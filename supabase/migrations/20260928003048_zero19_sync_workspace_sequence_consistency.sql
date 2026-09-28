-- Fix ZERO19 sync: both historic triggers used different customer mappings.
-- They moved existing projects while retaining an occupied sequence number.
-- No existing project/workspace is deleted or merged by this migration.

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
      when public.z19p_zero19_work_items.asset_id is not null then 'ready_production'
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
end $function$;

CREATE OR REPLACE FUNCTION public.z19p_sync_zero19_order_internal(p_owner uuid, p_tenant uuid, p_order uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_customer_id uuid; v_customer_name text; v_whatsapp text;
  v_order_display bigint; v_order_status text; v_order_created timestamptz;
  v_phone_norm text; v_workspace_id uuid; v_workspace_match text;
  v_project_id uuid; v_existing_payload jsonb:='{}'::jsonb; v_workflow jsonb:='{}'::jsonb;
  v_items jsonb:='[]'::jsonb; v_personalizations jsonb:='[]'::jsonb;
  v_active_count integer:=0; v_delivered_count integer:=0; v_cancelled_count integer:=0;
  v_requires_art boolean:=false; v_requires_font boolean:=false; v_source_art_available boolean:=false;
  v_font_defined boolean:=false; v_has_pending_placement boolean:=false; v_has_production_placement boolean:=false;
  v_pending_reason text:='awaiting_art'; v_status_id uuid; v_seq integer; v_pickup timestamptz; v_now timestamptz:=now();
begin
  -- Keep other configured accounts' legacy behavior, but ZERO19 must have one
  -- authoritative sync implementation, regardless of the triggering entrypoint.
  if p_owner='96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid
     and p_tenant='0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid then
    v_project_id:=public.z19p_sync_zero19_order_internal(p_order);
    if v_project_id is null then return jsonb_build_object('ok',false,'reason','order_without_personalization'); end if;
    select p.workspace_id,p.official_order_status into v_workspace_id,v_pending_reason
    from public.z19p_projects p where p.id=v_project_id and p.owner_id=p_owner;
    return jsonb_build_object('ok',true,'workspace_id',v_workspace_id,'project_id',v_project_id,'order_id',p_order,'pending_reason',v_pending_reason);
  end if;
  if p_owner is null or p_tenant is null or p_order is null then
    return jsonb_build_object('ok',false,'reason','missing_identifier');
  end if;
  if not exists(select 1 from public.z19p_public_settings s where s.owner_id=p_owner and s.zero19_pdv_tenant_id=p_tenant) then
    return jsonb_build_object('ok',false,'reason','tenant_not_configured');
  end if;

  select o.customer_id,o.display_id,o.status,o.created_at,
         coalesce(nullif(btrim(c.full_name),''),'Cliente ZERO19'),
         coalesce(nullif(btrim(c.whatsapp),''),nullif(btrim(c.telefone::text),''))
  into v_customer_id,v_order_display,v_order_status,v_order_created,v_customer_name,v_whatsapp
  from public.orders o
  left join public.customers c on c.id=o.customer_id and c.tenant_id=p_tenant
  where o.id=p_order and o.tenant_id=p_tenant limit 1;

  if not found then return jsonb_build_object('ok',false,'reason','order_not_found'); end if;
  if not exists(select 1 from public.personalization_sales ps where ps.tenant_id=p_tenant and ps.order_id=p_order) then
    return jsonb_build_object('ok',false,'reason','order_without_personalization');
  end if;

  v_phone_norm:=public.z19p_normalize_phone(v_whatsapp);

  select w.id,'matched_source' into v_workspace_id,v_workspace_match
  from public.z19p_workspaces w
  where w.owner_id=p_owner and w.workspace_type='client'
    and w.source_tenant_id=p_tenant and w.source_customer_id=v_customer_id
  order by w.created_at limit 1;

  if v_workspace_id is null and v_phone_norm<>'' then
    select w.id,'matched_phone' into v_workspace_id,v_workspace_match
    from public.z19p_workspaces w
    where w.owner_id=p_owner and w.workspace_type='client'
      and public.z19p_normalize_phone(w.phone)=v_phone_norm
    order by w.created_at limit 1;
  end if;

  if v_workspace_id is null then
    insert into public.z19p_workspaces(
      owner_id,company_name,client_name,phone,workspace_type,created_by,responsible_user_id,
      source_tenant_id,source_customer_id,source_customer_match,status_changed_at
    ) values(
      p_owner,v_customer_name,v_customer_name,nullif(v_whatsapp,''),'client',p_owner,p_owner,
      p_tenant,v_customer_id,'created',v_now
    ) returning id into v_workspace_id;
    v_workspace_match:='created';
  else
    update public.z19p_workspaces w
    set client_name=coalesce(nullif(w.client_name,''),v_customer_name),
        phone=coalesce(nullif(w.phone,''),nullif(v_whatsapp,'')),
        source_tenant_id=coalesce(w.source_tenant_id,p_tenant),
        source_customer_id=case when w.source_customer_id is null then v_customer_id else w.source_customer_id end,
        source_customer_match=v_workspace_match,updated_at=v_now
    where w.id=v_workspace_id;
  end if;

  select p.id,p.official_order_payload into v_project_id,v_existing_payload
  from public.z19p_projects p
  where p.owner_id=p_owner and p.official_order_source='zero19_pdv' and p.official_order_ref=p_order::text
  limit 1;

  v_existing_payload:=coalesce(v_existing_payload,'{}'::jsonb);
  v_workflow:=coalesce(v_existing_payload->'workflow','{}'::jsonb);
  v_font_defined:=coalesce(v_workflow->>'font_defined','false')='true';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',oi.id,'order_item_id',oi.id,'product_id',oi.product_id,'variant_id',oi.variant_id,
      'product_name',coalesce(nullif(oi.product_name,''),p.name,'Camiseta'),
      'name',coalesce(nullif(oi.product_name,''),p.name,'Camiseta'),
      'product_image',coalesce(nullif(oi.product_image,''),pv.main_image_url,p.main_image_url,''),
      'image',coalesce(nullif(oi.product_image,''),pv.main_image_url,p.main_image_url,''),
      'size',coalesce(nullif(oi.size,''),pv.size,''),'quantity',greatest(1,coalesce(oi.quantity,1)),
      'category',coalesce(cat.name,''),'subcategory',coalesce(sc.name,''),
      'color_name',coalesce(col.name,''),'color',coalesce(col.name,''),'model',coalesce(sc.name,''),
      'source','zero19_pdv'
    ) order by oi.id
  ) filter(where oi.id is not null),'[]'::jsonb)
  into v_items
  from public.order_items oi
  left join public.products p on p.id=oi.product_id and p.tenant_id=p_tenant
  left join public.product_variants pv on pv.id=oi.variant_id and pv.product_id=oi.product_id
  left join public.subcategories sc on sc.id=p.subcategory_id and sc.tenant_id=p_tenant
  left join public.categories cat on cat.id=sc.category_id and cat.tenant_id=p_tenant
  left join public.colors col on col.id=coalesce(pv.color_id,p.color_id) and col.tenant_id=p_tenant
  where oi.order_id=p_order and oi.tenant_id=p_tenant and oi.product_id is not null;

  with src as (
    select ps.*,
      coalesce(nullif(ps.details->0->'production'->>'kind',''),nullif(ps.details->0->>'personalization_type',''),
               nullif(ps.details->0->>'kind',''),'PERSONALIZATION') as production_kind,
      nullif(ps.details->0->'production'->>'file_path','') as production_file,
      case when lower(coalesce(ps.details->0->'production'->>'without_application','false')) in ('true','1','yes') then true else false end as without_application,
      case when coalesce(ps.details->0->>'quantity','') ~ '^[0-9]+$'
        then greatest(1,(ps.details->0->>'quantity')::integer) else 1 end as service_quantity
    from public.personalization_sales ps where ps.tenant_id=p_tenant and ps.order_id=p_order
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id',id,'personalization_id',id,'personalization_code',personalization_code,'status',status,
        'active',status not in ('CANCELLED','DELIVERED'),'garment_origin',garment_origin,
        'garment_product_name',garment_product_name,'garment_variation',garment_variation,
        'garment_model',garment_model,'garment_color',garment_color,'garment_size',garment_size,
        'text_value',text_value,'notes',notes,'pickup_at',pickup_at,'quantity',service_quantity,
        'kind',production_kind,'file_path',production_file,
        'width_cm',nullif(details->0->'production'->>'width_cm',''),
        'height_cm',nullif(details->0->'production'->>'height_cm',''),
        'meters',nullif(details->0->'production'->>'meters',''),
        'without_application',without_application,
        'requires_font',production_kind in ('NAME_NUMBER','PHRASE'),
        'requires_art',production_kind in ('NEW_ART','PRESET','DTF_METER') and production_file is null,
        'source_art_available',production_file is not null,'details',details
      ) order by created_at,id
    ),'[]'::jsonb),
    count(*) filter(where status not in ('CANCELLED','DELIVERED')),
    count(*) filter(where status='DELIVERED'),
    count(*) filter(where status='CANCELLED'),
    coalesce(bool_or(status not in ('CANCELLED','DELIVERED') and production_kind in ('NEW_ART','PRESET','DTF_METER') and production_file is null),false),
    coalesce(bool_or(status not in ('CANCELLED','DELIVERED') and production_kind in ('NAME_NUMBER','PHRASE')),false),
    coalesce(bool_or(status not in ('CANCELLED','DELIVERED') and production_file is not null),false),
    min(pickup_at) filter(where status not in ('CANCELLED','DELIVERED'))
  into v_personalizations,v_active_count,v_delivered_count,v_cancelled_count,
       v_requires_art,v_requires_font,v_source_art_available,v_pickup
  from src;

  if v_project_id is not null then
    select
      exists(select 1 from public.z19p_asset_placements ap where ap.owner_id=p_owner and ap.project_id=v_project_id and ap.production_state='pending'),
      exists(select 1 from public.z19p_asset_placements ap where ap.owner_id=p_owner and ap.project_id=v_project_id and ap.production_state in ('production','printed'))
    into v_has_pending_placement,v_has_production_placement;
  end if;

  if v_has_production_placement then v_pending_reason:='production';
  elsif v_has_pending_placement then v_pending_reason:='ready_production';
  elsif v_active_count=0 then
    if v_delivered_count>0 then v_pending_reason:='delivered'; else v_pending_reason:='cancelled'; end if;
  elsif v_requires_font and not v_font_defined then v_pending_reason:='needs_font';
  else v_pending_reason:='awaiting_art';
  end if;

  select s.id into v_status_id from public.z19p_statuses s
  where s.owner_id=p_owner and s.active and (
    (v_pending_reason in ('awaiting_art','needs_font') and s.queue_stage='art_work')
    or (v_pending_reason='ready_production' and s.queue_stage='ready_production')
    or (v_pending_reason='production' and s.queue_stage='production')
    or (v_pending_reason='delivered' and lower(s.name)='entregue')
  ) order by s.sort_order limit 1;

  if v_project_id is null then
    perform pg_advisory_xact_lock(hashtext(p_owner::text||':'||v_workspace_id::text));
    select coalesce(max(p.sequence_no),0)+1 into v_seq from public.z19p_projects p where p.workspace_id=v_workspace_id;

    insert into public.z19p_projects(
      owner_id,workspace_id,sequence_no,title,created_by,responsible_user_id,status_id,
      started_at,delivery_date,status_entered_at,updated_by,service_type,
      official_order_ref,official_order_source,official_order_status,official_order_synced_at,official_order_payload
    ) values(
      p_owner,v_workspace_id,v_seq,'Pedido #'||coalesce(v_order_display::text,left(p_order::text,8)),
      p_owner,p_owner,v_status_id,coalesce(v_order_created,v_now),v_pickup::date,v_now,p_owner,'personalizacao',
      p_order::text,'zero19_pdv',v_pending_reason,v_now,
      jsonb_build_object(
        'source','zero19_pdv','tenant_id',p_tenant,'order_id',p_order,'display_id',v_order_display,'order_status',v_order_status,
        'customer',jsonb_build_object('id',v_customer_id,'name',v_customer_name,'whatsapp',v_whatsapp,
          'workspace_match',v_workspace_match,'duplicate_whatsapp',v_workspace_match='matched_phone'),
        'items',v_items,'personalizations',v_personalizations,'pending_reason',v_pending_reason,
        'requires_art',v_requires_art,'requires_font',v_requires_font and not v_font_defined,
        'source_art_available',v_source_art_available,'pickup_at',v_pickup,'workflow',v_workflow,'synced_at',v_now
      )
    ) returning id into v_project_id;
  else
    update public.z19p_projects p
    set workspace_id=v_workspace_id,title='Pedido #'||coalesce(v_order_display::text,left(p_order::text,8)),
        status_id=coalesce(v_status_id,p.status_id),delivery_date=coalesce(v_pickup::date,p.delivery_date),
        status_entered_at=case when p.official_order_status is distinct from v_pending_reason then v_now else p.status_entered_at end,
        updated_at=v_now,updated_by=p_owner,service_type='personalizacao',
        official_order_status=v_pending_reason,official_order_synced_at=v_now,
        official_order_payload=jsonb_build_object(
          'source','zero19_pdv','tenant_id',p_tenant,'order_id',p_order,'display_id',v_order_display,'order_status',v_order_status,
          'customer',jsonb_build_object('id',v_customer_id,'name',v_customer_name,'whatsapp',v_whatsapp,
            'workspace_match',v_workspace_match,'duplicate_whatsapp',v_workspace_match='matched_phone'),
          'items',v_items,'personalizations',v_personalizations,'pending_reason',v_pending_reason,
          'requires_art',v_requires_art,'requires_font',v_requires_font and not v_font_defined,
          'source_art_available',v_source_art_available,'pickup_at',v_pickup,'workflow',v_workflow,'synced_at',v_now
        )
    where p.id=v_project_id;
  end if;

  if not exists(select 1 from public.z19p_folders f where f.workspace_id=v_workspace_id and f.project_id=v_project_id and f.purpose='artes_prontas') then
    insert into public.z19p_folders(owner_id,workspace_id,project_id,name,purpose,sort_order,created_by,updated_by)
    values(p_owner,v_workspace_id,v_project_id,'Artes prontas','artes_prontas',10,p_owner,p_owner);
  end if;

  return jsonb_build_object(
    'ok',true,'workspace_id',v_workspace_id,'project_id',v_project_id,'order_id',p_order,
    'display_id',v_order_display,'pending_reason',v_pending_reason,'customer_match',v_workspace_match
  );
end $function$;

notify pgrst, 'reload schema';
