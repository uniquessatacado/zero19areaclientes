
begin;

-- Vínculo estável entre o PDV ZERO19 e o 019 Personalizações.
alter table public.z19p_workspaces
  add column if not exists external_customer_source text,
  add column if not exists external_customer_ref text;

create unique index if not exists z19p_workspaces_external_customer_unique
  on public.z19p_workspaces(owner_id, external_customer_source, external_customer_ref)
  where external_customer_ref is not null;

alter table public.z19p_projects
  add column if not exists promised_at timestamptz,
  add column if not exists art_ready_at timestamptz,
  add column if not exists production_started_at timestamptz,
  add column if not exists ready_at timestamptz,
  add column if not exists customer_notified_at timestamptz,
  add column if not exists source_order_created_at timestamptz;

alter table public.personalization_sales
  add column if not exists z19p_workspace_id uuid references public.z19p_workspaces(id) on delete set null,
  add column if not exists z19p_project_id uuid references public.z19p_projects(id) on delete set null;

create index if not exists personalization_sales_z19p_project_idx
  on public.personalization_sales(z19p_project_id)
  where z19p_project_id is not null;

alter table public.z19p_public_settings
  add column if not exists zero19_sync_recent_limit integer not null default 20;

do $$ begin
  alter table public.z19p_public_settings
    add constraint z19p_public_settings_zero19_sync_recent_limit_check
    check (zero19_sync_recent_limit in (10,20,50,100));
exception when duplicate_object then null; end $$;

