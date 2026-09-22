-- v2.17.12 draft: company capability portal and operational production orders.
-- Apply through a named Supabase migration after isolated PostgreSQL verification.
-- No customer seed, prices, payments, commissions, or fabricated delivery dates.
begin;
create schema if not exists z19p_private;
grant usage on schema z19p_private to anon,authenticated;

create table public.z19p_company_portals (
 workspace_id uuid primary key references public.z19p_workspaces(id) on delete cascade,
 owner_id uuid not null references auth.users(id), token uuid not null unique default gen_random_uuid(),
 enabled boolean not null default true, created_at timestamptz not null default now(),
 created_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
create table z19p_private.company_upload_requests (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.z19p_company_portals(workspace_id) on delete cascade,
 request_id uuid not null, files jsonb not null, created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '2 hours', submitted_at timestamptz,
 unique(workspace_id,request_id), check(jsonb_typeof(files)='array')
);
create table z19p_private.company_upload_files (
 request_id uuid not null references z19p_private.company_upload_requests(id) on delete cascade,
 client_id uuid not null, path text not null unique, name text not null, mime_type text not null,
 size_bytes bigint not null check(size_bytes between 1 and 26214400), primary key(request_id,client_id)
);
create table public.z19p_company_orders (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 workspace_id uuid not null references public.z19p_workspaces(id) on delete cascade,
 project_id uuid not null unique references public.z19p_projects(id) on delete cascade,
 request_id uuid not null, submitted_payload jsonb not null, created_at timestamptz not null default now(),
 unique(workspace_id,request_id)
);
create table public.z19p_company_order_items (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 order_id uuid not null references public.z19p_company_orders(id) on delete cascade,
 product_id uuid not null references public.z19p_products(id) on delete restrict, product_name text not null,
 size text not null, color text not null check(length(btrim(color)) between 1 and 60), quantity integer not null check(quantity between 1 and 1000),
 width_cm numeric not null check(width_cm between 0.1 and 100),height_cm numeric not null check(height_cm between 0.1 and 300),
 reference_asset_id uuid not null references public.z19p_assets(id) on delete restrict,
 final_asset_id uuid references public.z19p_assets(id) on delete restrict,
 sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.z19p_projects add column source_kind text not null default 'internal' check(source_kind in ('internal','company_portal'));
alter table public.z19p_projects add column company_order_id uuid unique references public.z19p_company_orders(id) on delete no action deferrable initially deferred;
alter table public.z19p_projects add constraint z19p_project_company_source_check check((source_kind='company_portal')=(company_order_id is not null));
alter table public.z19p_film_allocations alter column quote_item_id drop not null;
alter table public.z19p_film_allocations add column company_order_item_id uuid references public.z19p_company_order_items(id) on delete restrict;
alter table public.z19p_film_allocations add constraint z19p_film_allocation_one_source check(num_nonnulls(quote_item_id,company_order_item_id)=1);
create index z19p_company_portals_owner_idx on public.z19p_company_portals(owner_id);
create index z19p_company_portals_creator_idx on public.z19p_company_portals(created_by);
create index z19p_company_orders_owner_idx on public.z19p_company_orders(owner_id,created_at desc);
create index z19p_company_order_items_order_idx on public.z19p_company_order_items(order_id);
create index z19p_company_order_items_owner_idx on public.z19p_company_order_items(owner_id);
create index z19p_company_order_items_product_idx on public.z19p_company_order_items(product_id);
create index z19p_company_order_items_reference_idx on public.z19p_company_order_items(reference_asset_id);
create index z19p_company_order_items_final_idx on public.z19p_company_order_items(final_asset_id);
create index z19p_company_requests_workspace_created_idx on z19p_private.company_upload_requests(workspace_id,created_at);
create index z19p_film_allocations_company_item_idx on public.z19p_film_allocations(company_order_item_id);
create index z19p_assets_company_catalog_idx on public.z19p_assets(workspace_id,created_at desc,id desc)
 where asset_type='arte' and metadata->>'source_kind'='company_portal' and nullif(metadata->>'source_catalog_asset_id','') is null;

alter table public.z19p_company_portals enable row level security;
alter table public.z19p_company_orders enable row level security;
alter table public.z19p_company_order_items enable row level security;
alter table z19p_private.company_upload_requests enable row level security;
alter table z19p_private.company_upload_files enable row level security;
revoke all on public.z19p_company_portals,public.z19p_company_orders,public.z19p_company_order_items from public,anon,authenticated;
revoke all on z19p_private.company_upload_requests,z19p_private.company_upload_files from public,anon,authenticated;
-- Portal tokens and raw submission payload are deliberately RPC-only.
grant select(id,owner_id,workspace_id,project_id,request_id,created_at) on public.z19p_company_orders to authenticated;
grant select on public.z19p_company_order_items to authenticated;
grant all on public.z19p_company_portals,public.z19p_company_orders,public.z19p_company_order_items to service_role;
create policy z19p_company_order_items_team_read on public.z19p_company_order_items for select to authenticated
 using(owner_id=(select public.z19p_current_account_owner()) and exists(select 1 from public.z19p_profiles where id=(select auth.uid()) and active));
create policy z19p_company_orders_team_read on public.z19p_company_orders for select to authenticated
 using(owner_id=(select public.z19p_current_account_owner()) and exists(select 1 from public.z19p_profiles where id=(select auth.uid()) and active));

create function z19p_private.company_actor() returns uuid language plpgsql stable security definer set search_path='' as $$
declare own uuid;
begin
 select account_owner_id into own from public.z19p_profiles where id=auth.uid() and active;
 if own is null then raise exception 'Entre novamente para acessar as empresas parceiras.'; end if;
 return own;
end $$;

create function z19p_private.company_portal(p_token uuid) returns public.z19p_company_portals language plpgsql stable security definer set search_path='' as $$
declare p public.z19p_company_portals%rowtype;
begin
 select * into p from public.z19p_company_portals where token=p_token and enabled;
 if not found then raise exception 'Link indisponível. Solicite o link atualizado à equipe.'; end if;
 return p;
end $$;

create function public.z19p_company_order_sizes() returns text[] language sql immutable security invoker set search_path='' as $$
 select array['PP','P','M','G','GG','XG','XXG','EXG','G1','G2','G3','G4','G5','Único','2','4','6','8','10','12','14','16']::text[];
$$;

create function z19p_private.company_portal_manage(p_workspace_id uuid,p_company_name text,p_client_name text,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare own uuid:=z19p_private.company_actor(); w public.z19p_workspaces%rowtype; p public.z19p_company_portals%rowtype; n integer; sid uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(own::text,21712));
 if p_workspace_id is null then
  if nullif(btrim(p_company_name),'') is null or length(p_company_name)>160 or length(coalesce(p_client_name,''))>160 then raise exception 'Informe o nome da empresa e um contato válido.'; end if;
  select count(*) into n from public.z19p_workspaces where owner_id=own and lower(btrim(company_name))=lower(btrim(p_company_name)) and workspace_type='client';
  if n>1 then raise exception 'Há empresas com esse nome. Abra o cadastro desejado para ativar o portal.'; end if;
  select * into w from public.z19p_workspaces where owner_id=own and lower(btrim(company_name))=lower(btrim(p_company_name)) and workspace_type='client';
  if not found then
   select id into sid from public.z19p_statuses where owner_id=own and active and not is_finalized and queue_stage='none' order by sort_order,id limit 1;
   insert into public.z19p_workspaces(owner_id,company_name,client_name,phone,workspace_type,created_by,responsible_user_id,status_id)
   values(own,btrim(p_company_name),nullif(btrim(p_client_name),''),null,'client',auth.uid(),auth.uid(),sid) returning * into w;
  end if;
 else
  select * into w from public.z19p_workspaces where id=p_workspace_id and owner_id=own and workspace_type='client' for update;
  if not found then raise exception 'Empresa não encontrada nesta conta.'; end if;
 end if;
 insert into public.z19p_company_portals(workspace_id,owner_id,enabled,created_by) values(w.id,own,coalesce(p_enabled,true),auth.uid())
 on conflict(workspace_id) do update set enabled=excluded.enabled,updated_at=clock_timestamp() returning * into p;
 -- This named pending stage is not a claim that artwork is already print-ready.
 if not exists(select 1 from public.z19p_statuses where owner_id=own and active and queue_stage='art_work' and not is_finalized) then
  insert into public.z19p_statuses(owner_id,name,color,sort_order,queue_stage) values(own,'Pendente de produção','#f59e0b',15,'art_work');
 end if;
 if not exists(select 1 from public.z19p_statuses where owner_id=own and active and is_finalized) then
  insert into public.z19p_statuses(owner_id,name,color,sort_order,queue_stage,is_finalized) values(own,'Pedido entregue','#22c55e',100,'none',true);
 end if;
 return jsonb_build_object('workspace_id',w.id,'company_name',w.company_name,'client_name',w.client_name,'token',p.token,'enabled',p.enabled);
end $$;

create function z19p_private.company_portals_list() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare own uuid:=z19p_private.company_actor(); result jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('workspace_id',w.id,'company_name',w.company_name,'client_name',w.client_name,'token',c.token,'enabled',c.enabled,
  'order_count',(select count(*) from public.z19p_company_orders o where o.workspace_id=w.id and o.owner_id=own),
  'pending_count',(select count(*) from public.z19p_company_orders o join public.z19p_projects p on p.id=o.project_id left join public.z19p_statuses s on s.id=p.status_id where o.workspace_id=w.id and o.owner_id=own and p.finalized_at is null and p.desisted_at is null and not coalesce(s.is_finalized,false))) order by w.company_name),'[]'::jsonb) into result
 from public.z19p_company_portals c join public.z19p_workspaces w on w.id=c.workspace_id and w.owner_id=c.owner_id where c.owner_id=own;
 return result;
