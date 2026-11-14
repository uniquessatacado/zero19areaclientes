-- 14/11 (dono: "estampa que estava em produção do GTA não estava em halftone; subi o halftone e fui para a produção adicionar no filme e
-- não foi em halftone, foi normal"; "permita que eu marque as estampas que não são halftone para não ficar pendente de fazer halftone;
-- no caso do GTA todas da frente não vai halftone, só das costas; quando tiver estampa em produção e sem halftone alerte o botão do
-- halftone para eu saber que tenho que fazer halftone, ou botão para marcar nela que não é halftone").
-- Causa: a troca gravava a arte nova na aplicação, mas os gatilhos do pedido do site (political_private.checkout_link_asset) e da VDR
-- (zero19_vdr_private.link_production_asset) refazem a arte pela receita do pedido (source_asset_id = a original) e voltavam para a chapada.
-- Agora a receita leva "art_override_asset_id" (a arte que substitui: só vale se for da MESMA estampa, original ou halftone dela) e os
-- gatilhos usam essa arte. A receita do pedido (order_items) não muda.
begin;

alter table zero19_vdr_private.political_defaults add column if not exists no_halftone boolean not null default false;

create or replace function political_private.checkout_link_asset() returns trigger
language plpgsql security definer set search_path = '' as $function$
declare recipe jsonb; a public.z19p_assets%rowtype; b public.z19p_assets%rowtype; ov uuid;
begin
 recipe:=new.metadata->'details'->0->'production';
 if nullif(recipe->>'checkout_application_id','') is null or new.owner_id<>'96d8732c-9576-4af9-9fe7-cdee065c14e6' then return new;end if;
 if recipe->>'kind'='PHRASE' then return new;end if;
 if not exists(select 1 from public.order_items i join public.political_checkout_orders c on c.order_id=i.order_id where i.id=(recipe->>'checkout_application_id')::uuid and i.order_id=new.order_id and i.metadata->'production'->>'source_asset_id'=recipe->>'source_asset_id') then raise exception 'Arte não corresponde à aplicação do checkout.';end if;
 select * into strict a from public.z19p_assets where id=(recipe->>'source_asset_id')::uuid and owner_id=new.owner_id and mime_type='image/png';
 if recipe->>'file_path' is distinct from coalesce(a.processed_path,a.original_path) or recipe->>'storage_bucket' is distinct from coalesce(a.metadata->>'storage_bucket','z19p-assets')
 or not exists(select 1 from storage.objects where bucket_id=recipe->>'storage_bucket' and name=recipe->>'file_path') then raise exception 'Arquivo da aplicação não foi preparado.';end if;
 begin ov:=nullif(coalesce(new.metadata->>'art_override_asset_id',recipe->>'art_override_asset_id'),'')::uuid; exception when others then ov:=null; end;
 if ov is not null and ov<>a.id then
   select * into b from public.z19p_assets x where x.id=ov and x.owner_id=new.owner_id and x.mime_type='image/png'
     and coalesce((x.metadata->>'halftone_of')::uuid,x.id)=coalesce((a.metadata->>'halftone_of')::uuid,a.id);
   if found and exists(select 1 from storage.objects where bucket_id=coalesce(b.metadata->>'storage_bucket','z19p-assets') and name=coalesce(b.processed_path,b.original_path)) then
     a:=b; new.source_file_path:=coalesce(b.processed_path,b.original_path);
   end if;
 end if;
 new.asset_id:=a.id;new.requires_art:=false;new.requires_font:=false;
 if new.stage not in ('production','ready_pickup','delivered','cancelled','awaiting_release') then new.stage:='ready_production';end if;
 new.art_ready_at:=coalesce(new.art_ready_at,now());return new;
end $function$;

create or replace function zero19_vdr_private.link_production_asset() returns trigger
language plpgsql security definer set search_path = '' as $function$
declare v_id uuid; v_asset public.z19p_assets%rowtype; b public.z19p_assets%rowtype; ov uuid; v_production jsonb; bucket_name text; wc numeric; hc numeric;
begin
  v_production:=new.metadata->'details'->0->'production';
  if new.tenant_id<>'0e885daf-b461-4384-b2c2-8ed2cf33478b' or coalesce(v_production->>'vdr_bundle_id','')='' then return new; end if;
  if nullif(v_production->>'source_asset_id','') is not null then
    v_id:=(v_production->>'source_asset_id')::uuid;
    select * into v_asset from public.z19p_assets where id=v_id and owner_id=new.owner_id and mime_type='image/png';
    if not found then raise exception 'Arte VDR não pertence à produção ZERO19.'; end if;
    bucket_name:=coalesce(v_asset.metadata->>'storage_bucket','z19p-assets');
    wc:=(v_production->>'width_cm')::numeric; hc:=(v_production->>'height_cm')::numeric;
    if wc is null or hc is null or wc<=0 or wc>100 or hc<=0 or hc>300
      or v_production->>'file_path' is distinct from coalesce(v_asset.processed_path,v_asset.original_path)
      or v_production->>'storage_bucket' is distinct from bucket_name
      or bucket_name not in('z19p-assets','z19p-private')
    then raise exception 'Confira o arquivo privado e as medidas desta aplicação VDR.'; end if;
    if bucket_name='z19p-private' and not exists(
      select 1 from zero19_vdr_private.political_imports i where i.asset_id=v_id and i.tenant_id=new.tenant_id
        and i.processed_path=v_production->>'file_path'
    ) then raise exception 'Importação privada não registrada para esta loja.'; end if;
    begin ov:=nullif(coalesce(new.metadata->>'art_override_asset_id',v_production->>'art_override_asset_id'),'')::uuid; exception when others then ov:=null; end;
    if ov is not null and ov<>v_id then
      select * into b from public.z19p_assets x where x.id=ov and x.owner_id=new.owner_id and x.mime_type='image/png'
        and coalesce((x.metadata->>'halftone_of')::uuid,x.id)=coalesce((v_asset.metadata->>'halftone_of')::uuid,v_asset.id);
      if found then v_id:=b.id; new.source_file_path:=coalesce(b.processed_path,b.original_path); end if;
    end if;
    new.asset_id=v_id; new.requires_art=false; new.requires_font=false;
    if new.stage not in ('production','ready_pickup','delivered','cancelled','awaiting_release') then new.stage='ready_production'; end if;
    new.art_ready_at=coalesce(new.art_ready_at,now());
  end if;
  return new;
end $function$;

-- Passa as aplicações que ESPERAM produção de uma arte para outra da mesma estampa (halftone ou volta para a original).
create or replace function zero19_vdr_private.site_print_move_pending(p_from uuid, p_to uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare t public.z19p_assets%rowtype; moved integer := 0; to_path text;
begin
  select * into strict t from public.z19p_assets where id = p_to;
  to_path := coalesce(t.processed_path, t.original_path);
  perform set_config('z19p.owner_override', '96d8732c-9576-4af9-9fe7-cdee065c14e6', true);
  -- A marca fica no nível de cima da aplicação (metadata.art_override_asset_id): a sincronização com a venda troca só "details"
  -- e mantém a marca; a receita do pedido e a venda não mudam.
  with m as (
    update public.z19p_zero19_work_items w set asset_id = p_to, source_file_path = to_path, updated_at = now(),
      metadata = coalesce(w.metadata, '{}'::jsonb) || jsonb_build_object('art_override_asset_id', p_to::text,
        'halftone_swap', jsonb_build_object('from', p_from, 'to', p_to, 'at', now()))
    where w.asset_id = p_from and w.stage in ('awaiting_art','art_received','awaiting_halftone','awaiting_font','ready_production')
    returning 1)
  select count(*) into moved from m;
  return moved;
end $$;
revoke all on function zero19_vdr_private.site_print_move_pending(uuid, uuid) from public, anon, authenticated;

-- O gatilho que confere a arte quando a venda muda também aceita a arte substituta da mesma estampa.
do $patch$
declare d text; a1 text := 'join public.z19p_assets a on a.id=wi.asset_id and a.owner_id=wi.owner_id';
  a2 text := E'      and wi.source_file_path=v_file\n';
begin
  d := pg_get_functiondef('public.z19p_zero19_art_intake_stage_trigger()'::regprocedure);
  if position(a1 in d) = 0 or position(a2 in d) = 0 then raise exception 'art_intake_stage: trecho não encontrado'; end if;
  d := replace(d, a1, $r$join public.z19p_assets a on a.id::text=new.details->0->'production'->>'source_asset_id' and a.owner_id=wi.owner_id$r$);
  d := replace(d, a2, $r$      and (wi.asset_id=a.id and wi.source_file_path=v_file
        or wi.metadata->>'art_override_asset_id'=wi.asset_id::text and exists(select 1 from public.z19p_assets o where o.id=wi.asset_id and o.owner_id=wi.owner_id
          and coalesce((o.metadata->>'halftone_of')::uuid,o.id)=coalesce((a.metadata->>'halftone_of')::uuid,a.id) and wi.source_file_path=coalesce(o.processed_path,o.original_path)))
$r$);
  execute d;
end $patch$;

create or replace function public.z19p_site_prints_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.z19p_site_prints_member() then raise exception 'Só a equipe da ZERO19.'; end if;
  return (select coalesce(jsonb_agg(row_data || jsonb_build_object('needs_halftone', (row_data->>'pending')::int > 0 and not (row_data->>'halftone')::boolean and not (row_data->>'no_halftone')::boolean) order by sort_key), '[]'::jsonb) from (
    select p.sort_order sort_key, jsonb_build_object('print_id', p.id, 'name', p.name, 'candidate', p.candidate, 'preview_url', p.preview_url,
      'asset_id', a.id, 'asset_name', a.name, 'path', coalesce(a.original_path, a.processed_path), 'bucket', coalesce(a.metadata->>'storage_bucket', 'z19p-assets'),
      'width_px', a.width, 'height_px', a.height, 'width_cm', pr.default_width_cm, 'height_cm', pr.default_height_cm,
      'dpi', case when coalesce(pr.default_width_cm, 0) > 0 and a.width > 0 then round(a.width / (pr.default_width_cm / 2.54)) end,
      'halftone', coalesce(pr.halftone, false), 'original_asset_id', (a.metadata->>'halftone_of')::uuid, 'no_halftone', d.no_halftone,
      'pending', (select count(*) from public.z19p_zero19_work_items w where w.asset_id = a.id and w.stage in ('awaiting_art','art_received','awaiting_halftone','awaiting_font','ready_production'))) row_data
    from public.political_prints p
    join zero19_vdr_private.political_defaults d on d.political_print_id = p.id and d.tenant_id = p.tenant_id
    join public.z19p_assets a on a.id = d.asset_id
    left join public.z19p_asset_print_profiles pr on pr.asset_id = a.id
    where p.enabled) x);
end $$;

-- Para o alerta do botão: estampas com pedido esperando produção, ainda chapadas e não marcadas "não vai halftone".
create or replace function public.z19p_site_prints_alert() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare n_prints integer; n_items integer;
begin
  if not public.z19p_site_prints_member() then return jsonb_build_object('prints', 0, 'items', 0); end if;
  select count(*), coalesce(sum(c), 0) into n_prints, n_items from (
    select (select count(*) from public.z19p_zero19_work_items w where w.asset_id = a.id and w.stage in ('awaiting_art','art_received','awaiting_halftone','awaiting_font','ready_production')) c
    from public.political_prints p
    join zero19_vdr_private.political_defaults d on d.political_print_id = p.id and d.tenant_id = p.tenant_id
    join public.z19p_assets a on a.id = d.asset_id
    left join public.z19p_asset_print_profiles pr on pr.asset_id = a.id
    where p.enabled and not d.no_halftone and not coalesce(pr.halftone, false)) x where c > 0;
  return jsonb_build_object('prints', n_prints, 'items', n_items);
end $$;

create or replace function public.z19p_site_print_set_no_halftone(p_print_id uuid, p_value boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.z19p_site_prints_member() then raise exception 'Só a equipe da ZERO19.'; end if;
  update zero19_vdr_private.political_defaults d set no_halftone = coalesce(p_value, false), updated_by = auth.uid(), updated_at = now()
    where d.political_print_id = p_print_id and d.tenant_id = (select p.tenant_id from public.political_prints p where p.id = p_print_id);
  if not found then raise exception 'Estampa não encontrada.'; end if;
  return jsonb_build_object('success', true, 'list', public.z19p_site_prints_list());
end $$;

create or replace function public.z19p_site_print_set_halftone(p_print_id uuid, p_path text, p_width_px integer, p_height_px integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare own constant uuid := '96d8732c-9576-4af9-9fe7-cdee065c14e6'; p public.political_prints%rowtype; d record; old public.z19p_assets%rowtype; prof public.z19p_asset_print_profiles%rowtype;
  new_id uuid := gen_random_uuid(); width_cm numeric; height_cm numeric; obj_size bigint; swapped integer := 0; original_id uuid;
begin
  if not public.z19p_site_prints_member() then raise exception 'Só a equipe da ZERO19.'; end if;
  select * into p from public.political_prints where id = p_print_id;
  if p.id is null then raise exception 'Estampa não encontrada.'; end if;
  select * into d from zero19_vdr_private.political_defaults where political_print_id = p.id and tenant_id = p.tenant_id;
  if d.asset_id is null then raise exception 'Esta estampa ainda não foi preparada para a produção.'; end if;
  select * into old from public.z19p_assets where id = d.asset_id;
  select * into prof from public.z19p_asset_print_profiles where asset_id = old.id;
  if p_path !~ ('^' || own::text || '/vdr-political/[0-9a-f-]{36}/halftone\.png$') then raise exception 'Arquivo inválido.'; end if;
  select (metadata->>'size')::bigint into obj_size from storage.objects where bucket_id = 'z19p-private' and name = p_path;
  if coalesce(obj_size, 0) <= 0 then raise exception 'O arquivo do halftone não chegou. Envie de novo.'; end if;
  if coalesce(p_width_px, 0) < 50 or coalesce(p_height_px, 0) < 50 then raise exception 'Imagem pequena demais.'; end if;
  width_cm := coalesce(prof.default_width_cm, p.width_cm);
  height_cm := round(width_cm * p_height_px / p_width_px, 3);
  if p_width_px / (width_cm / 2.54) < 290 then raise exception 'O halftone tem % DPI na medida de % cm. Envie com pelo menos 300 DPI (largura mínima de % px).', round(p_width_px / (width_cm / 2.54)), width_cm, ceil(width_cm / 2.54 * 300); end if;
  original_id := coalesce((old.metadata->>'halftone_of')::uuid, old.id);
  perform set_config('z19p.owner_override', own::text, true);
  insert into public.z19p_assets(id, owner_id, workspace_id, folder_id, name, asset_type, original_path, processed_path, mime_type, size_bytes, width, height, dpi, alpha_trimmed, background_removed, maximized, metadata, created_by, updated_by)
    values (new_id, own, old.workspace_id, old.folder_id, left(regexp_replace(old.name, '\s*·\s*HALFTONE$', '') || ' · HALFTONE', 200), 'arte', p_path, p_path, 'image/png', obj_size, p_width_px, p_height_px, 300, true, false, false,
      coalesce(old.metadata, '{}'::jsonb) || jsonb_build_object('storage_bucket', 'z19p-private', 'halftone_of', original_id, 'halftone_uploaded_at', now(), 'halftone_uploaded_by', auth.uid(),
        'requested_width_cm', width_cm, 'requested_height_cm', height_cm, 'effective_dpi', round(p_width_px / (width_cm / 2.54))), auth.uid(), auth.uid());
  insert into public.z19p_asset_print_profiles(asset_id, owner_id, default_width_cm, default_height_cm, aspect_ratio, halftone, allow_internal_nesting, rotation_policy, ready_for_print, created_by, updated_by)
    values (new_id, own, width_cm, height_cm, round(p_width_px::numeric / p_height_px, 8), true, false, coalesce(prof.rotation_policy, 'free'), true, auth.uid(), auth.uid());
  insert into zero19_vdr_private.political_imports(tenant_id, political_print_id, source_path, source_sha256, dimension, size_cm, asset_id, original_path, processed_path, imported_by)
    values (p.tenant_id, p.id, p.file_path, encode(extensions.digest(p_path, 'sha256'), 'hex'), 'width', width_cm, new_id, p_path, p_path, auth.uid());
  update zero19_vdr_private.political_defaults set asset_id = new_id, no_halftone = false, updated_by = auth.uid(), updated_at = now() where political_print_id = p.id and tenant_id = p.tenant_id;
  -- Pedidos que esperam produção (com a arte em uso antes ou com a original) passam para o halftone. O que já foi impresso fica como está.
  swapped := zero19_vdr_private.site_print_move_pending(old.id, new_id);
  if original_id <> old.id then swapped := swapped + zero19_vdr_private.site_print_move_pending(original_id, new_id); end if;
  return jsonb_build_object('success', true, 'asset_id', new_id, 'width_cm', width_cm, 'height_cm', height_cm, 'pending_swapped', swapped, 'list', public.z19p_site_prints_list());
end $$;

create or replace function public.z19p_site_print_restore(p_print_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.political_prints%rowtype; cur public.z19p_assets%rowtype; original_id uuid; swapped integer := 0;
begin
  if not public.z19p_site_prints_member() then raise exception 'Só a equipe da ZERO19.'; end if;
  select * into p from public.political_prints where id = p_print_id;
  select a.* into cur from zero19_vdr_private.political_defaults d join public.z19p_assets a on a.id = d.asset_id where d.political_print_id = p.id and d.tenant_id = p.tenant_id;
  original_id := (cur.metadata->>'halftone_of')::uuid;
  if original_id is null then raise exception 'Esta estampa já está com a arte original.'; end if;
  update zero19_vdr_private.political_defaults set asset_id = original_id, updated_by = auth.uid(), updated_at = now() where political_print_id = p.id and tenant_id = p.tenant_id;
  swapped := zero19_vdr_private.site_print_move_pending(cur.id, original_id);
  return jsonb_build_object('success', true, 'pending_swapped', swapped, 'list', public.z19p_site_prints_list());
end $$;

revoke all on function public.z19p_site_prints_alert(), public.z19p_site_print_set_no_halftone(uuid, boolean) from public, anon;
grant execute on function public.z19p_site_prints_alert(), public.z19p_site_print_set_no_halftone(uuid, boolean) to authenticated;

-- Dono: "no caso do GTA, todas da frente não vai halftone, só das costas".
update zero19_vdr_private.political_defaults d set no_halftone = true, updated_at = now()
  from public.political_prints p where p.id = d.political_print_id and p.tenant_id = d.tenant_id and p.candidate = 'GTA6' and p.name ilike '%frente%';

-- Pedidos que já esperavam produção quando o halftone subiu e voltaram para a chapada: agora vão para o halftone.
select zero19_vdr_private.site_print_move_pending((a.metadata->>'halftone_of')::uuid, a.id)
  from zero19_vdr_private.political_defaults d join public.z19p_assets a on a.id = d.asset_id where a.metadata ? 'halftone_of';
commit;
