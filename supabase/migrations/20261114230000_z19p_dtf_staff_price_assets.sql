-- 14/11 (dono: "pelo Montar filme acessar as áreas dos clientes que compram por metro e baixar as imagens em PNG; permita alterar o preço
-- do pedido antes de adicionar no filme e atualizar ele também no pedido dele").
-- (1) z19p_dtf_staff_client_assets: pastas e artes de um cliente DTF (a equipe já lê os arquivos pela regra z19p_dtf_staff_read_private).
-- (2) z19p_dtf_staff_set_price: novo valor do pedido DTF. Muda o pedido DTF (o cliente vê) e o pedido do PDV (total e "Pagamentos na
--     retirada"). As linhas do pedido continuam; valor menor vira desconto do pedido e valor maior vira uma linha "Ajuste de preço (DTF)".
begin;

create or replace function public.z19p_dtf_staff_client_assets(p_client_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_owner uuid := public.z19p_dtf_assert_staff(); c public.z19p_dtf_clients;
begin
  select * into c from public.z19p_dtf_clients where id = p_client_id and owner_id = v_owner;
  if not found then raise exception 'Cliente não encontrado.'; end if;
  return jsonb_build_object('client', jsonb_build_object('id', c.id, 'name', c.name, 'whatsapp', c.whatsapp, 'email', c.email),
    'folders', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name) order by f.sort_order, f.name) from public.z19p_dtf_folders f where f.client_id = c.id), '[]'::jsonb),
    'assets', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'folderId', a.folder_id, 'path', a.print_path, 'thumbPath', a.thumb_path,
        'originalPath', a.original_path, 'widthCm', a.width_cm, 'heightCm', a.height_cm, 'widthPx', a.width_px, 'heightPx', a.height_px, 'dpi', a.dpi,
        'sourceDpi', a.source_dpi, 'createdAt', a.created_at) order by a.created_at desc)
      from public.z19p_dtf_assets a where a.client_id = c.id and a.deleted_at is null), '[]'::jsonb));
end $$;
revoke all on function public.z19p_dtf_staff_client_assets(uuid) from public, anon;
grant execute on function public.z19p_dtf_staff_client_assets(uuid) to authenticated;

create or replace function public.z19p_dtf_staff_set_price(p_film_id uuid, p_total numeric, p_reason text default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_owner uuid := public.z19p_dtf_assert_staff(); f public.z19p_dtf_films; o public.orders; v_total numeric := round(p_total, 2);
  v_base numeric; v_adjust numeric := 0; v_discount numeric := 0; v_reason text := left(nullif(btrim(coalesce(p_reason, '')), ''), 200);
begin
  select f2.* into f from public.z19p_dtf_films f2 join public.z19p_dtf_clients c on c.id = f2.client_id
    where f2.id = p_film_id and c.owner_id = v_owner for update of f2;
  if not found then raise exception 'Pedido DTF não encontrado.'; end if;
  if f.status not in ('sent', 'printing', 'ready') then raise exception 'Só dá para mudar o preço de pedido em aberto.'; end if;
  if v_total is null or v_total <= 0 or v_total > 100000 then raise exception 'Valor inválido.'; end if;
  select * into o from public.orders where id = f.order_id for update;
  if not found then raise exception 'O pedido do PDV deste DTF não foi encontrado.'; end if;
  if o.status = 'CANCELADO' then raise exception 'O pedido do PDV está cancelado.'; end if;
  if coalesce(o.amount_paid, 0) > v_total then raise exception 'Já foi recebido % neste pedido: o valor não pode ficar menor que isso.', to_char(o.amount_paid, 'FM999G990D00'); end if;
  -- Tira o ajuste anterior (se houver) e recalcula a partir das linhas do pedido.
  delete from public.order_items i where i.order_id = o.id and i.metadata->>'dtf_adjust' = 'true';
  select coalesce(sum(i.subtotal), 0) into v_base from public.order_items i where i.order_id = o.id;
  if v_total >= v_base then v_adjust := v_total - v_base; else v_discount := v_base - v_total; end if;
  if v_adjust > 0 then
    insert into public.order_items (tenant_id, order_id, product_name, size, quantity, unit_price, cost_price, subtotal, metadata)
    values (o.tenant_id, o.id, 'Ajuste de preço (DTF)', '-', 1, v_adjust, 0, v_adjust,
      jsonb_build_object('source', 'z19p_dtf', 'film_id', f.id, 'dtf_adjust', true, 'reason', v_reason));
  end if;
  update public.orders set total_amount = v_total, subtotal_amount = v_base + v_adjust, discount_type = 'value', discount_value = v_discount,
    pickup_balance_due = greatest(v_total - coalesce(amount_paid, 0), 0), updated_at = now()
    where id = o.id;
  update public.z19p_dtf_films set total = v_total, updated_at = now(),
    price = coalesce(price, '{}'::jsonb) || jsonb_build_object('override', jsonb_build_object('total', v_total, 'previous', coalesce((price->'override'->>'previous')::numeric, f.total),
      'reason', v_reason, 'at', now(), 'by', auth.uid()))
    where id = f.id;
  return jsonb_build_object('success', true, 'total', v_total, 'previous', f.total, 'orderId', o.id);
end $$;
revoke all on function public.z19p_dtf_staff_set_price(uuid, numeric, text) from public, anon;
grant execute on function public.z19p_dtf_staff_set_price(uuid, numeric, text) to authenticated;
commit;
