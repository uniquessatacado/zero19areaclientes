-- One-time, evidence-backed repair for the front/back mislink in order #49322.
-- Preserves both source files, dimensions (including the saved 35 cm),
-- promised dates, pauses, stock, payments and export history.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$
declare f public.z19p_zero19_work_items%rowtype;
        b public.z19p_zero19_work_items%rowtype;
        p public.z19p_asset_placements%rowtype;
        v_actor uuid:='96d8732c-9576-4af9-9fe7-cdee065c14e6';
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
  perform 1 from public.z19p_projects where id='658b6551-b79d-4e23-93e8-7f6ce0db78be' for update;
  select * into f from public.z19p_zero19_work_items where id='ba7ba54b-8fbd-4d4d-b50f-0d763cdd7be3' for update;
  select * into b from public.z19p_zero19_work_items where id='aa3e56d6-74f1-4eba-a560-fb0aea257cb1' for update;
  select * into p from public.z19p_asset_placements where id='a1d537e9-07a7-4a55-8da4-b9839a83f92f' for update;
  if f.stage is distinct from 'ready_production' or b.stage is distinct from 'art_received'
    or f.asset_id is distinct from '15a361b9-bd38-4954-a745-f07b7154d5b4'::uuid
    or b.asset_id is distinct from f.asset_id or p.asset_id is distinct from b.asset_id
    or p.production_state is distinct from 'pending'
    or p.external_order_item_ref is distinct from f.personalization_sale_id::text
    or f.production_started_at is not null or b.production_started_at is not null then
    raise exception 'State changed since diagnosis. Stop and review; no repair applied.';
  end if;
  if not exists(select 1 from public.z19p_assets a where a.id=b.asset_id
    and a.metadata->>'personalization_sale_id'=b.personalization_sale_id::text
    and a.metadata->>'source_file_path'=b.source_file_path) then
    raise exception 'Source identity no longer matches. Stop.';
  end if;
  if exists(select 1 from public.z19p_film_exports e where to_jsonb(e)::text like '%'||b.asset_id::text||'%')
    or exists(select 1 from public.z19p_film_allocations a where to_jsonb(a)::text like '%'||b.asset_id::text||'%')
    or exists(select 1 from public.z19p_film_drafts d where to_jsonb(d)::text like '%'||b.asset_id::text||'%') then
    raise exception 'Artwork was added to a film; review references before repairing.';
  end if;
  update public.z19p_asset_placements set external_order_item_ref=b.personalization_sale_id::text,
    metadata=coalesce(metadata,'{}')||jsonb_build_object('identity_repair_20260928',jsonb_build_object('previous_item_ref',p.external_order_item_ref,'reason','Organizer selected first order item instead of artwork source','at',now())),
    updated_by=v_actor,updated_at=now() where id=p.id;
  update public.z19p_zero19_work_items set asset_id=null,stage='art_received',art_ready_at=null,
    metadata=coalesce(metadata,'{}')||jsonb_build_object('identity_repair_20260928',jsonb_build_object('previous_asset_id',f.asset_id,'previous_stage',f.stage,'previous_art_ready_at',f.art_ready_at,'at',now())),updated_at=now()
    where id=f.id;
  update public.z19p_zero19_work_items set stage='ready_production',art_ready_at=coalesce(art_ready_at,p.created_at),
    metadata=coalesce(metadata,'{}')||jsonb_build_object('identity_repair_20260928',jsonb_build_object('previous_stage',b.stage,'position_id',p.id,'at',now())),updated_at=now()
    where id=b.id;
  perform public.z19p_zero19_refresh_project(b.project_id);
end $$;
select text_value,stage,asset_id,personalization_sale_id from public.z19p_zero19_work_items
where project_id='658b6551-b79d-4e23-93e8-7f6ce0db78be' order by text_value;
commit;
