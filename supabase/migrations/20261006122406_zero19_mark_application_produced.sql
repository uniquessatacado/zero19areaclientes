-- Explicit confirmation that ONE application has already been produced.
-- This is separate from TIFF export, which still only starts production.
create or replace function public.z19p_zero19_mark_work_item_produced(p_work_item_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  own uuid := public.z19p_current_account_owner();
  tenant constant uuid := '0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid;
  w public.z19p_zero19_work_items;
  source_order public.orders;
  source_sale public.personalization_sales;
  aggregate_stage text;
  confirmed_at timestamptz := now();
  placement_count integer := 0;
  locked_project_id uuid;
  total_count integer;
  completed_count integer;
begin
  if auth.uid() is null or own is distinct from '96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid then
    raise exception 'Acesso não autorizado.';
  end if;
  select * into w from public.z19p_zero19_work_items
    where id=p_work_item_id and owner_id=own and tenant_id=tenant;
  if not found then raise exception 'Personalização não encontrada.'; end if;
  locked_project_id:=w.project_id;
  select * into source_order from public.orders where id=w.order_id and tenant_id=tenant;
  if not found then raise exception 'Pedido de origem não encontrado.'; end if;

  -- Match source synchronization lock order: customer, order, project, item.
  perform pg_advisory_xact_lock(hashtext('zero19_pdv_workspace:' || tenant::text || ':' || coalesce(source_order.customer_id::text,source_order.id::text)));
  perform pg_advisory_xact_lock(hashtext('zero19_pdv_order:' || tenant::text || ':' || source_order.id::text));
  select * into source_order from public.orders where id=w.order_id and tenant_id=tenant for update;
  if not found then raise exception 'Pedido de origem não encontrado.'; end if;
  perform 1 from public.z19p_projects
    where id=w.project_id and owner_id=own and official_order_source='zero19_pdv'
      and official_order_ref=source_order.id::text for update;
  if not found then raise exception 'Vínculo do pedido inválido. Atualize a fila.'; end if;
  select * into w from public.z19p_zero19_work_items
    where id=p_work_item_id and owner_id=own and tenant_id=tenant for update;
  if not found or w.order_id is distinct from source_order.id or w.project_id is distinct from locked_project_id then
    raise exception 'Personalização alterada. Atualize a fila.';
  end if;
  select * into source_sale from public.personalization_sales
    where id=w.personalization_sale_id and order_id=w.order_id and tenant_id=tenant for update;
  if not found then raise exception 'Aplicação de origem não encontrada.'; end if;
  if source_order.status='CANCELADO' or source_sale.status='CANCELLED' or w.stage='cancelled' then
    raise exception 'Pedido ou aplicação cancelados.';
  end if;
  if w.stage='awaiting_release' or exists(
    select 1 from public.venduss_order_integration link
    left join public.orders original on original.id=link.source_order_id and original.tenant_id=link.source_tenant_id
    where link.supplier_order_id=w.order_id and link.supplier_tenant_id=tenant
      and (link.released_at is null or link.source_deleted or original.status='CANCELADO')
  ) then raise exception 'Pedido Venduss ainda não liberado ou cancelado.'; end if;

  -- Retry does not return a finished application to production or duplicate history.
  if w.stage in ('ready_pickup','delivered') then
    return jsonb_build_object('work_item_id',w.id,'project_id',w.project_id,'stage',w.stage,'already_produced',true);
  end if;
  if w.stage not in ('awaiting_art','art_received','awaiting_halftone','awaiting_font','ready_production','production') then
    raise exception 'Esta aplicação não pode ser concluída nesta etapa.';
  end if;
  if exists(select 1 from public.z19p_production_pauses
    where owner_id=own and ended_at is null and (scope='printer' or project_id=w.project_id)) then
    raise exception 'Retome a produção antes de concluir.';
  end if;

  -- No new payment gate for direct ZERO19 orders: preserve existing completion policy.
  -- No asset/file/font readiness gate: this explicitly records production done elsewhere.
  update public.personalization_sales set status='DONE',completed_at=coalesce(completed_at,confirmed_at),updated_at=confirmed_at
    where id=source_sale.id and tenant_id=tenant;
  update public.z19p_zero19_work_items
    set stage='ready_pickup',ready_at=coalesce(ready_at,confirmed_at),updated_at=confirmed_at,
      metadata=metadata||jsonb_build_object('production_confirmation',jsonb_build_object(
        'source','queue_manual_produced','actor_user_id',auth.uid(),'confirmed_at',confirmed_at,'from_stage',w.stage))
    where id=w.id and owner_id=own and tenant_id=tenant;
  -- Only this application's placements leave the film queue. Shared assets stay unchanged.
  update public.z19p_asset_placements
    set production_state='printed',updated_at=confirmed_at,updated_by=auth.uid(),
      metadata=metadata||jsonb_build_object('produced_confirmation_source','queue_manual_produced','produced_confirmed_at',confirmed_at)
    where owner_id=own and project_id=w.project_id and external_order_item_ref=w.personalization_sale_id::text
      and production_state in ('pending','production');
  get diagnostics placement_count=row_count;
  aggregate_stage:=public.z19p_zero19_refresh_project(w.project_id);
  insert into public.z19p_audit_log(owner_id,actor_user_id,workspace_id,project_id,entity_type,entity_id,action,description,metadata)
    values(own,auth.uid(),w.workspace_id,w.project_id,'zero19_work_item',w.id::text,
      'zero19_application_produced','Confirmou que esta aplicação já foi produzida.',jsonb_build_object(
        'source','queue_manual_produced','order_id',w.order_id,'personalization_sale_id',w.personalization_sale_id,
        'from_stage',w.stage,'to_stage','ready_pickup','confirmed_at',confirmed_at,'placements',placement_count));
  select count(*),count(*) filter(where stage in ('ready_pickup','delivered'))
    into total_count,completed_count from public.z19p_zero19_work_items
    where owner_id=own and tenant_id=tenant and project_id=w.project_id and stage<>'cancelled';
  return jsonb_build_object('work_item_id',w.id,'project_id',w.project_id,'stage','ready_pickup',
    'project_stage',aggregate_stage,'already_produced',false,'completed',completed_count,'total',total_count);
end $$;
revoke all on function public.z19p_zero19_mark_work_item_produced(uuid) from public,anon;
grant execute on function public.z19p_zero19_mark_work_item_produced(uuid) to authenticated;
comment on function public.z19p_zero19_mark_work_item_produced(uuid) is
  'Confirma produção já concluída de uma aplicação ZERO19; preserva demais aplicações, assets e exportação TIFF.';
