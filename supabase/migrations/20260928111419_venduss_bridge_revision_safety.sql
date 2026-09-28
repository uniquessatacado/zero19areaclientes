-- Edits after physical work started require explicit review, not silent reprinting.
alter table public.venduss_order_integration add column revision_pending boolean not null default false;
alter table public.venduss_order_integration add column revision_reason text;
create function venduss_fulfillment_private.hold_revision() returns trigger language plpgsql security definer set search_path='' as $$
declare source_id uuid; link public.venduss_order_integration%rowtype;
begin
  source_id:=coalesce(new.order_id,old.order_id);
  select * into link from public.venduss_order_integration where source_order_id=source_id;
  if not found or link.supplier_order_id is null then return null; end if;
  if tg_op='UPDATE' and (new.product_id,new.variant_id,new.quantity,new.excluido) is not distinct from (old.product_id,old.variant_id,old.quantity,old.excluido) then return null; end if;
  if exists(select 1 from public.orders where id=link.supplier_order_id and separation_completed_at is not null)
    or exists(select 1 from public.z19p_zero19_work_items where order_id=link.supplier_order_id and stage in ('production','ready_pickup','delivered')) then
    update public.venduss_order_integration set revision_pending=true,
      revision_reason='Pedido alterado na Venduss depois do início da separação/produção. Confira as peças e o que já foi produzido antes de liberar novamente.',
      released_at=null,release_kind=null,released_by=null,release_reason=null,sync_pending=true,sync_error=null,updated_at=now()
      where source_order_id=source_id;
    perform set_config('venduss.bridge_source',source_id::text,true);
    update public.orders set status='RECEBIDO',separation_completed_at=null,venduss_integration_state='pending' where id=link.supplier_order_id and status<>'CANCELADO';
    perform set_config('venduss.bridge_source','',true);
  end if;
  return null;
end $$;
revoke all on function venduss_fulfillment_private.hold_revision() from public,anon,authenticated;
create trigger venduss_revision_hold after insert or update or delete on public.order_items for each row execute function venduss_fulfillment_private.hold_revision();

do $patch$
declare definition text; anchor text;
begin
  definition:=pg_get_functiondef('venduss_fulfillment_private.sync_order(uuid)'::regprocedure);
  anchor:='if src.payment_status=''PAGO'' and link.released_at is null then';
  if position(anchor in definition)=0 then raise exception 'Review release condition before updating'; end if;
  definition:=replace(definition,anchor,'if src.payment_status=''PAGO'' and link.released_at is null and not link.revision_pending then');
  anchor:='update public.orders set total_amount=amount,subtotal_amount=amount,profit_amount=0,';
  if position(anchor in definition)=0 then raise exception 'Review supplier totals before updating'; end if;
  definition:=replace(definition,anchor,anchor||E'\n    payment_status=case when coalesce(amount_paid,0)>0 and amount>amount_paid then ''PARCIAL'' when coalesce(amount_paid,0)>0 and amount<=amount_paid then ''PAGO'' else payment_status end,');
  anchor:='is distinct from (excluded.details,excluded.text_value,excluded.garment_variation,false);';
  if position(anchor in definition)=0 then raise exception 'Review artwork snapshot before updating'; end if;
  definition:=replace(definition,anchor,anchor||E'\n      if previous_details is null then\n        update public.personalization_sales set pickup_at=src.pickup_due_at,estimated_ready_at=src.pickup_due_at where venduss_source_item_id=item.id;\n      end if;');
  anchor:='-- Re-run release guard even when the artwork/quantity did not change.';
  definition:=replace(definition,anchor,E'-- No invented 20-minute promise from the legacy personalization INSERT default.\n  update public.z19p_projects p set promised_at=(select min(coalesce(ps.pickup_at,ps.estimated_ready_at)) from public.personalization_sales ps where ps.order_id=mirror.id and ps.status<>''CANCELLED'') where p.official_order_source=''zero19_pdv'' and p.official_order_ref=mirror.id::text;\n  '||anchor);
  execute definition;
  definition:=pg_get_functiondef('public.venduss_release_order(uuid,text)'::regprocedure);
  anchor:='release_reason=coalesce(release_reason,trim(p_reason)),sync_pending=true';
  if position(anchor in definition)=0 then raise exception 'Review manual release before updating'; end if;
  execute replace(definition,anchor,'release_reason=coalesce(release_reason,trim(p_reason)),revision_pending=false,revision_reason=null,sync_pending=true');
