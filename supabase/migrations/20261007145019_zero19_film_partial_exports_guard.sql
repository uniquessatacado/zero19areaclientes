-- Queue reindexing is derived, not a change to another application.
-- Keep strict comparison of its source, art, text, quantities and production state.
create or replace function public.z19p_mark_selected_order_production_lettering(
 p_project_ids uuid[],p_placement_ids uuid[],p_sale_ids uuid[],p_expected_lettering jsonb
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
 own uuid:=public.z19p_current_account_owner();
 tenant constant uuid:='0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid;
 lock_key text; order_ids uuid[]; selected_ids uuid[]; expected_count integer; font_count integer;
 siblings_before jsonb; siblings_after jsonb; result jsonb; target_project_id uuid;
begin
 if auth.uid() is null or own is distinct from '96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid then raise exception 'Acesso não autorizado.';end if;
 if jsonb_typeof(p_expected_lettering) is distinct from 'array' then raise exception 'Revisões de escrita inválidas. Atualize o filme.';end if;
 if exists(select 1 from unnest(coalesce(p_project_ids,'{}')) req(id) where not exists(select 1 from public.z19p_projects where id=req.id and owner_id=own)) then raise exception 'Vínculo de produção inválido. Atualize o filme.';end if;
 select coalesce(array_agg(distinct o.id),'{}') into order_ids from public.orders o
  join public.z19p_projects p on p.official_order_ref=o.id::text and p.official_order_source='zero19_pdv'
  where p.owner_id=own and p.id=any(coalesce(p_project_ids,'{}')) and o.tenant_id=tenant;
 -- All customer keys first, then all order keys, matching the edit/sync order.
 for lock_key in select distinct 'zero19_pdv_workspace:'||tenant::text||':'||coalesce(o.customer_id::text,o.id::text)
  from public.orders o where o.id=any(order_ids) order by 1 loop perform pg_advisory_xact_lock(hashtext(lock_key));end loop;
 for lock_key in select 'zero19_pdv_order:'||tenant::text||':'||o.id::text from public.orders o
  where o.id=any(order_ids) order by 1 loop perform pg_advisory_xact_lock(hashtext(lock_key));end loop;
 perform 1 from public.orders where id=any(order_ids) and tenant_id=tenant order by id for update nowait;
 perform 1 from public.z19p_projects where id=any(coalesce(p_project_ids,'{}')) and owner_id=own order by id for update nowait;
 perform 1 from public.z19p_workspaces where owner_id=own and id in (select workspace_id from public.z19p_projects where id=any(coalesce(p_project_ids,'{}')) and owner_id=own) order by id for update nowait;
 perform 1 from public.z19p_zero19_work_items where owner_id=own and
  (order_id=any(order_ids) or project_id=any(coalesce(p_project_ids,'{}'))) order by id for update nowait;
 perform 1 from public.personalization_sales where tenant_id=tenant and order_id=any(order_ids) order by id for update nowait;

 select coalesce(array_agg(w.id),'{}') into selected_ids from public.z19p_zero19_work_items w
  where w.owner_id=own and w.project_id=any(coalesce(p_project_ids,'{}')) and (
   w.personalization_sale_id=any(coalesce(p_sale_ids,'{}')) or exists(select 1 from public.z19p_asset_placements a
    where a.owner_id=own and a.id=any(coalesce(p_placement_ids,'{}')) and a.project_id=w.project_id and a.external_order_item_ref=w.personalization_sale_id::text));
 expected_count:=jsonb_array_length(p_expected_lettering);
 select count(*) into font_count from public.z19p_zero19_work_items where id=any(selected_ids) and kind in ('NAME_NUMBER','PHRASE');
 if expected_count<>font_count or exists(select 1 from jsonb_to_recordset(p_expected_lettering) as e(work_item_id uuid) group by e.work_item_id having count(*)<>1) then
  raise exception 'Inclua todas as escritas selecionadas e suas revisões. Remova e adicione novamente os itens antigos do filme.';
 end if;
 if exists(select 1 from jsonb_to_recordset(p_expected_lettering) as e(work_item_id uuid,personalization_sale_id uuid,lettering_revision text,font_set_id uuid,quantity numeric,production jsonb)
  left join public.z19p_zero19_work_items w on w.id=e.work_item_id and w.id=any(selected_ids) and w.owner_id=own and w.tenant_id=tenant and w.kind in ('NAME_NUMBER','PHRASE')
  where w.id is null or w.personalization_sale_id is distinct from e.personalization_sale_id
   or w.metadata->>'lettering_revision' is distinct from e.lettering_revision
   or coalesce(nullif(w.metadata->>'font_set_id',''),w.metadata->'details'->0->'production'->>'font_set_id') is distinct from e.font_set_id::text
   or w.quantity is distinct from e.quantity
   or jsonb_typeof(e.production) is distinct from 'object'
   or w.metadata->'details'->0->'production' is distinct from e.production) then
  raise exception 'Uma escrita, fonte, quantidade ou medida mudou após montar o filme. Remova e adicione novamente essa aplicação antes de exportar.';
 end if;
 perform 1 from public.z19p_customization_sets s where s.owner_id=own and s.id in
  (select e.font_set_id from jsonb_to_recordset(p_expected_lettering) as e(font_set_id uuid)) order by s.id for share nowait;
 if exists(select 1 from jsonb_to_recordset(p_expected_lettering) as e(font_set_id uuid)
  where not exists(select 1 from public.z19p_customization_sets s where s.owner_id=own and s.id=e.font_set_id and s.status='ready' and s.tested_at is not null)) then
  raise exception 'Uma fonte não está mais liberada e testada. Confira a aplicação antes de exportar.';
 end if;
 select coalesce(jsonb_agg((to_jsonb(w)-'updated_at')||jsonb_build_object('metadata',w.metadata-'queue_position') order by w.id),'[]'::jsonb) into siblings_before
  from public.z19p_zero19_work_items w where w.owner_id=own and w.project_id=any(coalesce(p_project_ids,'{}')) and not (w.id=any(selected_ids));
 result:=public.z19p_mark_selected_order_production(p_project_ids,p_placement_ids,p_sale_ids);
 -- The source trigger also visits applications not selected in this TIFF.
 -- Never promote those to ready/production as a side effect of this export.
 if exists(select 1 from jsonb_to_recordset(siblings_before) as original(id uuid,stage text,personalization_sale_id uuid)
   join public.personalization_sales sale on sale.id=original.personalization_sale_id and sale.tenant_id=tenant
   where (sale.status='CANCELLED' and original.stage<>'cancelled')
    or (sale.status='IN_PROGRESS' and original.stage not in ('production','ready_pickup','delivered'))
    or (sale.status='DONE' and original.stage not in ('ready_pickup','delivered'))
    or (sale.status='DELIVERED' and original.stage<>'delivered')) then
  raise exception 'Outra aplicação do pedido mudou de etapa. Atualize o filme antes de exportar.';
 end if;
 update public.z19p_zero19_work_items sibling set
  stage=original.stage,requires_art=original.requires_art,requires_font=original.requires_font,
  art_ready_at=original.art_ready_at,production_started_at=original.production_started_at,
  ready_at=original.ready_at,delivered_at=original.delivered_at,
  art_received_at=original.art_received_at,customer_notified_at=original.customer_notified_at,
  production_step=original.production_step
 from jsonb_to_recordset(siblings_before) as original(id uuid,stage text,requires_art boolean,requires_font boolean,
  art_ready_at timestamptz,production_started_at timestamptz,ready_at timestamptz,delivered_at timestamptz,
  art_received_at timestamptz,customer_notified_at timestamptz,production_step text)
 where sibling.id=original.id and sibling.owner_id=own and sibling.project_id=any(coalesce(p_project_ids,'{}'))
  and (sibling.stage,sibling.requires_art,sibling.requires_font,sibling.art_ready_at,sibling.production_started_at,
   sibling.ready_at,sibling.delivered_at,sibling.art_received_at,sibling.customer_notified_at,sibling.production_step)
  is distinct from (original.stage,original.requires_art,original.requires_font,original.art_ready_at,original.production_started_at,
   original.ready_at,original.delivered_at,original.art_received_at,original.customer_notified_at,original.production_step);
 select coalesce(jsonb_agg((to_jsonb(w)-'updated_at')||jsonb_build_object('metadata',w.metadata-'queue_position') order by w.id),'[]'::jsonb) into siblings_after
  from public.z19p_zero19_work_items w where w.owner_id=own and w.project_id=any(coalesce(p_project_ids,'{}')) and not (w.id=any(selected_ids));
 if siblings_before is distinct from siblings_after then raise exception 'Não foi possível preservar as aplicações não selecionadas. Nenhuma etapa foi alterada; atualize o filme.';end if;
 for target_project_id in select p.id from public.z19p_projects p where p.owner_id=own and p.id=any(coalesce(p_project_ids,'{}')) and p.official_order_source='zero19_pdv' loop
  perform public.z19p_zero19_refresh_project(target_project_id);
  update public.z19p_projects project set official_order_payload=jsonb_set(project.official_order_payload,'{items}',(
   select coalesce(jsonb_agg(item.value||jsonb_build_object('stage',coalesce(current_work.stage,item.value->>'stage')) order by item.ordinality),'[]'::jsonb)
   from jsonb_array_elements(project.official_order_payload->'items') with ordinality item(value,ordinality)
   left join public.z19p_zero19_work_items current_work on current_work.project_id=project.id and current_work.owner_id=own
    and current_work.personalization_sale_id::text=item.value->>'id'),false)
   where project.id=target_project_id and project.owner_id=own;
 end loop;
 return result;
exception when lock_not_available then raise exception 'Pedido em atualização. Tente novamente.';
end $$;
revoke all on function public.z19p_mark_selected_order_production_lettering(uuid[],uuid[],uuid[],jsonb) from public,anon;
grant execute on function public.z19p_mark_selected_order_production_lettering(uuid[],uuid[],uuid[],jsonb) to authenticated;
comment on function public.z19p_mark_selected_order_production_lettering(uuid[],uuid[],uuid[],jsonb) is
 'Confirma apenas exportações cuja escrita/fonte/quantidade/receita ainda corresponde ao snapshot do filme, com CAS atômico e locks fail-fast.';
