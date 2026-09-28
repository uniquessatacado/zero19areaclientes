-- Explicit item identity replaces project-wide advancement. No stock/finance writes.
create or replace function public.z19p_mark_selected_order_production(
  p_project_ids uuid[], p_placement_ids uuid[], p_sale_ids uuid[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  own uuid:=public.z19p_current_account_owner();
  selected_ids uuid[]; project_row record; changed integer; placements integer;
begin
  if auth.uid() is null or own is null then raise exception 'Autenticação obrigatória.'; end if;
  if exists(select 1 from unnest(coalesce(p_project_ids,'{}')) req(id) where not exists(
    select 1 from public.z19p_projects p where p.id=req.id and p.owner_id=own))
  or exists(select 1 from unnest(coalesce(p_placement_ids,'{}')) req(id) where not exists(
    select 1 from public.z19p_asset_placements a where a.id=req.id and a.owner_id=own
      and (a.project_id is null or a.project_id=any(coalesce(p_project_ids,'{}')))))
  or exists(select 1 from unnest(coalesce(p_sale_ids,'{}')) req(id) where not exists(
    select 1 from public.z19p_zero19_work_items w where w.personalization_sale_id=req.id
      and w.owner_id=own and w.project_id=any(coalesce(p_project_ids,'{}'))))
  then raise exception 'Vínculo de produção inválido. Atualize o filme.'; end if;

  perform 1 from public.z19p_projects where owner_id=own and id=any(coalesce(p_project_ids,'{}')) order by id for update;
  if exists(select 1 from public.z19p_projects p join public.orders o on o.id::text=p.official_order_ref
    where p.owner_id=own and p.official_order_source='zero19_pdv' and p.id=any(coalesce(p_project_ids,'{}'))
      and o.status='CANCELADO') then raise exception 'Pedido cancelado. Remova seus itens do filme.'; end if;
  if exists(select 1 from public.z19p_production_pauses where owner_id=own and ended_at is null
    and (scope='printer' or project_id=any(coalesce(p_project_ids,'{}'))))
  then raise exception 'Retome a produção antes de confirmar o filme.'; end if;

  select array_agg(w.id) into selected_ids from public.z19p_zero19_work_items w
  where w.owner_id=own and w.project_id=any(coalesce(p_project_ids,'{}')) and (
    w.personalization_sale_id=any(coalesce(p_sale_ids,'{}')) or exists(
      select 1 from public.z19p_asset_placements a where a.id=any(coalesce(p_placement_ids,'{}'))
        and a.owner_id=own and a.project_id=w.project_id
        and a.external_order_item_ref=w.personalization_sale_id::text));
  selected_ids:=coalesce(selected_ids,'{}');
  if exists(select 1 from public.z19p_projects p where p.id=any(coalesce(p_project_ids,'{}'))
    and p.owner_id=own and p.official_order_source='zero19_pdv' and not exists(
      select 1 from public.z19p_zero19_work_items w where w.project_id=p.id and w.id=any(selected_ids)))
  then raise exception 'Identificação da personalização ausente. Atualize e adicione o item novamente ao filme.'; end if;
  perform 1 from public.z19p_zero19_work_items where id=any(selected_ids) order by id for update;
  if exists(select 1 from public.z19p_zero19_work_items where id=any(selected_ids)
    and stage not in ('ready_production','production','ready_pickup','delivered'))
  then raise exception 'Uma personalização selecionada ainda possui pendência ou foi cancelada.'; end if;

  update public.z19p_zero19_work_items set stage='production',production_started_at=coalesce(production_started_at,now()),updated_at=now()
    where owner_id=own and id=any(selected_ids) and stage='ready_production';
  get diagnostics changed=row_count;
  update public.personalization_sales s set status='IN_PROGRESS',started_at=coalesce(started_at,now()),updated_at=now()
    where s.tenant_id='0e885daf-b461-4384-b2c2-8ed2cf33478b' and s.status not in ('DONE','DELIVERED','CANCELLED')
      and exists(select 1 from public.z19p_zero19_work_items w where w.id=any(selected_ids) and w.stage='production' and w.personalization_sale_id=s.id);
  update public.z19p_asset_placements a set production_state='production',exported_at=coalesce(exported_at,now()),updated_at=now(),updated_by=auth.uid()
    where owner_id=own and id=any(coalesce(p_placement_ids,'{}')) and production_state='pending';
  get diagnostics placements=row_count;
  for project_row in select * from public.z19p_projects where owner_id=own and id=any(coalesce(p_project_ids,'{}')) loop
    if project_row.official_order_source='zero19_pdv' then
      perform public.z19p_zero19_refresh_project(project_row.id);
    else
      update public.z19p_projects set official_order_status='production',production_started_at=coalesce(production_started_at,now()),
        updated_at=now(),updated_by=auth.uid(),status_id=coalesce(public.z19p_zero19_status_id(own,'production'),status_id)
        where id=project_row.id and official_order_ref is not null;
    end if;
  end loop;
  return jsonb_build_object('projects',coalesce(cardinality(p_project_ids),0),'placements',placements,'personalizations',changed);
end $$;
revoke all on function public.z19p_mark_selected_order_production(uuid[],uuid[],uuid[]) from public,anon;
grant execute on function public.z19p_mark_selected_order_production(uuid[],uuid[],uuid[]) to authenticated;

-- Old clients may identify positioned art, but must never advance unidentified siblings.
create or replace function public.z19p_mark_official_order_production(p_project_ids uuid[],p_placement_ids uuid[])
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  return public.z19p_mark_selected_order_production(p_project_ids,p_placement_ids,'{}');
end $$;

create or replace function public.z19p_zero19_complete_work_item(p_work_item_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare own uuid:=public.z19p_current_account_owner(); w public.z19p_zero19_work_items; aggregate_stage text;
begin
  if auth.uid() is null or own is distinct from '96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid then raise exception 'Acesso não autorizado.'; end if;
  select * into w from public.z19p_zero19_work_items where id=p_work_item_id and owner_id=own;
  if not found then raise exception 'Personalização não encontrada.'; end if;
  perform 1 from public.z19p_projects where id=w.project_id and owner_id=own for update;
  select * into w from public.z19p_zero19_work_items where id=p_work_item_id and owner_id=own for update;
  if w.stage not in ('production','ready_pickup','delivered') then raise exception 'Somente uma personalização em produção pode ser concluída.'; end if;
  if exists(select 1 from public.z19p_projects p join public.orders o on o.id::text=p.official_order_ref
    where p.id=w.project_id and o.status='CANCELADO') then raise exception 'Pedido cancelado.'; end if;
  if exists(select 1 from public.z19p_production_pauses where owner_id=own and ended_at is null and (scope='printer' or project_id=w.project_id))
    then raise exception 'Retome a produção antes de concluir.'; end if;
  update public.z19p_zero19_work_items set stage='ready_pickup',ready_at=coalesce(ready_at,now()),updated_at=now() where id=w.id and stage='production';
  update public.personalization_sales set status='DONE',completed_at=coalesce(completed_at,now()),updated_at=now()
    where id=w.personalization_sale_id and tenant_id='0e885daf-b461-4384-b2c2-8ed2cf33478b' and status not in ('DONE','DELIVERED','CANCELLED');
  aggregate_stage:=public.z19p_zero19_refresh_project(w.project_id);
  return jsonb_build_object('work_item_id',w.id,'project_stage',aggregate_stage);
end $$;
revoke all on function public.z19p_zero19_complete_work_item(uuid) from public,anon;
grant execute on function public.z19p_zero19_complete_work_item(uuid) to authenticated;
