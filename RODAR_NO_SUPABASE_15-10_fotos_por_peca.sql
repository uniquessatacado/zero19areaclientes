-- FOTO DE CADA PEÇA PRONTA (15/10). Supabase > SQL Editor > New query > colar TUDO > Run.
-- Pode rodar de novo sem problema. No final aparece uma tabela: cada linha deve dizer OK.

-- 15/10 (dono): foto de CADA peça pronta no QR e o cliente vê a camisa como montou com as fotos ao lado.
-- Uma foto por montagem (camisas iguais = 1 foto, pode mostrar todas juntas); peça sem estampa nem escrita
-- não pede foto. Pode rodar de novo. Não muda pedido, pagamento, estoque, frete, etiqueta nem arquivos.

-- 1) Cada foto guarda de qual peça ela é.
alter table public.zero19_production_photos add column if not exists piece_key text;
alter table public.zero19_production_photos add column if not exists piece_label text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'zero19_production_photos_piece_len') then
    alter table public.zero19_production_photos add constraint zero19_production_photos_piece_len
      check ((piece_key is null or length(piece_key) <= 120) and (piece_label is null or length(piece_label) <= 200));
  end if;
end $$;

-- 2) Registrar a foto de uma peça (mesmas travas da foto de antes: equipe ZERO19, arquivo deste pedido, montagem atual).
create or replace function public.zero19_register_production_piece_photo(p_order_id uuid, p_requirement_id text, p_fingerprint text,
  p_storage_path text, p_piece_key text, p_piece_label text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb; k text := btrim(coalesce(p_piece_key, '')); l text := left(btrim(coalesce(p_piece_label, '')), 200);
begin
  if k = '' or length(k) > 120 then raise exception 'Escolha de qual peça é a foto.'; end if;
  result := public.zero19_register_production_photo(p_order_id, p_requirement_id, p_fingerprint, p_storage_path);
  update public.zero19_production_photos set piece_key = k, piece_label = nullif(l, '')
    where order_id = p_order_id and storage_path = p_storage_path;
  if not found then raise exception 'A foto não foi confirmada.'; end if;
  return coalesce(result, '{}'::jsonb) || jsonb_build_object('success', true, 'piece_key', k);
end $$;
revoke all on function public.zero19_register_production_piece_photo(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.zero19_register_production_piece_photo(uuid, text, text, text, text, text) to authenticated;

-- 3) A página do QR sabe quais peças já têm foto (lista "photos" no manifesto).
do $patch$
declare definition text;
  old_part constant text := '''photo_count'', photo_count, ''number'', target.display_id,';
  new_part constant text := '''photo_count'', photo_count, ''photos'', coalesce((select jsonb_agg(jsonb_build_object(''piece_key'', ph.piece_key, ''at'', ph.created_at) order by ph.created_at) from public.zero19_production_photos ph where ph.order_id = target.id and ph.tenant_id = target.tenant_id and ph.fingerprint = current_fingerprint), ''[]''::jsonb), ''number'', target.display_id,';
begin
  definition := pg_get_functiondef('public.zero19_production_photo_manifest(uuid)'::regprocedure);
  if position(new_part in definition) > 0 then raise notice 'Fotos por peça (manifesto): já aplicado.';
  elsif position(old_part in definition) = 0 then raise warning 'Fotos por peça (manifesto) NÃO aplicado: a função mudou. Avise o desenvolvedor.';
  else execute replace(definition, old_part, new_part); end if;
end $patch$;

-- 4) Pedido sem personalização (ex.: camisa sem estampa) pode ficar pronto sem foto.
do $patch$
declare definition text;
  old_guard constant text := 'if coalesce((manifest->>''photo_count'')::integer, 0) < 1 then raise exception';
  new_guard constant text := 'if coalesce((manifest->>''photo_count'')::integer, 0) < 1 and exists (select 1 from public.personalization_sales ps where ps.order_id = target.id and ps.tenant_id = tenant and ps.status <> ''CANCELLED'') then raise exception';
begin
  definition := pg_get_functiondef('public.zero19_confirm_order_produced(uuid,text)'::regprocedure);
  if position(new_guard in definition) > 0 then raise notice 'Pronta sem personalização sem foto: já aplicado.';
  elsif position(old_guard in definition) = 0 then raise warning 'Pronta sem personalização NÃO aplicado: a função mudou. Avise o desenvolvedor.';
  else execute replace(definition, old_guard, new_guard); end if;