end $$;

create function z19p_private.company_portal_reserve(p_token uuid,p_request_id uuid,p_files jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare portal public.z19p_company_portals%rowtype:=z19p_private.company_portal(p_token); req z19p_private.company_upload_requests%rowtype;
 row jsonb; count_files integer; total_bytes bigint; extension text;
begin
 if p_request_id is null or jsonb_typeof(p_files) is distinct from 'array' then raise exception 'Lista de arquivos inválida.'; end if;
 count_files:=jsonb_array_length(p_files);
 if count_files>200 then raise exception 'Envie até 100 artes por pedido.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(portal.workspace_id::text,21712));
 select * into req from z19p_private.company_upload_requests where workspace_id=portal.workspace_id and request_id=p_request_id for update;
 if found then
  if req.files is distinct from p_files then raise exception 'Arquivos alterados: inicie um novo envio.'; end if;
  if req.expires_at<=now() and req.submitted_at is null and exists(select 1 from z19p_private.company_upload_files f where f.request_id=req.id and not exists(select 1 from storage.objects o where o.bucket_id='z19p-assets' and o.name=f.path)) then raise exception 'O prazo de envio expirou. Inicie um novo pedido.'; end if;
 else
  if (select count(*) from z19p_private.company_upload_requests where workspace_id=portal.workspace_id and created_at>now()-interval '1 hour')>=20 or
     (select count(*) from z19p_private.company_upload_requests where workspace_id=portal.workspace_id and created_at>now()-interval '24 hours')>=100 then raise exception 'Limite de envios atingido. Aguarde ou fale com a equipe.'; end if;
  if exists(select 1 from jsonb_array_elements(p_files) f group by f->>'client_id' having count(*)>1) then raise exception 'Identificação de arquivo repetida.'; end if;
  total_bytes:=0;
  for row in select value from jsonb_array_elements(p_files) loop
   if jsonb_typeof(row) is distinct from 'object' or nullif(row->>'name','') is null or length(row->>'name')>180 or
      row->>'mime_type' not in ('image/png','image/jpeg','image/webp') or row->>'mime_type' is null or
      coalesce(row->>'size_bytes','') !~ '^[0-9]{1,8}$' or row->>'client_id' is null then raise exception 'Use PNG, JPG ou WebP com até 25 MB por arte.'; end if;
   perform (row->>'client_id')::uuid;
   if (row->>'size_bytes')::bigint not between 1 and 26214400 then raise exception 'Use arquivos de até 25 MB por arte.'; end if;
   total_bytes:=total_bytes+(row->>'size_bytes')::bigint;
  end loop;
  if total_bytes>262144000 then raise exception 'O total de artes do pedido deve ter até 250 MB.'; end if;
  if total_bytes+coalesce((select sum(f.size_bytes) from z19p_private.company_upload_requests r join z19p_private.company_upload_files f on f.request_id=r.id where r.workspace_id=portal.workspace_id and r.created_at>now()-interval '24 hours'),0)>2147483648 then raise exception 'Limite diário de arquivos atingido. Fale com a equipe.'; end if;
  insert into z19p_private.company_upload_requests(workspace_id,request_id,files) values(portal.workspace_id,p_request_id,p_files) returning * into req;
  for row in select value from jsonb_array_elements(p_files) loop
   extension:=case row->>'mime_type' when 'image/png' then 'png' when 'image/jpeg' then 'jpg' else 'webp' end;
   insert into z19p_private.company_upload_files(request_id,client_id,path,name,mime_type,size_bytes)
   values(req.id,(row->>'client_id')::uuid,portal.owner_id::text||'/company-portal/'||gen_random_uuid()::text||'/'||gen_random_uuid()::text||'.'||extension,row->>'name',row->>'mime_type',(row->>'size_bytes')::bigint);
  end loop;
 end if;
 return jsonb_build_object('request_id',p_request_id,'expires_at',req.expires_at,'uploads',(select jsonb_agg(jsonb_build_object('client_id',client_id,'path',path,'bucket','z19p-assets') order by client_id) from z19p_private.company_upload_files where request_id=req.id));
end $$;

-- Each random upload path is a short-lived, one-insert capability. It contains
-- neither the reusable portal token nor a predictable/client-selected filename.
create function z19p_private.company_upload_allowed(p_path text,p_metadata jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from z19p_private.company_upload_files f join z19p_private.company_upload_requests r on r.id=f.request_id join public.z19p_company_portals c on c.workspace_id=r.workspace_id
 where f.path=p_path and r.expires_at>now() and r.submitted_at is null and c.enabled
 and p_metadata->>'mimetype'=f.mime_type and case when coalesce(p_metadata->>'size','') ~ '^[0-9]{1,8}$' then (p_metadata->>'size')::bigint=f.size_bytes else false end);
$$;
create policy z19p_company_upload_insert on storage.objects for insert to anon,authenticated
 with check(bucket_id='z19p-assets' and z19p_private.company_upload_allowed(name,metadata));

create function z19p_private.company_portal_submit(p_token uuid,p_request_id uuid,p_order jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare portal public.z19p_company_portals%rowtype:=z19p_private.company_portal(p_token); req z19p_private.company_upload_requests%rowtype;
 existing public.z19p_company_orders%rowtype; w public.z19p_workspaces%rowtype; f z19p_private.company_upload_files%rowtype;
 product public.z19p_products%rowtype; row jsonb; pid uuid:=gen_random_uuid(); oid uuid:=gen_random_uuid(); aid uuid; fid uuid; sid uuid;
 processed z19p_private.company_upload_files%rowtype; reference public.z19p_assets%rowtype;
 seq integer; total integer:=0; qty integer; position integer:=0; wc numeric; hc numeric; pw integer; ph integer; used_uploads uuid[]:='{}';
begin
 if auth.uid() is not null and public.z19p_current_account_owner()<>portal.owner_id then raise exception 'Abra este link sem uma sessão de outra empresa.'; end if;
 if p_request_id is null or jsonb_typeof(p_order) is distinct from 'object' or jsonb_typeof(p_order->'items') is distinct from 'array' or jsonb_array_length(p_order->'items') not between 1 and 100 then raise exception 'Adicione os produtos e as artes ao pedido.'; end if;
 if length(coalesce(p_order->>'title',''))>160 or length(coalesce(p_order->>'notes',''))>3000 then raise exception 'Nome ou observações do pedido excederam o limite.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(portal.workspace_id::text,21712));
 select * into existing from public.z19p_company_orders where workspace_id=portal.workspace_id and request_id=p_request_id;
 if found then
  if existing.submitted_payload is distinct from p_order then raise exception 'Este envio já foi concluído com outros itens.'; end if;
  return jsonb_build_object('order_id',existing.id,'project_id',existing.project_id,'number',(select sequence_no from public.z19p_projects where id=existing.project_id),'replayed',true);
 end if;
 select * into req from z19p_private.company_upload_requests where workspace_id=portal.workspace_id and request_id=p_request_id and submitted_at is null for update;
 if not found then raise exception 'Envio expirado ou não iniciado. Selecione novamente as artes.'; end if;
 for row in select value from jsonb_array_elements(p_order->'items') loop
  if coalesce(row->>'quantity','') !~ '^[0-9]{1,4}$' or row->>'size' is null or not(row->>'size'=any(public.z19p_company_order_sizes())) then raise exception 'Tamanho ou quantidade inválida.'; end if;
  qty:=(row->>'quantity')::integer;
  if qty not between 1 and 1000 then raise exception 'Cada linha deve ter de 1 a 1000 peças.'; end if;
  total:=total+qty;
  if total>5000 then raise exception 'O pedido deve ter até 5000 peças.'; end if;
  if not exists(select 1 from public.z19p_products where id=(row->>'product_id')::uuid and owner_id=portal.owner_id and active) then raise exception 'Produto indisponível. Atualize o catálogo.'; end if;
  if nullif(btrim(row->>'color'),'') is null or length(row->>'color')>60 then raise exception 'Informe a cor de cada produto.'; end if;
  if nullif(btrim(row->>'art_name'),'') is null or length(row->>'art_name')>160 then raise exception 'Digite o nome de cada arte.'; end if;
  if coalesce(row->>'width_cm','') !~ '^[0-9]{1,3}([.][0-9]{1,6})?$' or coalesce(row->>'height_cm','') !~ '^[0-9]{1,3}([.][0-9]{1,6})?$' then raise exception 'Informe a largura em centímetros de cada arte.'; end if;
  wc:=(row->>'width_cm')::numeric; hc:=(row->>'height_cm')::numeric;
  if wc<0.1 or wc>100 or hc<0.1 or hc>300 then raise exception 'Medidas da arte fora do limite permitido.'; end if;
  if nullif(row->>'reference_asset_id','') is not null then
   if row->>'upload_id' is not null or row->>'processed_upload_id' is not null then raise exception 'Escolha uma arte salva ou envie uma nova.'; end if;
   select * into reference from public.z19p_assets where id=(row->>'reference_asset_id')::uuid and owner_id=portal.owner_id and workspace_id=portal.workspace_id and asset_type='arte' and metadata->>'source_kind'='company_portal' and nullif(metadata->>'source_catalog_asset_id','') is null and processed_path is not null for share;
   if not found or reference.width is null or reference.height is null then raise exception 'Arte salva indisponível nesta empresa.'; end if;
   pw:=reference.width; ph:=reference.height;
  else
   if row->>'upload_id' is null or row->>'processed_upload_id' is null or row->>'upload_id'=row->>'processed_upload_id' then raise exception 'Envie o original e o PNG preparado de cada arte.'; end if;
   if (row->>'upload_id')::uuid=any(used_uploads) or (row->>'processed_upload_id')::uuid=any(used_uploads) then raise exception 'Cada nova arte precisa de arquivos próprios.'; end if;
   used_uploads:=used_uploads||array[(row->>'upload_id')::uuid,(row->>'processed_upload_id')::uuid];
   if coalesce(row->>'pixel_width','') !~ '^[0-9]{1,5}$' or coalesce(row->>'pixel_height','') !~ '^[0-9]{1,5}$' then raise exception 'Dimensões do PNG preparado indisponíveis.'; end if;
   pw:=(row->>'pixel_width')::integer; ph:=(row->>'pixel_height')::integer;
   if pw not between 1 and 40000 or ph not between 1 and 40000 then raise exception 'Dimensões do PNG preparado inválidas.'; end if;
   for f in select * from z19p_private.company_upload_files where request_id=req.id and client_id in ((row->>'upload_id')::uuid,(row->>'processed_upload_id')::uuid) loop
    if not exists(select 1 from storage.objects o where o.bucket_id='z19p-assets' and o.name=f.path and o.metadata->>'mimetype'=f.mime_type and case when coalesce(o.metadata->>'size','') ~ '^[0-9]{1,8}$' then (o.metadata->>'size')::bigint=f.size_bytes else false end) then raise exception 'Uma arte ainda não terminou de enviar. Tente novamente.'; end if;
   end loop;
   if (select count(*) from z19p_private.company_upload_files where request_id=req.id and client_id in ((row->>'upload_id')::uuid,(row->>'processed_upload_id')::uuid))<>2 or not exists(select 1 from z19p_private.company_upload_files where request_id=req.id and client_id=(row->>'processed_upload_id')::uuid and mime_type='image/png') then raise exception 'Envie o original e o PNG preparado de cada arte.'; end if;
  end if;
  if abs(hc-wc*ph/nullif(pw,0))>0.02 then raise exception 'A altura deve manter a proporção da arte preparada.'; end if;
 end loop;
 if cardinality(used_uploads)<>(select count(*) from z19p_private.company_upload_files where request_id=req.id) then raise exception 'A lista de artes não corresponde aos itens.'; end if;
 select * into w from public.z19p_workspaces where id=portal.workspace_id and owner_id=portal.owner_id for update;
 select coalesce(max(sequence_no),0)+1 into seq from public.z19p_projects where workspace_id=w.id;
 select id into sid from public.z19p_statuses where owner_id=portal.owner_id and active and not is_finalized and queue_stage='art_work' order by sort_order,id limit 1;
 if sid is null then raise exception 'A equipe precisa configurar o status Pendente de produção.'; end if;
 insert into public.z19p_projects(id,owner_id,workspace_id,sequence_no,title,notes,responsible_user_id,status_id,source_kind,company_order_id,created_by)
 values(pid,portal.owner_id,w.id,seq,coalesce(nullif(btrim(p_order->>'title'),''),'Pedido de produção #'||seq),nullif(btrim(p_order->>'notes'),''),w.responsible_user_id,sid,'company_portal',oid,null);
 insert into public.z19p_company_orders(id,owner_id,workspace_id,project_id,request_id,submitted_payload) values(oid,portal.owner_id,w.id,pid,p_request_id,p_order);
 insert into public.z19p_folders(owner_id,workspace_id,project_id,name,purpose,created_by) values(portal.owner_id,w.id,pid,'Artes enviadas pelo cliente','artes_cliente',null) returning id into fid;
 for row in select value from jsonb_array_elements(p_order->'items') loop
  select * into product from public.z19p_products where id=(row->>'product_id')::uuid and owner_id=portal.owner_id;
  aid:=gen_random_uuid();
  wc:=(row->>'width_cm')::numeric; hc:=(row->>'height_cm')::numeric;
  if nullif(row->>'reference_asset_id','') is not null then
   select * into reference from public.z19p_assets where id=(row->>'reference_asset_id')::uuid and owner_id=portal.owner_id and workspace_id=w.id;
   pw:=reference.width; ph:=reference.height;
   insert into public.z19p_assets(id,owner_id,workspace_id,project_id,folder_id,name,asset_type,original_path,processed_path,mime_type,size_bytes,width,height,dpi,alpha_trimmed,metadata,created_by)
   values(aid,portal.owner_id,w.id,pid,fid,reference.name,'arte',reference.original_path,reference.processed_path,reference.mime_type,reference.size_bytes,pw,ph,300,reference.alpha_trimmed,jsonb_build_object('source_kind','company_portal','company_order_id',oid,'source_catalog_asset_id',reference.id,'submitted_size',row->>'size','requested_width_cm',wc,'requested_height_cm',hc),null);
  else
   select * into f from z19p_private.company_upload_files where request_id=req.id and client_id=(row->>'upload_id')::uuid;
   select * into processed from z19p_private.company_upload_files where request_id=req.id and client_id=(row->>'processed_upload_id')::uuid;
   pw:=(row->>'pixel_width')::integer; ph:=(row->>'pixel_height')::integer;
   insert into public.z19p_assets(id,owner_id,workspace_id,project_id,folder_id,name,asset_type,original_path,processed_path,mime_type,size_bytes,width,height,dpi,alpha_trimmed,metadata,created_by)
   values(aid,portal.owner_id,w.id,pid,fid,btrim(row->>'art_name'),'arte',f.path,processed.path,'image/png',processed.size_bytes,pw,ph,300,true,jsonb_build_object('source_kind','company_portal','company_order_id',oid,'submitted_size',row->>'size','original_mime_type',f.mime_type,'original_size_bytes',f.size_bytes,'requested_width_cm',wc,'requested_height_cm',hc,'preparation_source','client_browser'),null);
  end if;
  insert into public.z19p_company_order_items(owner_id,order_id,product_id,product_name,size,color,quantity,width_cm,height_cm,reference_asset_id,final_asset_id,sort_order)
  values(portal.owner_id,oid,product.id,product.name,row->>'size',btrim(row->>'color'),(row->>'quantity')::integer,wc,hc,aid,aid,position);
  position:=position+1;
 end loop;
 insert into public.z19p_status_history(owner_id,workspace_id,project_id,to_status_id,changed_by) values(portal.owner_id,w.id,pid,sid,null);
 update z19p_private.company_upload_requests set submitted_at=clock_timestamp() where id=req.id;
 return jsonb_build_object('order_id',oid,'project_id',pid,'number',seq,'replayed',false);
end $$;

-- A project marker alone never authorizes the partner payment exemption.
create function z19p_private.company_project_link_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.z19p_projects where id=new.id) then return new; end if;
 if new.source_kind='company_portal' and not exists(select 1 from public.z19p_company_orders o where o.id=new.company_order_id and o.project_id=new.id and o.workspace_id=new.workspace_id and o.owner_id=new.owner_id) then raise exception 'Vínculo do pedido da empresa inválido.'; end if;
 if tg_op='UPDATE' and row(new.source_kind,new.company_order_id,new.workspace_id,new.owner_id) is distinct from row(old.source_kind,old.company_order_id,old.workspace_id,old.owner_id) and (old.source_kind='company_portal' or new.source_kind='company_portal') then raise exception 'A origem do pedido da empresa não pode ser alterada.'; end if;
 return new;
end $$;
create constraint trigger z19p_company_project_link_guard after insert or update on public.z19p_projects deferrable initially deferred for each row execute function z19p_private.company_project_link_guard();

create function z19p_private.company_order_issues(p_project_id uuid) returns text[] language plpgsql stable security definer set search_path='' as $$
declare own uuid:=z19p_private.company_actor(); o public.z19p_company_orders%rowtype; issues text[]:='{}'; i record;
begin
 select co.* into o from public.z19p_company_orders co join public.z19p_projects p on p.company_order_id=co.id and p.id=co.project_id and p.workspace_id=co.workspace_id and p.owner_id=co.owner_id and p.source_kind='company_portal' where p.id=p_project_id and p.owner_id=own;
 if not found then return array['Pedido da empresa não encontrado nesta conta.']; end if;
 if not exists(select 1 from public.z19p_company_order_items where order_id=o.id and owner_id=own) then return array['Este pedido não tem itens.']; end if;
 for i in select * from public.z19p_company_order_items where order_id=o.id and owner_id=own loop
  if not exists(select 1 from public.z19p_assets a join public.z19p_asset_print_profiles ap on ap.asset_id=a.id and ap.owner_id=own where a.id=i.final_asset_id and a.owner_id=own and a.workspace_id=o.workspace_id and a.asset_type='arte' and coalesce(a.processed_path,a.original_path) is not null and ap.ready_for_print and ap.default_width_cm>0 and ap.default_height_cm>0 and ap.default_width_cm::text not in ('NaN','Infinity','-Infinity') and ap.default_height_cm::text not in ('NaN','Infinity','-Infinity')) then
   issues:=array_append(issues,'Prepare a arte e as medidas: '||i.product_name||' / '||i.size||'.');
  end if;
 end loop;
 return issues;
end $$;

create function z19p_private.company_order_detail(p_project_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare own uuid:=z19p_private.company_actor(); o public.z19p_company_orders%rowtype; p public.z19p_projects%rowtype; result jsonb;
begin
 select * into p from public.z19p_projects where id=p_project_id and owner_id=own and source_kind='company_portal';
 select * into o from public.z19p_company_orders where id=p.company_order_id and project_id=p.id and owner_id=own and workspace_id=p.workspace_id;
 if not found then raise exception 'Pedido da empresa não encontrado nesta conta.'; end if;
 select jsonb_build_object('order',jsonb_build_object('id',o.id,'project_id',p.id,'workspace_id',p.workspace_id,'number',p.sequence_no,'title',p.title,'notes',p.notes,'created_at',o.created_at),
 'company',(select jsonb_build_object('company_name',company_name,'client_name',client_name) from public.z19p_workspaces where id=p.workspace_id and owner_id=own),'project',to_jsonb(p),
 'items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'order_id',i.order_id,'product_id',i.product_id,'product_name',i.product_name,'size',i.size,'color',i.color,'quantity',i.quantity,'requested_width_cm',i.width_cm,'requested_height_cm',i.height_cm,'width_cm',i.width_cm,'height_cm',i.height_cm,'reference_asset_id',i.reference_asset_id,'final_asset_id',i.final_asset_id,'asset',to_jsonb(a),'reference_asset',to_jsonb(ref),'profile',to_jsonb(ap),'exported_quantity',coalesce((select sum(quantity) from public.z19p_film_allocations where company_order_item_id=i.id and owner_id=own),0)) order by i.sort_order),'[]'::jsonb) from public.z19p_company_order_items i left join public.z19p_assets a on a.id=i.final_asset_id and a.owner_id=own left join public.z19p_assets ref on ref.id=i.reference_asset_id and ref.owner_id=own left join public.z19p_asset_print_profiles ap on ap.asset_id=a.id and ap.owner_id=own where i.order_id=o.id and i.owner_id=own),
 'issues',to_jsonb(z19p_private.company_order_issues(p.id)),
 'statuses',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'color',color,'queue_stage',queue_stage,'is_finalized',is_finalized) order by sort_order),'[]'::jsonb) from public.z19p_statuses where owner_id=own and active)) into result;
 return result;
