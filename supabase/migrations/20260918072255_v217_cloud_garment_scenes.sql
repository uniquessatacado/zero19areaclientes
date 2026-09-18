begin;
create table public.z19p_garment_scenes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  scene jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default clock_timestamp(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  constraint garment_scene_shape check(coalesce(jsonb_typeof(scene)='object' and scene->>'version'='1' and jsonb_typeof(scene->'layers')='array' and jsonb_array_length(scene->'layers')<=40 and octet_length(scene::text)<=524288,false))
);
create index z19p_garment_scenes_account_date on public.z19p_garment_scenes(owner_id,updated_at desc,id);
alter table public.z19p_garment_scenes enable row level security;
revoke all on public.z19p_garment_scenes from anon,authenticated;
grant select,insert,update on public.z19p_garment_scenes to authenticated;
grant all on public.z19p_garment_scenes to service_role;
create policy garment_scenes_read on public.z19p_garment_scenes for select to authenticated using(owner_id=(select public.z19p_current_account_owner()) and exists(select 1 from public.z19p_profiles p where p.id=(select auth.uid()) and p.active));
create policy garment_scenes_insert on public.z19p_garment_scenes for insert to authenticated with check(owner_id=(select public.z19p_current_account_owner()) and created_by=(select auth.uid()) and updated_by=(select auth.uid()) and exists(select 1 from public.z19p_profiles p where p.id=(select auth.uid()) and p.active));
create policy garment_scenes_update on public.z19p_garment_scenes for update to authenticated using(owner_id=(select public.z19p_current_account_owner()) and exists(select 1 from public.z19p_profiles p where p.id=(select auth.uid()) and p.active)) with check(owner_id=(select public.z19p_current_account_owner()) and updated_by=(select auth.uid()) and exists(select 1 from public.z19p_profiles p where p.id=(select auth.uid()) and p.active));
create function public.z19p_stamp_garment_scene() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.owner_id<>old.owner_id or new.id<>old.id or new.created_by<>old.created_by then raise exception 'A origem da montagem não pode ser alterada.'; end if;
    new.created_at:=old.created_at;
    new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
  else new.updated_at:=clock_timestamp(); end if;
  new.updated_by:=auth.uid();
  return new;
end;
$$;
revoke all on function public.z19p_stamp_garment_scene() from public,anon,authenticated;
create trigger z19p_stamp_garment_scene before insert or update on public.z19p_garment_scenes for each row execute function public.z19p_stamp_garment_scene();
comment on table public.z19p_garment_scenes is 'Private account garment montages. Costs and public presentations are stored separately.';
commit;
