begin;
do $$
declare actor uuid; result jsonb; denied boolean; project uuid; elapsed numeric;
begin
  foreach actor in array array['96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'90176ecb-fee5-4bba-b2dd-ddd04951ebaf'::uuid,'a0991d1e-8bdf-4c8e-9404-30724c2eacd4'::uuid] loop
    perform set_config('request.jwt.claim.sub',actor::text,true);
    result:=public.zero19_personalization_ops_snapshot('0e885daf-b461-4384-b2c2-8ed2cf33478b');
    if (result->>'scheduler_version')::integer<>1 then raise exception 'Missing shared production snapshot'; end if;
  end loop;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  denied:=false;
  begin
    perform public.zero19_personalization_ops_snapshot('0e885daf-b461-4384-b2c2-8ed2cf33478b');
  exception when others then denied:=true; end;
  if not denied then raise exception 'Unrelated identity gained production access'; end if;
  select id into project from public.z19p_projects where owner_id='96d8732c-9576-4af9-9fe7-cdee065c14e6' order by created_at limit 1;
  insert into public.z19p_production_pauses(owner_id,project_id,scope,started_at,ended_at,created_by) values
    ('96d8732c-9576-4af9-9fe7-cdee065c14e6',project,'order','2035-01-08 10:00-03','2035-01-08 11:00-03','96d8732c-9576-4af9-9fe7-cdee065c14e6'),
    ('96d8732c-9576-4af9-9fe7-cdee065c14e6',null,'printer','2035-01-08 10:30-03','2035-01-08 11:30-03','96d8732c-9576-4af9-9fe7-cdee065c14e6');
  elapsed:=public.z19p_paused_business_minutes('96d8732c-9576-4af9-9fe7-cdee065c14e6',project,'2035-01-08 10:00-03','2035-01-08 12:00-03',array[]::date[]);
  if elapsed<>90 then raise exception 'Overlapping pauses counted twice: %',elapsed; end if;
end $$;
set local role authenticated;
set local request.jwt.claim.sub='96d8732c-9576-4af9-9fe7-cdee065c14e6';
select public.z19p_save_production_parameters('{"art_minutes":30,"print_minutes_per_meter":50,"film_width_cm":58,"print_batch_cm":100,"cut_minutes_per_art":5,"oven_width_cm":29.7,"oven_height_cm":42,"cure_minutes_per_cycle":2,"cure_cycles":2,"press_minutes_per_side":5,"default_art_width_cm":28,"default_art_height_cm":28,"gap_cm":0.4}'::jsonb) is not null as settings_roundtrip;
rollback;