end $$;

create function z19p_private.company_order_prepare(p_project_id uuid,p_items jsonb,p_delivery_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare own uuid:=z19p_private.company_actor(); p public.z19p_projects%rowtype; o public.z19p_company_orders%rowtype; row jsonb; i public.z19p_company_order_items%rowtype;
begin
 select * into p from public.z19p_projects where id=p_project_id and owner_id=own and source_kind='company_portal' for update;
 select * into o from public.z19p_company_orders where id=p.company_order_id and project_id=p.id and workspace_id=p.workspace_id and owner_id=own;
 if not found or p.finalized_at is not null or p.desisted_at is not null then raise exception 'Pedido encerrado ou não encontrado.'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>100 or exists(select 1 from jsonb_array_elements(p_items) x group by x->>'id' having count(*)>1) then raise exception 'Itens inválidos.'; end if;
 for row in select value from jsonb_array_elements(p_items) loop
  select * into i from public.z19p_company_order_items where id=(row->>'id')::uuid and order_id=o.id and owner_id=own for update;
  if not found then raise exception 'Item não pertence a este pedido.'; end if;
  if not exists(select 1 from public.z19p_assets where id=(row->>'final_asset_id')::uuid and owner_id=own and workspace_id=p.workspace_id and asset_type='arte') then raise exception 'A arte final precisa pertencer a esta empresa.'; end if;
  if i.final_asset_id is distinct from (row->>'final_asset_id')::uuid and exists(select 1 from public.z19p_film_allocations where company_order_item_id=i.id) then raise exception 'Esta arte já entrou em filme. Preserve seu vínculo de produção.'; end if;
  insert into public.z19p_asset_print_profiles(asset_id,owner_id,project_id,default_width_cm,default_height_cm,aspect_ratio,ready_for_print,created_by,updated_by)
  select a.id,own,p.id,i.width_cm,i.height_cm,i.width_cm/i.height_cm,false,auth.uid(),auth.uid() from public.z19p_assets a where a.id=(row->>'final_asset_id')::uuid and a.id=i.reference_asset_id and a.owner_id=own
  on conflict(asset_id) do nothing;
  update public.z19p_company_order_items set final_asset_id=(row->>'final_asset_id')::uuid,updated_at=clock_timestamp() where id=i.id;
 end loop;
 update public.z19p_projects set delivery_date=p_delivery_date,updated_at=clock_timestamp(),updated_by=auth.uid() where id=p.id;
 return z19p_private.company_order_detail(p.id);
end $$;

create function z19p_private.company_orders_list(p_workspace_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare own uuid:=z19p_private.company_actor(); result jsonb;
begin
 select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb) into result from (
 select o.id,p.id project_id,p.workspace_id,w.company_name,p.sequence_no,p.title,s.name status_name,s.color status_color,s.queue_stage,o.created_at,p.delivery_date,null::date requested_delivery_date,p.finalized_at,p.desisted_at,s.is_finalized,
 (select sum(quantity) from public.z19p_company_order_items where order_id=o.id and owner_id=own) total_quantity
 from public.z19p_company_orders o join public.z19p_projects p on p.id=o.project_id and p.company_order_id=o.id join public.z19p_workspaces w on w.id=o.workspace_id left join public.z19p_statuses s on s.id=p.status_id and s.owner_id=own
 where o.owner_id=own and (p_workspace_id is null or o.workspace_id=p_workspace_id) order by o.created_at desc) r;
 return result;
end $$;

create function z19p_private.company_portal_catalog(p_token uuid,p_limit integer,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare portal public.z19p_company_portals%rowtype:=z19p_private.company_portal(p_token); page_limit integer:=greatest(1,least(coalesce(p_limit,100),100)); page_offset integer:=greatest(0,least(coalesce(p_offset,0),100000)); result jsonb;
begin
 select jsonb_build_object('catalog',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'original_path',original_path,'processed_path',processed_path,'width',width,'height',height,'width_cm',metadata->'requested_width_cm','height_cm',metadata->'requested_height_cm') order by created_at desc,id desc),'[]'::jsonb)
 from (select id,name,original_path,processed_path,width,height,metadata,created_at from public.z19p_assets where owner_id=portal.owner_id and workspace_id=portal.workspace_id and asset_type='arte' and metadata->>'source_kind'='company_portal' and nullif(metadata->>'source_catalog_asset_id','') is null and processed_path is not null order by created_at desc,id desc limit page_limit offset page_offset) a),
 'has_more',exists(select 1 from public.z19p_assets where owner_id=portal.owner_id and workspace_id=portal.workspace_id and asset_type='arte' and metadata->>'source_kind'='company_portal' and nullif(metadata->>'source_catalog_asset_id','') is null and processed_path is not null order by created_at desc,id desc limit 1 offset page_offset+page_limit)) into result;
 return result;
