-- Keep repasse settlement independent of the production authorization.
do $patch$
declare definition text; anchor text;
begin
  definition:=pg_get_functiondef('public.confirm_manual_order_payment(uuid,uuid,text,text,integer,uuid,text)'::regprocedure);
  anchor:='v_next_status := CASE';
  if position(anchor in definition)=0 then raise exception 'Review manual payment status before patching'; end if;
  execute replace(definition,anchor,anchor||E'\n    WHEN v_order.venduss_source_order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.venduss_order_integration WHERE source_order_id=v_order.venduss_source_order_id AND released_at IS NOT NULL) THEN v_order.status');

  definition:=pg_get_functiondef('venduss_fulfillment_private.enqueue()'::regprocedure);
  anchor:='  return null;';
  if position(anchor in definition)=0 then raise exception 'Review integration enqueue before patching'; end if;
  execute replace(definition,anchor,E'  -- Flag the source even if the deferred sync fails before creating a supplier.\n  update public.orders set venduss_integration_state=''pending'' where id=source_id and venduss_integration_state is null and exists(select 1 from public.venduss_order_integration where source_order_id=source_id);\n'||anchor);

  definition:=pg_get_functiondef('venduss_fulfillment_private.sync_order(uuid)'::regprocedure);
  anchor:='  for item in';
  if position(anchor in definition)=0 then raise exception 'Review supplier recovery before patching'; end if;
  definition:=replace(definition,anchor,E'  -- An active source may regain shared items after an earlier edit removed them.\n  if mirror.status=''CANCELADO'' and exists(select 1 from public.order_items oi join public.product_variants pv on pv.id=oi.variant_id join public.product_variants bv on bv.id=pv.stock_source_variant_id join public.products bp on bp.id=bv.product_id where oi.order_id=p_source and coalesce(oi.excluido,''F'')<>''T'' and bp.tenant_id=link.supplier_tenant_id) then\n    update public.orders set status=''RECEBIDO'',payment_status=case when coalesce(amount_paid,0)>0 then ''PARCIAL'' else ''PENDENTE'' end where id=mirror.id;\n  end if;\n'||anchor);
  anchor:='    has_art:=item.prepared_path is not null;';
  if position(anchor in definition)=0 then raise exception 'Review retained artwork before patching'; end if;
  definition:=replace(definition,anchor,E'    select ps.details into previous_details from public.personalization_sales ps where ps.venduss_source_item_id=item.id;\n    has_art:=item.prepared_path is not null or previous_details->0->''production''->>''venduss_product_id''=item.product_id::text;');
  -- Retain an order snapshot when the catalog artwork is subsequently removed.
  anchor:='join public.venduss_shared_print_artworks a on a.product_id=oi.product_id';
  if position(anchor in definition)=0 then raise exception 'Review removed artwork cancellation before patching'; end if;
  definition:=replace(definition,anchor,'left join public.venduss_shared_print_artworks a on a.product_id=oi.product_id');
  anchor:='where oi.id=ps.venduss_source_item_id and oi.order_id=p_source and coalesce(oi.excluido,''F'')<>''T''';
  if position(anchor in definition)=0 then raise exception 'Review removed line condition before patching'; end if;
  definition:=replace(definition,anchor,anchor||' and (a.product_id is not null or ps.details->0->''production''->>''venduss_product_id''=oi.product_id::text)');
  execute definition;
end $patch$;

-- Safe while disabled; retries only the dedicated integration outbox.
select cron.schedule('venduss-fulfillment-retry','* * * * *','select venduss_fulfillment_private.retry_pending()');
notify pgrst,'reload schema';
