-- v2.17.22 — reusable shirt groups sourced from the ZERO19/Vendus catalog.
begin;

create table if not exists public.z19p_manual_garment_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.z19p_current_account_owner(),
  workspace_id uuid not null references public.z19p_workspaces(id) on delete cascade,
  project_id uuid references public.z19p_projects(id) on delete set null,
  name text not null,
  active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.z19p_manual_garments
  add column if not exists group_id uuid references public.z19p_manual_garment_groups(id) on delete cascade,
  add column if not exists quantity integer not null default 1 check(quantity between 1 and 999),
  add column if not exists vendus_subcategory_id uuid,
  add column if not exists vendus_product_id bigint,
  add column if not exists vendus_variant_id uuid,
  add column if not exists product_name text,
  add column if not exists product_image_url text,
  add column if not exists color_hex text;

alter table public.z19p_asset_placements
  add column if not exists manual_garment_group_id uuid references public.z19p_manual_garment_groups(id) on delete set null;

create index if not exists z19p_manual_garment_groups_workspace_idx
  on public.z19p_manual_garment_groups(owner_id,workspace_id,active,created_at desc);
create index if not exists z19p_manual_garments_group_idx
  on public.z19p_manual_garments(group_id,created_at);
create index if not exists z19p_asset_placements_manual_group_idx
  on public.z19p_asset_placements(manual_garment_group_id,created_at desc)
  where manual_garment_group_id is not null;

alter table public.z19p_manual_garment_groups enable row level security;
revoke all on public.z19p_manual_garment_groups from anon,authenticated;
grant select,insert,update,delete on public.z19p_manual_garment_groups to authenticated;
grant all on public.z19p_manual_garment_groups to service_role;

drop policy if exists z19p_manual_garment_groups_select on public.z19p_manual_garment_groups;
create policy z19p_manual_garment_groups_select on public.z19p_manual_garment_groups for select to authenticated
using(owner_id=public.z19p_current_account_owner() and exists(select 1 from public.z19p_profiles p where p.id=auth.uid() and p.active));

drop policy if exists z19p_manual_garment_groups_insert on public.z19p_manual_garment_groups;
create policy z19p_manual_garment_groups_insert on public.z19p_manual_garment_groups for insert to authenticated
with check(owner_id=public.z19p_current_account_owner() and created_by=auth.uid() and updated_by=auth.uid() and exists(select 1 from public.z19p_profiles p where p.id=auth.uid() and p.active));

drop policy if exists z19p_manual_garment_groups_update on public.z19p_manual_garment_groups;
create policy z19p_manual_garment_groups_update on public.z19p_manual_garment_groups for update to authenticated
using(owner_id=public.z19p_current_account_owner() and exists(select 1 from public.z19p_profiles p where p.id=auth.uid() and p.active))
with check(owner_id=public.z19p_current_account_owner() and updated_by=auth.uid());

drop policy if exists z19p_manual_garment_groups_delete on public.z19p_manual_garment_groups;
create policy z19p_manual_garment_groups_delete on public.z19p_manual_garment_groups for delete to authenticated
using(owner_id=public.z19p_current_account_owner() and exists(select 1 from public.z19p_profiles p where p.id=auth.uid() and p.active));

-- Preserve the one manual shirt already created before groups existed.
do $$
declare g record; gid uuid;
begin
  for g in
    select * from public.z19p_manual_garments where group_id is null
  loop
    insert into public.z19p_manual_garment_groups(owner_id,workspace_id,project_id,name,created_by,updated_by,created_at,updated_at)
    values(g.owner_id,g.workspace_id,g.project_id,'Grupo manual · '||coalesce(g.name,'Camiseta'),g.created_by,g.updated_by,g.created_at,g.updated_at)
    returning id into gid;
    update public.z19p_manual_garments set group_id=gid where id=g.id;
    update public.z19p_asset_placements set manual_garment_group_id=gid
      where manual_garment_id=g.id and manual_garment_group_id is null;
  end loop;
end $$;

commit;