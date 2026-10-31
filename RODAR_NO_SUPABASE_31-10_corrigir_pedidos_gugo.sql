-- 31/10/2026 (dono: "os pedidos que foram feitos no site que estão com esse erro corrija; em gestão de pedidos e em todo
-- lugar que tenha aquele pedido corrija também para ficar com valor correto").
-- A função political-checkout publicada era antiga: pedido da camiseta GUGO virou camiseta comum (39,99 + 2 estampas de 25),
-- sem promoção, sem o tecido escolhido e sem o lugar certo da estampa. Isto refaz cada pedido como a compra certa faria:
-- valores (orders), itens (order_items, é deles que saem produção e estoque ao marcar pago) e retratos do checkout
-- (political_checkout_orders.snapshot e quick_catalog_order_details). O frete cobrado não muda.
-- Só mexe em pedido NÃO pago, sem produção, sem estoque reservado, sem etiqueta e sem comprovante. O valor antigo fica em
-- snapshot->'gugo_fix'. Pode rodar de novo: pedido já corrigido é ignorado. Se um valor não bater, nada é gravado.
do $fix$
declare
 tid constant uuid:='0e885daf-b461-4384-b2c2-8ed2cf33478b';
 expected constant jsonb:='{"50715":83.71,"50719":128.42,"50721":119.35,"50722":119.35,"50727":104.39,"50731":119.35,"50733":121.73,"50736":119.03}';
 actor constant text:='Claude (IA) · a pedido do dono';
 rec record; prod record; line jsonb; piece jsonb; ship jsonb; ko jsonb; apps jsonb; a jsonb; place jsonb;
 new_items jsonb; new_ship jsonb; before_items jsonb;
 price numeric; item_name text; front_label text; kit_promo numeric; blank_promo numeric; promo numeric; sub numeric; tot numeric; n integer; fixed integer:=0;
begin
 for rec in
  select o.id,o.display_id,o.total_amount,o.subtotal_amount,o.discount_value,o.shipping_cost,o.profit_amount,c.request_id,c.snapshot
  from public.orders o join public.political_checkout_orders c on c.order_id=o.id
  where o.tenant_id=tid and o.status='AGUARDANDO_PAGAMENTO' and o.payment_status='PENDENTE' and coalesce(o.amount_paid,0)=0
   and c.production_released_at is null and c.stock_reserved_at is null and o.smartenvios_shipment_id is null and o.shipping_label_url is null
   and c.snapshot->'pieces' @> '[{"kit_id":"gugo"}]'
   and not exists(select 1 from jsonb_array_elements(c.snapshot->'items') l where coalesce(l->>'kit_id','')<>'')
   and not exists(select 1 from political_private.zero19_payment_proofs pr where pr.order_id=o.id)
   and not exists(select 1 from public.z19p_zero19_work_items w where w.order_id=o.id)
  order by o.display_id for update of o,c
 loop
  select jsonb_agg(to_jsonb(i)) into before_items from public.order_items i where i.order_id=rec.id;
  new_items:='[]';new_ship:='[]';
  for line in select value from jsonb_array_elements(rec.snapshot->'items') loop
   piece:=null;ship:=null;
   select value into piece from jsonb_array_elements(rec.snapshot->'pieces') where value->>'line_id'=line->>'line_id';
   select value into ship from jsonb_array_elements(rec.snapshot->'shipping_items') where value->>'line_id'=line->>'line_id';
   if coalesce(piece->>'kit_id','')='' then
    new_items:=new_items||jsonb_build_array(line);
    if ship is not null then new_ship:=new_ship||jsonb_build_array(ship);end if;
    continue;
   end if;
   ko:=political_private.checkout_kit_option(piece->>'kit_id',piece->>'kit_option',piece->>'size');
   select p.id,p.cost_price,p.main_image_url into strict prod from public.products p where p.id=(ko->'option'->>'product_id')::bigint and p.tenant_id=tid;
   price:=political_private.kit_unit_price(ko->'kit'->'prices',piece->>'size');
   item_name:=(ko->'kit'->>'name')||' · '||(ko->'option'->>'fabric_label')||' · '||(ko->'option'->>'cut_label')||' · preta';
   front_label:='Frente · meio do peito · '||case when piece->>'audience'='KIDS' then '3' else '4' end||' dedos abaixo da gola';
   -- A camisa: produto, variação, preço e custo da camiseta escolhida.
   update public.order_items set product_name=item_name,product_image=coalesce(prod.main_image_url,product_image),unit_price=price,cost_price=prod.cost_price,subtotal=price*quantity,
    metadata=metadata||jsonb_build_object('product_id',prod.id,'variant_id',ko->>'variant_id')
    where order_id=rec.id and metadata->>'line_id'=line->>'line_id' and metadata->>'checkout_physical'='true';
   get diagnostics n=row_count;if n<>1 then raise exception 'Pedido %: camisa da linha % não encontrada.',rec.display_id,line->>'line_id';end if;
   -- As estampas: incluídas no preço e no lugar certo.
   apps:='[]';n:=0;
   for a in select value from jsonb_array_elements(line->'applications') loop
    place:=case a->>'role' when 'front_art' then jsonb_build_object('code','front_center','label',front_label) when 'back_art' then jsonb_build_object('code','back_upper','label','Costas · embaixo da nuca') end;
    if place is null then raise exception 'Pedido %: aplicação inesperada %.',rec.display_id,a->>'role';end if;
    apps:=apps||jsonb_build_array(a||jsonb_build_object('label',place->>'label','production',(a->'production')||jsonb_build_object('position_code',place->>'code','position_label',place->>'label')));
    update public.order_items set product_name='Personalização · '||(place->>'label'),unit_price=0,subtotal=0,
     metadata=jsonb_set(metadata,'{production}',(metadata->'production')||jsonb_build_object('position_code',place->>'code','position_label',place->>'label'))
     where order_id=rec.id and metadata->>'line_id'=line->>'line_id' and metadata->>'checkout_application'='true' and metadata->'vdr'->>'role'=a->>'role';
    get diagnostics n=row_count;if n<>1 then raise exception 'Pedido %: estampa % não encontrada.',rec.display_id,a->>'role';end if;
   end loop;
   new_items:=new_items||jsonb_build_array(line||jsonb_build_object('name',item_name,'kit_id',piece->>'kit_id','kit_option',piece->>'kit_option','kit_size',piece->>'size','product_id',prod.id,'variant_id',ko->>'variant_id','cost_price',prod.cost_price,'image_url',prod.main_image_url,'base_price',price,'unit_price',price,'original_price',price,'applications',apps));
   if ship is not null then new_ship:=new_ship||jsonb_build_array(ship||jsonb_build_object('product_id',prod.id,'variant_id',ko->>'variant_id','unit_price',price,'kit_id',piece->>'kit_id','kit_option',piece->>'kit_option'));end if;
  end loop;
  kit_promo:=political_private.checkout_kit_promo(new_items);blank_promo:=political_private.checkout_blank_promo(new_items);promo:=kit_promo+blank_promo;
  select coalesce(sum(subtotal),0) into sub from public.order_items where order_id=rec.id;
  tot:=round(sub+coalesce(rec.shipping_cost,0)-promo,2);
  if expected ? rec.display_id::text and tot<>(expected->>rec.display_id::text)::numeric then raise exception 'Pedido % deu % em vez de %. Nada foi gravado.',rec.display_id,tot,expected->>rec.display_id::text;end if;
  update public.orders set subtotal_amount=sub,total_amount=tot,discount_type='value',discount_value=promo,
   profit_amount=(select coalesce(sum(subtotal-coalesce(cost_price,0)*quantity),0)-promo from public.order_items where order_id=rec.id) where id=rec.id;
  update public.political_checkout_orders set snapshot=snapshot||jsonb_build_object('items',new_items,'shipping_items',new_ship,'kit_promo_discount',kit_promo,'blank_promo_discount',blank_promo,
   'gugo_fix',jsonb_build_object('at',now(),'by',actor,'before',jsonb_build_object('total',rec.total_amount,'subtotal',rec.subtotal_amount,'discount',rec.discount_value,'profit',rec.profit_amount,'items',before_items))) where request_id=rec.request_id;
  update public.quick_catalog_order_details set details=details||jsonb_build_object('original_total',sub+coalesce(rec.shipping_cost,0),'discount_amount',promo,'shipping_items',new_ship) where order_id=rec.id;
  insert into public.order_history(order_id,user_name,action_type,description) values(rec.id,actor,'CORRECAO_VALOR','Pedido corrigido: camiseta GUGO cobrada como camiseta comum. Total de R$ '||rec.total_amount||' para R$ '||tot||'.');
  fixed:=fixed+1;
 end loop;
 raise notice 'Pedidos corrigidos: %',fixed;
end $fix$;
