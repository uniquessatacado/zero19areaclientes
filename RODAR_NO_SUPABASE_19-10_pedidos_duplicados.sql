-- Pedidos duplicados ZERO19 (19/10, dono: "uma página que mostra se tem pedidos diferentes no mesmo cliente").
-- Respostas do dono: pedidos dos ÚLTIMOS 30 DIAS (cancelados ficam fora); junta pelo mesmo WhatsApp, mesmo CPF
-- ou mesmo endereço de entrega (nome igual NÃO junta). Cancelar qualquer pedido por ali, com confirmação
-- (o cancelamento é o mesmo da tela do pedido). "Está certo, o cliente tem esses pedidos mesmo" tira o card da
-- tela e ele volta sozinho se chegar pedido novo para esse cliente.
-- Comparação:
--   WhatsApp: só números, sem o 55; DDD + últimos 8 dígitos (com ou sem o 9 da frente conta igual).
--   CPF/CNPJ: só números (11 ou 14), sem sequência repetida (000…).
--   Endereço: só pedido de ENVIO (retirada não tem endereço de entrega). CEP + número da casa, o mesmo
--     endereço que a etiqueta usa (ficha de endereço principal do cliente, senão o cadastro). Número "S/N" ou 0
--     não junta.
-- SÓ a ZERO19. Não muda pedido, estoque, pagamento, frete nem produção: só lê e guarda o "está certo".

create table if not exists political_private.zero19_duplicate_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_ids uuid[] not null,
  note text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by uuid,
  undone_by_name text
);
create index if not exists zero19_duplicate_reviews_active
  on political_private.zero19_duplicate_reviews(tenant_id) where undone_at is null;
alter table political_private.zero19_duplicate_reviews enable row level security;
revoke all on table political_private.zero19_duplicate_reviews from public, anon, authenticated;