end $$;

create function z19p_private.company_portal_read(p_token uuid,p_limit integer,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare portal public.z19p_company_portals%rowtype:=z19p_private.company_portal(p_token); page_limit integer:=greatest(1,least(coalesce(p_limit,30),50)); page_offset integer:=greatest(0,least(coalesce(p_offset,0),100000)); result jsonb;
begin
 select jsonb_build_object('company',(select jsonb_build_object('company_name',company_name,'client_name',client_name) from public.z19p_workspaces where id=portal.workspace_id and owner_id=portal.owner_id),
 'products',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'description',null) order by sort_order,name),'[]'::jsonb) from public.z19p_products where owner_id=portal.owner_id and active),'sizes',to_jsonb(public.z19p_company_order_sizes()),
 'catalog',(z19p_private.company_portal_catalog(p_token,100,0)->'catalog'),
 'catalog_has_more',(z19p_private.company_portal_catalog(p_token,100,0)->'has_more'),
 'orders',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'project_id',p.id,'number',p.sequence_no,'title',p.title,'notes',p.notes,'created_at',o.created_at,'delivery_date',p.delivery_date,
 'status',jsonb_build_object('name',case when s.queue_stage='art_work' then 'Pendente de produção' else coalesce(s.name,'Pendente de produção') end,'color',coalesce(s.color,'#f59e0b'),'stage',s.queue_stage,'finalized',coalesce(s.is_finalized,false) or p.finalized_at is not null or p.desisted_at is not null),
 'items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'product_name',i.product_name,'size',i.size,'color',i.color,'quantity',i.quantity,'width_cm',i.width_cm,'height_cm',i.height_cm,'art_name',a.name,'original_path',a.original_path,'processed_path',a.processed_path,'exported_quantity',coalesce((select sum(quantity) from public.z19p_film_allocations where company_order_item_id=i.id and owner_id=portal.owner_id),0)) order by i.sort_order),'[]'::jsonb) from public.z19p_company_order_items i join public.z19p_assets a on a.id=i.reference_asset_id and a.owner_id=portal.owner_id where i.order_id=o.id and i.owner_id=portal.owner_id)) order by o.created_at desc),'[]'::jsonb)
 from (select * from public.z19p_company_orders where workspace_id=portal.workspace_id and owner_id=portal.owner_id order by created_at desc,id desc limit page_limit offset page_offset) o join public.z19p_projects p on p.id=o.project_id and p.company_order_id=o.id and p.owner_id=portal.owner_id left join public.z19p_statuses s on s.id=p.status_id and s.owner_id=portal.owner_id),
 'has_more',(select count(*)>page_offset+page_limit from public.z19p_company_orders where workspace_id=portal.workspace_id and owner_id=portal.owner_id),
 'summary',(select jsonb_build_object('total',count(*),'active',count(*) filter(where p.finalized_at is null and p.desisted_at is null and not coalesce(s.is_finalized,false)),'completed',count(*) filter(where p.finalized_at is not null or p.desisted_at is not null or coalesce(s.is_finalized,false)),
 'pieces',coalesce((select sum(i.quantity) from public.z19p_company_order_items i join public.z19p_company_orders co on co.id=i.order_id where co.workspace_id=portal.workspace_id and co.owner_id=portal.owner_id),0))
 from public.z19p_company_orders o join public.z19p_projects p on p.id=o.project_id left join public.z19p_statuses s on s.id=p.status_id and s.owner_id=portal.owner_id where o.workspace_id=portal.workspace_id and o.owner_id=portal.owner_id)) into result;
 return result;
