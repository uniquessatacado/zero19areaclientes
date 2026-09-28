-- Integration QA against the real schema. ALWAYS roll back. No customer message
-- or transaction survives; sequence numbers may have harmless gaps.
begin;
set local statement_timeout='30s';
set local lock_timeout='2s';
update venduss_fulfillment_private.settings set enabled=true;
do $qa$
declare
  product record; response jsonb; source uuid; mirror uuid; admin_id uuid; supplier_admin uuid; register_id uuid;
  physical_before integer; physical_after integer; count_items integer;
  stage text; link public.venduss_order_integration%rowtype;
begin
  select p.id,p.tenant_id,p.name,coalesce(v.price,p.price) price,v.id variant_id,v.size,v.stock_source_variant_id base_variant,bv.available_quantity
  into product from public.venduss_shared_print_artworks art
  join public.products p on p.id=art.product_id
  join public.product_variants v on v.product_id=p.id
  join public.product_variants bv on bv.id=v.stock_source_variant_id
  where art.print_position_code is not null and v.available_quantity>0 and bv.available_quantity>0
  order by p.id,v.id limit 1;
  if not found then raise exception 'QA requires one configured printed product with stock; no fixture was changed.'; end if;
  physical_before:=product.available_quantity;
  response:=public.create_order(p_tenant_id=>product.tenant_id,p_customer_id=>null,p_total_amount=>product.price,
    p_subtotal_amount=>product.price,p_shipping_cost=>0,p_shipping_method=>'RETIRADA',p_payment_method=>'PIX',
    p_items=>jsonb_build_array(jsonb_build_object('product_id',product.id,'variant_id',product.variant_id,'quantity',1,'price',product.price,'name',product.name,'size',product.size,'confirmed_extra_hours',0)));
  source:=(response->>'id')::uuid;
  perform venduss_fulfillment_private.process_one(source);
  select * into link from public.venduss_order_integration where source_order_id=source;
  if link.sync_pending or link.sync_error is not null or link.supplier_order_id is null then raise exception 'Sync failed: %',link.sync_error; end if;
  mirror:=link.supplier_order_id;
  select available_quantity into physical_after from public.product_variants where id=product.base_variant;
  if physical_after<>physical_before-1 then raise exception 'Stock moved incorrectly: % -> %',physical_before,physical_after; end if;
  select wi.stage into stage from public.z19p_zero19_work_items wi where wi.order_id=mirror;
  if stage<>'awaiting_release' then raise exception 'Unpaid production released: %',stage; end if;
  if exists(select 1 from public.orders where id=mirror and (profit_amount<>0 or payment_status<>'PENDENTE')) then raise exception 'Supplier finance mismatch'; end if;
  select u.user_id into supplier_admin from public.user_tenants u join public.orders o on o.tenant_id=u.tenant_id where o.id=mirror and u.role::text in ('ADMIN','SUPER_ADMIN') limit 1;
  select cr.id into register_id from public.cash_registers cr join public.orders o on o.tenant_id=cr.tenant_id where o.id=mirror and cr.status='open' limit 1;
  if supplier_admin is null or register_id is null then raise exception 'QA requires an existing authorized operator and open supplier cash register'; end if;
  perform set_config('request.jwt.claim.sub',supplier_admin::text,true);
  perform public.venduss_schedule_receivable(mirror,(now() at time zone 'America/Sao_Paulo')::date);
  if (public.venduss_supplier_overview((select tenant_id from public.orders where id=mirror))->>'due_count')::integer<1 then raise exception 'Scheduled receivable is not visible in PDV summary'; end if;
  perform public.confirm_manual_order_payment(mirror,register_id,'pix',null,null,null,'QA transaction rollback');
  if not exists(select 1 from public.orders where id=mirror and payment_status='PAGO' and status='RECEBIDO') then raise exception 'Supplier payment must not release production'; end if;
  if exists(select 1 from public.z19p_zero19_work_items wi where wi.order_id=mirror and wi.stage<>'awaiting_release') then raise exception 'Supplier receipt incorrectly released work'; end if;
  perform public.reverse_manual_order_payment(mirror);
  begin
    perform public.complete_order_separation(mirror);
    raise exception 'QA_FAIL: blocked separation was accepted';
  exception when others then if sqlerrm like 'QA_FAIL:%' then raise; end if; end;
  -- Automatic release after source payment, NOT payment of the supplier invoice.
  update public.orders set payment_status='PAGO' where id=source;
  perform venduss_fulfillment_private.process_one(source);
  select wi.stage into stage from public.z19p_zero19_work_items wi where wi.order_id=mirror;
  if stage<>'ready_production' then raise exception 'Paid production not released: %',stage; end if;
  if not exists(select 1 from public.orders where id=mirror and payment_status='PENDENTE' and status='NA_FILA_SEPARACAO') then raise exception 'Supplier receivable must remain unpaid'; end if;
  select user_id into admin_id from public.user_tenants where tenant_id=product.tenant_id and role::text in ('ADMIN','SUPER_ADMIN') limit 1;
  if admin_id is null then raise exception 'No operator available for authorization QA'; end if;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform public.venduss_release_order(source,'QA rollback: idempotent release');
  perform public.complete_order_separation(mirror);
  select available_quantity into physical_after from public.product_variants where id=product.base_variant;
  if physical_after<>physical_before-1 then raise exception 'Supplier separation changed availability again'; end if;
  perform venduss_fulfillment_private.sync_order(source);
  select count(*) into count_items from public.order_items where order_id=mirror;
  if count_items<>1 then raise exception 'Duplicate supplier items'; end if;
  -- Exercise edit/review triggers without committing any quantity/stock change.
  update public.order_items set quantity=quantity+1 where order_id=source;
  perform venduss_fulfillment_private.process_one(source);
  if not exists(select 1 from public.venduss_order_integration where source_order_id=source and revision_pending and released_at is null) then raise exception 'Edit after separation was not held for review'; end if;
  update public.order_items set quantity=quantity-1 where order_id=source;
  perform venduss_fulfillment_private.process_one(source);
  perform public.venduss_release_order(source,'QA rollback: physical revision checked');
  if exists(select 1 from public.venduss_order_integration where source_order_id=source and revision_pending) then raise exception 'Explicit review did not release order'; end if;
  perform public.order_stock_cancel(source);
  perform venduss_fulfillment_private.process_one(source);
  select available_quantity into physical_after from public.product_variants where id=product.base_variant;
  if physical_after<>physical_before then raise exception 'Cancellation did not restore exactly once'; end if;
  if exists(select 1 from public.z19p_zero19_work_items wi where wi.order_id=mirror and wi.stage<>'cancelled') then raise exception 'Cancelled production remains active'; end if;
  if not exists(select 1 from public.orders where id=mirror and status='CANCELADO') then raise exception 'Supplier order not cancelled'; end if;
  perform set_config('qa.venduss_result','PASS: real checkout stock, pending production, payment release, cash receipt/reversal, due-date PDV alert, separation, edit review, replay and cancellation',true);
end $qa$;
select current_setting('qa.venduss_result') result;
rollback;