create or replace function political_private.zero19_duplicates_guard(p_tenant_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not political_private.can_manage(p_tenant_id) then
    raise exception 'Acesso não autorizado aos pedidos desta loja.';
  end if;
  if not exists (select 1 from public.tenants t where t.id = p_tenant_id and lower(btrim(coalesce(t.subdomain, ''))) = 'zero19') then
    raise exception 'Pedidos duplicados existe só na ZERO19.';
  end if;
end;
$$;
revoke all on function political_private.zero19_duplicates_guard(uuid) from public, anon, authenticated;

create or replace function public.list_zero19_duplicate_orders(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - interval '30 days';
  v_result jsonb;
begin
  perform political_private.zero19_duplicates_guard(p_tenant_id);

  with recursive base as (
    select o.id, o.display_id, o.created_at, o.status, o.payment_status, o.origin,
      o.shipping_method, o.shipping_cost, o.total_amount,
      coalesce(btrim(o.shipping_method), '') = '' or o.shipping_method ~* '(RETIRADA|RETIRAR|LOJA)' as pickup,
      coalesce(nullif(btrim(c.full_name), ''), nullif(btrim(concat_ws(' ', o.nome_entrega, o.sobrenome_entrega)), ''), 'Cliente sem nome') as customer_name,
      nullif(btrim(c.whatsapp), '') as whatsapp,
      nullif(btrim(c.cpf), '') as cpf,
      regexp_replace(coalesce(a.zip_code, c.cep, ''), '\D', '', 'g') as zip,
      nullif(btrim(coalesce(a.street, c.endereco, '')), '') as street,
      nullif(btrim(coalesce(a.number, c.numero, '')), '') as number,
      nullif(btrim(coalesce(a.neighborhood, c.bairro, '')), '') as district,
      nullif(btrim(coalesce(a.city, c.cidade, '')), '') as city,
      nullif(btrim(coalesce(a.state, c.estado, '')), '') as state,
      nullif(btrim(coalesce(a.complement, c.complemento, '')), '') as complement,
      nullif(btrim(coalesce(nullif(o.tracking_code, ''), o.codigo_rastreio)), '') as tracking_code,
      nullif(btrim(coalesce(o.smartenvios_shipment_id, '')), '') is not null or o.label_generated_at is not null as has_label,
      o.label_generated_at,
      regexp_replace(coalesce(c.whatsapp, ''), '\D', '', 'g') as phone_digits
    from public.orders o
    left join public.customers c on c.id = o.customer_id and c.tenant_id = o.tenant_id
    left join lateral (
      select ca.zip_code, ca.street, ca.number, ca.neighborhood, ca.city, ca.state, ca.complement
      from public.customer_addresses ca
      where ca.tenant_id = o.tenant_id and ca.customer_id = o.customer_id
      order by ca.is_default desc nulls last, ca.created_at desc nulls last, ca.id limit 1
    ) a on true
    where o.tenant_id = p_tenant_id and o.created_at >= v_since
      and o.status <> 'CANCELADO' and coalesce(o.excluido, 'N') not in ('S', '1')
  ), normalized as (
    select b.*,
      case when length(b.phone_digits) in (12, 13) and b.phone_digits like '55%' then substr(b.phone_digits, 3) else b.phone_digits end as phone,
      regexp_replace(coalesce(b.cpf, ''), '\D', '', 'g') as doc,
      regexp_replace(lower(coalesce(b.number, '')), '[^0-9a-z]', '', 'g') as house
    from base b
  ), keys as (
    select id, 'WHATSAPP' as kind, 'W:' || substr(phone, 1, 2) || right(phone, 8) as k, phone as label
    from normalized where length(phone) in (10, 11)
    union all
    select id, 'CPF', 'C:' || doc, doc
    from normalized where length(doc) in (11, 14) and doc !~ '^(\d)\1+$'
    union all
    select id, 'ADDRESS', 'E:' || zip || '|' || house, zip || '|' || coalesce(number, '')
    from normalized where not pickup and zip ~ '^[0-9]{8}$' and zip <> '00000000'
      and house <> '' and house !~ '^(sn|semnumero|0+)$'
  ), edges as (
    select distinct a.id as src, b.id as dst from keys a join keys b on a.k = b.k
  ), reach(root, id) as (
    select src, dst from edges
    union
    select r.root, e.dst from reach r join edges e on e.src = r.id
  ), comp as (
    select id, min(root::text) as gid from reach group by id
  ), groups as (
    select gid, array_agg(id order by id) as ids, max(n.created_at) as last_at
    from comp join normalized n using (id)
    group by gid having count(*) >= 2
  ), reviewed as (
    -- Card "conferido" = todos os pedidos de agora já estavam num "está certo"; pedido novo faz o card voltar.
    select g.gid, r.id, r.created_at, r.created_by_name, r.note, r.order_ids
    from groups g join political_private.zero19_duplicate_reviews r
      on r.tenant_id = p_tenant_id and r.undone_at is null and r.order_ids && g.ids
  ), shaped as (
    select g.gid, g.last_at,
      (select to_jsonb(x) from (select rv.id, rv.created_at as at, rv.created_by_name as by, rv.note
        from reviewed rv where rv.gid = g.gid and g.ids <@ rv.order_ids order by rv.created_at desc limit 1) x) as review,
      (select to_jsonb(x) from (select rv.created_at as at, rv.created_by_name as by
        from reviewed rv where rv.gid = g.gid order by rv.created_at desc limit 1) x) as previous_review,
      coalesce((select array_agg(distinct u) from reviewed rv, unnest(rv.order_ids) u where rv.gid = g.gid), '{}') as seen_ids,
      (select coalesce(jsonb_agg(jsonb_build_object('kind', m.kind, 'label', m.label) order by m.kind, m.label), '[]'::jsonb)
        from (select k.kind, min(k.label) as label from keys k where k.id = any(g.ids)
          group by k.kind, k.k having count(distinct k.id) >= 2) m) as matches,
      g.ids
    from groups g
  ), result as (
    select s.gid, s.last_at, s.review is not null as is_reviewed, s.review, s.previous_review, s.matches,
      (select jsonb_agg(jsonb_build_object(
          'id', n.id, 'display_id', n.display_id, 'created_at', n.created_at, 'status', n.status,
          'payment_status', n.payment_status, 'origin', n.origin, 'shipping_method', n.shipping_method,
          'shipping_cost', n.shipping_cost, 'total_amount', n.total_amount, 'pickup', n.pickup,
          'customer_name', n.customer_name, 'whatsapp', n.whatsapp, 'cpf', n.cpf,
          'address', case when n.pickup then null else jsonb_build_object('zip', n.zip, 'street', n.street, 'number', n.number,
            'district', n.district, 'city', n.city, 'state', n.state, 'complement', n.complement) end,
          'tracking_code', n.tracking_code, 'has_label', n.has_label,
          -- Envio (19/10, dono: "destaque se tem etiqueta gerada e quando foi"): etiqueta, rastreio mandado,
          -- despachado e o erro da última tentativa de etiqueta (só quando ainda não tem etiqueta).
          'label_generated_at', n.label_generated_at,
          'tracking_notified_at', (select max(tn.notified_at) from political_private.zero19_tracking_notifications tn where tn.order_id = n.id),
          'dispatched', (select jsonb_build_object('at', d.dispatched_at, 'by', d.dispatched_by_name) from public.zero19_order_dispatches d where d.order_id = n.id),
          'label_issue', case when n.has_label or n.pickup then null else
            (select jsonb_build_object('at', li.created_at, 'message', li.message) from public.zero19_label_issues li where li.order_id = n.id) end,
          'is_new', s.previous_review is not null and not (n.id = any(s.seen_ids)),
          'credit_used', coalesce((select sum(be.amount) from public.customer_balance_entries be
            where be.order_id = n.id and be.entry_type = 'DEBIT'), 0),
          'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.product_name, 'quantity', i.quantity))
            from (select oi.product_name, oi.quantity from public.order_items oi where oi.order_id = n.id order by oi.id limit 8) i), '[]'::jsonb),
          'item_count', (select coalesce(sum(oi.quantity), 0) from public.order_items oi where oi.order_id = n.id)
        ) order by n.created_at desc, n.id)
        from normalized n where n.id = any(s.ids)) as orders
    from shaped s
  )
  select jsonb_build_object(
    'since', v_since,
    'open_count', (select count(*) from result where not is_reviewed),
    'reviewed_count', (select count(*) from result where is_reviewed),
    'groups', coalesce((select jsonb_agg(jsonb_build_object(
        'key', r.gid, 'reviewed', r.is_reviewed, 'review', r.review, 'previous_review', r.previous_review,
        'matches', r.matches, 'orders', r.orders, 'last_at', r.last_at)
      order by r.is_reviewed, r.last_at desc, r.gid) from result r), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.list_zero19_duplicate_orders(uuid) from public, anon;
grant execute on function public.list_zero19_duplicate_orders(uuid) to authenticated;

-- "Está certo, o cliente tem esses pedidos mesmo": guarda o conjunto de pedidos de agora.
create or replace function public.mark_zero19_duplicates_ok(p_tenant_id uuid, p_order_ids uuid[], p_note text default null, p_actor_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_id uuid;
begin
  perform political_private.zero19_duplicates_guard(p_tenant_id);
  select array_agg(distinct u order by u) into v_ids from unnest(coalesce(p_order_ids, '{}')) u where u is not null;
  if coalesce(array_length(v_ids, 1), 0) < 2 then raise exception 'Escolha os pedidos do cliente para marcar como certo.'; end if;
  if (select count(*) from public.orders o where o.id = any(v_ids) and o.tenant_id = p_tenant_id) <> array_length(v_ids, 1) then
    raise exception 'Algum pedido não é desta loja. Atualize a tela.';
  end if;
  insert into political_private.zero19_duplicate_reviews(tenant_id, order_ids, note, created_by, created_by_name)
  values (p_tenant_id, v_ids, left(nullif(btrim(coalesce(p_note, '')), ''), 300), auth.uid(), left(nullif(btrim(coalesce(p_actor_name, '')), ''), 120))
  returning id into v_id;
  return jsonb_build_object('success', true, 'id', v_id);
end;
$$;
revoke all on function public.mark_zero19_duplicates_ok(uuid, uuid[], text, text) from public, anon;
grant execute on function public.mark_zero19_duplicates_ok(uuid, uuid[], text, text) to authenticated;

-- Desfazer o "está certo" (o card volta para "Para conferir"). Fica no histórico quem desfez.
create or replace function public.undo_zero19_duplicates_ok(p_tenant_id uuid, p_review_id uuid, p_actor_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform political_private.zero19_duplicates_guard(p_tenant_id);
  update political_private.zero19_duplicate_reviews r
  set undone_at = now(), undone_by = auth.uid(), undone_by_name = left(nullif(btrim(coalesce(p_actor_name, '')), ''), 120)
  where r.id = p_review_id and r.tenant_id = p_tenant_id and r.undone_at is null;
  if not found then raise exception 'Esta conferência já foi desfeita. Atualize a tela.'; end if;
  return jsonb_build_object('success', true);
end;
$$;
revoke all on function public.undo_zero19_duplicates_ok(uuid, uuid, text) from public, anon;
grant execute on function public.undo_zero19_duplicates_ok(uuid, uuid, text) to authenticated;