end $patch$;

-- 5) Pronta pelo QR conferindo a foto de cada peça (a lista de peças vem da mesma conta da tela).
create or replace function public.zero19_confirm_pieces_ready(p_order_id uuid, p_piece_keys text[], p_actor_name text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare manifest jsonb; k text; missing integer := 0;
begin
  if not political_private.zero19_progress_member() then raise exception 'Entre com a conta da ZERO19 para marcar como pronta.'; end if;
  if coalesce(cardinality(p_piece_keys), 0) > 200 then raise exception 'Peças demais neste pedido.'; end if;
  manifest := public.zero19_production_photo_manifest(p_order_id);
  foreach k in array coalesce(p_piece_keys, '{}'::text[]) loop
    if not exists (select 1 from public.zero19_production_photos ph where ph.order_id = p_order_id
        and ph.fingerprint = manifest->>'fingerprint' and ph.piece_key = k) then missing := missing + 1; end if;
  end loop;
  if missing > 0 then raise exception 'Falta a foto de % peça(s). Tire a foto de cada peça antes de marcar pronta.', missing; end if;
  return public.zero19_confirm_order_produced(p_order_id, p_actor_name);
end $$;
revoke all on function public.zero19_confirm_pieces_ready(uuid, text[], text) from public, anon;
grant execute on function public.zero19_confirm_pieces_ready(uuid, text[], text) to authenticated;

-- 6) Acompanhar meu pedido: só as fotos do pedido marcado pronto (montagem confirmada) podem ser abertas.
create or replace function public.zero19_ready_photo_public(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.zero19_production_photos ph
    join public.zero19_production_confirmations c on c.order_id = ph.order_id and c.fingerprint = ph.fingerprint
    where ph.storage_path = p_name);
$$;
revoke all on function public.zero19_ready_photo_public(text) from public;
grant execute on function public.zero19_ready_photo_public(text) to anon, authenticated;
drop policy if exists zero19_ready_photos_customer_read on storage.objects;
create policy zero19_ready_photos_customer_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'zero19-production-photos' and public.zero19_ready_photo_public(name));

create or replace function political_private.zero19_public_ready_photos(p_order_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('piece_key', ph.piece_key, 'piece_label', ph.piece_label, 'path', ph.storage_path, 'at', ph.created_at)
    order by ph.created_at), '[]'::jsonb)
  from public.zero19_production_photos ph
  join public.zero19_production_confirmations c on c.order_id = ph.order_id and c.fingerprint = ph.fingerprint
  where ph.order_id = p_order_id;
$$;
revoke all on function political_private.zero19_public_ready_photos(uuid) from public, anon, authenticated;