create table if not exists public.z19p_zero19_work_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.z19p_current_account_owner(),
  workspace_id uuid not null references public.z19p_workspaces(id) on delete cascade,
  project_id uuid not null references public.z19p_projects(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  personalization_sale_id uuid not null references public.personalization_sales(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  kind text not null,
  stage text not null,
  quantity integer not null default 1 check(quantity > 0),
  garment_origin text,
  garment_name text,
  garment_variation text,
  garment_model text,
  garment_color text,
  garment_size text,
  text_value text,
  source_file_path text,
  requires_art boolean not null default false,
  requires_font boolean not null default false,
  without_application boolean not null default false,
  asset_id uuid references public.z19p_assets(id) on delete set null,
  promised_at timestamptz,
  art_ready_at timestamptz,
  production_started_at timestamptz,
  ready_at timestamptz,
  customer_notified_at timestamptz,
  delivered_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(personalization_sale_id)
);

do $$ begin
  alter table public.z19p_zero19_work_items
    add constraint z19p_zero19_work_items_stage_check
    check(stage in ('awaiting_art','awaiting_font','ready_production','production','ready_pickup','delivered','cancelled'));
exception when duplicate_object then null; end $$;

create index if not exists z19p_zero19_work_items_queue_idx
  on public.z19p_zero19_work_items(owner_id,stage,promised_at,created_at);
create index if not exists z19p_zero19_work_items_project_idx
  on public.z19p_zero19_work_items(project_id,stage);
create index if not exists z19p_zero19_work_items_order_idx
  on public.z19p_zero19_work_items(order_id);

alter table public.z19p_zero19_work_items enable row level security;
drop policy if exists z19p_zero19_work_items_select on public.z19p_zero19_work_items;
create policy z19p_zero19_work_items_select on public.z19p_zero19_work_items
  for select to authenticated
  using (owner_id = public.z19p_current_account_owner());
drop policy if exists z19p_zero19_work_items_insert on public.z19p_zero19_work_items;
create policy z19p_zero19_work_items_insert on public.z19p_zero19_work_items
  for insert to authenticated
  with check (owner_id = public.z19p_current_account_owner());
drop policy if exists z19p_zero19_work_items_update on public.z19p_zero19_work_items;
create policy z19p_zero19_work_items_update on public.z19p_zero19_work_items
  for update to authenticated
  using (owner_id = public.z19p_current_account_owner())
  with check (owner_id = public.z19p_current_account_owner());
drop policy if exists z19p_zero19_work_items_delete on public.z19p_zero19_work_items;
create policy z19p_zero19_work_items_delete on public.z19p_zero19_work_items
  for delete to authenticated
  using (owner_id = public.z19p_current_account_owner());
grant select,insert,update,delete on public.z19p_zero19_work_items to authenticated;

-- Status visual adicional. Os estados de preparação continuam usando as chaves semânticas
-- art_work / ready_production / production já existentes.
insert into public.z19p_statuses(owner_id,name,color,sort_order,active,is_finalized,queue_stage)
select '96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'Pronto para retirada','#22c55e',60,true,false,'none'
where not exists (
  select 1 from public.z19p_statuses
  where owner_id='96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid
    and lower(trim(name))='pronto para retirada'
);

create or replace function public.z19p_zero19_source_stage(
  p_status text,
  p_kind text,
  p_file_path text
)
returns text
language sql
immutable
set search_path=public
as $$
  select case upper(coalesce(p_status,'PENDING'))
    when 'IN_PROGRESS' then 'production'
    when 'DONE' then 'ready_pickup'
    when 'DELIVERED' then 'delivered'
    when 'CANCELLED' then 'cancelled'
    else case upper(coalesce(p_kind,'NEW_ART'))
      when 'NAME_NUMBER' then 'awaiting_font'
      when 'PHRASE' then 'awaiting_font'
      else case when nullif(trim(coalesce(p_file_path,'')),'') is not null
        then 'ready_production'
        else 'awaiting_art'
      end
    end
  end
$$;

create or replace function public.z19p_zero19_status_id(p_owner uuid,p_stage text)
returns uuid
language plpgsql
stable
security definer
set search_path=public
as $$
declare v_id uuid;
begin
  if p_stage in ('awaiting_art','awaiting_font') then
    select id into v_id from public.z19p_statuses
    where owner_id=p_owner and active=true and queue_stage='art_work'
    order by sort_order,id limit 1;
  elsif p_stage='ready_production' then
    select id into v_id from public.z19p_statuses
    where owner_id=p_owner and active=true and queue_stage='ready_production'
    order by sort_order,id limit 1;
  elsif p_stage='production' then
    select id into v_id from public.z19p_statuses
    where owner_id=p_owner and active=true and queue_stage='production'
    order by sort_order,id limit 1;
  elsif p_stage='ready_pickup' then
    select id into v_id from public.z19p_statuses
    where owner_id=p_owner and active=true and lower(trim(name))='pronto para retirada'
    order by sort_order,id limit 1;
  elsif p_stage='delivered' then
    select id into v_id from public.z19p_statuses
    where owner_id=p_owner and active=true and lower(trim(name)) in ('entregue','finalizado')
    order by case when lower(trim(name))='entregue' then 0 else 1 end,sort_order,id limit 1;
  elsif p_stage='cancelled' then
    select id into v_id from public.z19p_statuses
    where owner_id=p_owner and active=true and lower(trim(name)) in ('desistiu','cliente desistiu')
    order by sort_order,id limit 1;
  end if;
  if v_id is null then
    select id into v_id from public.z19p_statuses
    where owner_id=p_owner and active=true and lower(trim(name))='em atendimento'
    order by sort_order,id limit 1;
  end if;
  return v_id;
end $$;

create or replace function public.z19p_zero19_refresh_project(p_project_id uuid)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_owner uuid;
  v_workspace uuid;
  v_stage text;
  v_status uuid;
  v_now timestamptz:=now();
begin
  select owner_id,workspace_id into v_owner,v_workspace
  from public.z19p_projects
  where id=p_project_id and official_order_source='zero19_pdv'
  for update;
  if not found then return null; end if;

  if exists(select 1 from public.z19p_zero19_work_items where project_id=p_project_id and stage='awaiting_art') then
    v_stage:='awaiting_art';
  elsif exists(select 1 from public.z19p_zero19_work_items where project_id=p_project_id and stage='awaiting_font') then
    v_stage:='awaiting_font';
  elsif exists(select 1 from public.z19p_zero19_work_items where project_id=p_project_id and stage='ready_production') then
    v_stage:='ready_production';
  elsif exists(select 1 from public.z19p_zero19_work_items where project_id=p_project_id and stage='production') then
    v_stage:='production';
  elsif exists(select 1 from public.z19p_zero19_work_items where project_id=p_project_id and stage='ready_pickup') then
    v_stage:='ready_pickup';
  elsif exists(select 1 from public.z19p_zero19_work_items where project_id=p_project_id and stage='delivered') then
    v_stage:='delivered';
  elsif exists(select 1 from public.z19p_zero19_work_items where project_id=p_project_id and stage='cancelled') then
    v_stage:='cancelled';
  else
    v_stage:='awaiting_art';
  end if;

  v_status:=public.z19p_zero19_status_id(v_owner,v_stage);

  update public.z19p_projects
  set official_order_status=v_stage,
      status_id=coalesce(v_status,status_id),
      art_ready_at=case
        when v_stage in ('ready_production','production','ready_pickup','delivered') then coalesce(art_ready_at,v_now)
        else art_ready_at end,
      production_started_at=case
        when v_stage='production' then coalesce(production_started_at,v_now)
        else production_started_at end,
      ready_at=case
        when v_stage='ready_pickup' then coalesce(ready_at,v_now)
        else ready_at end,
      updated_at=v_now,
      updated_by=coalesce(auth.uid(),v_owner)
  where id=p_project_id;

  update public.z19p_workspaces
  set status_id=coalesce(v_status,status_id),
      status_changed_at=v_now,
      updated_at=v_now
  where id=v_workspace and owner_id=v_owner;

  return v_stage;
end $$;

-- Pedidos oficiais da ZERO19 já foram cobrados no PDV. Eles não dependem de orçamento
-- interno do Personalizações para entrar nas filas operacionais.
create or replace function public.z19p_validate_project_transition()
returns trigger
language plpgsql
security invoker
set search_path=public
as $$
declare v_stage text; v_final boolean; v_official boolean;
begin
  if tg_op='UPDATE' and new.status_id is not distinct from old.status_id then return new; end if;
  select queue_stage,is_finalized into v_stage,v_final
  from public.z19p_statuses where id=new.status_id and owner_id=new.owner_id;

  v_official := new.official_order_source='zero19_pdv' and new.official_order_ref is not null;

  if v_stage in ('art_work','ready_production','production') then
    if new.delivery_date is null then
      raise exception 'Defina a data de entrega antes de liberar para producao.';
    end if;
    if not v_official then
      if tg_op='INSERT' then
        raise exception 'Projeto novo deve iniciar em etapa comercial; libere a producao pelo fluxo de pagamento.';
      end if;
      if not exists(
        select 1 from public.z19p_quotes q
        where q.project_id=new.id and q.owner_id=new.owner_id and q.payment_status='paid'
      ) then
        raise exception 'O projeto precisa de um orcamento pago antes de entrar na fila operacional.';
      end if;
    end if;
  end if;

  new.status_entered_at=now();
  if coalesce(v_final,false) and new.finalized_at is null then new.finalized_at=now(); end if;
  return new;
end $$;

drop trigger if exists z19p_projects_validate_transition on public.z19p_projects;
create trigger z19p_projects_validate_transition
before insert or update of status_id on public.z19p_projects
for each row execute function public.z19p_validate_project_transition();

create or replace function public.z19p_validate_workspace_operational_status()
returns trigger
language plpgsql
security invoker
set search_path=public
as $$
declare v_stage text; v_project public.z19p_projects%rowtype; v_official boolean;
begin
  if tg_op='UPDATE' and new.status_id is not distinct from old.status_id then return new; end if;
  select queue_stage into v_stage from public.z19p_statuses
  where id=new.status_id and owner_id=new.owner_id;

  if v_stage in ('art_work','ready_production','production') then
    select * into v_project from public.z19p_projects p
    where p.workspace_id=new.id and p.owner_id=new.owner_id
    order by p.sequence_no desc,p.started_at desc nulls last,p.id desc limit 1;

    v_official := found and v_project.official_order_source='zero19_pdv' and v_project.official_order_ref is not null;

    if not found
       or v_project.status_id is distinct from new.status_id
       or v_project.delivery_date is null
       or (
         not v_official and not exists(
           select 1 from public.z19p_quotes q
           where q.project_id=v_project.id and q.owner_id=new.owner_id and q.payment_status='paid'
         )
       )
    then
      raise exception 'Status operacional deve ser aplicado pelo fluxo seguro do projeto.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists z19p_workspaces_validate_operational_status on public.z19p_workspaces;
create trigger z19p_workspaces_validate_operational_status
before insert or update of status_id on public.z19p_workspaces
for each row execute function public.z19p_validate_workspace_operational_status();

create or replace function public.z19p_sync_zero19_order_internal(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_tenant constant uuid := '0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid;
  v_owner constant uuid := '96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid;
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_workspace uuid;
  v_project uuid;
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

  if v_order.customer_id is not null then
    select * into v_customer from public.customers where id=v_order.customer_id;
  end if;

  v_phone:=regexp_replace(coalesce(v_customer.whatsapp,''),'[^0-9]','','g');

  select id into v_workspace
  from public.z19p_workspaces
  where owner_id=v_owner
    and workspace_type='client'
    and external_customer_source='zero19_pdv'
    and external_customer_ref=v_order.customer_id::text
  order by created_at
  limit 1;

  if v_workspace is null and v_phone<>'' then
    select id into v_workspace
    from public.z19p_workspaces
    where owner_id=v_owner
      and workspace_type='client'
      and regexp_replace(coalesce(phone,''),'[^0-9]','','g')=v_phone
    order by created_at
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

  select id into v_project
  from public.z19p_projects
  where owner_id=v_owner
    and official_order_source='zero19_pdv'
    and official_order_ref=p_order_id::text
  limit 1;

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
    update public.z19p_projects
    set workspace_id=v_workspace,
        title='Pedido ZERO19 #'||coalesce(v_order.display_id::text,substring(p_order_id::text,1,8)),
        delivery_date=coalesce(v_promised::date,delivery_date,v_order.created_at::date,current_date),
        promised_at=coalesce(v_promised,promised_at),
        source_order_created_at=coalesce(source_order_created_at,v_order.created_at),
        official_order_synced_at=now(),
        updated_at=now()
    where id=v_project;
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
    metadata=excluded.metadata,
    updated_at=now();

  update public.personalization_sales
  set z19p_workspace_id=v_workspace,z19p_project_id=v_project
  where tenant_id=v_tenant and order_id=p_order_id
    and (z19p_workspace_id is distinct from v_workspace or z19p_project_id is distinct from v_project);

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
end $$;

create or replace function public.z19p_sync_zero19_personalization_trigger()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.tenant_id='0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid and new.order_id is not null then
    perform public.z19p_sync_zero19_order_internal(new.order_id);
  end if;
  return new;
end $$;

drop trigger if exists z19p_zero19_personalization_sync on public.personalization_sales;
create trigger z19p_zero19_personalization_sync
after insert or update of status,pickup_at,estimated_ready_at,details,garment_origin,
  garment_product_name,garment_variation,garment_model,garment_color,garment_size,text_value
on public.personalization_sales
for each row execute function public.z19p_sync_zero19_personalization_trigger();

create or replace function public.z19p_sync_zero19_recent(p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_owner uuid:=public.z19p_current_account_owner();
  v_limit integer:=greatest(1,least(coalesce(p_limit,20),100));
  v_row record;
  v_count integer:=0;
  v_projects jsonb:='[]'::jsonb;
  v_project uuid;
begin
  if auth.uid() is null or v_owner<>'96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid then
    raise exception 'Acesso nao autorizado.';
  end if;

  for v_row in
    select p.order_id,max(p.created_at) created_at
    from public.personalization_sales p
    where p.tenant_id='0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid
      and p.order_id is not null
      and not exists(
        select 1 from public.z19p_projects z
        where z.owner_id=v_owner
          and z.official_order_source='zero19_pdv'
          and z.official_order_ref=p.order_id::text
      )
    group by p.order_id
    order by max(p.created_at) desc
    limit v_limit
  loop
    v_project:=public.z19p_sync_zero19_order_internal(v_row.order_id);
    if v_project is not null then
      v_count:=v_count+1;
      v_projects:=v_projects||jsonb_build_array(v_project);
    end if;
  end loop;

  return jsonb_build_object('synced',v_count,'project_ids',v_projects,'limit',v_limit);
end $$;

revoke all on function public.z19p_sync_zero19_recent(integer) from public,anon;
grant execute on function public.z19p_sync_zero19_recent(integer) to authenticated;

create or replace function public.z19p_zero19_mark_art_ready(
  p_project_id uuid,
  p_personalization_sale_id uuid,
  p_asset_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_owner uuid:=public.z19p_current_account_owner(); v_stage text;
begin
  if auth.uid() is null or v_owner<>'96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid then
    raise exception 'Acesso nao autorizado.';
  end if;
  if not exists(
    select 1 from public.z19p_projects
    where id=p_project_id and owner_id=v_owner and official_order_source='zero19_pdv'
  ) then raise exception 'Pedido ZERO19 nao encontrado.'; end if;
  if not exists(
    select 1 from public.z19p_assets
    where id=p_asset_id and owner_id=v_owner
  ) then raise exception 'Arte nao encontrada.'; end if;

  update public.z19p_zero19_work_items
  set asset_id=p_asset_id,stage='ready_production',
      art_ready_at=coalesce(art_ready_at,now()),updated_at=now()
  where owner_id=v_owner and project_id=p_project_id
    and personalization_sale_id=p_personalization_sale_id
    and stage not in ('production','ready_pickup','delivered','cancelled');

  v_stage:=public.z19p_zero19_refresh_project(p_project_id);
  return jsonb_build_object('project_id',p_project_id,'stage',v_stage);
end $$;

revoke all on function public.z19p_zero19_mark_art_ready(uuid,uuid,uuid) from public,anon;
grant execute on function public.z19p_zero19_mark_art_ready(uuid,uuid,uuid) to authenticated;

create or replace function public.z19p_zero19_mark_font_ready(p_work_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_owner uuid:=public.z19p_current_account_owner(); v_project uuid; v_stage text;
begin
  if auth.uid() is null or v_owner<>'96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid then
    raise exception 'Acesso nao autorizado.';
  end if;
  update public.z19p_zero19_work_items
  set stage='ready_production',art_ready_at=coalesce(art_ready_at,now()),updated_at=now()
  where id=p_work_item_id and owner_id=v_owner and stage='awaiting_font'
  returning project_id into v_project;
  if v_project is null then raise exception 'Personalizacao pendente de fonte nao encontrada.'; end if;
  v_stage:=public.z19p_zero19_refresh_project(v_project);
  return jsonb_build_object('project_id',v_project,'stage',v_stage);
end $$;

revoke all on function public.z19p_zero19_mark_font_ready(uuid) from public,anon;
grant execute on function public.z19p_zero19_mark_font_ready(uuid) to authenticated;

create or replace function public.z19p_zero19_mark_ready(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_owner uuid:=public.z19p_current_account_owner();
  v_ready uuid;
  v_workspace uuid;
begin
  if auth.uid() is null or v_owner<>'96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid then
    raise exception 'Acesso nao autorizado.';
  end if;
  select workspace_id into v_workspace from public.z19p_projects
  where id=p_project_id and owner_id=v_owner and official_order_source='zero19_pdv'
  for update;
  if not found then raise exception 'Pedido ZERO19 nao encontrado.'; end if;

  update public.z19p_zero19_work_items
  set stage='ready_pickup',ready_at=coalesce(ready_at,now()),updated_at=now()
  where project_id=p_project_id and owner_id=v_owner
    and stage not in ('delivered','cancelled');

  update public.personalization_sales p
  set status='DONE',completed_at=coalesce(completed_at,now()),updated_at=now()
  where p.id in (
    select personalization_sale_id from public.z19p_zero19_work_items
    where project_id=p_project_id and owner_id=v_owner and stage='ready_pickup'
  )
    and p.tenant_id='0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid
    and p.status not in ('DELIVERED','CANCELLED');

  v_ready:=public.z19p_zero19_status_id(v_owner,'ready_pickup');
  update public.z19p_projects
  set status_id=coalesce(v_ready,status_id),official_order_status='ready_pickup',
      ready_at=coalesce(ready_at,now()),updated_at=now(),updated_by=auth.uid()
  where id=p_project_id;
  update public.z19p_workspaces
  set status_id=coalesce(v_ready,status_id),status_changed_at=now(),updated_at=now()
  where id=v_workspace and owner_id=v_owner;

  return jsonb_build_object('project_id',p_project_id,'stage','ready_pickup');
end $$;

revoke all on function public.z19p_zero19_mark_ready(uuid) from public,anon;
grant execute on function public.z19p_zero19_mark_ready(uuid) to authenticated;

create or replace function public.z19p_zero19_mark_notified(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_owner uuid:=public.z19p_current_account_owner();
begin
  if auth.uid() is null or v_owner<>'96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid then
    raise exception 'Acesso nao autorizado.';
  end if;
  update public.z19p_zero19_work_items
  set customer_notified_at=coalesce(customer_notified_at,now()),updated_at=now()
  where project_id=p_project_id and owner_id=v_owner;
  update public.personalization_sales p
  set customer_notified_at=coalesce(customer_notified_at,now()),updated_at=now()
  where p.id in (
    select personalization_sale_id from public.z19p_zero19_work_items
    where project_id=p_project_id and owner_id=v_owner
  );
  update public.z19p_projects
  set customer_notified_at=coalesce(customer_notified_at,now()),updated_at=now(),updated_by=auth.uid()
  where id=p_project_id and owner_id=v_owner;
  return jsonb_build_object('project_id',p_project_id,'notified',true);
end $$;

revoke all on function public.z19p_zero19_mark_notified(uuid) from public,anon;
grant execute on function public.z19p_zero19_mark_notified(uuid) to authenticated;

create or replace function public.z19p_zero19_mark_delivered(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_owner uuid:=public.z19p_current_account_owner(); v_status uuid; v_workspace uuid;
begin
  if auth.uid() is null or v_owner<>'96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid then
    raise exception 'Acesso nao autorizado.';
  end if;
  select workspace_id into v_workspace from public.z19p_projects
  where id=p_project_id and owner_id=v_owner and official_order_source='zero19_pdv'
  for update;
  if not found then raise exception 'Pedido ZERO19 nao encontrado.'; end if;

  update public.z19p_zero19_work_items
  set stage='delivered',delivered_at=coalesce(delivered_at,now()),updated_at=now()
  where project_id=p_project_id and owner_id=v_owner and stage<>'cancelled';

  update public.personalization_sales p
  set status='DELIVERED',delivered_at=coalesce(delivered_at,now()),updated_at=now()
  where p.id in (
    select personalization_sale_id from public.z19p_zero19_work_items
    where project_id=p_project_id and owner_id=v_owner and stage='delivered'
  )
    and p.tenant_id='0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid
    and p.status<>'CANCELLED';

  v_status:=public.z19p_zero19_status_id(v_owner,'delivered');
  update public.z19p_projects
  set status_id=coalesce(v_status,status_id),official_order_status='delivered',
      finalized_at=coalesce(finalized_at,now()),updated_at=now(),updated_by=auth.uid()
  where id=p_project_id;
  update public.z19p_workspaces
  set status_id=coalesce(v_status,status_id),status_changed_at=now(),updated_at=now()
  where id=v_workspace and owner_id=v_owner;

  return jsonb_build_object('project_id',p_project_id,'stage','delivered');
end $$;

revoke all on function public.z19p_zero19_mark_delivered(uuid) from public,anon;
grant execute on function public.z19p_zero19_mark_delivered(uuid) to authenticated;

-- Estende a confirmação da exportação do filme: ao marcar um pedido ZERO19,
-- a origem no PDV também passa para IN_PROGRESS.
create or replace function public.z19p_mark_official_order_production(p_project_ids uuid[],p_placement_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  own uuid:=public.z19p_current_account_owner();
  project_count integer:=0;
  placement_count integer:=0;
  source_count integer:=0;
begin
  if auth.uid() is null then raise exception 'Autenticacao obrigatoria.'; end if;

  update public.z19p_projects
  set official_order_status='production',
      production_started_at=coalesce(production_started_at,now()),
      updated_at=now(),updated_by=auth.uid(),
      status_id=coalesce(public.z19p_zero19_status_id(own,'production'),status_id)
  where owner_id=own and official_order_ref is not null
    and id=any(coalesce(p_project_ids,array[]::uuid[]));
  get diagnostics project_count=row_count;

  update public.z19p_asset_placements
  set production_state='production',exported_at=coalesce(exported_at,now()),
      updated_at=now(),updated_by=auth.uid()
  where owner_id=own and production_state='pending'
    and id=any(coalesce(p_placement_ids,array[]::uuid[]));
  get diagnostics placement_count=row_count;

  update public.z19p_zero19_work_items w
  set stage='production',production_started_at=coalesce(production_started_at,now()),updated_at=now()
  where w.owner_id=own
    and w.project_id=any(coalesce(p_project_ids,array[]::uuid[]))
    and w.stage not in ('ready_pickup','delivered','cancelled');

  update public.personalization_sales p
  set status='IN_PROGRESS',started_at=coalesce(started_at,now()),updated_at=now()
  where p.id in (
    select w.personalization_sale_id
    from public.z19p_zero19_work_items w
    where w.owner_id=own
      and w.project_id=any(coalesce(p_project_ids,array[]::uuid[]))
      and w.stage='production'
  )
    and p.tenant_id='0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid
    and p.status not in ('DONE','DELIVERED','CANCELLED');
  get diagnostics source_count=row_count;

  update public.z19p_workspaces w
  set status_id=coalesce(public.z19p_zero19_status_id(own,'production'),w.status_id),
      status_changed_at=now(),updated_at=now()
  where w.owner_id=own and w.id in (
    select p.workspace_id from public.z19p_projects p
    where p.owner_id=own and p.id=any(coalesce(p_project_ids,array[]::uuid[]))
  );

  return jsonb_build_object(
    'projects',project_count,
    'placements',placement_count,
    'source_personalizations',source_count
  );
end $$;

revoke all on function public.z19p_mark_official_order_production(uuid[],uuid[]) from public,anon;
grant execute on function public.z19p_mark_official_order_production(uuid[],uuid[]) to authenticated;

-- Snapshot enxuto para o PDV ZERO19. Só usuários do tenant podem executar.
create or replace function public.zero19_personalization_ops_snapshot(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_avg numeric;
  v_backlog integer;
  v_counts jsonb;
  v_ready jsonb;
begin
  if auth.uid() is null or not exists(
    select 1 from public.user_tenants ut
    where ut.user_id=auth.uid() and ut.tenant_id=p_tenant_id
  ) then raise exception 'Acesso nao autorizado.'; end if;
  if p_tenant_id<>'0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid then
    raise exception 'Tenant invalido.';
  end if;

  select coalesce(
    round(avg(
      greatest(1,extract(epoch from (p.ready_at-p.art_ready_at))/60)
      / greatest(1,coalesce(q.qty,1))
    )::numeric,1),
    30
  ) into v_avg
  from public.z19p_projects p
  left join lateral (
    select sum(w.quantity)::integer qty
    from public.z19p_zero19_work_items w where w.project_id=p.id
  ) q on true
  where p.owner_id='96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid
    and p.official_order_source='zero19_pdv'
    and p.art_ready_at is not null
    and p.ready_at is not null
    and p.ready_at>p.art_ready_at
    and p.ready_at>now()-interval '60 days';

  select coalesce(sum(quantity),0)::integer into v_backlog
  from public.z19p_zero19_work_items
  where owner_id='96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid
    and stage in ('awaiting_art','awaiting_font','ready_production','production');

  select jsonb_build_object(
    'awaiting_art',count(*) filter(where stage='awaiting_art'),
    'awaiting_font',count(*) filter(where stage='awaiting_font'),
    'ready_production',count(*) filter(where stage='ready_production'),
    'production',count(*) filter(where stage='production'),
    'ready_pickup',count(*) filter(where stage='ready_pickup')
  ) into v_counts
  from public.z19p_zero19_work_items
  where owner_id='96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid;

  select coalesce(jsonb_agg(x.item order by x.promised_at nulls last,x.created_at),'[]'::jsonb)
  into v_ready
  from (
    select w.promised_at,w.created_at,jsonb_build_object(
      'project_id',w.project_id,
      'workspace_id',w.workspace_id,
      'order_id',w.order_id,
      'display_id',p.official_order_payload->>'display_id',
      'client_name',ws.client_name,
      'phone',ws.phone,
      'promised_at',p.promised_at,
      'ready_at',p.ready_at,
      'customer_notified_at',p.customer_notified_at
    ) item
    from public.z19p_zero19_work_items w
    join public.z19p_projects p on p.id=w.project_id
    join public.z19p_workspaces ws on ws.id=w.workspace_id
    where w.owner_id='96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid
      and w.stage='ready_pickup'
    group by w.project_id,w.workspace_id,w.order_id,w.promised_at,w.created_at,
             p.official_order_payload,p.promised_at,p.ready_at,p.customer_notified_at,
             ws.client_name,ws.phone
  ) x;

  return jsonb_build_object(
    'avg_minutes_per_shirt',v_avg,
    'backlog_quantity',v_backlog,
    'counts',coalesce(v_counts,'{}'::jsonb),
    'ready_pickup',coalesce(v_ready,'[]'::jsonb),
    'generated_at',now()
  );
end $$;

revoke all on function public.zero19_personalization_ops_snapshot(uuid) from public,anon;
grant execute on function public.zero19_personalization_ops_snapshot(uuid) to authenticated;

-- Sincroniza apenas o trabalho aberto atual; não importa os 622 históricos entregues/cancelados.
do $$
declare r record;
begin
  for r in
    select distinct order_id
    from public.personalization_sales
    where tenant_id='0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid
      and order_id is not null
      and status in ('PENDING','IN_PROGRESS','DONE')
  loop
    perform public.z19p_sync_zero19_order_internal(r.order_id);
  end loop;
end $$;

commit;
