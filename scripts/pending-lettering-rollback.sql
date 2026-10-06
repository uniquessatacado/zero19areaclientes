-- Run after the candidate migration inside this transaction. Synthetic only.
begin;
set local statement_timeout='45s';
set local lock_timeout='3s';
select set_config('request.jwt.claims','{"sub":"96d8732c-9576-4af9-9fe7-cdee065c14e6","role":"authenticated"}',true);
do $$
#variable_conflict use_variable
declare
 own uuid:='96d8732c-9576-4af9-9fe7-cdee065c14e6'; tenant uuid:='0e885daf-b461-4384-b2c2-8ed2cf33478b';
 order_id uuid:=gen_random_uuid(); workspace_id uuid:=gen_random_uuid(); project_id uuid:=gen_random_uuid();
 team_id uuid:=gen_random_uuid(); kit_id uuid:=gen_random_uuid(); font_id uuid:=gen_random_uuid();
 sale_ids uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()]; work_ids uuid[];
 recipe jsonb; expected jsonb; export_expected jsonb; result jsonb; rejection boolean; before_siblings jsonb; before_font jsonb; before_sale jsonb; before_real jsonb;
begin
 select coalesce(jsonb_agg(to_jsonb(w)-'updated_at' order by w.id),'[]') into before_real from public.z19p_zero19_work_items w;
 insert into public.z19p_teams(id,owner_id,name,created_by,updated_by) values(team_id,own,'QA SYNTHETIC lettering',own,own);
 insert into public.z19p_team_kits(id,owner_id,team_id,season,name,created_by,updated_by) values(kit_id,own,team_id,'QA','QA SYNTHETIC',own,own);
 insert into public.z19p_customization_sets(id,owner_id,kit_id,name,status,tested_at,created_by,updated_by)
  values(font_id,own,kit_id,'QA SYNTHETIC official font','ready',now(),own,own);
 insert into public.orders(id,tenant_id,status,payment_status,origin,total_amount) values(order_id,tenant,'RECEBIDO','PARCIAL','PDV',100);
 insert into public.z19p_workspaces(id,owner_id,company_name,workspace_type,created_by) values(workspace_id,own,'QA SYNTHETIC pending lettering','client',own);
 insert into public.z19p_projects(id,owner_id,workspace_id,sequence_no,title,official_order_source,official_order_ref,official_order_payload,created_by)
  values(project_id,own,workspace_id,1,'QA SYNTHETIC pending lettering','zero19_pdv',order_id::text,'{}',own);
 recipe:=jsonb_build_object('kind','PHRASE','font_set_id',font_id,'top_text','ORIGINAL','number','','letter_height_cm',5.5,'name_max_width_cm',34,'width_cm',29.6,'height_cm',28,'position_label','Costas · em cima','untouched','preserve recipe');
 insert into public.personalization_sales(id,tenant_id,order_id,text_value,personalization_code,status,sale_amount,cost_amount,details)
 values(sale_ids[1],tenant,order_id,'ORIGINAL','QA-'||sale_ids[1]::text,'PENDING',25,7,jsonb_build_array(jsonb_build_object('quantity',2,'production',recipe))),
       (sale_ids[2],tenant,order_id,'SIBLING NAME','QA-'||sale_ids[2]::text,'PENDING',25,7,jsonb_build_array(jsonb_build_object('production',recipe||jsonb_build_object('top_text','SIBLING NAME')))),
       (sale_ids[3],tenant,order_id,'SIBLING PNG','QA-'||sale_ids[3]::text,'PENDING',25,7,'[{"production":{"kind":"NEW_ART","file_path":"qa-original.png","width_cm":29.6,"height_cm":28}}]'),
       (sale_ids[4],tenant,order_id,'SIBLING HALFTONE','QA-'||sale_ids[4]::text,'PENDING',25,7,'[{"production":{"kind":"NEW_ART","file_path":"qa-halftone.png","needs_halftone":true,"width_cm":30,"height_cm":28}}]');
 select array_agg(w.id order by array_position(sale_ids,w.personalization_sale_id)) into work_ids from public.z19p_zero19_work_items w where w.order_id=order_id;
 if cardinality(work_ids)<>4 then raise exception 'Synthetic sync fixture missing'; end if;
 update public.z19p_zero19_work_items set stage='ready_production',metadata=metadata||jsonb_build_object('font_set_id',font_id) where id=any(work_ids[1:2]);
 update public.z19p_zero19_work_items set stage='awaiting_font',requires_font=true where id=work_ids[2];
 update public.z19p_zero19_work_items set stage='art_received',requires_art=true where id=work_ids[3];
 update public.z19p_zero19_work_items set stage='awaiting_halftone',requires_art=true where id=work_ids[4];
 select jsonb_build_object('text_value',w.text_value,'production',w.metadata->'details'->0->'production','font_set_id',w.metadata->>'font_set_id','lettering_revision',w.metadata->>'lettering_revision') into expected from public.z19p_zero19_work_items w where id=work_ids[1];
 select to_jsonb(f) into before_font from public.z19p_customization_sets f where id=font_id;
 select to_jsonb(s)-'text_value'-'details'-'updated_at' into before_sale from public.personalization_sales s where id=sale_ids[1];
 select jsonb_agg(to_jsonb(w)-'updated_at' order by id) into before_siblings from public.z19p_zero19_work_items w where w.project_id=project_id and id<>work_ids[1] and w.order_id=order_id;

 perform set_config('request.jwt.claims','{"role":"anon"}',true);rejection:=false;
 begin perform public.z19p_zero19_edit_pending_lettering(work_ids[1],'NOT AUTHORIZED','',expected);exception when others then if sqlerrm not like '%não autorizado%' then raise;end if;rejection:=true;end;
 if not rejection then raise exception 'Anonymous lettering edit accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);rejection:=false;
 begin perform public.z19p_zero19_edit_pending_lettering(work_ids[1],'OTHER ACCOUNT','',expected);exception when others then if sqlerrm not like '%não autorizado%' then raise;end if;rejection:=true;end;
 if not rejection then raise exception 'Other-account lettering edit accepted';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',own,'role','authenticated')::text,true);
 if has_function_privilege('anon','public.z19p_zero19_edit_pending_lettering(uuid,text,text,jsonb)','execute') then raise exception 'Anonymous EXECUTE leak';end if;
 if not has_function_privilege('authenticated','public.z19p_zero19_edit_pending_lettering(uuid,text,text,jsonb)','execute') then raise exception 'Team EXECUTE missing';end if;
 rejection:=false;begin perform public.z19p_zero19_edit_pending_lettering(work_ids[1],'','#',expected);exception when others then if sqlerrm not like '%algarismos%' then raise;end if;rejection:=true;end;
 if not rejection then raise exception 'Invalid number accepted';end if;
 rejection:=false;begin perform public.z19p_zero19_edit_pending_lettering(work_ids[1],'','',expected);exception when others then if sqlerrm not like '%Mantenha%' then raise;end if;rejection:=true;end;
 if not rejection then raise exception 'Empty application accepted';end if;
 rejection:=false;begin perform public.z19p_zero19_edit_pending_lettering(work_ids[1],repeat('A',1001),'',expected);exception when others then if sqlerrm not like '%1000%' then raise;end if;rejection:=true;end;
 if not rejection then raise exception 'Oversized application accepted';end if;
 rejection:=false;begin perform public.z19p_zero19_edit_pending_lettering(work_ids[1],'CAS CONFLICT','',expected||'{"lettering_revision":"stale"}');exception when others then if sqlerrm not like '%outra pessoa%' then raise;end if;rejection:=true;end;
 if not rejection then raise exception 'Stale source accepted';end if;
 -- Each deliberate malformed fixture lives in a subtransaction and rolls back.
 begin
  update public.personalization_sales set details='[{}]' where id=sale_ids[1];
  update public.z19p_zero19_work_items set kind='PHRASE',stage='ready_production' where id=work_ids[1];
  perform public.z19p_zero19_edit_pending_lettering(work_ids[1],'BAD RECIPE','',expected);
  raise exception 'Missing recipe accepted';
 exception when others then if sqlerrm not like '%Receita de produção não encontrada%' then raise;end if;end;
 begin
  update public.z19p_zero19_work_items set metadata=jsonb_set(metadata,'{details,0,production,top_text}','"OUT OF SYNC"') where id=work_ids[1];
  perform public.z19p_zero19_edit_pending_lettering(work_ids[1],'BAD SOURCE','',expected);
  raise exception 'Source/work mismatch accepted';
 exception when others then if sqlerrm not like '%mudou no PDV%' then raise;end if;end;
 begin
  insert into public.venduss_order_integration(source_order_id,source_tenant_id,supplier_tenant_id,supplier_order_id,sync_pending) values(gen_random_uuid(),tenant,tenant,order_id,false);
  perform public.z19p_zero19_edit_pending_lettering(work_ids[1],'NOT RELEASED','',expected);
  raise exception 'Unreleased Venduss accepted';
 exception when others then if sqlerrm not like '%Venduss%' or sqlerrm like '%accepted%' then raise;end if;end;
 begin
  update public.personalization_sales set status='IN_PROGRESS' where id=sale_ids[1];
  update public.z19p_zero19_work_items set stage='ready_production' where id=work_ids[1];
  perform public.z19p_zero19_edit_pending_lettering(work_ids[1],'IN_PROGRESS','',expected);
  raise exception 'IN_PROGRESS source accepted';
 exception when others then if sqlerrm not like '%já iniciou a produção%' then raise;end if;end;

 result:=public.z19p_zero19_edit_pending_lettering(work_ids[1],E'  joão\n#ação, é? sim! - “confirma”.  ','22',expected);
 if result->>'text_value'<>'JOÃO #AÇÃO, É? SIM! - “CONFIRMA”. · 22' then raise exception 'Punctuation/accent normalized incorrectly: %',result->>'text_value';end if;
 if nullif(result->'metadata'->>'lettering_revision','') is null then raise exception 'Revision missing';end if;
 if ((result->'metadata'->'details'->0->'production')-'top_text'-'number') is distinct from (recipe-'top_text'-'number') then raise exception 'Physical recipe changed';end if;
 if (select text_value from public.personalization_sales where id=sale_ids[1]) is distinct from result->>'text_value' then raise exception 'Source sale not updated';end if;
 if (select metadata->>'font_set_id' from public.z19p_zero19_work_items where id=work_ids[1])<>font_id::text then raise exception 'Official font changed';end if;
 if (select stage from public.z19p_zero19_work_items where id=work_ids[1])<>'ready_production' then raise exception 'Edit started production';end if;
 if (select to_jsonb(s)-'text_value'-'details'-'updated_at' from public.personalization_sales s where id=sale_ids[1]) is distinct from before_sale then raise exception 'Price/cost/order identity changed';end if;
 if (select jsonb_agg(to_jsonb(w)-'updated_at' order by id) from public.z19p_zero19_work_items w where w.order_id=order_id and id<>work_ids[1]) is distinct from before_siblings then raise exception 'Sibling application changed';end if;
 if (select stage from public.z19p_zero19_work_items where id=work_ids[2])<>'awaiting_font' or (select stage from public.z19p_zero19_work_items where id=work_ids[3])<>'art_received' or (select stage from public.z19p_zero19_work_items where id=work_ids[4])<>'awaiting_halftone' then raise exception 'Pending sibling source was auto-approved';end if;
 if (select official_order_status from public.z19p_projects where id=project_id)<>'art_received' then raise exception 'Restored workflow aggregate not refreshed';end if;
 if (select to_jsonb(f) from public.z19p_customization_sets f where id=font_id) is distinct from before_font then raise exception 'Font asset changed';end if;
 if (select count(*) from public.z19p_audit_log where entity_id=work_ids[1]::text and action='zero19_pending_lettering_edited' and actor_user_id=own)<>1 then raise exception 'Audit missing';end if;
 result:=public.z19p_zero19_edit_pending_lettering(work_ids[1],'JOÃO #AÇÃO, É? SIM! - “CONFIRMA”.','22',expected);
 if result->>'already_saved'<>'true' or (select count(*) from public.z19p_audit_log where entity_id=work_ids[1]::text and action='zero19_pending_lettering_edited')<>1 then raise exception 'Lost response duplicated history';end if;
 rejection:=false;begin perform public.z19p_zero19_edit_pending_lettering(work_ids[1],'CHANGED AGAIN','22',expected);exception when others then if sqlerrm not like '%outra pessoa%' then raise;end if;rejection:=true;end;
 if not rejection then raise exception 'Concurrent editor overwrote source';end if;

 -- Export CAS runs atomically with the historical production transition.
 select jsonb_build_array(jsonb_build_object('work_item_id',w.id,'personalization_sale_id',w.personalization_sale_id,'lettering_revision',w.metadata->>'lettering_revision','font_set_id',w.metadata->>'font_set_id','quantity',w.quantity,'production',w.metadata->'details'->0->'production')) into export_expected from public.z19p_zero19_work_items w where id=work_ids[1];
 if has_function_privilege('anon','public.z19p_mark_selected_order_production_lettering(uuid[],uuid[],uuid[],jsonb)','execute') then raise exception 'Anonymous export CAS EXECUTE leak';end if;
 rejection:=false;begin perform public.z19p_mark_selected_order_production_lettering(array[project_id],'{}',array[sale_ids[1]],'[]');exception when others then if sqlerrm not like '%todas as escritas%' then raise;end if;rejection:=true;end;
 if not rejection then raise exception 'Empty font coverage bypass accepted';end if;
 rejection:=false;begin perform public.z19p_mark_selected_order_production_lettering(array[project_id],'{}',array[sale_ids[1]],export_expected||export_expected);exception when others then if sqlerrm not like '%todas as escritas%' then raise;end if;rejection:=true;end;
 if not rejection then raise exception 'Duplicate font coverage accepted';end if;
 rejection:=false;begin perform public.z19p_mark_selected_order_production_lettering(array[project_id],'{}',array[sale_ids[1]],jsonb_set(export_expected,'{0,lettering_revision}','null'));exception when others then if sqlerrm not like '%mudou após%' then raise;end if;rejection:=true;end;
 if not rejection then raise exception 'Outdated TIFF revision accepted';end if;
 rejection:=false;begin perform public.z19p_mark_selected_order_production_lettering(array[project_id],'{}',array[sale_ids[1]],jsonb_set(export_expected,'{0,quantity}','1'));exception when others then if sqlerrm not like '%mudou após%' then raise;end if;rejection:=true;end;
 if not rejection then raise exception 'Outdated TIFF quantity accepted';end if;
 rejection:=false;begin perform public.z19p_mark_selected_order_production_lettering(array[project_id],'{}',array[sale_ids[1]],jsonb_set(export_expected,'{0,production,top_text}','"OTHER SOURCE"'));exception when others then if sqlerrm not like '%mudou após%' then raise;end if;rejection:=true;end;
 if not rejection then raise exception 'PDV source race accepted';end if;
 update public.z19p_customization_sets set status='draft' where id=font_id;rejection:=false;
 begin perform public.z19p_mark_selected_order_production_lettering(array[project_id],'{}',array[sale_ids[1]],export_expected);exception when others then if sqlerrm not like '%fonte não está%' then raise;end if;rejection:=true;end;
 if not rejection then raise exception 'Archived/unready font export accepted';end if;
 update public.z19p_customization_sets set status='ready' where id=font_id;
 result:=public.z19p_mark_selected_order_production_lettering(array[project_id],'{}',array[sale_ids[1]],export_expected);
 if result->>'personalizations'<>'1' or (select stage from public.z19p_zero19_work_items where id=work_ids[1])<>'production' or (select status from public.personalization_sales where id=sale_ids[1])<>'IN_PROGRESS' then raise exception 'Atomic export failed';end if;
 if (select stage from public.z19p_zero19_work_items where id=work_ids[2])<>'awaiting_font' then raise exception 'Export advanced unselected font';end if;
 if (select jsonb_agg(to_jsonb(w)-'updated_at' order by id) from public.z19p_zero19_work_items w where w.order_id=order_id and id<>work_ids[1]) is distinct from before_siblings then raise exception 'Export promoted/changed unselected PNG or halftone';end if;

 update public.z19p_zero19_work_items set stage='production' where id=work_ids[1];rejection:=false;
 begin perform public.z19p_zero19_edit_pending_lettering(work_ids[1],'PRODUCTION','22',expected);exception when others then if sqlerrm not like '%antes de iniciar%' then raise;end if;rejection:=true;end;
 if not rejection then raise exception 'Production application edited';end if;
 update public.z19p_zero19_work_items set stage='ready_production' where id=work_ids[1];
 update public.orders set status='CANCELADO' where id=order_id;rejection:=false;
 begin perform public.z19p_zero19_edit_pending_lettering(work_ids[1],'CANCELLED','22',expected);exception when others then if sqlerrm not like '%cancelado%' then raise;end if;rejection:=true;end;
 if not rejection then raise exception 'Cancelled order edited';end if;
 if (select coalesce(jsonb_agg(to_jsonb(w)-'updated_at' order by id),'[]') from public.z19p_zero19_work_items w where w.order_id is distinct from order_id) is distinct from before_real then raise exception 'Real application changed';end if;
 perform set_config('pending_lettering.test_result','PASS synthetic rollback: auth/ACL, punctuation/accents, source+work atomic, recipe/font/prices/siblings preserved, CAS conflict/retry, atomic export coverage/revision/quantity/recipe/font, production/cancel guards. No real order edited.',true);
end $$;
select current_setting('pending_lettering.test_result') as result;
rollback;