-- Só o necessário para desenhar a camisa como o cliente montou (mesma conta da equipe).
create or replace function political_private.zero19_public_shirt_source(p_order_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'pieces', (select coalesce(jsonb_agg(jsonb_build_object('line_id', p.v->'line_id', 'audience', p.v->'audience', 'size', p.v->'size',
        'quantity', p.v->'quantity', 'model', p.v->'model', 'color', p.v->'color', 'side', p.v->'side', 'applications', p.v->'applications',
        'print_id', p.v->'print_id', 'print_name', p.v->'print_name', 'preview_url', p.v->'preview_url', 'customization', p.v->'customization')
        order by p.n), '[]'::jsonb)
      from public.political_checkout_orders co
      cross join lateral jsonb_array_elements(case when jsonb_typeof(co.snapshot->'pieces') = 'array' then co.snapshot->'pieces' else '[]'::jsonb end) with ordinality p(v, n)
      where co.order_id = p_order_id),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'product_name', i.product_name, 'product_image', i.product_image,
        'size', i.size, 'quantity', i.quantity, 'metadata', jsonb_strip_nulls(jsonb_build_object(
          'pdv_studio_piece', i.metadata->'pdv_studio_piece',
          'vdr', case when i.metadata ? 'vdr' then jsonb_strip_nulls(jsonb_build_object('bundle_id', i.metadata->'vdr'->'bundle_id', 'role', i.metadata->'vdr'->'role')) end,
          'checkout_application', i.metadata->'checkout_application', 'checkout_transfer', i.metadata->'checkout_transfer',
          'personalization_production', case when i.metadata ? 'personalization_production' then to_jsonb(true) end, 'model', i.metadata->'model')))
        order by i.id), '[]'::jsonb)
      from public.order_items i join public.orders o on o.id = i.order_id and o.tenant_id = i.tenant_id where i.order_id = p_order_id),
    'sales', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'status', s.status, 'text_value', s.text_value,
        'garment_model', s.garment_model, 'garment_size', s.garment_size, 'garment_color', s.garment_color, 'garment_origin', s.garment_origin,
        'details', (select coalesce(jsonb_agg(jsonb_build_object('quantity', d.v->'quantity', 'production', jsonb_strip_nulls(jsonb_build_object(
            'model', d.v->'production'->'model', 'garment_key', d.v->'production'->'garment_key', 'vdr_bundle_id', d.v->'production'->'vdr_bundle_id',
            'vdr_block', d.v->'production'->'vdr_block', 'position_code', d.v->'production'->'position_code', 'kind', d.v->'production'->'kind',
            'garment_quantity', d.v->'production'->'garment_quantity', 'top_text', d.v->'production'->'top_text', 'bottom_text', d.v->'production'->'bottom_text',
            'ink_color', d.v->'production'->'ink_color', 'source_political_print_id', d.v->'production'->'source_political_print_id',
            'source_asset_id', d.v->'production'->'source_asset_id', 'storage_bucket', d.v->'production'->'storage_bucket',
            'file_path', case when d.v->'production'->>'storage_bucket' = 'z19p-assets' then d.v->'production'->'file_path' end))) order by d.n), '[]'::jsonb)
          from jsonb_array_elements(case when jsonb_typeof(s.details) = 'array' then s.details else '[]'::jsonb end) with ordinality d(v, n)))
        order by s.id), '[]'::jsonb)
      from public.personalization_sales s join public.orders o on o.id = s.order_id and o.tenant_id = s.tenant_id
      where s.order_id = p_order_id and s.status <> 'CANCELLED'));
$$;
revoke all on function political_private.zero19_public_shirt_source(uuid) from public, anon, authenticated;

-- 7) Meus pedidos passa a trazer as fotos de pronta e a montagem de cada camisa.
do $patch$
declare definition text;
  old_part constant text := '''progress'', r.progress, ''freight'', r.freight';
  new_part constant text := '''progress'', r.progress, ''freight'', r.freight, ''ready_photos'', political_private.zero19_public_ready_photos(r.id), ''shirt_source'', political_private.zero19_public_shirt_source(r.id)';
begin
  definition := pg_get_functiondef('public.zero19_public_order_details(text)'::regprocedure);
  if position(new_part in definition) > 0 then raise notice 'Meus pedidos com fotos por peça: já aplicado.';
  elsif position(old_part in definition) = 0 then raise warning 'Meus pedidos com fotos por peça NÃO aplicado: a função mudou. Avise o desenvolvedor.';
  else execute replace(definition, old_part, new_part); end if;
end $patch$;

notify pgrst, 'reload schema';

-- ===== CONFERÊNCIA (cada linha deve dizer OK) =====
select 'Foto ligada à peça' as item, case when exists (select 1 from information_schema.columns where table_name = 'zero19_production_photos' and column_name = 'piece_key') then 'OK' else 'FALTA' end as situacao
union all select 'QR sabe quais peças têm foto', case when pg_get_functiondef('public.zero19_production_photo_manifest(uuid)'::regprocedure) like '%''photos'', coalesce(%' then 'OK' else 'FALTA' end
union all select 'Pronta confere cada peça', case when to_regprocedure('public.zero19_confirm_pieces_ready(uuid,text[],text)') is not null then 'OK' else 'FALTA' end
union all select 'Sem personalização não pede foto', case when pg_get_functiondef('public.zero19_confirm_order_produced(uuid,text)'::regprocedure) like '%ps.status <> ''CANCELLED'') then raise exception%' then 'OK' else 'FALTA' end
union all select 'Cliente vê fotos e camisas', case when pg_get_functiondef('public.zero19_public_order_details(text)'::regprocedure) like '%ready_photos%' then 'OK' else 'FALTA' end
union all select 'Cliente abre a foto do pedido pronto', case when exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'zero19_ready_photos_customer_read') then 'OK' else 'FALTA' end;
