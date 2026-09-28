-- Targeted recovery of the upload shown by the owner. Preserves files and dimensions.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"96d8732c-9576-4af9-9fe7-cdee065c14e6","role":"authenticated"}',true);
do $$
declare a public.z19p_assets; w public.z19p_zero19_work_items;
begin
  select * into w from public.z19p_zero19_work_items where id='2b7ec903-825e-4993-aa45-979cd1728370' for update;
  select * into a from public.z19p_assets where id='ea1610cf-4197-41f0-9255-f359a1c8a497' for update;
  if w.id is null or a.id is null or a.owner_id<>auth.uid() or w.owner_id<>a.owner_id or w.workspace_id<>a.workspace_id
    or w.project_id<>'acc3261a-24e7-4986-a24e-30cbbe3cbe42' or w.stage<>'awaiting_art' or w.asset_id is not null
    or a.project_id<>'51029ab2-621f-4c96-96ba-4498b10f7edb' or a.metadata->>'personalization_sale_id' is not null
  then raise exception 'Estado alterado: interromper recuperação e revisar novamente.'; end if;
  if exists(select 1 from public.z19p_asset_placements where asset_id=a.id)
    or exists(select 1 from public.z19p_print_job_items where asset_id=a.id)
    or exists(select 1 from public.z19p_film_allocations where asset_id=a.id)
    or exists(select 1 from public.z19p_zero19_work_items where asset_id=a.id)
  then raise exception 'Arte já possui vínculo operacional: não mover.'; end if;
  update public.z19p_assets set project_id=w.project_id,updated_at=now(),updated_by=auth.uid(),
    metadata=(coalesce(metadata,'{}')-'official_placement_id')||jsonb_build_object(
      'personalization_sale_id',w.personalization_sale_id,'zero19_work_item_id',w.id,
      'pdv_position_code','front_center','pdv_position_label','Frente · meio',
      'upload_link_recovery',jsonb_build_object('previous_project_id',a.project_id,'previous_placement_id',a.metadata->>'official_placement_id','recovered_at',now(),'reason','Upload perdeu contexto do pedido #49323 e selecionou histórico cancelado #49087'))
    where id=a.id;
  update public.z19p_asset_print_profiles set project_id=w.project_id,ready_for_print=false,updated_at=now(),updated_by=auth.uid() where asset_id=a.id;
  update public.z19p_zero19_work_items set asset_id=a.id,stage='art_received',art_received_at=coalesce(art_received_at,now()),updated_at=now() where id=w.id;
end $$;
reset role;
select public.z19p_zero19_refresh_project('acc3261a-24e7-4986-a24e-30cbbe3cbe42');
select id,text_value,stage,asset_id from public.z19p_zero19_work_items where project_id='acc3261a-24e7-4986-a24e-30cbbe3cbe42' order by created_at,id;
commit;
