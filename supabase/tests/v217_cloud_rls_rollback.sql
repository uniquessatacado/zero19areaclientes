-- Run only as administrative diagnostic. ALL fixture writes roll back.
begin;
select set_config('qa.owner',(select id::text from public.z19p_profiles where id=account_owner_id and active and role='admin' order by created_at limit 1),true);
select set_config('qa.employee',(select id::text from public.z19p_profiles where account_owner_id=current_setting('qa.owner')::uuid and active and role='employee' order by created_at limit 1),true);
select set_config('request.jwt.claim.sub',current_setting('qa.owner'),true);
set local role authenticated;
do $$
declare v_owner uuid:=auth.uid();v_scene uuid;v_export uuid:=gen_random_uuid();v_stamp timestamptz;v_newstamp timestamptz;
begin
  if v_owner is null then raise exception 'Owner fixture is required'; end if;
  insert into public.z19p_production_cost_settings(owner_id,data) values(v_owner,'{"version":1,"activeProfileId":null,"purchases":[],"profiles":[]}') on conflict(owner_id) do nothing;
  select updated_at into v_stamp from public.z19p_production_cost_settings where owner_id=v_owner;
  if not found then raise exception 'Owner cannot read costs'; end if;
  update public.z19p_production_cost_settings set data=data where owner_id=v_owner and updated_at=v_stamp returning updated_at into v_newstamp;
  if v_newstamp<=v_stamp then raise exception 'Optimistic timestamp did not advance'; end if;
  update public.z19p_production_cost_settings set data=data where owner_id=v_owner and updated_at=v_stamp;
  if found then raise exception 'Stale cost write succeeded'; end if;
  insert into public.z19p_production_ledger(owner_id,export_id,production_date,data) values(v_owner,v_export,current_date,'{"version":1,"cost":0}');
  perform 1 from public.z19p_production_ledger where export_id=v_export;
  if not found then raise exception 'Owner cannot read ledger'; end if;
  begin
    insert into public.z19p_production_ledger(owner_id,export_id,production_date,data) values(v_owner,v_export,current_date,'{"version":1,"cost":0}');
    raise exception 'Duplicate export accepted';
  exception when unique_violation then null; end;
  insert into public.z19p_garment_scenes(owner_id,scene) values(v_owner,'{"version":1,"title":"Rollback fixture","layers":[]}') returning id into v_scene;
  perform set_config('qa.scene',v_scene::text,true);
  insert into public.z19p_film_drafts(owner_id,user_id,data) values(v_owner,v_owner,jsonb_build_object('version',1,'ownerId',v_owner,'items','[]'::jsonb,'settings','{}'::jsonb)) on conflict(owner_id,user_id) do nothing;
end $$;
select set_config('request.jwt.claim.sub',current_setting('qa.employee'),true);
do $$
declare n integer;v_owner uuid:=current_setting('qa.owner')::uuid;
begin
  if auth.uid() is null or auth.uid()=v_owner then raise exception 'Employee fixture required'; end if;
  select count(*) into n from public.z19p_production_cost_settings;
  if n<>0 then raise exception 'Employee read private costs'; end if;
  select count(*) into n from public.z19p_production_ledger;
  if n<>0 then raise exception 'Employee read private ledger'; end if;
  begin
    insert into public.z19p_production_cost_settings(owner_id,data) values(v_owner,'{"version":1,"purchases":[],"profiles":[]}');
    raise exception 'Employee inserted private costs';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.z19p_production_ledger(owner_id,export_id,production_date,data) values(v_owner,gen_random_uuid(),current_date,'{"version":1,"cost":0}');
    raise exception 'Employee inserted private ledger';
  exception when insufficient_privilege then null; end;
  update public.z19p_production_cost_settings set data=data where owner_id=v_owner;
  if found then raise exception 'Employee updated costs'; end if;
  select count(*) into n from public.z19p_garment_scenes where id=current_setting('qa.scene')::uuid;
  if n<>1 then raise exception 'Active team cannot read own account montage'; end if;
  select count(*) into n from public.z19p_film_drafts where user_id=v_owner;
  if n<>0 then raise exception 'Employee read another user working draft'; end if;
  begin
    insert into public.z19p_film_drafts(owner_id,user_id,data) values(v_owner,v_owner,jsonb_build_object('version',1,'ownerId',v_owner,'items','[]'::jsonb,'settings','{}'::jsonb));
    raise exception 'Employee overwrote another user draft';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin perform 1 from public.z19p_production_cost_settings;raise exception 'Anonymous read costs';exception when insufficient_privilege then null;end;
  begin perform 1 from public.z19p_production_ledger;raise exception 'Anonymous read ledger';exception when insufficient_privilege then null;end;
  begin perform 1 from public.z19p_garment_scenes;raise exception 'Anonymous read private montage';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'PASS: owner costs/ledger, employee isolation, team montage, private working film, optimistic concurrency, duplicate export, anonymous denial. Fixture writes rolled back.' as result;
