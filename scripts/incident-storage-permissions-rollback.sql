-- Execute against the linked project. All synthetic records are rolled back.
begin;
set local statement_timeout='30s';
create temp table probe_actors as select id,account_owner_id,role from public.z19p_profiles where active;
create temp table probe_results(test text,passed boolean);
grant select on probe_actors to authenticated;
grant all on probe_results to authenticated;
set local role authenticated;
do $$
declare actor record; object_id uuid; path text; n integer;
begin
 for actor in select * from probe_actors loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor.id,'role','authenticated')::text,true);
  foreach path in array array[actor.account_owner_id::text||'/incident-probe/auto-mockups/',actor.account_owner_id::text||'/incident-probe/venduss-order/',actor.id::text||'/incident-probe/root/'] loop
   insert into storage.objects(bucket_id,name,metadata) values('z19p-assets',path||gen_random_uuid()||'.png','{"mimetype":"image/png"}') returning id into object_id;
   select count(*) into n from storage.objects where id=object_id;
   if n<>1 then raise exception 'Actor cannot read the uploaded object'; end if;
   update storage.objects set metadata='{"mimetype":"image/png","probe":true}' where id=object_id;
   get diagnostics n=row_count;
   if n<>1 then raise exception 'Actor cannot update own account object'; end if;
   insert into probe_results values('upload/read/update '||actor.role||' '||path,true);
  end loop;
  begin
   insert into storage.objects(bucket_id,name) values('z19p-assets',gen_random_uuid()||'/foreign/probe.png');
   raise exception 'SECURITY: foreign account upload accepted';
  exception when insufficient_privilege then insert into probe_results values('foreign folder rejected '||actor.role,true); end;
  begin
   update storage.objects set name=gen_random_uuid()||'/foreign/probe.png' where id=object_id;
   raise exception 'SECURITY: foreign account rename accepted';
  exception when insufficient_privilege then insert into probe_results values('foreign rename rejected '||actor.role,true); end;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 begin
  insert into storage.objects(bucket_id,name) select 'z19p-assets',account_owner_id||'/incident-probe/unknown.png' from probe_actors limit 1;
  raise exception 'SECURITY: unknown user accepted';
 exception when insufficient_privilege then insert into probe_results values('unknown user rejected',true); end;
end $$;
reset role;
select * from probe_results;
rollback;