end $patch$;

create or replace function venduss_fulfillment_private.guard_work() returns trigger language plpgsql security definer set search_path='' as $$
declare link public.venduss_order_integration%rowtype;
begin
  select * into link from public.venduss_order_integration where supplier_order_id=new.order_id;
  if not found or new.stage='cancelled' then return new; end if;
  if tg_op='UPDATE' and new.source_file_path is distinct from old.source_file_path then new.asset_id:=null; end if;
  if link.released_at is null then new.stage:='awaiting_release';
  elsif new.stage in ('awaiting_release','art_received','awaiting_art') and nullif(new.source_file_path,'') is not null then new.stage:='ready_production'; end if;
  new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object('venduss_revision_pending',link.revision_pending,'venduss_revision_reason',link.revision_reason);
  return new;
end $$;

-- When a source is cancelled, preserve actual money received for reconciliation.
-- Never fabricate a refund or a second cash movement.
create or replace function public.venduss_supplier_overview(p_tenant_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.user_tenants u where u.user_id=auth.uid() and (u.role::text='SUPER_ADMIN' or u.tenant_id=p_tenant_id)) then raise exception 'Sem permissão para consultar esta loja.'; end if;
  select jsonb_build_object('orders',count(*) filter(where status<>'CANCELADO'),'sales_total',coalesce(sum(total_amount) filter(where status<>'CANCELADO'),0),
    'receivable_total',coalesce(sum(greatest(0,total_amount-coalesce(amount_paid,0))) filter(where payment_status<>'PAGO' and status<>'CANCELADO'),0),
    'received_total',coalesce(sum(coalesce(amount_paid,0)),0),
    'reconcile_total',coalesce(sum(greatest(0,coalesce(amount_paid,0)-case when status='CANCELADO' then 0 else total_amount end)),0),
    'pending_release',count(*) filter(where venduss_integration_state='pending' and status<>'CANCELADO'),
    'pending_separation',count(*) filter(where venduss_integration_state='released' and separation_completed_at is null and status<>'CANCELADO'),
    'due_count',count(*) filter(where payment_status<>'PAGO' and status<>'CANCELADO' and venduss_receivable_due_at<=(now() at time zone 'America/Sao_Paulo')::date)) into result
    from public.orders where tenant_id=p_tenant_id and venduss_source_order_id is not null;
  return result||jsonb_build_object('attention_orders',coalesce((select jsonb_agg(to_jsonb(row)) from (
    select o.id,o.display_id,o.total_amount,o.payment_status,o.status,o.venduss_receivable_due_at,o.venduss_integration_state,src.display_id as venduss_display_id
    from public.orders o left join public.orders src on src.id=o.venduss_source_order_id
    where o.tenant_id=p_tenant_id and o.venduss_source_order_id is not null
      and ((o.status<>'CANCELADO' and (o.separation_completed_at is null or (o.payment_status<>'PAGO' and o.venduss_receivable_due_at<=(now() at time zone 'America/Sao_Paulo')::date)))
        or coalesce(o.amount_paid,0)>case when o.status='CANCELADO' then 0 else o.total_amount end)
    order by (o.payment_status<>'PAGO' and o.venduss_receivable_due_at<=(now() at time zone 'America/Sao_Paulo')::date) desc nulls last,o.created_at limit 10
  ) row),'[]'::jsonb));
end $$;
revoke all on function public.venduss_supplier_overview(uuid) from public,anon;
grant execute on function public.venduss_supplier_overview(uuid) to authenticated;
notify pgrst,'reload schema';
