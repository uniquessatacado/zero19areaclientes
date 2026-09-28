-- Read-only application calls under the real authenticated role. No order
-- mutations, release, payments, sync jobs, exports or stock changes are called.
begin;
set local statement_timeout='45s';
create temp table probe_actors as select id,account_owner_id,role from public.z19p_profiles where active;
create temp table probe_tenants as select id,subdomain from public.tenants where subdomain in ('venduss','zero19');
create temp table probe_results(test text,passed boolean,summary jsonb);
grant select on probe_actors,probe_tenants to authenticated;
grant all on probe_results to authenticated;
set local role authenticated;
do $$
declare actor record; tenant record; payload jsonb; n integer;
begin
 for actor in select * from probe_actors loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor.id,'role','authenticated')::text,true);
  payload:=public.z19p_pending_film_items();
  if payload is null then raise exception 'Empty pending-film contract'; end if;
  insert into probe_results values('pending film '||actor.role,true,jsonb_build_object('type',jsonb_typeof(payload)));
  payload:=public.z19p_queue_readiness();
  if payload is null then raise exception 'Empty readiness contract'; end if;
  insert into probe_results values('queue readiness '||actor.role,true,jsonb_build_object('type',jsonb_typeof(payload)));
  select count(*) into n from public.z19p_list_partner_artworks();
  insert into probe_results values('Venduss art archive '||actor.role,true,jsonb_build_object('rows',n));
  select id into strict tenant from probe_tenants where subdomain='zero19';
  payload:=public.zero19_personalization_ops_snapshot(tenant.id);
  if payload is null then raise exception 'Empty ops snapshot'; end if;
  insert into probe_results values('ZERO19 production snapshot '||actor.role,true,jsonb_build_object('type',jsonb_typeof(payload)));
  if actor.role='admin' then
   select id into strict tenant from probe_tenants where subdomain='venduss';
   payload:=public.venduss_production_tracking(tenant.id,100,0);
   if payload is null then raise exception 'Empty Venduss tracking'; end if;
   insert into probe_results values('Venduss integrated tracking',true,jsonb_build_object('type',jsonb_typeof(payload)));
   payload:=public.venduss_supplier_overview(tenant.id);
   if payload is null then raise exception 'Empty supplier overview'; end if;
   insert into probe_results values('Venduss supplier overview',true,jsonb_build_object('type',jsonb_typeof(payload)));
  end if;
 end loop;
end $$;
reset role;
select * from probe_results;
rollback;
