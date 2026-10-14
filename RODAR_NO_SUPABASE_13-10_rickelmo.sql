-- Rickelmo #49842 (13/10, dono): pedido de ENVIO marcado "entregue" por engano pelo QR (13/10 19:39).
-- Volta a estampa para PRONTA (igual ao "Voltar ao fluxo -> Pronta" do 019). Não mexe em pagamento, estoque, frete nem etiqueta.
-- O projeto deste pedido no 019 estava com a conta zero19@venduss (a pasta e a estampa são da conta do 019): o dono do projeto é acertado junto.
-- Tudo numa operação só: se algo der errado, nada muda.
do $fix$
declare o constant uuid := '04747f6b-39a4-445c-8474-4a46ce5b62f5'; own constant uuid := '96d8732c-9576-4af9-9fe7-cdee065c14e6';
  proj constant uuid := '5be2a500-439c-47e5-975d-4285f2d579ee'; ws uuid; powner uuid; target_status uuid; n integer;
begin
  if (select status from public.orders where id = o) <> 'EM_SEPARACAO' then raise exception 'status do pedido mudou'; end if;
  select workspace_id, owner_id into ws, powner from public.z19p_projects where id = proj and official_order_source = 'zero19_pdv' for update;
  if ws is null then raise exception 'projeto nao encontrado'; end if;
  -- Igual a z19p_zero19_force_stage(proj, 'ready_pickup') do 019 ("Voltar ao fluxo" -> Pronta).
  update public.z19p_zero19_work_items set stage = 'ready_pickup', ready_at = coalesce(ready_at, now()), delivered_at = null, updated_at = now()
    where project_id = proj and order_id = o and stage <> 'cancelled';
  get diagnostics n = row_count; if n <> 1 then raise exception 'esperava 1 aplicacao, achei %', n; end if;
  update public.personalization_sales s set status = 'DONE', completed_at = coalesce(completed_at, now()), delivered_at = null, updated_at = now()
    where s.id in (select personalization_sale_id from public.z19p_zero19_work_items where project_id = proj and order_id = o);
  target_status := public.z19p_zero19_status_id(powner, 'ready_pickup');
  update public.z19p_projects set official_order_status = 'ready_pickup', status_id = coalesce(target_status, status_id), ready_at = coalesce(ready_at, now()), finalized_at = null, updated_at = now() where id = proj;
  update public.z19p_workspaces set status_id = coalesce(target_status, status_id), status_changed_at = now(), updated_at = now() where id = ws and owner_id = powner;
  insert into public.zero19_order_progress_events(tenant_id, order_id, action, stage_before, stage_after, detail, actor_name)
    values ('0e885daf-b461-4384-b2c2-8ed2cf33478b', o, 'BACK', 'DELIVERED', political_private.zero19_order_progress_row(o)->>'stage', 'Entregue desfeito: pedido de envio marcado entregue por engano (pedido do dono 13/10)', 'Claude (pedido do dono)');
end $fix$;