end $$;

-- Narrowly extend the existing transition trigger; regular projects continue
-- through the unchanged v2.17.11 quote/payment/mockup checks.
do $patch_transition$
declare definition text; anchor text:=' if tg_op=''UPDATE'' and new.status_id is not distinct from old.status_id then return new; end if;';
begin
 select pg_get_functiondef('public.z19p_validate_project_transition()'::regprocedure) into definition;
 if position(anchor in definition)=0 then raise exception 'Revise a rotina de transição antes de aplicar a migration.'; end if;
 definition:=replace(definition,anchor,$branch$
 if new.source_kind='company_portal' then
  select queue_stage,is_finalized into stage,final from public.z19p_statuses where id=new.status_id and owner_id=new.owner_id and active;
  if not found then raise exception 'Status não encontrado ou inativo.'; end if;
  if tg_op='INSERT' then
   if stage is distinct from 'art_work' then raise exception 'Novo pedido da empresa deve começar pendente de produção.'; end if;
   return new;
  end if;
  if not exists(select 1 from public.z19p_company_orders o where o.id=new.company_order_id and o.project_id=new.id and o.owner_id=new.owner_id and o.workspace_id=new.workspace_id) then raise exception 'Vínculo do pedido da empresa inválido.'; end if;
  if new.status_id is not distinct from old.status_id then return new; end if;
  if auth.uid() is null or not exists(select 1 from public.z19p_profiles where id=auth.uid() and active and account_owner_id=new.owner_id) then raise exception 'Autenticação ativa obrigatória.'; end if;
  if old.finalized_at is not null or old.desisted_at is not null or exists(select 1 from public.z19p_statuses where id=old.status_id and is_finalized) then raise exception 'Pedido encerrado. Crie um novo projeto.'; end if;
  if stage in ('ready_production','production') then
   issues:=z19p_private.company_order_issues(new.id);
   if cardinality(issues)>0 then raise exception '%',array_to_string(issues,' '); end if;
  end if;
  new.status_entered_at:=now();
  if coalesce(final,false) then new.finalized_at:=coalesce(new.finalized_at,now()); end if;
  return new;
 end if;
$branch$||anchor);
 execute definition;
