-- Execute after the migration, or between BEGIN and its COMMIT in a test session.
-- Synthetic IDs only. No real order is completed, no files/messages are sent.
begin;
set local statement_timeout='45s';
set local lock_timeout='3s';
select set_config('request.jwt.claims','{"sub":"96d8732c-9576-4af9-9fe7-cdee065c14e6","role":"authenticated"}',true);
do $$
#variable_conflict use_variable
declare
  own uuid:='96d8732c-9576-4af9-9fe7-cdee065c14e6';
  tenant uuid:='0e885daf-b461-4384-b2c2-8ed2cf33478b';
  order_id uuid:=gen_random_uuid(); workspace_id uuid:=gen_random_uuid(); project_id uuid:=gen_random_uuid();
  sale_ids uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
  work_ids uuid[]; artwork_id uuid:=gen_random_uuid(); placement_ids uuid[]:=array[gen_random_uuid(),gen_random_uuid()];
  paused_id uuid:=gen_random_uuid(); fake_source_id uuid:=gen_random_uuid();
  other_tenant_id uuid;
  before_real jsonb; after_real jsonb; before_asset jsonb; before_siblings jsonb; result jsonb; rejected boolean;
begin
  if exists(select 1 from public.z19p_production_pauses where owner_id=own and scope='printer' and ended_at is null) then
    raise exception 'QA stopped: real printer is paused; do not change its pause for a test.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'stage',w.stage) order by w.id),'[]')
    into before_real from public.z19p_zero19_work_items w;
  insert into public.orders(id,tenant_id,status,payment_status,origin,total_amount)
    values(order_id,tenant,'RECEBIDO','PARCIAL','PDV',0);
  insert into public.z19p_workspaces(id,owner_id,company_name,workspace_type,created_by)
    values(workspace_id,own,'QA SYNTHETIC application produced','client',own);
  insert into public.z19p_projects(id,owner_id,workspace_id,sequence_no,title,official_order_source,official_order_ref,official_order_payload,created_by)
    values(project_id,own,workspace_id,1,'QA SYNTHETIC mixed order','zero19_pdv',order_id::text,'{}',own);
  insert into public.personalization_sales(id,tenant_id,order_id,text_value,personalization_code,status,details)
    values
      (sale_ids[1],tenant,order_id,'QA awaiting artwork','QA-'||sale_ids[1]::text,'PENDING','[{"production":{"kind":"NEW_ART"}}]'),
      (sale_ids[2],tenant,order_id,'QA awaiting font','QA-'||sale_ids[2]::text,'PENDING','[{"production":{"kind":"NAME_NUMBER"}}]'),
      (sale_ids[3],tenant,order_id,'QA ready for TIFF','QA-'||sale_ids[3]::text,'PENDING','[{"production":{"kind":"NEW_ART"}}]');
  select array_agg(w.id order by array_position(sale_ids,w.personalization_sale_id)) into work_ids
    from public.z19p_zero19_work_items w where w.order_id=order_id;
  if cardinality(work_ids)<>3 then raise exception 'Synthetic sync fixture missing'; end if;
  insert into public.z19p_assets(id,owner_id,workspace_id,project_id,name,original_path,metadata)
    values(artwork_id,own,workspace_id,project_id,'QA shared artwork','qa-no-storage-object.png','{"untouched":"shared original"}');
  insert into public.z19p_asset_placements(id,owner_id,workspace_id,project_id,asset_id,external_order_item_ref,width_cm,height_cm,garment_model,surface,position_code,production_state)
    values
      (placement_ids[1],own,workspace_id,project_id,artwork_id,sale_ids[1]::text,30,28,'normal','back','back_center','pending'),
      (placement_ids[2],own,workspace_id,project_id,artwork_id,sale_ids[2]::text,20,10,'normal','front','front_center','pending');
  update public.z19p_zero19_work_items set stage='ready_production' where id=work_ids[3];
  perform public.z19p_zero19_refresh_project(project_id);
  select to_jsonb(a) into before_asset from public.z19p_assets a where a.id=artwork_id;
  select jsonb_agg(jsonb_build_object('id',w.id,'stage',w.stage,'source_file_path',w.source_file_path,'asset_id',w.asset_id) order by w.id)
    into before_siblings from public.z19p_zero19_work_items w where w.project_id=project_id and w.id<>work_ids[1];

  -- No identity and a different account cannot complete the application.
  perform set_config('request.jwt.claims','{"role":"anon"}',true);rejected:=false;
  begin perform public.z19p_zero19_mark_work_item_produced(work_ids[1]);
    exception when others then if sqlerrm not like '%não autorizado%' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'Anonymous application completion accepted'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);rejected:=false;
  begin perform public.z19p_zero19_mark_work_item_produced(work_ids[1]);
    exception when others then if sqlerrm not like '%não autorizado%' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'Other account accepted'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',own,'role','authenticated')::text,true);
  select id into other_tenant_id from public.tenants t where t.id<>tenant order by t.id limit 1;
  if other_tenant_id is null then raise exception 'Tenant-isolation fixture unavailable'; end if;
  update public.z19p_zero19_work_items set tenant_id=other_tenant_id where id=work_ids[1];
  rejected:=false;begin perform public.z19p_zero19_mark_work_item_produced(work_ids[1]);
    exception when others then if sqlerrm not like '%não encontrada%' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'Cross-tenant application completion accepted'; end if;
  update public.z19p_zero19_work_items set tenant_id=tenant where id=work_ids[1];
  if has_function_privilege('anon','public.z19p_zero19_mark_work_item_produced(uuid)','execute') then raise exception 'Anonymous EXECUTE leak'; end if;
  if not has_function_privilege('authenticated','public.z19p_zero19_mark_work_item_produced(uuid)','execute') then raise exception 'Team EXECUTE missing'; end if;

  insert into public.z19p_production_pauses(id,owner_id,project_id,scope,note)
    values(paused_id,own,project_id,'order','QA SYNTHETIC pause');
  rejected:=false;begin perform public.z19p_zero19_mark_work_item_produced(work_ids[1]);
    exception when others then if sqlerrm not like '%Retome%' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'Paused production accepted'; end if;
  delete from public.z19p_production_pauses where id=paused_id;

  -- Direct ZERO19 keeps its existing partial-payment completion policy.
  result:=public.z19p_zero19_mark_work_item_produced(work_ids[1]);
  if result->>'completed'<>'1' or result->>'total'<>'3' then raise exception 'Wrong partial progress: %',result; end if;
  if (select stage from public.z19p_zero19_work_items where id=work_ids[1])<>'ready_pickup' then raise exception 'Pending-art application not completed'; end if;
  if (select status from public.personalization_sales where id=sale_ids[1])<>'DONE' then raise exception 'Public source not DONE'; end if;
  if (select official_order_status from public.z19p_projects where id=project_id)='ready_pickup' then raise exception 'Whole mixed order completed too early'; end if;
  if before_siblings is distinct from (select jsonb_agg(jsonb_build_object('id',w.id,'stage',w.stage,'source_file_path',w.source_file_path,'asset_id',w.asset_id) order by w.id) from public.z19p_zero19_work_items w where w.project_id=project_id and w.id<>work_ids[1]) then raise exception 'Sibling applications changed'; end if;
  if (select production_state from public.z19p_asset_placements where id=placement_ids[1])<>'printed' or (select production_state from public.z19p_asset_placements where id=placement_ids[2])<>'pending' then raise exception 'Placements not scoped to this application'; end if;
  if before_asset is distinct from (select to_jsonb(a) from public.z19p_assets a where a.id=artwork_id) then raise exception 'Shared asset changed'; end if;
  if not exists(select 1 from public.z19p_audit_log a where a.entity_id=work_ids[1]::text and a.actor_user_id=own and a.metadata->>'source'='queue_manual_produced' and a.metadata->>'from_stage'='awaiting_art') then raise exception 'Audit actor/source/stage missing'; end if;
  result:=public.z19p_zero19_mark_work_item_produced(work_ids[1]);
  if result->>'already_produced'<>'true' or (select count(*) from public.z19p_audit_log where entity_id=work_ids[1]::text and action='zero19_application_produced')<>1 then raise exception 'Retry duplicated completion history'; end if;

  -- An unreleased Venduss mirror is blocked, even if its UI stage was stale.
  insert into public.venduss_order_integration(source_order_id,source_tenant_id,supplier_tenant_id,supplier_order_id,sync_pending)
    values(fake_source_id,tenant,tenant,order_id,false);
  rejected:=false;begin perform public.z19p_zero19_mark_work_item_produced(work_ids[2]);
    exception when others then if sqlerrm not like '%Venduss%' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'Unreleased Venduss accepted'; end if;
  update public.venduss_order_integration set released_at=now(),released_by=own,release_kind='manual',release_reason='QA SYNTHETIC release' where source_order_id=fake_source_id;
  update public.z19p_zero19_work_items set stage='awaiting_release' where id=work_ids[2];
  rejected:=false;begin perform public.z19p_zero19_mark_work_item_produced(work_ids[2]);
    exception when others then if sqlerrm not like '%Venduss%' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'Awaiting-release stage accepted'; end if;
  update public.z19p_zero19_work_items set stage='awaiting_font' where id=work_ids[2];
  perform public.z19p_zero19_mark_work_item_produced(work_ids[2]);
  if (select stage from public.z19p_zero19_work_items where id=work_ids[2])<>'ready_pickup' then raise exception 'Manually released pending-font item not completed'; end if;

  -- Existing TIFF selected export advances only to production, never completion.
  perform public.z19p_mark_selected_order_production(array[project_id],'{}',array[sale_ids[3]]);
  if (select stage from public.z19p_zero19_work_items where id=work_ids[3])<>'production' then raise exception 'TIFF export behavior regressed'; end if;
  if (select status from public.personalization_sales where id=sale_ids[3])<>'IN_PROGRESS' then raise exception 'TIFF source completion behavior regressed'; end if;
  perform public.z19p_zero19_mark_work_item_produced(work_ids[3]);
  if (select official_order_status from public.z19p_projects where id=project_id)<>'ready_pickup' then raise exception 'Last application did not finish aggregate'; end if;
  if (select count(*) from public.z19p_zero19_work_items w where w.project_id=project_id and w.stage='ready_pickup')<>3 then raise exception 'All applications not ready'; end if;

  -- A cancelled source cannot be resurrected, including a repeated completion.
  update public.orders set status='CANCELADO' where id=order_id;
  rejected:=false;begin perform public.z19p_zero19_mark_work_item_produced(work_ids[1]);
    exception when others then if sqlerrm not like '%cancelad%' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'Cancelled source accepted'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'stage',w.stage) order by w.id),'[]')
    into after_real from public.z19p_zero19_work_items w where w.order_id is distinct from order_id;
  if before_real is distinct from after_real then raise exception 'A real application stage changed'; end if;
  perform set_config('application_produced.test_result','Synthetic rollback passed: partial completion, siblings, shared asset, placements, audit, retries, auth/tenant isolation, pauses, Venduss release, pending files/font, partial payment, TIFF production, aggregate and cancellation; zero real orders completed.',true);
end $$;
select current_setting('application_produced.test_result') as result;
rollback;
