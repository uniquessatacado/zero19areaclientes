-- Targeted regression: artwork identity only; no sales, payment, stock,
-- exports or print jobs. All test updates are rolled back.
begin;
set local statement_timeout='30s';
set local lock_timeout='3s';
create temp table art_probe_actors as
  select id,role from public.z19p_profiles
  where active and account_owner_id='96d8732c-9576-4af9-9fe7-cdee065c14e6';
create temp table art_probe_results(test text,passed boolean);
grant select on art_probe_actors to authenticated;
grant all on art_probe_results to authenticated;
insert into art_probe_results values
 ('anonymous cannot mark artwork ready',not has_function_privilege('anon','public.z19p_zero19_mark_art_ready(uuid,uuid,uuid)','execute')),
 ('authenticated can call guarded RPC',has_function_privilege('authenticated','public.z19p_zero19_mark_art_ready(uuid,uuid,uuid)','execute'));
set local role authenticated;
do $$
declare actor record; blocked boolean; n integer;
begin
  for actor in select * from art_probe_actors loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor.id,'role','authenticated')::text,true);
    blocked:=false;
    begin
      perform public.z19p_zero19_mark_art_ready('658b6551-b79d-4e23-93e8-7f6ce0db78be','41a088dd-9323-4999-9416-6b91f2aa8093','15a361b9-bd38-4954-a745-f07b7154d5b4');
    exception when others then
      if sqlerrm not like '%outra posicao%' then raise; end if;blocked:=true;
    end;
    if not blocked then raise exception 'Wrong artwork identity accepted'; end if;
    insert into art_probe_results values('wrong sale blocked: '||actor.role,true);

    perform public.z19p_zero19_mark_art_ready('658b6551-b79d-4e23-93e8-7f6ce0db78be','da93ac42-aa33-4026-8545-41e21c3ccc0b','15a361b9-bd38-4954-a745-f07b7154d5b4');
    select count(*) into n from public.z19p_zero19_work_items
      where id='aa3e56d6-74f1-4eba-a560-fb0aea257cb1' and stage='ready_production'
        and asset_id='15a361b9-bd38-4954-a745-f07b7154d5b4';
    if n<>1 then raise exception 'Correct artwork not linked'; end if;
    insert into art_probe_results values('correct sale accepted: '||actor.role,true);

    update public.z19p_asset_placements
      set external_order_item_ref='da93ac42-aa33-4026-8545-41e21c3ccc0b',updated_by=actor.id
      where id='a1d537e9-07a7-4a55-8da4-b9839a83f92f' and production_state='pending';
    get diagnostics n=row_count;if n<>1 then raise exception 'Correct placement not writable'; end if;
    blocked:=false;
    begin
      update public.z19p_asset_placements set external_order_item_ref='41a088dd-9323-4999-9416-6b91f2aa8093',updated_by=actor.id
        where id='a1d537e9-07a7-4a55-8da4-b9839a83f92f';
    exception when others then
      if sqlerrm not like '%outra arte%' then raise; end if;blocked:=true;
    end;
    if not blocked then raise exception 'Wrong placement accepted'; end if;
    insert into art_probe_results values('placement identity protected: '||actor.role,true);
  end loop;
end $$;
reset role;
select * from art_probe_results;
rollback;