end $patch_transition$;

alter function public.z19p_transition_project(uuid,uuid) rename to z19p_transition_project_v21711;
create function public.z19p_transition_project(p_project_id uuid,p_status_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare own uuid:=z19p_private.company_actor(); p public.z19p_projects%rowtype; s public.z19p_statuses%rowtype;
begin
 select * into p from public.z19p_projects where id=p_project_id and owner_id=own for update;
 if not found then raise exception 'Projeto não encontrado.'; end if;
 if p.source_kind<>'company_portal' then return public.z19p_transition_project_v21711(p_project_id,p_status_id); end if;
 select * into s from public.z19p_statuses where id=p_status_id and owner_id=own and active;
 if not found then raise exception 'Status não encontrado ou inativo.'; end if;
 update public.z19p_projects set status_id=s.id,updated_at=clock_timestamp(),updated_by=auth.uid() where id=p.id and owner_id=own;
 insert into public.z19p_status_history(owner_id,workspace_id,project_id,from_status_id,to_status_id,changed_by) values(own,p.workspace_id,p.id,p.status_id,s.id,auth.uid());
 return jsonb_build_object('project_id',p.id,'status_id',s.id,'queue_stage',s.queue_stage,'is_finalized',s.is_finalized);
end $$;

create function z19p_private.pending_company_film_items() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare own uuid:=z19p_private.company_actor(); result jsonb;
begin
 select coalesce(jsonb_agg(to_jsonb(r) order by r.delivery_date,r.project_id,r.company_order_item_id),'[]'::jsonb) into result from (
 select 'company_order'::text kind,p.id project_id,p.workspace_id,w.company_name,p.title project_title,p.delivery_date,p.responsible_user_id,null::uuid quote_id,null::uuid quote_item_id,null::text service_type,
 i.id company_order_item_id,i.product_name,i.size,i.color,i.product_name||' / '||i.size||' / '||i.color label,i.quantity ordered_quantity,i.final_asset_id asset_id,
 coalesce((select sum(quantity) from public.z19p_film_allocations where company_order_item_id=i.id and owner_id=own),0) exported_quantity,
 i.quantity-coalesce((select sum(quantity) from public.z19p_film_allocations where company_order_item_id=i.id and owner_id=own),0) remaining_quantity,
 coalesce((select jsonb_agg(jsonb_build_object('film_item_id',film_item_id,'quantity',quantity)) from public.z19p_film_allocations where company_order_item_id=i.id and owner_id=own),'[]'::jsonb) allocations,
 ap.default_width_cm width_cm,ap.default_height_cm height_cm,ap.halftone,ap.rotation_policy,ap.allow_internal_nesting,a.name asset_name,a.processed_path,a.original_path,a.metadata
 from public.z19p_company_order_items i join public.z19p_company_orders o on o.id=i.order_id and o.owner_id=own
 join public.z19p_projects p on p.company_order_id=o.id and p.id=o.project_id and p.owner_id=own and p.source_kind='company_portal'
 join public.z19p_workspaces w on w.id=p.workspace_id and w.owner_id=own join public.z19p_statuses s on s.id=p.status_id and s.owner_id=own
 join public.z19p_assets a on a.id=i.final_asset_id and a.owner_id=own and a.workspace_id=p.workspace_id
 join public.z19p_asset_print_profiles ap on ap.asset_id=a.id and ap.owner_id=own and ap.ready_for_print
 where i.owner_id=own and p.finalized_at is null and p.desisted_at is null and not s.is_finalized and s.queue_stage in ('ready_production','production') and cardinality(z19p_private.company_order_issues(p.id))=0) r where r.remaining_quantity>0;
 return result;
end $$;
alter function public.z19p_pending_film_items() rename to z19p_pending_film_items_v21711;
create function public.z19p_pending_film_items() returns jsonb language sql stable security invoker set search_path='' as $$
 select public.z19p_pending_film_items_v21711()||z19p_private.pending_company_film_items();
$$;
alter function public.z19p_queue_readiness() rename to z19p_queue_readiness_v21711;
create function z19p_private.company_queue_readiness() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare own uuid:=z19p_private.company_actor(); result jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('project_id',p.id,'issues',to_jsonb(z19p_private.company_order_issues(p.id)))),'[]'::jsonb) into result
 from public.z19p_projects p join public.z19p_company_orders o on o.id=p.company_order_id and o.project_id=p.id and o.owner_id=own
 join public.z19p_statuses s on s.id=p.status_id and s.owner_id=own
 where p.owner_id=own and p.finalized_at is null and p.desisted_at is null and not s.is_finalized and s.queue_stage in ('ready_production','production');
 return result;
