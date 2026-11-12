-- 12/11 (dono: "o último agora que eu marquei já impresso, tirar da fila, no Aguardando produção marquei errado; tem como desfazer?").
-- Desfaz o "Já impresso · tirar da fila" (z19p_mark_selected_order_production) das aplicações escolhidas: só as que estão em
-- "production" e que entraram em produção nas últimas 48 h (não mexe em filme antigo, pronta, entregue nem cancelada). Voltam para
-- "ready_production" (Aguardando produção), a personalização volta para PENDING e a posição posicionada volta para pendente.
create or replace function public.z19p_zero19_undo_printed(p_project_id uuid, p_sale_ids uuid[], p_placement_ids uuid[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  own uuid := public.z19p_current_account_owner();
  v_items integer := 0; v_placements integer := 0;
begin
  if auth.uid() is null or own is distinct from '96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid then raise exception 'Acesso não autorizado.'; end if;
  if not exists (select 1 from public.z19p_projects p where p.id = p_project_id and p.owner_id = own) then raise exception 'Pedido não encontrado.'; end if;
  perform 1 from public.z19p_projects where id = p_project_id for update;
  perform set_config('z19p.owner_override', own::text, true);
  update public.z19p_zero19_work_items w set stage = 'ready_production', production_started_at = null, updated_at = now()
    where w.owner_id = own and w.project_id = p_project_id and w.stage = 'production'
      and w.personalization_sale_id = any(coalesce(p_sale_ids, '{}'))
      and w.production_started_at > now() - interval '48 hours';
  get diagnostics v_items = row_count;
  update public.personalization_sales s set status = 'PENDING', started_at = null, updated_at = now()
    where s.tenant_id = '0e885daf-b461-4384-b2c2-8ed2cf33478b' and s.status = 'IN_PROGRESS'
      and s.id = any(coalesce(p_sale_ids, '{}'))
      and exists (select 1 from public.z19p_zero19_work_items w where w.personalization_sale_id = s.id and w.project_id = p_project_id and w.stage = 'ready_production');
  update public.z19p_asset_placements a set production_state = 'pending', exported_at = null, updated_at = now(), updated_by = auth.uid()
    where a.owner_id = own and a.project_id = p_project_id and a.id = any(coalesce(p_placement_ids, '{}'))
      and a.production_state = 'production' and a.exported_at > now() - interval '48 hours';
  get diagnostics v_placements = row_count;
  if v_items + v_placements = 0 then raise exception 'Nada para desfazer: estas artes não estão mais "em produção" (ou faz mais de 2 dias).'; end if;
  perform public.z19p_zero19_refresh_project(p_project_id);
  return jsonb_build_object('items', v_items, 'placements', v_placements);
end $$;

revoke all on function public.z19p_zero19_undo_printed(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.z19p_zero19_undo_printed(uuid, uuid[], uuid[]) to authenticated;
