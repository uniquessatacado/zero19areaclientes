-- Venduss sales -> ZERO19 cost-only receivable + existing production workflow.
-- Physical availability is ALREADY moved by inventory_private.sync_stock.
-- Never call create_order/order_stock_cancel for the supplier mirror.
create schema if not exists venduss_fulfillment_private;
revoke all on schema venduss_fulfillment_private from public,anon,authenticated;
create table venduss_fulfillment_private.settings(id boolean primary key default true check(id),enabled boolean not null default false);
insert into venduss_fulfillment_private.settings(id,enabled) values(true,false);
alter table venduss_fulfillment_private.settings enable row level security;

alter table public.orders add column if not exists venduss_source_order_id uuid;
alter table public.orders add column if not exists venduss_receivable_due_at date;
alter table public.orders add column if not exists venduss_integration_state text;
create unique index if not exists orders_venduss_source_unique on public.orders(venduss_source_order_id) where venduss_source_order_id is not null;
alter table public.order_items add column if not exists venduss_source_item_id uuid;
create unique index if not exists order_items_venduss_source_unique on public.order_items(venduss_source_item_id) where venduss_source_item_id is not null;
alter table public.personalization_sales add column if not exists venduss_source_item_id uuid;
create unique index if not exists personalization_venduss_source_unique on public.personalization_sales(venduss_source_item_id) where venduss_source_item_id is not null;

