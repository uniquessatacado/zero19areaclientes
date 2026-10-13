-- Conferência de impressão (13/10, dono): página que mostra pedidos pagos sem nenhuma leitura
-- do QR do cupom (cupom talvez não impresso), lidos sem rastreio e com rastreio.
-- SOMENTE LEITURA: resume as leituras/ações já gravadas pelo QR da produção. Não muda pedido,
-- etapa, pagamento, estoque, frete nem etiqueta.
create or replace function public.zero19_qr_activity(p_order_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not political_private.zero19_progress_member() then raise exception 'Entre com a conta da ZERO19 para ver as leituras do QR.'; end if;
  if coalesce(array_length(p_order_ids, 1), 0) > 300 then raise exception 'Muitos pedidos de uma vez.'; end if;
  return coalesce((select jsonb_object_agg(g.order_id::text, g.info) from (
    select e.order_id, jsonb_build_object(
      'opens', count(*) filter (where e.action = 'QR_OPEN'),
      'first_open_at', min(e.created_at) filter (where e.action = 'QR_OPEN'),
      'last_open_at', max(e.created_at) filter (where e.action = 'QR_OPEN'),
      'moves', count(*) filter (where e.action <> 'QR_OPEN'),
      'last', (select jsonb_build_object('action', l.action, 'at', l.created_at, 'by', l.actor_name)
        from public.zero19_order_progress_events l where l.order_id = e.order_id order by l.created_at desc limit 1)) info
    from public.zero19_order_progress_events e
    where e.order_id = any(coalesce(p_order_ids, '{}'::uuid[])) and e.tenant_id = '0e885daf-b461-4384-b2c2-8ed2cf33478b'
    group by e.order_id) g), '{}'::jsonb);
end $$;
revoke all on function public.zero19_qr_activity(uuid[]) from public, anon;
grant execute on function public.zero19_qr_activity(uuid[]) to authenticated;
comment on function public.zero19_qr_activity(uuid[]) is 'Leituras do QR do cupom e última movimentação por pedido (somente leitura).';
