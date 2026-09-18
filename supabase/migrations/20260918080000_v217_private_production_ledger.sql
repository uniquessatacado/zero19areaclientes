-- Explicit private production expense records. Never auto-record on download.
begin;
create table if not exists public.z19p_production_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  export_id uuid not null,
  production_date date not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  unique(owner_id,export_id),
  constraint z19p_production_ledger_shape check (coalesce(jsonb_typeof(data)='object' and data->>'version'='1' and jsonb_typeof(data->'cost')='number' and (data->>'cost')::numeric>=0 and octet_length(data::text)<=2097152,false))
);
create index if not exists z19p_production_ledger_owner_date on public.z19p_production_ledger(owner_id,production_date desc);
alter table public.z19p_production_ledger enable row level security;
revoke all on public.z19p_production_ledger from anon,authenticated;
grant select,insert on public.z19p_production_ledger to authenticated;
grant all on public.z19p_production_ledger to service_role;
drop policy if exists z19p_production_ledger_owner_read on public.z19p_production_ledger;
create policy z19p_production_ledger_owner_read on public.z19p_production_ledger for select to authenticated using (owner_id=(select auth.uid()) and owner_id=(select public.z19p_current_account_owner()) and (select public.z19p_is_admin()));
drop policy if exists z19p_production_ledger_owner_insert on public.z19p_production_ledger;
create policy z19p_production_ledger_owner_insert on public.z19p_production_ledger for insert to authenticated with check (owner_id=(select auth.uid()) and owner_id=(select public.z19p_current_account_owner()) and created_by=(select auth.uid()) and (select public.z19p_is_admin()));
comment on table public.z19p_production_ledger is 'Owner-only explicit production expense snapshots. Export does not imply a completed print or measured ink consumption. No employee or delegated-admin access.';
commit;
