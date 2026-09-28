-- ZERO19 cancelled orders leave the production queue without deleting history.
-- Cancellation is authoritative for production. Finance/stock RPCs are unchanged.
create or replace function public.z19p_guard_cancelled_zero19_sale()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if new.tenant_id='0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid and exists(
    select 1 from public.orders o where o.id=new.order_id and o.tenant_id=new.tenant_id and o.status='CANCELADO'
  ) then new.status:='CANCELLED'; end if;
  return new;
end $function$;
revoke all on function public.z19p_guard_cancelled_zero19_sale() from public,anon,authenticated;
drop trigger if exists zzzz_zero19_cancelled_sale_guard on public.personalization_sales;
create trigger zzzz_zero19_cancelled_sale_guard before insert or update on public.personalization_sales
for each row execute function public.z19p_guard_cancelled_zero19_sale();

create or replace function public.z19p_guard_cancelled_zero19_work()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if new.tenant_id='0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid and exists(
    select 1 from public.orders o where o.id=new.order_id and o.tenant_id=new.tenant_id and o.status='CANCELADO'
  ) then new.stage:='cancelled'; end if;
  return new;
end $function$;
revoke all on function public.z19p_guard_cancelled_zero19_work() from public,anon,authenticated;
drop trigger if exists zzzz_zero19_cancelled_work_guard on public.z19p_zero19_work_items;
create trigger zzzz_zero19_cancelled_work_guard before insert or update on public.z19p_zero19_work_items
for each row execute function public.z19p_guard_cancelled_zero19_work();

create or replace function public.z19p_guard_cancelled_zero19_project()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if new.owner_id='96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid and new.official_order_source='zero19_pdv' and exists(
    select 1 from public.orders o where o.id::text=new.official_order_ref
      and o.tenant_id='0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid and o.status='CANCELADO'
  ) then
    new.official_order_status:='cancelled';
    new.status_id:=coalesce(public.z19p_zero19_status_id(new.owner_id,'cancelled'),new.status_id);
    new.official_order_payload:=coalesce(new.official_order_payload,'{}'::jsonb)||jsonb_build_object('order_status','CANCELADO');
  end if;
  return new;
end $function$;
revoke all on function public.z19p_guard_cancelled_zero19_project() from public,anon,authenticated;
drop trigger if exists zzzz_zero19_cancelled_project_guard on public.z19p_projects;
create trigger zzzz_zero19_cancelled_project_guard before insert or update on public.z19p_projects
for each row execute function public.z19p_guard_cancelled_zero19_project();

-- Stale pause dialogs must not keep a cancelled order in capacity reservations.
create or replace function public.z19p_guard_cancelled_zero19_pause()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if new.scope='order' and new.owner_id='96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid and exists(
    select 1 from public.z19p_projects p join public.orders o on o.id::text=p.official_order_ref
    where p.id=new.project_id and p.owner_id=new.owner_id and p.official_order_source='zero19_pdv'
      and o.tenant_id='0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid and o.status='CANCELADO'
  ) then
    new.ended_at:=coalesce(new.ended_at,greatest(now(),new.started_at));
    new.ended_by:=coalesce(new.ended_by,auth.uid());
  end if;
  return new;
end $function$;
revoke all on function public.z19p_guard_cancelled_zero19_pause() from public,anon,authenticated;
drop trigger if exists zzzz_zero19_cancelled_pause_guard on public.z19p_production_pauses;
create trigger zzzz_zero19_cancelled_pause_guard before insert or update on public.z19p_production_pauses
for each row execute function public.z19p_guard_cancelled_zero19_pause();

-- Preserve the canonical sync implementation and its concurrency fixes.
do $migration$
declare definition text; anchor text:=E'  select * into v_order from public.orders where id=p_order_id and tenant_id=v_tenant;\n  if not found then return null; end if;';
begin
  definition:=pg_get_functiondef('public.z19p_sync_zero19_order_internal(uuid)'::regprocedure);
  if position('-- Cancelled source orders never revive production.' in definition)=0 then
    if position(anchor in definition)=0 then raise exception 'Canonical ZERO19 sync changed; review cancellation guard.'; end if;
    definition:=replace(definition,anchor,anchor||E'\n\n  -- Cancelled source orders never revive production.\n  if v_order.status=''CANCELADO'' then\n    select p.id into v_project from public.z19p_projects p\n    where p.owner_id=v_owner and p.official_order_source=''zero19_pdv'' and p.official_order_ref=p_order_id::text\n    order by p.created_at,p.id limit 1;\n    return v_project;\n  end if;');
    execute definition;
  end if;