create table public.venduss_order_integration (
  source_order_id uuid primary key,
  source_tenant_id uuid not null references public.tenants(id),
  supplier_tenant_id uuid not null references public.tenants(id),
  supplier_order_id uuid unique references public.orders(id) on delete restrict,
  released_at timestamptz,
  released_by uuid,
  release_reason text,
  release_kind text check(release_kind in ('payment','manual')),
  source_deleted boolean not null default false,
  sync_pending boolean not null default true,
  sync_error text,
  attempts integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.venduss_order_integration enable row level security;
create policy venduss_integration_team_read on public.venduss_order_integration for select to authenticated using (
  exists(select 1 from public.user_tenants u where u.user_id=(select auth.uid()) and (u.role::text='SUPER_ADMIN' or u.tenant_id in (source_tenant_id,supplier_tenant_id)))
  or exists(select 1 from public.z19p_partner_tenants p where p.tenant_id=source_tenant_id and p.enabled and p.owner_id=public.z19p_current_account_owner())
);
grant select on public.venduss_order_integration to authenticated;
revoke all on public.venduss_order_integration from anon;
create index venduss_integration_retry_idx on public.venduss_order_integration(updated_at) where sync_pending;
create index venduss_receivable_due_idx on public.orders(tenant_id,venduss_receivable_due_at) where venduss_source_order_id is not null and payment_status<>'PAGO' and status<>'CANCELADO';

create table venduss_fulfillment_private.customers (
  source_tenant_id uuid not null references public.tenants(id),
  supplier_tenant_id uuid not null references public.tenants(id),
  customer_id uuid not null references public.customers(id),
  primary key(source_tenant_id,supplier_tenant_id)
);
alter table venduss_fulfillment_private.customers enable row level security;

create function venduss_fulfillment_private.sync_order(p_source uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  src public.orders%rowtype; link public.venduss_order_integration%rowtype;
  mirror public.orders%rowtype; item record; old_item public.order_items%rowtype;
  buyer public.tenants%rowtype; buyer_customer uuid; sale_id uuid;
  details jsonb; previous_details jsonb; amount numeric; price numeric; has_art boolean; cancelled boolean;
begin
  -- Source before integration before supplier: stable lock ordering.
  select * into src from public.orders where id=p_source for update;
  select * into link from public.venduss_order_integration where source_order_id=p_source for update;
  if not found then return; end if;
  cancelled:=src.id is null or link.source_deleted or src.status='CANCELADO' or src.excluido='T';
  perform set_config('venduss.bridge_source',p_source::text,true);
  if cancelled then
    update public.orders set status='CANCELADO',payment_status=case when payment_status='PAGO' then payment_status else 'CANCELADO' end,updated_at=now()
      where id=link.supplier_order_id and status<>'CANCELADO';
    update public.personalization_sales set status='CANCELLED' where order_id=link.supplier_order_id and status<>'CANCELLED';
    update public.venduss_order_integration set sync_pending=false,sync_error=null,updated_at=now() where source_order_id=p_source;
    perform set_config('venduss.bridge_source','',true); return;
  end if;
  if src.payment_status='PAGO' and link.released_at is null then
    update public.venduss_order_integration set released_at=now(),release_kind='payment',updated_at=now()
      where source_order_id=p_source returning * into link;
  end if;
  select * into buyer from public.tenants where id=src.tenant_id;
  select customer_id into buyer_customer from venduss_fulfillment_private.customers
    where source_tenant_id=src.tenant_id and supplier_tenant_id=link.supplier_tenant_id;
  if buyer_customer is null then
    perform pg_advisory_xact_lock(hashtextextended('venduss-buyer:'||src.tenant_id::text||':'||link.supplier_tenant_id::text,0));
    select customer_id into buyer_customer from venduss_fulfillment_private.customers
      where source_tenant_id=src.tenant_id and supplier_tenant_id=link.supplier_tenant_id;
    if buyer_customer is null then
      insert into public.customers(tenant_id,full_name,whatsapp,customer_type,observacao)
      values(link.supplier_tenant_id,'Venduss · compra de peças pelo custo',coalesce(buyer.sales_whatsapp,''),'USO_PROPRIO','Conta integrada da loja Venduss; não é o cliente final.') returning id into buyer_customer;
      insert into venduss_fulfillment_private.customers values(src.tenant_id,link.supplier_tenant_id,buyer_customer);
    end if;
  end if;
  select * into mirror from public.orders where id=link.supplier_order_id for update;
  if mirror.id is null then
    insert into public.orders(tenant_id,customer_id,status,payment_status,origin,total_amount,subtotal_amount,profit_amount,shipping_cost,
      payment_method,shipping_method,observacao_cliente,venduss_source_order_id)
    values(link.supplier_tenant_id,buyer_customer,'RECEBIDO','PENDENTE','VENDUSS',0,0,0,0,
      'A RECEBER DA VENDUSS','RETIRADA VENDUSS','Pedido Venduss #'||src.display_id||' · venda pelo custo · estoque já reservado na origem.',src.id)
    returning * into mirror;
    update public.venduss_order_integration set supplier_order_id=mirror.id where source_order_id=p_source;
  end if;
  for item in
    select oi.*,base.id base_id,base.name base_name,base.main_image_url base_image,
      pv.stock_source_variant_id base_variant_id,base_variant.size base_size,
      coalesce(base_variant.cost_price,base.cost_price) base_cost,co.name color_name,sub.name subcategory_name,
      art.prepared_path,art.width_cm,art.height_cm,art.print_position_code,pos.label position_label
    from public.order_items oi
    join public.product_variants pv on pv.id=oi.variant_id
    join public.product_variants base_variant on base_variant.id=pv.stock_source_variant_id
    join public.products base on base.id=base_variant.product_id and base.tenant_id=link.supplier_tenant_id
    left join public.colors co on co.id=coalesce(base_variant.color_id,base.color_id)
    left join public.subcategories sub on sub.id=base.subcategory_id
    left join public.venduss_shared_print_artworks art on art.product_id=oi.product_id and art.tenant_id=src.tenant_id
    left join public.z19p_partner_tenants partner on partner.tenant_id=src.tenant_id and partner.enabled
    left join public.z19p_print_positions pos on pos.owner_id=partner.owner_id and pos.code=art.print_position_code
    where oi.order_id=p_source and coalesce(oi.excluido,'F')<>'T' order by oi.id
  loop
    select * into old_item from public.order_items where venduss_source_item_id=item.id;
    price:=case when old_item.id is not null and old_item.product_id=item.base_id then old_item.unit_price else item.base_cost end;
    if price is null or price<0 then raise exception 'Cadastre o custo da peça ZERO19 % antes de sincronizar.',item.base_id; end if;
    insert into public.order_items(order_id,tenant_id,product_id,variant_id,product_name,product_image,size,quantity,unit_price,cost_price,subtotal,venduss_source_item_id,metadata)
    values(mirror.id,link.supplier_tenant_id,item.base_id,item.base_variant_id,item.base_name,item.base_image,item.base_size,item.quantity,price,price,price*item.quantity,item.id,
      jsonb_build_object('venduss_order_id',src.id,'venduss_display_id',src.display_id,'venduss_product_name',item.product_name,'color',item.color_name,'subcategory',item.subcategory_name,'stock_already_consumed',true))
    on conflict(venduss_source_item_id) where venduss_source_item_id is not null do update set
      product_id=excluded.product_id,variant_id=excluded.variant_id,product_name=excluded.product_name,product_image=excluded.product_image,
      size=excluded.size,quantity=excluded.quantity,unit_price=excluded.unit_price,cost_price=excluded.cost_price,subtotal=excluded.subtotal,metadata=excluded.metadata
    where (public.order_items.product_id,public.order_items.variant_id,public.order_items.quantity,public.order_items.unit_price,public.order_items.metadata)
      is distinct from (excluded.product_id,excluded.variant_id,excluded.quantity,excluded.unit_price,excluded.metadata);
    has_art:=item.prepared_path is not null;
    if has_art then
      details:=jsonb_build_array(jsonb_build_object('quantity',item.quantity,'production',jsonb_build_object(
        'kind','NEW_ART','file_path',item.prepared_path,'storage_bucket','venduss-print-artworks','width_cm',item.width_cm,'height_cm',item.height_cm,
        'position_code',item.print_position_code,'position_label',item.position_label,'venduss_order_id',src.id,'venduss_display_id',src.display_id,
        'venduss_product_id',item.product_id,'product_image',item.product_image,'prepared_artwork',true,'needs_halftone',false)));
      select ps.details into previous_details from public.personalization_sales ps where ps.venduss_source_item_id=item.id;
      if previous_details->0->'production'->>'venduss_product_id'=item.product_id::text then
        details:=jsonb_set(previous_details,'{0,quantity}',to_jsonb(item.quantity));
      end if;
      insert into public.personalization_sales(tenant_id,order_id,customer_id,text_value,sale_amount,cost_amount,details,garment_origin,
        garment_product_name,garment_variation,garment_model,garment_color,garment_size,venduss_source_item_id)
      values(link.supplier_tenant_id,mirror.id,buyer_customer,item.product_name,0,0,details,'STORE',item.base_name,item.base_size,item.subcategory_name,item.color_name,item.base_size,item.id)
      on conflict(venduss_source_item_id) where venduss_source_item_id is not null do update set
        text_value=excluded.text_value,details=excluded.details,garment_product_name=excluded.garment_product_name,
        garment_variation=excluded.garment_variation,garment_model=excluded.garment_model,garment_color=excluded.garment_color,garment_size=excluded.garment_size,
        status=case when public.personalization_sales.status='CANCELLED' then 'PENDING' else public.personalization_sales.status end
      where (public.personalization_sales.details,public.personalization_sales.text_value,public.personalization_sales.garment_variation,public.personalization_sales.status='CANCELLED')
        is distinct from (excluded.details,excluded.text_value,excluded.garment_variation,false);
    end if;
  end loop;
  -- Removed lines leave production immediately; keep its financial/production history.
  update public.personalization_sales ps set status='CANCELLED' where ps.order_id=mirror.id and ps.venduss_source_item_id is not null and ps.status<>'CANCELLED'
    and not exists(select 1 from public.order_items oi join public.venduss_shared_print_artworks a on a.product_id=oi.product_id
      where oi.id=ps.venduss_source_item_id and oi.order_id=p_source and coalesce(oi.excluido,'F')<>'T');
  delete from public.order_items mi where mi.order_id=mirror.id and mi.venduss_source_item_id is not null
    and not exists(select 1 from public.order_items oi join public.product_variants pv on pv.id=oi.variant_id join public.product_variants bv on bv.id=pv.stock_source_variant_id
      join public.products bp on bp.id=bv.product_id and bp.tenant_id=link.supplier_tenant_id
      where oi.id=mi.venduss_source_item_id and oi.order_id=p_source and coalesce(oi.excluido,'F')<>'T');
  select coalesce(sum(subtotal),0) into amount from public.order_items where order_id=mirror.id;
  update public.orders set total_amount=amount,subtotal_amount=amount,profit_amount=0,
    status=case when amount=0 and not exists(select 1 from public.order_items where order_id=mirror.id) then 'CANCELADO'
      when link.released_at is not null and status='RECEBIDO' then 'NA_FILA_SEPARACAO' else status end,updated_at=now()
    where id=mirror.id;
  update public.orders set venduss_integration_state=case when link.released_at is null then 'pending' else 'released' end
    where id in (p_source,mirror.id) and venduss_integration_state is distinct from case when link.released_at is null then 'pending' else 'released' end;
  -- Re-run release guard even when the artwork/quantity did not change.
  update public.z19p_zero19_work_items set updated_at=now() where order_id=mirror.id;
  perform public.z19p_zero19_refresh_project(p.id) from public.z19p_projects p where p.official_order_source='zero19_pdv' and p.official_order_ref=mirror.id::text;
  update public.venduss_order_integration set sync_pending=false,sync_error=null,updated_at=now() where source_order_id=p_source;
  perform set_config('venduss.bridge_source','',true);
end $$;

create function venduss_fulfillment_private.enqueue() returns trigger language plpgsql security definer set search_path='' as $$
declare source_id uuid; source_tenant uuid; supplier_tenant uuid;
begin
  if not exists(select 1 from venduss_fulfillment_private.settings where enabled) then return null; end if;
  if tg_table_name='orders' then source_id:=coalesce(new.id,old.id); source_tenant:=coalesce(new.tenant_id,old.tenant_id);
  else source_id:=coalesce(new.order_id,old.order_id); select tenant_id into source_tenant from public.orders where id=source_id; end if;
  if not exists(select 1 from public.tenants where id=source_tenant and subdomain='venduss') then return null; end if;
  select id into supplier_tenant from public.tenants where subdomain='zero19';
  if supplier_tenant is null then return null; end if;
  if exists(select 1 from public.order_items oi join public.product_variants v on v.id=oi.variant_id
    join public.product_variants b on b.id=v.stock_source_variant_id join public.products p on p.id=b.product_id
    where oi.order_id=source_id and p.tenant_id=supplier_tenant)
    or exists(select 1 from public.venduss_order_integration where source_order_id=source_id) then
    insert into public.venduss_order_integration(source_order_id,source_tenant_id,supplier_tenant_id,source_deleted)
    values(source_id,source_tenant,supplier_tenant,tg_table_name='orders' and tg_op='DELETE')
    on conflict(source_order_id) do update set sync_pending=true,sync_error=null,source_deleted=public.venduss_order_integration.source_deleted or excluded.source_deleted,updated_at=now();
  end if;
  return null;
end $$;
create trigger venduss_order_enqueue after insert or update or delete on public.orders for each row execute function venduss_fulfillment_private.enqueue();
create trigger venduss_item_enqueue after insert or update or delete on public.order_items for each row execute function venduss_fulfillment_private.enqueue();

create function venduss_fulfillment_private.process_one(p_source uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.venduss_order_integration where source_order_id=p_source and sync_pending) then return; end if;
  begin
    perform venduss_fulfillment_private.sync_order(p_source);
  exception when others then
    update public.venduss_order_integration set sync_pending=true,sync_error=left(sqlerrm,600),attempts=attempts+1,updated_at=now() where source_order_id=p_source;
  end;
end $$;
create function venduss_fulfillment_private.flush() returns trigger language plpgsql security definer set search_path='' as $$
begin perform venduss_fulfillment_private.process_one(new.source_order_id); return null; end $$;
create constraint trigger venduss_order_flush after insert or update on public.venduss_order_integration deferrable initially deferred for each row when(new.sync_pending and new.sync_error is null) execute function venduss_fulfillment_private.flush();

create function public.venduss_release_order(p_order_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare src public.orders%rowtype;
begin
  select * into src from public.orders where id=p_order_id for update;
  if auth.uid() is null or not exists(select 1 from public.user_tenants u where u.user_id=auth.uid() and (u.role::text='SUPER_ADMIN' or (u.tenant_id=src.tenant_id and u.role::text='ADMIN'))) then raise exception 'Sem permissão para liberar este pedido.'; end if;
  if src.status='CANCELADO' or src.excluido='T' then raise exception 'Pedido cancelado não pode ser liberado.'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Informe o motivo da liberação sem pagamento.'; end if;
  update public.venduss_order_integration set released_at=coalesce(released_at,now()),released_by=coalesce(released_by,auth.uid()),release_kind=coalesce(release_kind,'manual'),release_reason=coalesce(release_reason,trim(p_reason)),sync_pending=true,updated_at=now() where source_order_id=p_order_id;
  if not found then raise exception 'Este pedido não possui peças ZERO19 integradas.'; end if;
  perform venduss_fulfillment_private.sync_order(p_order_id);
end $$;
revoke all on function public.venduss_release_order(uuid,text) from public,anon;
grant execute on function public.venduss_release_order(uuid,text) to authenticated;

create function public.venduss_schedule_receivable(p_order_id uuid,p_due_at date) returns void language plpgsql security definer set search_path='' as $$
declare target public.orders%rowtype;
begin
  select * into target from public.orders where id=p_order_id for update;
  if auth.uid() is null or not exists(select 1 from public.user_tenants u where u.user_id=auth.uid() and (u.role::text='SUPER_ADMIN' or (u.tenant_id=target.tenant_id and u.role::text='ADMIN'))) then raise exception 'Sem permissão para agendar o recebimento.'; end if;
  if target.venduss_source_order_id is null or target.status='CANCELADO' or target.payment_status='PAGO' then raise exception 'Este pedido não possui recebimento Venduss pendente.'; end if;
  update public.orders set venduss_receivable_due_at=p_due_at,updated_at=now() where id=p_order_id;
end $$;
revoke all on function public.venduss_schedule_receivable(uuid,date) from public,anon;
grant execute on function public.venduss_schedule_receivable(uuid,date) to authenticated;

create function public.venduss_supplier_overview(p_tenant_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.user_tenants u where u.user_id=auth.uid() and (u.role::text='SUPER_ADMIN' or u.tenant_id=p_tenant_id)) then raise exception 'Sem permissão para consultar esta loja.'; end if;
  select jsonb_build_object('orders',count(*),'sales_total',coalesce(sum(total_amount),0),
    'receivable_total',coalesce(sum(greatest(0,total_amount-coalesce(amount_paid,0))) filter(where payment_status<>'PAGO'),0),
    'received_total',coalesce(sum(case when payment_status='PAGO' then total_amount else coalesce(amount_paid,0) end),0),
    'pending_release',count(*) filter(where venduss_integration_state='pending'),
    'pending_separation',count(*) filter(where venduss_integration_state='released' and separation_completed_at is null),
    'due_count',count(*) filter(where payment_status<>'PAGO' and venduss_receivable_due_at<=(now() at time zone 'America/Sao_Paulo')::date)) into result
    from public.orders where tenant_id=p_tenant_id and venduss_source_order_id is not null and status<>'CANCELADO';
  return result||jsonb_build_object('attention_orders',coalesce((select jsonb_agg(to_jsonb(row)) from (
    select o.id,o.display_id,o.total_amount,o.payment_status,o.status,o.venduss_receivable_due_at,o.venduss_integration_state,src.display_id as venduss_display_id
    from public.orders o left join public.orders src on src.id=o.venduss_source_order_id
    where o.tenant_id=p_tenant_id and o.venduss_source_order_id is not null and o.status<>'CANCELADO'
      and (o.separation_completed_at is null or (o.payment_status<>'PAGO' and o.venduss_receivable_due_at<=(now() at time zone 'America/Sao_Paulo')::date))
    order by (o.payment_status<>'PAGO' and o.venduss_receivable_due_at<=(now() at time zone 'America/Sao_Paulo')::date) desc nulls last,o.created_at limit 10
  ) row),'[]'::jsonb));
end $$;
revoke all on function public.venduss_supplier_overview(uuid) from public,anon;
grant execute on function public.venduss_supplier_overview(uuid) to authenticated;

-- Retry integration failures without making a customer's successful checkout fail.
create function venduss_fulfillment_private.retry_pending() returns void language plpgsql security definer set search_path='' as $$
declare row record;
begin
  if not exists(select 1 from venduss_fulfillment_private.settings where enabled) then return; end if;
  for row in select source_order_id from public.venduss_order_integration where sync_pending and updated_at<now()-interval '1 minute' order by updated_at limit 30
  loop perform venduss_fulfillment_private.process_one(row.source_order_id); end loop;
end $$;

-- Supplier lines are a projection; their amount and stock cannot be edited twice.
create function venduss_fulfillment_private.guard_supplier() returns trigger language plpgsql security definer set search_path='' as $$
declare source_id uuid;
begin
  if tg_table_name='orders' then source_id:=coalesce(new.venduss_source_order_id,old.venduss_source_order_id);
  else select venduss_source_order_id into source_id from public.orders where id=coalesce(new.order_id,old.order_id); end if;
  if source_id is null then return coalesce(new,old); end if;
  if current_setting('venduss.bridge_source',true)=source_id::text then return coalesce(new,old); end if;
  if tg_op='DELETE' or tg_table_name='order_items' then raise exception 'Altere ou cancele as peças no pedido original da Venduss.'; end if;
  if tg_op='INSERT' or (new.total_amount,new.subtotal_amount,new.profit_amount,new.customer_id,new.tenant_id,new.venduss_source_order_id)
    is distinct from (old.total_amount,old.subtotal_amount,old.profit_amount,old.customer_id,old.tenant_id,old.venduss_source_order_id)
    then raise exception 'Os valores e as peças deste pedido são sincronizados pela Venduss.'; end if;
  if new.status='CANCELADO' and old.status<>'CANCELADO' then raise exception 'Cancele o pedido original na Venduss.'; end if;
  if new.status not in ('RECEBIDO','CANCELADO') and not exists(select 1 from public.venduss_order_integration where source_order_id=source_id and released_at is not null)
    then raise exception 'Separação e produção ainda não foram liberadas pela Venduss.'; end if;
  return new;
end $$;
create trigger venduss_guard_supplier_order before insert or update or delete on public.orders for each row execute function venduss_fulfillment_private.guard_supplier();
create trigger venduss_guard_supplier_item before insert or update or delete on public.order_items for each row execute function venduss_fulfillment_private.guard_supplier();

-- A raw DELETE must not bypass the existing cancellation/stock-restore workflow.
create function venduss_fulfillment_private.guard_source_delete() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status<>'CANCELADO' and exists(select 1 from public.venduss_order_integration where source_order_id=old.id) then
    raise exception 'Cancele o pedido Venduss antes de excluir, para estornar o estoque e a produção juntos.';
  end if;
  return old;
end $$;
create trigger venduss_source_delete_guard before delete on public.orders for each row execute function venduss_fulfillment_private.guard_source_delete();

-- A release guard applies to EVERY production mutation, including stale screens.
alter table public.z19p_zero19_work_items drop constraint z19p_zero19_work_items_stage_check;
alter table public.z19p_zero19_work_items add constraint z19p_zero19_work_items_stage_check check(stage in ('awaiting_release','awaiting_art','art_received','awaiting_halftone','awaiting_font','ready_production','production','ready_pickup','delivered','cancelled'));
create function venduss_fulfillment_private.guard_work() returns trigger language plpgsql security definer set search_path='' as $$
declare link public.venduss_order_integration%rowtype;
begin
  select * into link from public.venduss_order_integration where supplier_order_id=new.order_id;
  if not found or new.stage='cancelled' then return new; end if;
  if link.released_at is null then new.stage:='awaiting_release';
  elsif new.stage in ('awaiting_release','art_received','awaiting_art') and nullif(new.source_file_path,'') is not null then new.stage:='ready_production'; end if;
  return new;
end $$;
create trigger zzzz_venduss_release_guard before insert or update on public.z19p_zero19_work_items for each row execute function venduss_fulfillment_private.guard_work();

-- Artwork versions used by orders remain readable after the product gets new art.
create or replace function public.z19p_can_read_partner_artwork_path(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    exists(select 1 from public.venduss_shared_print_artworks a
      join public.z19p_partner_tenants partner on partner.tenant_id=a.tenant_id and partner.enabled
      join public.z19p_profiles profile on profile.account_owner_id=partner.owner_id and profile.id=auth.uid() and profile.active
      where a.prepared_path=p_path or a.original_path=p_path)
    or exists(select 1 from public.personalization_sales ps
      join public.venduss_order_integration link on link.supplier_order_id=ps.order_id
      join public.z19p_partner_tenants partner on partner.tenant_id=link.source_tenant_id and partner.enabled
      join public.z19p_profiles profile on profile.account_owner_id=partner.owner_id and profile.id=auth.uid() and profile.active
      where ps.details->0->'production'->>'storage_bucket'='venduss-print-artworks' and ps.details->0->'production'->>'file_path'=p_path)
  );
$$;
create index if not exists venduss_sale_artwork_path_idx on public.personalization_sales((details->0->'production'->>'file_path')) where venduss_source_item_id is not null;
revoke all on function public.z19p_can_read_partner_artwork_path(text) from public;
grant execute on function public.z19p_can_read_partner_artwork_path(text) to authenticated;
do $patch$
declare definition text; anchor text;
begin
  definition:=pg_get_functiondef('public.z19p_zero19_refresh_project(uuid)'::regprocedure);
  anchor:='if exists(select 1 from public.z19p_zero19_work_items where project_id=p_project_id and stage=''awaiting_art'')';
  if position(anchor in definition)=0 then raise exception 'Review current project aggregation before migrating'; end if;
  execute replace(definition,anchor,'if exists(select 1 from public.z19p_zero19_work_items where project_id=p_project_id and stage=''awaiting_release'') then v_stage:=''awaiting_release''; elsif exists(select 1 from public.z19p_zero19_work_items where project_id=p_project_id and stage=''awaiting_art'')');
  definition:=pg_get_functiondef('public.order_stock_cancel(uuid)'::regprocedure);
  anchor:='BEGIN';
  execute replace(definition,anchor,anchor||E'\n    IF EXISTS(SELECT 1 FROM public.orders WHERE id=p_order_id AND venduss_source_order_id IS NOT NULL) THEN RAISE EXCEPTION ''Cancele o pedido original na Venduss para estornar uma única vez.''; END IF;');
  definition:=pg_get_functiondef('public.complete_order_separation(uuid)'::regprocedure);
  anchor:='-- Marca como separado';
  if position(anchor in definition)=0 then raise exception 'Review current separation function before migrating'; end if;
  execute replace(definition,anchor,E'IF v_order.venduss_source_order_id IS NOT NULL THEN\n IF NOT EXISTS(SELECT 1 FROM public.venduss_order_integration WHERE supplier_order_id=p_order_id AND released_at IS NOT NULL) OR v_order.status=''CANCELADO'' THEN RAISE EXCEPTION ''Separação ainda não liberada pela Venduss.''; END IF;\n UPDATE public.orders SET status=''SEPARADO'',separation_completed_at=now() WHERE id=p_order_id; RETURN;\n END IF;\n '||anchor);
end $patch$;

revoke all on all functions in schema venduss_fulfillment_private from public,anon,authenticated;
notify pgrst,'reload schema';
