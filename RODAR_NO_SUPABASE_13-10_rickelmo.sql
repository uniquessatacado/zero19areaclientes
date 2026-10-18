-- Rickelmo #49842 (13/10, dono): pedido de ENVIO marcado "entregue" por engano pelo QR (13/10 19:39).
-- Volta a estampa para PRONTA (igual ao "Voltar ao fluxo -> Pronta" do 019). Não mexe em pagamento, estoque, frete nem etiqueta.
-- 18/10 (Claude, a pedido do dono): em 17/10 a sincronização criou um 2º projeto para este pedido (bd7c6295…, conta do 019)
-- e a estampa passou para ele; o projeto antigo (5be2a500…, conta zero19@venduss, sem estampa) fica como está.
-- Fica registrado como feito pelo Claude (evento do pedido com actor_name "Claude (IA) …").
-- Tudo numa operação só: se algo der errado, nada muda.
do $fix$
declare o constant uuid := '04747f6b-39a4-445c-8474-4a46ce5b62f5'; own constant uuid := '96d8732c-9576-4af9-9fe7-cdee065c14e6';
  proj constant uuid := 'bd7c6295-302d-4e8d-b06b-e22b79f5438a'; ws uuid; powner uuid; target_status uuid; n integer; item_ready timestamptz;
begin
  if (select status from public.orders where id = o) <> 'EM_SEPARACAO' then raise exception 'status do pedido mudou'; end if;
  select workspace_id, owner_id into ws, powner from public.z19p_projects where id = proj and official_order_source = 'zero19_pdv' for update;
  if ws is null then raise exception 'projeto nao encontrado'; end if;
  if powner <> own then raise exception 'projeto mudou de conta'; end if;
  select ready_at into item_ready from public.z19p_zero19_work_items where project_id = proj and order_id = o and stage = 'delivered';
  -- Igual a z19p_zero19_force_stage(proj, 'ready_pickup') do 019 ("Voltar ao fluxo" -> Pronta).
  update public.z19p_zero19_work_items set stage = 'ready_pickup', ready_at = coalesce(ready_at, now()), delivered_at = null, updated_at = now()
    where project_id = proj and order_id = o and stage = 'delivered';
  get diagnostics n = row_count; if n <> 1 then raise exception 'esperava 1 aplicacao entregue, achei %', n; end if;
  update public.personalization_sales s set status = 'DONE', completed_at = coalesce(completed_at, now()), delivered_at = null, updated_at = now()
    where s.id in (select personalization_sale_id from public.z19p_zero19_work_items where project_id = proj and order_id = o);
  target_status := public.z19p_zero19_status_id(powner, 'ready_pickup');
  update public.z19p_projects set official_order_status = 'ready_pickup', status_id = coalesce(target_status, status_id), ready_at = coalesce(ready_at, item_ready, now()), finalized_at = null, updated_at = now() where id = proj;
  update public.z19p_workspaces set status_id = coalesce(target_status, status_id), status_changed_at = now(), updated_at = now() where id = ws and owner_id = powner;
  insert into public.zero19_order_progress_events(tenant_id, order_id, action, stage_before, stage_after, detail, actor_name)
    values ('0e885daf-b461-4384-b2c2-8ed2cf33478b', o, 'BACK', 'DELIVERED', political_private.zero19_order_progress_row(o)->>'stage', 'Entregue desfeito pelo Claude (IA) em 18/10 a pedido do dono: pedido de envio marcado entregue por engano no QR em 13/10', 'Claude (IA) · a pedido do dono');
end $fix$;