end $$;
create function public.z19p_queue_readiness() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce((select jsonb_agg(x) from jsonb_array_elements(public.z19p_queue_readiness_v21711()) x where not exists(select 1 from public.z19p_projects p where p.id::text=x->>'project_id' and p.source_kind='company_portal' and p.company_order_id is not null)),'[]'::jsonb)||z19p_private.company_queue_readiness();
$$;

create function z19p_private.record_company_film_item(p_export_id uuid,p_row jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare own uuid:=z19p_private.company_actor(); i public.z19p_company_order_items%rowtype; p public.z19p_projects%rowtype; a public.z19p_assets%rowtype;
 ap public.z19p_asset_print_profiles%rowtype; previous public.z19p_film_allocations%rowtype; delta integer; allocated bigint; qty integer; issues text[]; stage text; next_status uuid;
begin
 if p_row->>'quote_item_id' is not null or p_row->>'film_item_id' is null or coalesce(p_row->>'quantity','') !~ '^[0-9]{1,5}$' then raise exception 'Vínculo ou quantidade de filme inválida.'; end if;
 qty:=(p_row->>'quantity')::integer;
 if qty not between 1 and 10000 then raise exception 'Quantidade de filme inválida.'; end if;
 select * into i from public.z19p_company_order_items where id=(p_row->>'company_order_item_id')::uuid and owner_id=own for update;
 select pp.* into p from public.z19p_projects pp join public.z19p_company_orders o on o.project_id=pp.id and o.id=pp.company_order_id and o.workspace_id=pp.workspace_id and o.owner_id=own
 where o.id=i.order_id and pp.owner_id=own and pp.id=(p_row->>'project_id')::uuid and pp.source_kind='company_portal';
 if not found or i.final_asset_id is distinct from (p_row->>'asset_id')::uuid then raise exception 'A arte exportada não corresponde ao pedido da empresa.'; end if;
 select * into previous from public.z19p_film_allocations where owner_id=own and film_item_id=(p_row->>'film_item_id')::uuid;
 if found and (previous.company_order_item_id is distinct from i.id or previous.asset_id<>i.final_asset_id or previous.project_id<>p.id) then raise exception 'Vínculo de filme já registrado não pode mudar.'; end if;
 select * into a from public.z19p_assets where id=i.final_asset_id and owner_id=own and workspace_id=p.workspace_id for share;
 if not found or nullif(p_row->>'source_path','') is null or p_row->>'source_path' is distinct from coalesce(a.processed_path,a.original_path) then raise exception 'A arte do pedido mudou. Atualize a fila e gere novamente.'; end if;
 delta:=greatest(0,qty-coalesce(previous.quantity,0));
 if delta=0 then return jsonb_build_object('added_quantity',0,'has_previous_items',true); end if;
 select queue_stage into stage from public.z19p_statuses where id=p.status_id and owner_id=own and not is_finalized;
 if stage is null or stage not in ('ready_production','production') or p.finalized_at is not null or p.desisted_at is not null then raise exception 'Pedido não está liberado para produção.'; end if;
 issues:=z19p_private.company_order_issues(p.id);
 if cardinality(issues)>0 then raise exception '%',array_to_string(issues,' '); end if;
 select * into ap from public.z19p_asset_print_profiles where asset_id=i.final_asset_id and owner_id=own for share;
 if not found or p_row->>'width_cm' is null or p_row->>'height_cm' is null or (p_row->>'width_cm')::numeric::text in ('NaN','Infinity','-Infinity') or (p_row->>'height_cm')::numeric::text in ('NaN','Infinity','-Infinity') or abs(ap.default_width_cm-(p_row->>'width_cm')::numeric)>.005 or abs(ap.default_height_cm-(p_row->>'height_cm')::numeric)>.005 then raise exception 'Medidas do filme diferem da arte final.'; end if;
 select coalesce(sum(quantity),0) into allocated from public.z19p_film_allocations where company_order_item_id=i.id and owner_id=own;
 if allocated+delta>i.quantity then raise exception 'Quantidade já atendida em outro filme. Atualize as pendências.'; end if;
 insert into public.z19p_film_allocations(owner_id,film_item_id,company_order_item_id,project_id,asset_id,quantity,first_export_id,created_by)
 values(own,(p_row->>'film_item_id')::uuid,i.id,p.id,i.final_asset_id,qty,p_export_id,auth.uid())
 on conflict(owner_id,film_item_id) do update set quantity=excluded.quantity;
 if stage='ready_production' then
  select id into next_status from public.z19p_statuses where owner_id=own and active and not is_finalized and queue_stage='production' order by sort_order,id limit 1;
  if next_status is null then raise exception 'Configure o status Em produção antes de gerar arquivos.'; end if;
  perform public.z19p_transition_project(p.id,next_status);
 end if;
 return jsonb_build_object('added_quantity',delta,'has_previous_items',previous.film_item_id is not null);
end $$;

-- Keep one atomic export ledger and its original replay/fingerprint locks for
-- mixed normal + partner films. An isolated partner helper is not an endpoint.
do $patch_export$
declare definition text; anchor text:=' for row in select value from jsonb_array_elements(p_items) loop';
begin
 select pg_get_functiondef('z19p_private.record_film_export(uuid,text,jsonb)'::regprocedure) into definition;
 if position(anchor in definition)=0 or position(' production_status uuid; issues text[];' in definition)=0 then raise exception 'Revise o registro de filme antes de aplicar a migration.'; end if;
 if position('previous.quote_item_id<>i.id' in definition)=0 then raise exception 'Revise a identidade de itens do filme antes de aplicar a migration.'; end if;
 definition:=replace(definition,'previous.quote_item_id<>i.id','previous.quote_item_id is distinct from i.id or previous.company_order_item_id is not null');
 definition:=replace(definition,' production_status uuid; issues text[];',' production_status uuid; issues text[]; partner_result jsonb;');
 definition:=replace(definition,anchor,anchor||$branch$
  if row->>'company_order_item_id' is not null then
   partner_result:=z19p_private.record_company_film_item(p_export_id,row);
   added:=added+(partner_result->>'added_quantity')::integer;
   has_previous:=has_previous or (partner_result->>'has_previous_items')::boolean;
   continue;
  end if;
$branch$);
 execute definition;
end $patch_export$;

-- All exposed functions are invokers. Private definer helpers authorize the
-- caller by active account or by the exact unguessable company capability.
create function public.z19p_company_portal_manage(p_workspace_id uuid default null,p_company_name text default null,p_client_name text default null,p_enabled boolean default true) returns jsonb language sql security invoker set search_path='' as $$ select z19p_private.company_portal_manage(p_workspace_id,p_company_name,p_client_name,p_enabled) $$;
create function public.z19p_company_portals_list() returns jsonb language sql stable security invoker set search_path='' as $$ select z19p_private.company_portals_list() $$;
create function public.z19p_company_orders_list(p_workspace_id uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$ select z19p_private.company_orders_list(p_workspace_id) $$;
create function public.z19p_company_order_detail(p_project_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select z19p_private.company_order_detail(p_project_id) $$;
create function public.z19p_company_order_prepare(p_project_id uuid,p_items jsonb,p_delivery_date date default null) returns jsonb language sql security invoker set search_path='' as $$ select z19p_private.company_order_prepare(p_project_id,p_items,p_delivery_date) $$;
create function public.z19p_company_portal_read(p_token uuid,p_limit integer default 30,p_offset integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$ select z19p_private.company_portal_read(p_token,p_limit,p_offset) $$;
create function public.z19p_company_portal_catalog(p_token uuid,p_limit integer default 100,p_offset integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$ select z19p_private.company_portal_catalog(p_token,p_limit,p_offset) $$;
create function public.z19p_company_portal_reserve(p_token uuid,p_request_id uuid,p_files jsonb) returns jsonb language sql security invoker set search_path='' as $$ select z19p_private.company_portal_reserve(p_token,p_request_id,p_files) $$;
create function public.z19p_company_portal_submit(p_token uuid,p_request_id uuid,p_order jsonb) returns jsonb language sql security invoker set search_path='' as $$ select z19p_private.company_portal_submit(p_token,p_request_id,p_order) $$;

do $grants$
declare f record;
begin
 for f in select p.oid::regprocedure signature,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
 (n.nspname='z19p_private' and p.proname in ('company_actor','company_portal','company_portal_manage','company_portals_list','company_orders_list','company_order_detail','company_order_prepare','company_portal_read','company_portal_catalog','company_portal_reserve','company_portal_submit','company_upload_allowed','company_project_link_guard','company_order_issues','pending_company_film_items','company_queue_readiness','record_company_film_item')) or
 (n.nspname='public' and p.proname in ('z19p_company_order_sizes','z19p_company_portal_manage','z19p_company_portals_list','z19p_company_orders_list','z19p_company_order_detail','z19p_company_order_prepare','z19p_company_portal_read','z19p_company_portal_catalog','z19p_company_portal_reserve','z19p_company_portal_submit','z19p_transition_project','z19p_pending_film_items','z19p_queue_readiness')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname not in ('company_portal','company_project_link_guard','record_company_film_item') then execute format('grant execute on function %s to authenticated',f.signature); end if;
  if f.proname in ('z19p_company_order_sizes','company_upload_allowed','company_portal_read','company_portal_catalog','company_portal_reserve','company_portal_submit','z19p_company_portal_read','z19p_company_portal_catalog','z19p_company_portal_reserve','z19p_company_portal_submit') then execute format('grant execute on function %s to anon',f.signature); end if;
 end loop;
end $grants$;
comment on table public.z19p_company_orders is 'Operational requests submitted through an explicit company capability. This is not a quote, payment, invoice, or sale.';
comment on column public.z19p_projects.source_kind is 'company_portal is valid only with the immutable matching company_order_id, validated by deferred trigger.';
commit;
