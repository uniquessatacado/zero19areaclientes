CREATE OR REPLACE FUNCTION public.z19p_sync_zero19_order_internal(p_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant constant uuid := '0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid;
  v_owner constant uuid := '96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid;
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_workspace uuid;
  v_project uuid;
  v_project_workspace uuid;
  v_project_customer text;
  v_phone text;
  v_seq integer;
  v_stage text;
  v_status uuid;
  v_items jsonb;
  v_garments jsonb;
  v_promised timestamptz;
begin
  select * into v_order from public.orders where id=p_order_id and tenant_id=v_tenant;
  if not found then return null; end if;

  -- Cancelled source orders never revive production.
  if v_order.status='CANCELADO' then
    select p.id into v_project from public.z19p_projects p
    where p.owner_id=v_owner and p.official_order_source='zero19_pdv' and p.official_order_ref=p_order_id::text
    order by p.created_at,p.id limit 1;
    return v_project;
  end if;

  if not exists(
    select 1 from public.personalization_sales
    where order_id=p_order_id and tenant_id=v_tenant
  ) then return null; end if;

  -- The two legacy entrypoints now share these lock keys. Customer comes
  -- first (same order as the sale trigger), then order, then workspace row.
  perform pg_advisory_xact_lock(hashtext('zero19_pdv_workspace:' || v_tenant::text || ':' || coalesce(v_order.customer_id::text,p_order_id::text)));
  perform pg_advisory_xact_lock(hashtext('zero19_pdv_order:' || v_tenant::text || ':' || p_order_id::text));

  -- Reuse the project already linked by the sale/work items. Older duplicate
  -- projects are left intact; a background sync must not merge customer data.
  select p.id,p.workspace_id,
    coalesce(p.official_order_payload->>'customer_id',p.official_order_payload->'customer'->>'id')
  into v_project,v_project_workspace,v_project_customer
  from public.z19p_projects p
  where p.owner_id=v_owner and p.official_order_source='zero19_pdv'
    and p.official_order_ref=p_order_id::text
  order by
    exists(select 1 from public.personalization_sales sale where sale.order_id=p_order_id and sale.tenant_id=v_tenant and sale.z19p_project_id=p.id) desc,
    exists(select 1 from public.z19p_zero19_work_items work where work.project_id=p.id and work.order_id=p_order_id and work.tenant_id=v_tenant) desc,
    p.created_at,p.id
  limit 1 for update;

  if v_order.customer_id is not null then
    select * into v_customer from public.customers where id=v_order.customer_id and tenant_id=v_tenant;
  end if;

  v_phone:=regexp_replace(coalesce(v_customer.whatsapp,''),'[^0-9]','','g');

  select id into v_workspace
  from public.z19p_workspaces
  where owner_id=v_owner
    and workspace_type='client'
    and ((external_customer_source='zero19_pdv' and external_customer_ref=v_order.customer_id::text)
      or (source_tenant_id=v_tenant and source_customer_id=v_order.customer_id))
  order by (source_customer_match='manual_pdv') desc nulls last,created_at,id
  limit 1;

  -- Automatic matching must not move an established project between two
  -- records for the same customer. An explicit manual link may move it.
  if v_project is not null
     and v_project_customer is not distinct from v_order.customer_id::text
     and not exists(select 1 from public.z19p_workspaces w where w.id=v_workspace and w.owner_id=v_owner and w.source_customer_match='manual_pdv') then
    v_workspace:=v_project_workspace;
  end if;

  if v_workspace is null and v_phone<>'' then
    select id into v_workspace
    from public.z19p_workspaces
    where owner_id=v_owner
      and workspace_type='client'
      and regexp_replace(coalesce(phone,''),'[^0-9]','','g')=v_phone
      and (source_customer_id is null or source_customer_id=v_order.customer_id)
      and (external_customer_ref is null or external_customer_ref=v_order.customer_id::text)
    order by created_at,id
    limit 1;

    if v_workspace is not null then
      update public.z19p_workspaces
      set external_customer_source=coalesce(external_customer_source,'zero19_pdv'),
          external_customer_ref=coalesce(external_customer_ref,v_order.customer_id::text),
          client_name=coalesce(nullif(v_customer.full_name,''),client_name),
          phone=coalesce(nullif(v_customer.whatsapp,''),phone),
          updated_at=now()
      where id=v_workspace;
    end if;
  end if;

  if v_workspace is null then
    insert into public.z19p_workspaces(
      owner_id,company_name,client_name,phone,workspace_type,created_by,
      external_customer_source,external_customer_ref,status_changed_at
    )
    values(
      v_owner,
      coalesce(nullif(v_customer.full_name,''),'Cliente ZERO19'),
      coalesce(nullif(v_customer.full_name,''),'Cliente ZERO19'),
      nullif(v_customer.whatsapp,''),
      'client',
      v_owner,
      'zero19_pdv',
      v_order.customer_id::text,
      now()
    )
    returning id into v_workspace;
  end if;

  -- Serialize sequence allocation for every sync targeting this workspace.
  perform 1 from public.z19p_workspaces
    where id=v_workspace and owner_id=v_owner for update;
  if not found then raise exception 'Cliente de produção não encontrado.'; end if;

  select min(coalesce(pickup_at,estimated_ready_at)) into v_promised
  from public.personalization_sales
  where tenant_id=v_tenant and order_id=p_order_id;

  if v_project is null then
    select coalesce(max(sequence_no),0)+1 into v_seq
    from public.z19p_projects
    where owner_id=v_owner and workspace_id=v_workspace;

    select id into v_status
    from public.z19p_statuses
    where owner_id=v_owner and active=true and lower(trim(name))='em atendimento'
    order by sort_order limit 1;

    insert into public.z19p_projects(
      owner_id,workspace_id,sequence_no,title,created_by,responsible_user_id,
      status_id,delivery_date,promised_at,source_order_created_at,
      official_order_ref,official_order_source,official_order_status,
      official_order_synced_at,official_order_payload,service_type
    )
    values(
      v_owner,v_workspace,v_seq,
      'Pedido ZERO19 #'||coalesce(v_order.display_id::text,substring(p_order_id::text,1,8)),
      v_owner,null,
      v_status,
      coalesce(v_promised::date,v_order.created_at::date,current_date),
      v_promised,
      v_order.created_at,
      p_order_id::text,'zero19_pdv','syncing',
      now(),'{}'::jsonb,'personalizacao_zero19'
    )
    returning id into v_project;
  else
    if v_project_workspace is distinct from v_workspace then
      select coalesce(max(sequence_no),0)+1 into v_seq
      from public.z19p_projects
      where owner_id=v_owner and workspace_id=v_workspace and id<>v_project;
    end if;
    update public.z19p_projects
    set workspace_id=v_workspace,
        sequence_no=case when workspace_id is distinct from v_workspace then v_seq else sequence_no end,
        title='Pedido ZERO19 #'||coalesce(v_order.display_id::text,substring(p_order_id::text,1,8)),
        delivery_date=coalesce(v_promised::date,delivery_date,v_order.created_at::date,current_date),
        promised_at=coalesce(v_promised,promised_at),
        source_order_created_at=coalesce(source_order_created_at,v_order.created_at),
        official_order_synced_at=now(),
        updated_at=now()
    where id=v_project;
  end if;

  -- A deliberate customer/workspace change keeps production attachments in
  -- the same workspace as their project. Shared library assets are untouched.
  if v_project_workspace is not null and v_project_workspace is distinct from v_workspace then
    update public.z19p_folders set workspace_id=v_workspace
      where owner_id=v_owner and project_id=v_project and workspace_id=v_project_workspace;
    update public.z19p_assets set workspace_id=v_workspace
      where owner_id=v_owner and project_id=v_project and workspace_id=v_project_workspace;
    update public.z19p_asset_placements set workspace_id=v_workspace
      where owner_id=v_owner and project_id=v_project and workspace_id=v_project_workspace;
    update public.z19p_manual_garment_groups set workspace_id=v_workspace
      where owner_id=v_owner and project_id=v_project and workspace_id=v_project_workspace;
    update public.z19p_manual_garments set workspace_id=v_workspace
      where owner_id=v_owner and project_id=v_project and workspace_id=v_project_workspace;
  end if;

  insert into public.z19p_zero19_work_items(
    owner_id,workspace_id,project_id,tenant_id,personalization_sale_id,order_id,customer_id,
    kind,stage,quantity,garment_origin,garment_name,garment_variation,garment_model,
    garment_color,garment_size,text_value,source_file_path,requires_art,requires_font,
    without_application,promised_at,production_started_at,ready_at,delivered_at,metadata
  )
  select
    v_owner,v_workspace,v_project,v_tenant,p.id,p.order_id,p.customer_id,
    coalesce(nullif(p.details->0->'production'->>'kind',''),'NEW_ART'),
    public.z19p_zero19_source_stage(
      p.status,
      coalesce(nullif(p.details->0->'production'->>'kind',''),'NEW_ART'),
      p.details->0->'production'->>'file_path'
    ),
    greatest(1,case when coalesce(p.details->0->>'quantity','') ~ '^[0-9]+$'
      then (p.details->0->>'quantity')::integer else 1 end),
    p.garment_origin,p.garment_product_name,p.garment_variation,p.garment_model,
    p.garment_color,p.garment_size,p.text_value,
    nullif(p.details->0->'production'->>'file_path',''),
    coalesce(nullif(p.details->0->'production'->>'kind',''),'NEW_ART') not in ('NAME_NUMBER','PHRASE'),
    coalesce(nullif(p.details->0->'production'->>'kind',''),'NEW_ART') in ('NAME_NUMBER','PHRASE'),
    lower(coalesce(p.details->0->'production'->>'without_application','false'))='true',
    coalesce(p.pickup_at,p.estimated_ready_at),
    p.started_at,p.completed_at,p.delivered_at,
    jsonb_build_object(
      'personalization_code',p.personalization_code,
      'queue_position',p.queue_position,
      'details',p.details,
      'notes',p.notes,
      'sale_amount',p.sale_amount
    )
  from public.personalization_sales p
  where p.tenant_id=v_tenant and p.order_id=p_order_id
  on conflict(personalization_sale_id) do update set
    workspace_id=excluded.workspace_id,
    project_id=excluded.project_id,
    customer_id=excluded.customer_id,
    kind=excluded.kind,
    stage=case
      when excluded.stage in ('production','ready_pickup','delivered','cancelled') then excluded.stage
      when public.z19p_zero19_work_items.stage in ('ready_production','production','ready_pickup','delivered') then public.z19p_zero19_work_items.stage
      -- An imported/uploaded file still needs review; siblings must not release it.
      when public.z19p_zero19_work_items.asset_id is not null and public.z19p_zero19_work_items.requires_art then
        case when public.z19p_zero19_work_items.stage='awaiting_halftone' then 'awaiting_halftone' else 'art_received' end
      else excluded.stage
    end,
    quantity=excluded.quantity,
    garment_origin=excluded.garment_origin,
    garment_name=excluded.garment_name,
    garment_variation=excluded.garment_variation,
    garment_model=excluded.garment_model,
    garment_color=excluded.garment_color,
    garment_size=excluded.garment_size,
    text_value=excluded.text_value,
    source_file_path=coalesce(excluded.source_file_path,public.z19p_zero19_work_items.source_file_path),
    requires_art=excluded.requires_art,
    requires_font=excluded.requires_font,
    without_application=excluded.without_application,
    promised_at=excluded.promised_at,
    production_started_at=coalesce(public.z19p_zero19_work_items.production_started_at,excluded.production_started_at),
    ready_at=coalesce(public.z19p_zero19_work_items.ready_at,excluded.ready_at),
    delivered_at=coalesce(public.z19p_zero19_work_items.delivered_at,excluded.delivered_at),
    metadata=public.z19p_zero19_work_items.metadata || excluded.metadata,
    updated_at=now();

  update public.personalization_sales
  set z19p_workspace_id=v_workspace,z19p_project_id=v_project
  where tenant_id=v_tenant and order_id=p_order_id
    and (z19p_workspace_id is distinct from v_workspace or z19p_project_id is distinct from v_project);

  -- Refinalization deletes and recreates personalization_sales. Remove
  -- every old Personaliza work item that is no longer part of this order.
  delete from public.z19p_zero19_work_items stale
  where stale.project_id=v_project
    and stale.tenant_id=v_tenant
    and stale.order_id=p_order_id
    and not exists (
      select 1
      from public.personalization_sales current_sale
      where current_sale.id=stale.personalization_sale_id
        and current_sale.tenant_id=v_tenant
        and current_sale.order_id=p_order_id
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',w.personalization_sale_id,
    'order_item_id',w.personalization_sale_id,
    'external_id',w.personalization_sale_id,
    'product_name',coalesce(w.garment_name,'Personalização'),
    'name',coalesce(w.text_value,w.garment_name,'Personalização'),
    'quantity',w.quantity,
    'size',w.garment_size,
    'color',w.garment_color,
    'category',w.garment_variation,
    'service_kind',w.kind,
    'stage',w.stage,
    'garment_origin',w.garment_origin,
    'without_application',w.without_application,
    'asset_id',w.asset_id
  ) order by w.created_at),'[]'::jsonb)
  into v_items
  from public.z19p_zero19_work_items w
  where w.project_id=v_project;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',oi.id,
    'product_id',oi.product_id,
    'variant_id',oi.variant_id,
    'product_name',oi.product_name,
    'image',oi.product_image,
    'size',oi.size,
    'quantity',oi.quantity,
    'unit_price',oi.unit_price
  ) order by oi.created_at),'[]'::jsonb)
  into v_garments
  from public.order_items oi
  where oi.order_id=p_order_id and oi.product_id is not null;

  update public.z19p_projects
  set official_order_payload=jsonb_build_object(
        'source','zero19_pdv',
        'order_id',v_order.id,
        'display_id',v_order.display_id,
        'customer_id',v_order.customer_id,
        'customer_name',v_customer.full_name,
        'customer_whatsapp',v_customer.whatsapp,
        'payment_status',v_order.payment_status,
        'order_status',v_order.status,
        'created_at',v_order.created_at,
        'items',coalesce(v_items,'[]'::jsonb),
        'garments',coalesce(v_garments,'[]'::jsonb)
      ),
      official_order_synced_at=now(),
      updated_at=now()
  where id=v_project;

  perform public.z19p_zero19_refresh_project(v_project);
  return v_project;
end $function$
