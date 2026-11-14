-- 14/11 (dono: "no 019 permita baixar as estampas do estúdio (Estampa Política) em alta, PNG 300 DPI no mínimo, para eu fazer halftone
-- e subir de novo; então trocar a estampa atual chapada pela halftone e usar a partir de agora; quando for para a produção já vai com
-- halftone; um botão no Montar filme para isso"). Resposta: vale para os pedidos NOVOS e para os que ainda ESPERAM produção.
-- A produção acha a arte de cada estampa do site pela arte padrão (zero19_vdr_private.political_defaults + political_imports com o mesmo
-- arquivo do site). Trocar = nova arte na biblioteca (marcada halftone) + padrão apontando para ela + aplicações que esperam trocadas.
begin;

create or replace function public.z19p_site_prints_member() returns boolean language sql stable security definer set search_path = '' as $$
  select public.z19p_current_account_owner() = '96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid
    and exists (select 1 from public.z19p_profiles p where p.id = auth.uid() and p.active) $$;

create or replace function public.z19p_site_prints_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.z19p_site_prints_member() then raise exception 'Só a equipe da ZERO19.'; end if;
  return (select coalesce(jsonb_agg(row_data order by sort_key), '[]'::jsonb) from (
    select p.sort_order sort_key, jsonb_build_object('print_id', p.id, 'name', p.name, 'candidate', p.candidate, 'preview_url', p.preview_url,
      'asset_id', a.id, 'asset_name', a.name, 'path', coalesce(a.original_path, a.processed_path), 'bucket', coalesce(a.metadata->>'storage_bucket', 'z19p-assets'),
      'width_px', a.width, 'height_px', a.height, 'width_cm', pr.default_width_cm, 'height_cm', pr.default_height_cm,
      'dpi', case when coalesce(pr.default_width_cm, 0) > 0 and a.width > 0 then round(a.width / (pr.default_width_cm / 2.54)) end,
      'halftone', coalesce(pr.halftone, false), 'original_asset_id', (a.metadata->>'halftone_of')::uuid,
      'pending', (select count(*) from public.z19p_zero19_work_items w where w.asset_id = a.id and w.stage in ('awaiting_art','art_received','awaiting_halftone','awaiting_font','ready_production'))) row_data
    from public.political_prints p
    join zero19_vdr_private.political_defaults d on d.political_print_id = p.id and d.tenant_id = p.tenant_id
    join public.z19p_assets a on a.id = d.asset_id
    left join public.z19p_asset_print_profiles pr on pr.asset_id = a.id
    where p.enabled) x);
end $$;

-- Troca a arte da estampa pela versão halftone já enviada para z19p-private (pasta da conta).
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
  -- Mesma largura de impressão; a altura sai da proporção do arquivo novo.
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
  update zero19_vdr_private.political_defaults set asset_id = new_id, updated_by = auth.uid(), updated_at = now() where political_print_id = p.id and tenant_id = p.tenant_id;
  -- Pedidos que ainda esperam produção com a arte antiga passam para o halftone (o que já foi impresso fica como está).
  with moved as (
    update public.z19p_zero19_work_items w set asset_id = new_id, source_file_path = p_path, updated_at = now(),
      metadata = coalesce(w.metadata, '{}'::jsonb) || jsonb_build_object('halftone_swap', jsonb_build_object('from', old.id, 'to', new_id, 'at', now()))
    where w.asset_id = old.id and w.stage in ('awaiting_art','art_received','awaiting_halftone','awaiting_font','ready_production') returning w.personalization_sale_id)
  select count(*) into swapped from moved;
  update public.personalization_sales s set details = jsonb_set(jsonb_set(jsonb_set(s.details, '{0,production,source_asset_id}', to_jsonb(new_id::text)), '{0,production,file_path}', to_jsonb(p_path)),
      '{0,production,storage_bucket}', '"z19p-private"'), updated_at = now()
    where s.details->0->'production'->>'source_asset_id' = old.id::text and s.status in ('PENDING', 'IN_PROGRESS')
      and exists (select 1 from public.z19p_zero19_work_items w where w.personalization_sale_id = s.id and w.asset_id = new_id);
  return jsonb_build_object('success', true, 'asset_id', new_id, 'width_cm', width_cm, 'height_cm', height_cm, 'pending_swapped', swapped, 'list', public.z19p_site_prints_list());
end $$;

-- Volta para a arte original (chapada). Pedidos que esperam voltam junto.
create or replace function public.z19p_site_print_restore(p_print_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.political_prints%rowtype; cur public.z19p_assets%rowtype; original_id uuid; orig public.z19p_assets%rowtype; swapped integer := 0;
begin
  if not public.z19p_site_prints_member() then raise exception 'Só a equipe da ZERO19.'; end if;
  select * into p from public.political_prints where id = p_print_id;
  select a.* into cur from zero19_vdr_private.political_defaults d join public.z19p_assets a on a.id = d.asset_id where d.political_print_id = p.id and d.tenant_id = p.tenant_id;
  original_id := (cur.metadata->>'halftone_of')::uuid;
  if original_id is null then raise exception 'Esta estampa já está com a arte original.'; end if;
  select * into orig from public.z19p_assets where id = original_id;
  update zero19_vdr_private.political_defaults set asset_id = original_id, updated_by = auth.uid(), updated_at = now() where political_print_id = p.id and tenant_id = p.tenant_id;
  with moved as (update public.z19p_zero19_work_items w set asset_id = original_id, source_file_path = coalesce(orig.processed_path, orig.original_path), updated_at = now()
    where w.asset_id = cur.id and w.stage in ('awaiting_art','art_received','awaiting_halftone','awaiting_font','ready_production') returning 1)
  select count(*) into swapped from moved;
  update public.personalization_sales s set details = jsonb_set(jsonb_set(jsonb_set(s.details, '{0,production,source_asset_id}', to_jsonb(original_id::text)), '{0,production,file_path}', to_jsonb(coalesce(orig.processed_path, orig.original_path))),
      '{0,production,storage_bucket}', to_jsonb(coalesce(orig.metadata->>'storage_bucket', 'z19p-assets'))), updated_at = now()
    where s.details->0->'production'->>'source_asset_id' = cur.id::text and s.status in ('PENDING', 'IN_PROGRESS');
  return jsonb_build_object('success', true, 'pending_swapped', swapped, 'list', public.z19p_site_prints_list());
end $$;

revoke all on function public.z19p_site_prints_member(), public.z19p_site_prints_list(), public.z19p_site_print_set_halftone(uuid, text, integer, integer), public.z19p_site_print_restore(uuid) from public, anon;
grant execute on function public.z19p_site_prints_list(), public.z19p_site_print_set_halftone(uuid, text, integer, integer), public.z19p_site_print_restore(uuid) to authenticated;
commit;
