-- Synthetic workspace/assets/placement only; no order, stock, payment or export.
begin;
set local statement_timeout='30s';
create temp table probe_actors as select id,account_owner_id,role from public.z19p_profiles where active;
create temp table probe_results(test text,passed boolean);
grant select on probe_actors to authenticated;
grant all on probe_results to authenticated;
set local role authenticated;
do $$
declare actor record; workspace uuid; art uuid; mockup uuid; placement uuid; n integer;
begin
 for actor in select * from probe_actors loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor.id,'role','authenticated')::text,true);
  insert into public.z19p_workspaces(owner_id,company_name)
    values(actor.account_owner_id,'INCIDENT ROLLBACK PROBE') returning id into workspace;
  insert into public.z19p_assets(owner_id,workspace_id,name,asset_type,created_by,updated_by)
    values(actor.account_owner_id,workspace,'INCIDENT ART','arte',actor.id,actor.id) returning id into art;
  insert into public.z19p_assets(owner_id,workspace_id,name,asset_type,created_by,updated_by)
    values(actor.account_owner_id,workspace,'INCIDENT MOCKUP','mockup',actor.id,actor.id) returning id into mockup;
  insert into public.z19p_asset_print_profiles(asset_id,owner_id,default_width_cm,default_height_cm,aspect_ratio,ready_for_print,created_by,updated_by)
    values(art,actor.account_owner_id,28.4,30,28.4/30,true,actor.id,actor.id);
  insert into public.z19p_asset_placements(owner_id,workspace_id,asset_id,mockup_asset_id,garment_model,surface,position_code,width_cm,height_cm,production_state,created_by,updated_by)
    values(actor.account_owner_id,workspace,art,mockup,'normal','front','front_center',28.4,30,'pending',actor.id,actor.id) returning id into placement;
  select count(*) into n from public.z19p_asset_placements where id=placement and production_state='pending';
  if n<>1 then raise exception 'Placement not visible to its operator'; end if;
  update public.z19p_asset_print_profiles set default_width_cm=28.5,updated_by=actor.id where asset_id=art;
  get diagnostics n=row_count; if n<>1 then raise exception 'Print profile update failed'; end if;
  update public.z19p_assets set metadata='{"production_state":"pending"}',updated_by=actor.id where id=art;
  get diagnostics n=row_count; if n<>1 then raise exception 'Artwork update failed'; end if;
  insert into probe_results values('authenticated workspace/art/mockup/profile/placement/update '||actor.role,true);
 end loop;
end $$;
reset role;
select * from probe_results;
rollback;
