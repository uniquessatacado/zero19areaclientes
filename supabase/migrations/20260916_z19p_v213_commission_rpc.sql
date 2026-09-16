-- v2.13 — comissão só nasce depois que o orçamento é marcado como pago.
begin;
drop policy if exists z19p_commission_seller_insert on public.z19p_commissions;
create or replace function public.z19p_mark_quote_paid(p_quote_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_owner uuid:=public.z19p_current_account_owner();v_quote public.z19p_quotes%rowtype;v_ws public.z19p_workspaces%rowtype;v_seller uuid;v_cfg public.z19p_commission_config%rowtype;v_item public.z19p_quote_items%rowtype;v_tier uuid;v_rule public.z19p_commission_rules%rowtype;v_product numeric:=0;v_print numeric:=0;v_total numeric:=0;v_comm numeric:=0;v_iprod numeric;v_iprint numeric;v_itotal numeric;v_icomm numeric;v_default numeric;v_prints numeric;v_art numeric;v_detail jsonb:='[]'::jsonb;
begin
 select * into v_quote from public.z19p_quotes where id=p_quote_id and owner_id=v_owner;if not found then raise exception 'Orçamento não encontrado.';end if;
 select * into v_ws from public.z19p_workspaces where id=v_quote.workspace_id and owner_id=v_owner;v_seller:=coalesce(v_ws.responsible_user_id,v_quote.created_by,auth.uid());
 if v_quote.payment_status='paid' then return jsonb_build_object('ok',true,'already_paid',true,'quote_id',v_quote.id);end if;
 update public.z19p_quotes set payment_status='paid',paid_at=now(),paid_by=auth.uid(),updated_at=now(),updated_by=auth.uid() where id=v_quote.id;
 select * into v_cfg from public.z19p_commission_config where owner_id=v_owner;if not found or not v_cfg.enabled then return jsonb_build_object('ok',true,'commission_enabled',false,'quote_id',v_quote.id);end if;
 for v_item in select * from public.z19p_quote_items where quote_id=v_quote.id order by sort_order loop
  select id into v_tier from public.z19p_price_tiers where owner_id=v_owner and active=true and min_qty<=v_item.quantity and(max_qty is null or v_item.quantity<=max_qty)order by min_qty desc limit 1;
  v_iprod:=0;v_iprint:=0;
  if v_item.pricing_mode='piece_plus_print' then v_iprod:=coalesce(v_item.piece_price,0)*greatest(v_item.quantity,1);select coalesce(sum(coalesce((x->>'price')::numeric,0)),0),coalesce(sum(coalesce((x->>'art_fee')::numeric,0)),0) into v_prints,v_art from jsonb_array_elements(coalesce(v_item.prints,'[]'::jsonb))x;v_iprint:=v_prints*greatest(v_item.quantity,1)+v_art;
  else v_itotal:=coalesce(v_item.total_unit_price,0)*greatest(v_item.quantity,1);select coalesce(default_unit_price,0) into v_default from public.z19p_products where id=v_item.product_id and owner_id=v_owner;v_iprod:=least(v_itotal,coalesce(v_default,0)*greatest(v_item.quantity,1));if v_iprod=0 then v_iprod:=v_itotal;end if;v_iprint:=greatest(0,v_itotal-v_iprod);end if;
  v_itotal:=v_iprod+v_iprint;v_icomm:=0;
  if v_tier is not null then select * into v_rule from public.z19p_commission_rules where owner_id=v_owner and seller_user_id=v_seller and tier_id=v_tier and active=true limit 1;if found then if v_rule.basis='total' then v_icomm:=v_itotal*v_rule.total_percent/100;elsif v_rule.basis='product' then v_icomm:=v_iprod*v_rule.product_percent/100;elsif v_rule.basis='print' then v_icomm:=v_iprint*v_rule.print_percent/100;else v_icomm:=v_iprod*v_rule.product_percent/100+v_iprint*v_rule.print_percent/100;end if;end if;end if;
  v_product:=v_product+v_iprod;v_print:=v_print+v_iprint;v_total:=v_total+v_itotal;v_comm:=v_comm+v_icomm;
  v_detail:=v_detail||jsonb_build_array(jsonb_build_object('item_id',v_item.id,'product_name',v_item.product_name,'quantity',v_item.quantity,'tier_id',v_tier,'product_amount',round(v_iprod,2),'print_amount',round(v_iprint,2),'total_amount',round(v_itotal,2),'commission_amount',round(v_icomm,2)));
 end loop;
 insert into public.z19p_commissions(owner_id,quote_id,workspace_id,project_id,seller_user_id,product_amount,print_amount,total_amount,commission_amount,detail,status)values(v_owner,v_quote.id,v_quote.workspace_id,v_quote.project_id,v_seller,round(v_product,2),round(v_print,2),round(v_total,2),round(v_comm,2),v_detail,'pending')on conflict(owner_id,quote_id,seller_user_id)do update set product_amount=excluded.product_amount,print_amount=excluded.print_amount,total_amount=excluded.total_amount,commission_amount=excluded.commission_amount,detail=excluded.detail,status='pending',decided_at=null,decided_by=null,paid_at=null,paid_by=null;
 return jsonb_build_object('ok',true,'commission_enabled',true,'quote_id',v_quote.id,'commission_amount',round(v_comm,2),'seller_user_id',v_seller);
end$$;
grant execute on function public.z19p_mark_quote_paid(uuid) to authenticated;
commit;
