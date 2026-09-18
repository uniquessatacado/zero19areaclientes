-- 019 Personalizacoes v2.17
-- A area publica exibe somente o projeto ativo/mais recente da empresa.

begin;

create or replace function public.z19p_get_public_workspace(p_token uuid)
returns jsonb language sql security definer set search_path=public as $$
  select jsonb_build_object(
    'workspace',jsonb_build_object(
      'id',w.id,'company_name',w.company_name,'client_name',w.client_name,'share_enabled',w.share_enabled,
      'client_can_download',w.client_can_download,
      'status',case when s.id is null then null else jsonb_build_object('id',s.id,'name',s.name,'color',s.color) end,
      'responsible',case when rp.id is null then null else jsonb_build_object('name',rp.full_name,'phone',rp.phone) end,
      'project',case when p.id is null then null else jsonb_build_object('id',p.id,'title',p.title,'sequence_no',p.sequence_no,'delivery_date',p.delivery_date) end,
      'service_hours','9h às 18h','created_at',w.created_at,'updated_at',w.updated_at
    ),
    'folders',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'parent_id',f.parent_id,'name',f.name,'sort_order',f.sort_order) order by f.sort_order,f.name)
      from public.z19p_folders f where f.workspace_id=w.id and f.project_id is not distinct from p.id),'[]'::jsonb),
    'assets',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'folder_id',a.folder_id,'name',a.name,'asset_type',a.asset_type,'processed_path',a.processed_path,'original_path',a.original_path,'width',a.width,'height',a.height,'dpi',a.dpi,'alpha_trimmed',a.alpha_trimmed,'background_removed',a.background_removed,'maximized',a.maximized,'created_at',a.created_at) order by a.created_at desc)
      from public.z19p_assets a where a.workspace_id=w.id and a.project_id is not distinct from p.id),'[]'::jsonb),
    'quotes',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'project_id',q.project_id,'title',q.title,'delivery_term',q.delivery_term,'delivery_date',q.delivery_date,'payment_status',q.payment_status,'notes',q.notes,'created_at',q.created_at,'updated_at',q.updated_at,
      'items',coalesce((select jsonb_agg(jsonb_build_object('id',qi.id,'product_name',qi.product_name,'quantity',qi.quantity,'pricing_mode',qi.pricing_mode,'piece_price',qi.piece_price,'total_unit_price',qi.total_unit_price,'prints',qi.prints,'sort_order',qi.sort_order) order by qi.sort_order,qi.created_at) from public.z19p_quote_items qi where qi.quote_id=q.id),'[]'::jsonb)) order by q.created_at desc)
      from public.z19p_quotes q where q.workspace_id=w.id and q.project_id is not distinct from p.id),'[]'::jsonb)
  )
  from public.z19p_workspaces w
  left join lateral(select pr.* from public.z19p_projects pr where pr.workspace_id=w.id and pr.owner_id=w.owner_id order by pr.sequence_no desc,pr.started_at desc nulls last,pr.id desc limit 1)p on true
  left join public.z19p_statuses s on s.id=coalesce(p.status_id,w.status_id)
  left join public.z19p_profiles rp on rp.id=coalesce(p.responsible_user_id,w.responsible_user_id) and rp.active=true
  where w.share_token=p_token and w.share_enabled=true limit 1;
$$;
revoke all on function public.z19p_get_public_workspace(uuid) from public;
grant execute on function public.z19p_get_public_workspace(uuid) to anon,authenticated;

create or replace function public.z19p_get_public_quote_documents(p_workspace_token uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  with target as (
    select w.id workspace_id,(select p.id from public.z19p_projects p where p.workspace_id=w.id and p.owner_id=w.owner_id order by p.sequence_no desc,p.started_at desc nulls last,p.id desc limit 1) project_id
    from public.z19p_workspaces w where w.share_token=p_workspace_token and w.share_enabled=true limit 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('quote_id',d.quote_id,'storage_path',d.storage_path,'public_token',d.public_token,'generated_at',d.generated_at,'document_version',d.document_version,'stale',d.stale) order by d.document_version desc),'[]'::jsonb)
  from target t join public.z19p_quotes q on q.workspace_id=t.workspace_id and q.project_id is not distinct from t.project_id
  join public.z19p_quote_documents d on d.quote_id=q.id where d.stale=false;
$$;
revoke all on function public.z19p_get_public_quote_documents(uuid) from public;
grant execute on function public.z19p_get_public_quote_documents(uuid) to anon,authenticated;

commit;
