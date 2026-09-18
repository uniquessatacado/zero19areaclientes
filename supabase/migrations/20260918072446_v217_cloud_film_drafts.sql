begin;
create table if not exists public.z19p_film_drafts (
  owner_id uuid not null references auth.users(id),
  user_id uuid not null references auth.users(id),
  data jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key(owner_id,user_id),
  constraint z19p_film_drafts_shape check (coalesce(jsonb_typeof(data)='object' and data->>'version'='1' and data->>'ownerId'=owner_id::text and jsonb_typeof(data->'items')='array' and jsonb_typeof(data->'settings')='object' and octet_length(data::text)<=8388608,false))
);
create or replace function public.z19p_touch_film_draft() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.owner_id<>old.owner_id or new.user_id<>old.user_id then raise exception 'A conta e o usuário do rascunho não podem ser alterados.'; end if;
  new.revision := old.revision + 1;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.z19p_touch_film_draft() from public,anon,authenticated;
drop trigger if exists z19p_film_draft_touch on public.z19p_film_drafts;
create trigger z19p_film_draft_touch before update on public.z19p_film_drafts for each row execute function public.z19p_touch_film_draft();
alter table public.z19p_film_drafts enable row level security;
revoke all on public.z19p_film_drafts from anon,authenticated;
grant select,insert,update on public.z19p_film_drafts to authenticated;
grant all on public.z19p_film_drafts to service_role;
drop policy if exists z19p_film_draft_read on public.z19p_film_drafts;
create policy z19p_film_draft_read on public.z19p_film_drafts for select to authenticated using (user_id=(select auth.uid()) and owner_id=(select public.z19p_current_account_owner()) and exists(select 1 from public.z19p_profiles p where p.id=(select auth.uid()) and p.active));
drop policy if exists z19p_film_draft_insert on public.z19p_film_drafts;
create policy z19p_film_draft_insert on public.z19p_film_drafts for insert to authenticated with check (user_id=(select auth.uid()) and owner_id=(select public.z19p_current_account_owner()) and revision=1 and exists(select 1 from public.z19p_profiles p where p.id=(select auth.uid()) and p.active));
drop policy if exists z19p_film_draft_update on public.z19p_film_drafts;
create policy z19p_film_draft_update on public.z19p_film_drafts for update to authenticated using (user_id=(select auth.uid()) and owner_id=(select public.z19p_current_account_owner()) and exists(select 1 from public.z19p_profiles p where p.id=(select auth.uid()) and p.active)) with check (user_id=(select auth.uid()) and owner_id=(select public.z19p_current_account_owner()) and exists(select 1 from public.z19p_profiles p where p.id=(select auth.uid()) and p.active));
comment on table public.z19p_film_drafts is 'One cloud working film per authenticated user and account. Optimistic revision prevents another device from being overwritten silently. No costs, generated pixels or credentials belong in this draft.';
commit;
