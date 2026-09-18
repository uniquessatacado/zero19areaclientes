-- Account-owner-only cost settings, isolated from employee access.
begin;
create table if not exists public.z19p_production_cost_settings (
  owner_id uuid primary key default public.z19p_current_account_owner() references auth.users(id) on delete cascade,
  data jsonb not null default '{"version":1,"activeProfileId":null,"purchases":[],"profiles":[]}'::jsonb,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  constraint z19p_production_cost_settings_shape check (
    coalesce(jsonb_typeof(data)='object' and data->>'version'='1'
    and jsonb_typeof(data->'purchases')='array' and jsonb_typeof(data->'profiles')='array'
    and octet_length(data::text)<=2097152,false)
  )
);
alter table public.z19p_production_cost_settings enable row level security;
revoke all on public.z19p_production_cost_settings from anon,authenticated;
grant select,insert,update on public.z19p_production_cost_settings to authenticated;
grant all on public.z19p_production_cost_settings to service_role;
drop policy if exists z19p_costs_team_select on public.z19p_production_cost_settings;
create policy z19p_costs_team_select on public.z19p_production_cost_settings
  for select to authenticated using (owner_id=(select auth.uid()) and owner_id=(select public.z19p_current_account_owner()) and (select public.z19p_is_admin()));
drop policy if exists z19p_costs_admin_insert on public.z19p_production_cost_settings;
create policy z19p_costs_admin_insert on public.z19p_production_cost_settings
  for insert to authenticated with check (owner_id=(select auth.uid()) and owner_id=(select public.z19p_current_account_owner()) and (select public.z19p_is_admin()));
drop policy if exists z19p_costs_admin_update on public.z19p_production_cost_settings;
create policy z19p_costs_admin_update on public.z19p_production_cost_settings
  for update to authenticated using (owner_id=(select auth.uid()) and owner_id=(select public.z19p_current_account_owner()) and (select public.z19p_is_admin()))
  with check (owner_id=(select auth.uid()) and owner_id=(select public.z19p_current_account_owner()) and (select public.z19p_is_admin()));

-- The client compares the prior updated_at in the UPDATE WHERE clause. The server
-- creates the new revision; two admins cannot silently overwrite the same revision.
create or replace function public.z19p_stamp_production_cost_settings() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.owner_id<>old.owner_id then raise exception 'A conta dos custos não pode ser alterada.'; end if;
    new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
  else new.updated_at:=clock_timestamp(); end if;
  new.updated_by:=auth.uid();
  return new;
end;
$$;
revoke all on function public.z19p_stamp_production_cost_settings() from public,anon,authenticated;
drop trigger if exists z19p_stamp_production_cost_settings on public.z19p_production_cost_settings;
create trigger z19p_stamp_production_cost_settings before insert or update on public.z19p_production_cost_settings
  for each row execute function public.z19p_stamp_production_cost_settings();
comment on table public.z19p_production_cost_settings is 'Account-private DTF purchase prices, printer profiles and calibration. Never included in public settings.';
commit;
