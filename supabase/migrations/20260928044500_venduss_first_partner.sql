-- Only an explicitly linked Venduss tenant can activate the company portal.
-- Future tenant partnerships need an authenticated activation flow, not an
-- arbitrary new-company form in Personalizações.
begin;
create table public.z19p_partner_tenants(
 tenant_id uuid primary key references public.tenants(id),
 workspace_id uuid not null unique references public.z19p_workspaces(id) on delete restrict,
 owner_id uuid not null references auth.users(id),
 enabled boolean not null default true,
 created_at timestamptz not null default now()
);
create index z19p_partner_tenants_owner_idx on public.z19p_partner_tenants(owner_id);
alter table public.z19p_partner_tenants enable row level security;
revoke all on public.z19p_partner_tenants from public,anon,authenticated;
grant all on public.z19p_partner_tenants to service_role;

do $seed_venduss$
declare v_tenant uuid; v_owner uuid; v_workspace uuid; v_status uuid;
begin
 select t.id,p.account_owner_id into v_tenant,v_owner
 from public.tenants t join public.user_tenants ut on ut.tenant_id=t.id
 join public.z19p_profiles p on p.id=ut.user_id and p.active and p.account_owner_id=p.id
 where t.subdomain='venduss' and ut.role::text in ('ADMIN','SUPER_ADMIN')
 order by case when p.role='admin' then 0 else 1 end,ut.created_at limit 1;
 if v_tenant is null or v_owner is null then raise exception 'A loja Venduss não tem responsável ativo no Personalizações.'; end if;
 select workspace_id into v_workspace from public.z19p_partner_tenants where tenant_id=v_tenant;
 if v_workspace is null then
  select id into v_workspace from public.z19p_workspaces
  where owner_id=v_owner and source_tenant_id=v_tenant and external_customer_source='venduss_partner'
  order by created_at limit 1;
 end if;
 if v_workspace is null then
  select id into v_status from public.z19p_statuses
  where owner_id=v_owner and active and not is_finalized and queue_stage='none'
  order by sort_order,id limit 1;
  insert into public.z19p_workspaces(owner_id,company_name,client_name,workspace_type,status_id,created_by,responsible_user_id,source_tenant_id,external_customer_source)
  values(v_owner,'Venduss','Loja Venduss','client',v_status,v_owner,v_owner,v_tenant,'venduss_partner')
  returning id into v_workspace;
 end if;
 insert into public.z19p_partner_tenants(tenant_id,workspace_id,owner_id,enabled)
 values(v_tenant,v_workspace,v_owner,true)
 on conflict(tenant_id) do nothing;
 insert into public.z19p_company_portals(workspace_id,owner_id,enabled,created_by)
 values(v_workspace,v_owner,true,v_owner)
 on conflict(workspace_id) do update set enabled=true,updated_at=now();
end $seed_venduss$;

create function z19p_private.enforce_partner_tenant_portal()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.enabled and not exists(select 1 from public.z19p_partner_tenants pt
   where pt.workspace_id=new.workspace_id and pt.owner_id=new.owner_id and pt.enabled) then
  raise exception 'Ative a parceria pelo cadastro da loja antes de abrir o portal.';
 end if;
 return new;
end $$;
create trigger z19p_company_portal_partner_guard before insert or update of enabled,workspace_id,owner_id
on public.z19p_company_portals for each row execute function z19p_private.enforce_partner_tenant_portal();
revoke all on function z19p_private.enforce_partner_tenant_portal() from public,anon,authenticated;
commit;
