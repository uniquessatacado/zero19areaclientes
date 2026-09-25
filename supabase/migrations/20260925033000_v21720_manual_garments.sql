-- v2.17.20 — manual garment flow for clients without an official order.
begin;

create table if not exists public.z19p_manual_garments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.z19p_current_account_owner(),
  workspace_id uuid not null references public.z19p_workspaces(id) on delete cascade,
  project_id uuid references public.z19p_projects(id) on delete set null,
  name text not null,
  category text not null check(category in ('masculina','feminina','infantil')),
  garment_model text not null check(garment_model in ('normal','oversized','babylook','kids')),
  size text not null,
  color text not null,
  color_name text not null,
  active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists z19p_manual_garments_workspace_idx
  on public.z19p_manual_garments(owner_id,workspace_id,active,created_at desc);

alter table public.z19p_asset_placements
  add column if not exists manual_garment_id uuid references public.z19p_manual_garments(id) on delete set null;

create index if not exists z19p_asset_placements_manual_garment_idx
  on public.z19p_asset_placements(manual_garment_id,created_at desc)
  where manual_garment_id is not null;

alter table public.z19p_manual_garments enable row level security;
revoke all on public.z19p_manual_garments from anon,authenticated;
grant select,insert,update,delete on public.z19p_manual_garments to authenticated;
grant all on public.z19p_manual_garments to service_role;

drop policy if exists z19p_manual_garments_select on public.z19p_manual_garments;
create policy z19p_manual_garments_select on public.z19p_manual_garments for select to authenticated
using(owner_id=public.z19p_current_account_owner() and exists(select 1 from public.z19p_profiles p where p.id=auth.uid() and p.active));

drop policy if exists z19p_manual_garments_insert on public.z19p_manual_garments;
create policy z19p_manual_garments_insert on public.z19p_manual_garments for insert to authenticated
with check(owner_id=public.z19p_current_account_owner() and created_by=auth.uid() and updated_by=auth.uid() and exists(select 1 from public.z19p_profiles p where p.id=auth.uid() and p.active));

drop policy if exists z19p_manual_garments_update on public.z19p_manual_garments;
create policy z19p_manual_garments_update on public.z19p_manual_garments for update to authenticated
using(owner_id=public.z19p_current_account_owner() and exists(select 1 from public.z19p_profiles p where p.id=auth.uid() and p.active))
with check(owner_id=public.z19p_current_account_owner() and updated_by=auth.uid());

drop policy if exists z19p_manual_garments_delete on public.z19p_manual_garments;
create policy z19p_manual_garments_delete on public.z19p_manual_garments for delete to authenticated
using(owner_id=public.z19p_current_account_owner() and exists(select 1 from public.z19p_profiles p where p.id=auth.uid() and p.active));

commit;
