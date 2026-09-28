-- Read authorization regression. Synthetic storage metadata only; no physical
-- file is uploaded/deleted. All metadata rows and claims are rolled back.
begin;
set local statement_timeout='30s';
create temp table source_actors as select id,role from public.z19p_profiles
where active and account_owner_id='96d8732c-9576-4af9-9fe7-cdee065c14e6';
create temp table source_results(test text,passed boolean);
create temp table source_probes(id uuid);
with x as (insert into storage.objects(bucket_id,name) values
 ('personalization-artwork','0e885daf-b461-4384-b2c2-8ed2cf33478b/unlinked-'||gen_random_uuid()||'.png'),
 ('personalization-artwork',gen_random_uuid()||'/foreign-qa.png') returning id)
insert into source_probes select id from x;
grant select on source_actors,source_probes to authenticated;
grant all on source_results to authenticated;
set local role authenticated;
do $$ declare a record; n integer;
begin
 for a in select * from source_actors loop
   perform set_config('request.jwt.claims',jsonb_build_object('sub',a.id,'role','authenticated')::text,true);
   select count(*) into n from storage.objects where bucket_id='personalization-artwork' and name in (
     '0e885daf-b461-4384-b2c2-8ed2cf33478b/2920afda-b0fc-4864-8f17-d53c7d49ecf9/Logo_oficial_zero19.PNG',
     '0e885daf-b461-4384-b2c2-8ed2cf33478b/9acc0ffb-dd78-4765-aa1c-b6eef4015d37/Treina_e_hora_que_melhora_.PNG');
   if n<>2 then raise exception 'Source files inaccessible to %: %',a.role,n;end if;
   insert into source_results values('both linked PDV source files readable: '||a.role,true);
   if a.role='employee' then
     select count(*) into n from storage.objects where id in(select id from source_probes);
     if n<>0 then raise exception 'Unlinked/foreign source exposed to staff';end if;
     insert into source_results values('unlinked and foreign files denied: employee',true);
   end if;
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 select count(*) into n from storage.objects where bucket_id='personalization-artwork';
 if n<>0 then raise exception 'Unknown user has private artwork access';end if;
 insert into source_results values('unknown user denied',true);
end $$;
reset role;
select * from source_results;
rollback;
