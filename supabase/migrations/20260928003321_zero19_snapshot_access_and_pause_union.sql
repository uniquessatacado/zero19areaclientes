-- Pauses may overlap (an order stopped while the printer is under maintenance).
-- Union the intervals before subtracting time so no minute is discounted twice.
create or replace function public.z19p_paused_business_minutes(
  p_owner uuid,p_project uuid,p_start timestamptz,p_end timestamptz,p_holidays date[]
) returns numeric language sql stable security invoker set search_path=public as $$
  select coalesce(sum(public.z19p_business_minutes(lower(period),upper(period),p_holidays)),0)
  from (
    select unnest(range_agg(tstzrange(greatest(p_start,x.started_at),least(p_end,coalesce(x.ended_at,p_end)),'[)'))) as period
    from public.z19p_production_pauses x
    where x.owner_id=p_owner and x.started_at<p_end and coalesce(x.ended_at,p_end)>p_start
      and (x.scope='printer' or x.project_id=p_project)
  ) intervals;
$$;
revoke all on function public.z19p_paused_business_minutes(uuid,uuid,timestamptz,timestamptz,date[]) from public,anon,authenticated;

do $migration$
declare definition text;
  previous_access text := $old$if auth.uid() is null or not exists(select 1 from public.user_tenants where user_id=auth.uid() and tenant_id=p_tenant_id) then$old$;
  previous_pauses text := $old$coalesce((select sum(public.z19p_business_minutes(greatest(p.production_started_at,x.started_at),least(p.ready_at,coalesce(x.ended_at,p.ready_at)),holidays)) from public.z19p_production_pauses x where x.owner_id=own and x.started_at<p.ready_at and coalesce(x.ended_at,p.ready_at)>p.production_started_at and (x.scope='printer' or x.project_id=p.id)),0)$old$;
begin
  select pg_get_functiondef('public.zero19_personalization_ops_snapshot_v21738(uuid)'::regprocedure) into definition;
  if position(previous_access in definition)=0 or position(previous_pauses in definition)=0 then
    raise exception 'Snapshot differs from the audited version; no change applied.';
  end if;
  definition:=replace(definition,previous_access,$new$if auth.uid() is null or not (
    exists(select 1 from public.user_tenants where user_id=auth.uid() and tenant_id=p_tenant_id)
    or exists(select 1 from public.z19p_profiles profile where profile.id=auth.uid() and profile.active and coalesce(profile.account_owner_id,profile.id)=own)
  ) then$new$);
  -- The following original fixed-ZERO19 tenant check remains in place.
  definition:=replace(definition,previous_pauses,'public.z19p_paused_business_minutes(own,p.id,p.production_started_at,p.ready_at,holidays)');
  execute definition;
end;
$migration$;
