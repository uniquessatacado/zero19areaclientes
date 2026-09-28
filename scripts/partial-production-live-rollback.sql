-- Regression using the real mixed order; every mutation is rolled back.
-- No payments, stock, order sale totals or file objects are changed.
begin;
set local statement_timeout='30s';
set local lock_timeout='3s';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"96d8732c-9576-4af9-9fe7-cdee065c14e6","role":"authenticated"}',true);
do $$
declare p uuid:='acc3261a-24e7-4986-a24e-30cbbe3cbe42';
  ready_id uuid:='efe97a98-7599-4a78-a319-96af89b04d83';
  sale_id uuid:='72c6179c-12e4-4d33-8dfb-93c0f1f4922d';
  before_others jsonb; after_others jsonb; rejected boolean; result jsonb; font_id uuid;
begin
  select jsonb_agg(jsonb_build_object('id',id,'stage',stage,'asset',asset_id) order by id) into before_others
    from public.z19p_zero19_work_items where project_id=p and id<>ready_id;
  if (select stage from public.z19p_zero19_work_items where id=ready_id)<>'ready_production' then raise exception 'Fixture changed: do not overwrite live work'; end if;
  -- Resume only inside this rolled-back transaction to exercise the production guard.
  update public.z19p_production_pauses set ended_at=now() where owner_id=auth.uid() and ended_at is null and (scope='printer' or project_id=p);
  rejected:=false;
  begin perform public.z19p_mark_selected_order_production(array[p],'{}',array['1f4e89c1-65ef-4ee4-92e6-d3a2292b2b50'::uuid]);
    exception when others then if sqlerrm not like '%pendência%' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'Pending font accepted'; end if;
  rejected:=false;
  begin perform public.z19p_mark_official_order_production(array[p],'{}');
    exception when others then if sqlerrm not like '%Identificação%' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'Legacy call advanced unidentified items'; end if;
  rejected:=false;
  begin perform public.z19p_mark_selected_order_production(array[p],'{}',array['00000000-0000-4000-8000-000000000000'::uuid]);
    exception when others then if sqlerrm not like '%Vínculo%' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'Unknown identity accepted'; end if;
  result:=public.z19p_mark_selected_order_production(array[p],'{}',array[sale_id]);
  if (result->>'personalizations')::int<>1 then raise exception 'Expected precisely one production transition: %',result; end if;
  if (select stage from public.z19p_zero19_work_items where id=ready_id)<>'production' then raise exception 'Ready item not in production'; end if;
  result:=public.z19p_mark_selected_order_production(array[p],'{}',array[sale_id]);
  if (result->>'personalizations')::int<>0 then raise exception 'Replay not idempotent'; end if;
  perform public.z19p_zero19_complete_work_item(ready_id);
  if (select stage from public.z19p_zero19_work_items where id=ready_id)<>'ready_pickup' then raise exception 'Completion did not persist'; end if;
  if (select status from public.personalization_sales where id=sale_id)<>'DONE' then raise exception 'Public source not updated'; end if;
  if (select official_order_status from public.z19p_projects where id=p)='ready_pickup' then raise exception 'Whole order incorrectly completed'; end if;
  perform public.z19p_zero19_complete_work_item(ready_id);
  select jsonb_agg(jsonb_build_object('id',id,'stage',stage,'asset',asset_id) order by id) into after_others
    from public.z19p_zero19_work_items where project_id=p and id<>ready_id;
  if before_others is distinct from after_others then raise exception 'Other personalizations changed: % / %',before_others,after_others; end if;
  select coalesce(metadata->>'font_set_id',metadata#>>'{details,0,production,font_set_id}')::uuid into font_id from public.z19p_zero19_work_items where id=ready_id;
  if font_id is null then raise exception 'Fixture font unavailable'; end if;
  perform public.z19p_zero19_set_font('bf765aab-42db-48c2-bb18-0e6cc32dec6b',font_id);
  if (select stage from public.z19p_zero19_work_items where id='bf765aab-42db-48c2-bb18-0e6cc32dec6b')<>'ready_production' then raise exception 'Font did not become ready'; end if;
  if (select stage from public.z19p_zero19_work_items where id='2b7ec903-825e-4993-aa45-979cd1728370')<>'art_received' then raise exception 'Choosing font changed artwork'; end if;
  perform public.z19p_zero19_mark_art_ready(p,'4eacbf39-9c55-4dcc-8d7c-8dc4db2b8b8e','ea1610cf-4197-41f0-9255-f359a1c8a497');
  if (select count(*) from public.z19p_zero19_work_items where project_id=p and stage='ready_production')<>2 then raise exception 'Artwork and font not independently ready'; end if;
  if (select stage from public.z19p_zero19_work_items where id=ready_id)<>'ready_pickup' then raise exception 'Preparing siblings changed completed item'; end if;
  if has_function_privilege('anon','public.z19p_mark_selected_order_production(uuid[],uuid[],uuid[])','execute')
    or has_function_privilege('anon','public.z19p_zero19_complete_work_item(uuid)','execute') then raise exception 'Anonymous privilege leak'; end if;
  perform set_config('partial_production.test_result','16 assertions passed: pending guards, legacy guard, unknown identity, selected-only export, replay, completion, public status, aggregate status, siblings preserved, independent font/art review, permissions',true);
end $$;
select current_setting('partial_production.test_result') result;
rollback;
