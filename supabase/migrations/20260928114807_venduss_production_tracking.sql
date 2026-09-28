-- Tenant-scoped administrative tracking; never exposed to catalog visitors.
create function public.venduss_production_tracking(p_tenant_id uuid,p_limit integer default 100,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.user_tenants u where u.user_id=auth.uid() and (u.role::text='SUPER_ADMIN' or u.tenant_id=p_tenant_id)) then raise exception 'Sem permissão para consultar esta loja.'; end if;
  select coalesce(jsonb_agg(to_jsonb(row) order by row.created_at desc),'[]'::jsonb) into result from (
    select src.id,src.display_id,src.created_at,src.status,src.payment_status,src.pickup_due_at,
      c.full_name client_name,i.supplier_order_id,s.display_id supplier_display_id,s.status separation_status,s.separation_completed_at,
      i.released_at,i.release_kind,i.revision_pending,i.revision_reason,i.sync_pending,i.sync_error,
      (select coalesce(jsonb_agg(jsonb_build_object('id',oi.id,'name',oi.product_name,'image',oi.product_image,'size',oi.size,'quantity',oi.quantity) order by oi.id),'[]'::jsonb) from public.order_items oi where oi.order_id=s.id and coalesce(oi.excluido,'F')<>'T') pieces,
      (select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'stage',w.stage,'name',w.text_value,'quantity',w.quantity,'size',w.garment_size,'color',w.garment_color,'position',w.metadata->'details'->0->'production'->>'position_label','product_image',w.metadata->'details'->0->'production'->>'product_image','promised_at',w.promised_at) order by w.created_at),'[]'::jsonb) from public.z19p_zero19_work_items w where w.order_id=s.id) production
    from public.venduss_order_integration i join public.orders src on src.id=i.source_order_id
    left join public.orders s on s.id=i.supplier_order_id left join public.customers c on c.id=src.customer_id
    where i.source_tenant_id=p_tenant_id
    order by src.created_at desc limit least(greatest(coalesce(p_limit,100),1),100) offset greatest(coalesce(p_offset,0),0)
  ) row;
  return jsonb_build_object('orders',result,'total',(select count(*) from public.venduss_order_integration where source_tenant_id=p_tenant_id),'updated_at',now());
end $$;
revoke all on function public.venduss_production_tracking(uuid,integer,integer) from public,anon;
grant execute on function public.venduss_production_tracking(uuid,integer,integer) to authenticated;
notify pgrst,'reload schema';