end $migration$;

-- Completed timestamps remain history, but cancelled jobs are not samples.
do $migration$
declare definition text; anchor text:='and p.ready_at>p.production_started_at';
begin
  definition:=pg_get_functiondef('public.zero19_personalization_ops_snapshot_v21738(uuid)'::regprocedure);
  if position('and p.official_order_status in (''ready_pickup'',''delivered'')' in definition)=0 then
    if position(anchor in definition)=0 then raise exception 'Production sample query changed; review cancellation filter.'; end if;
    execute replace(definition,anchor,anchor||' and p.official_order_status in (''ready_pickup'',''delivered'')');
  end if;
end $migration$;

create or replace function public.z19p_cancel_zero19_order_production_internal(p_order_id uuid)
returns void language plpgsql security definer set search_path='' as $function$
declare
  v_tenant constant uuid:='0e885daf-b461-4384-b2c2-8ed2cf33478b';
  v_owner constant uuid:='96d8732c-9576-4af9-9fe7-cdee065c14e6';
  v_previous_owner text:=coalesce(current_setting('z19p.owner_override',true),'');
  v_projects uuid[];
begin
  if not exists(select 1 from public.orders where id=p_order_id and tenant_id=v_tenant and status='CANCELADO') then return; end if;
  select coalesce(array_agg(p.id order by p.id),'{}'::uuid[]) into v_projects
  from public.z19p_projects p where p.owner_id=v_owner and p.official_order_source='zero19_pdv' and p.official_order_ref=p_order_id::text;

  update public.personalization_sales set status='CANCELLED',updated_at=now()
  where tenant_id=v_tenant and order_id=p_order_id and status is distinct from 'CANCELLED';
  update public.z19p_zero19_work_items set stage='cancelled',updated_at=now()
  where tenant_id=v_tenant and owner_id=v_owner and order_id=p_order_id and stage is distinct from 'cancelled';

  perform set_config('z19p.owner_override',v_owner::text,true);
  update public.z19p_projects
  set official_order_status='cancelled',
      status_id=coalesce(public.z19p_zero19_status_id(v_owner,'cancelled'),status_id),
      official_order_payload=coalesce(official_order_payload,'{}'::jsonb)||jsonb_build_object('order_status','CANCELADO'),
      official_order_synced_at=now(),updated_at=now()
  where id=any(v_projects) and owner_id=v_owner;
  perform set_config('z19p.owner_override',v_previous_owner,true);

  update public.z19p_production_pauses set ended_at=greatest(now(),started_at),ended_by=coalesce(auth.uid(),ended_by)
  where owner_id=v_owner and project_id=any(v_projects) and scope='order' and ended_at is null;
exception when others then
  perform set_config('z19p.owner_override',v_previous_owner,true);
  raise;
end $function$;
revoke all on function public.z19p_cancel_zero19_order_production_internal(uuid) from public,anon,authenticated;

create or replace function public.z19p_cancel_zero19_order_production_trigger()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if new.tenant_id='0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid and new.status='CANCELADO' then
    perform public.z19p_cancel_zero19_order_production_internal(new.id);
  end if;
  -- Restoring a live order status does not silently reopen its production.
  -- Explicit production reopening is allowed only after that source restore.
  return new;
end $function$;
revoke all on function public.z19p_cancel_zero19_order_production_trigger() from public,anon,authenticated;
drop trigger if exists z19p_zero19_order_cancellation on public.orders;
create trigger z19p_zero19_order_cancellation after insert or update of status on public.orders
for each row execute function public.z19p_cancel_zero19_order_production_trigger();

-- Audited inconsistent orders: #47623 #47874 #47880 #47983 #48356 #49228
-- #49370 (10 personalization rows); #48860 already consistent.
-- No order status, stock, payment, amount, artwork, or history is changed here.
do $backfill$
declare row record;
begin
  for row in select o.id from public.orders o
    where o.tenant_id='0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid and o.status='CANCELADO'
      and (exists(select 1 from public.personalization_sales s where s.order_id=o.id and s.tenant_id=o.tenant_id)
        or exists(select 1 from public.z19p_projects p where p.owner_id='96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid and p.official_order_source='zero19_pdv' and p.official_order_ref=o.id::text))
    order by o.id
  loop perform public.z19p_cancel_zero19_order_production_internal(row.id); end loop;
end $backfill$;

notify pgrst,'reload schema';
