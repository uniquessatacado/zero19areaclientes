-- ZERO19 · Alterar data de entrega com senha + fila de produção (05/11, dono: "acessando o pedido em Gestão de pedidos possa
-- alterar data de entrega e também lendo o QR de produção tenha um botão lá dentro de alterar data de entrega; sempre que apertar
-- em alterar pede senha; então pode também reimprimir a 2ª via da produção com a nova data"; "na 019 crie uma fila para saber qual
-- pedido está na frente para fazer, pela ordem, considerando prazo de entrega e frete que o cliente escolheu; PDV tem preferência
-- se tiver que entregar próximo da data atual").
--
-- 1) private.zero19_action_passwords: só o HASH (bcrypt) da senha; a senha nunca vai para o Git. Gravar com
--    insert ... values ('CHANGE_DEADLINE', extensions.crypt('<senha>', extensions.gen_salt('bf', 10))).
-- 2) public.zero19_change_order_deadline: confere a senha e troca a data do pedido inteiro de uma vez
--    (personalization_sales.pickup_at/estimated_ready_at; o gatilho de sincronização leva para o 019: aplicações e pedido;
--    orders.pickup_due_at só quando o pedido é "pagar na retirada"). Fica no histórico e na linha do tempo do QR.
--    Senha errada não muda nada; 8 erros em 10 minutos travam por 10 minutos.
-- 3) public.zero19_production_order_queue: ordem de produção. Retirada = data da retirada; envio = último dia de postar para o
--    frete ESCOLHIDO chegar no dia que o cliente viu (feriados e horários de postagem das Regras de frete); data alterada pela
--    equipe vale como está. Atrasados primeiro; no mesmo dia, o PDV vai na frente; em espera vai para o fim.
-- Não muda estoque, pagamento, frete, etiqueta, preço nem etapa da produção.
begin;

create table if not exists private.zero19_action_passwords (
  action text primary key,
  password_hash text not null,
  updated_at timestamptz not null default now()
);
revoke all on private.zero19_action_passwords from public, anon, authenticated;

create table if not exists private.zero19_action_password_failures (
  id bigserial primary key,
  actor uuid,
  action text not null,
  created_at timestamptz not null default now()
);
create index if not exists zero19_action_password_failures_actor_idx on private.zero19_action_password_failures (actor, created_at desc);
revoke all on private.zero19_action_password_failures from public, anon, authenticated;

create table if not exists public.zero19_order_deadline_changes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid,
  order_id uuid not null references public.orders(id) on delete cascade,
  previous_at timestamptz,
  promised_at timestamptz not null,
  reason text,
  source text,
  actor uuid default auth.uid(),
  actor_name text,
  created_at timestamptz not null default now()
);
create index if not exists zero19_order_deadline_changes_order_idx on public.zero19_order_deadline_changes (order_id, created_at desc);
alter table public.zero19_order_deadline_changes enable row level security;
revoke all on public.zero19_order_deadline_changes from public, anon, authenticated;

-- A linha do tempo do QR ganha "Prazo alterado".
alter table public.zero19_order_progress_events drop constraint if exists zero19_order_progress_events_action_check;
alter table public.zero19_order_progress_events add constraint zero19_order_progress_events_action_check
  check (action in ('QR_OPEN','GARMENT_SEPARATED','SEPARATED','PRESSING','BACK','MANUAL_TRACKING','AUTO_SHIPPED','READY','LABEL_OK','LABEL_ERROR',
    'HOLD','HOLD_RELEASE','DELIVERED','LABEL_UNPAID','COUPON_PRINTED','DEADLINE'));

-- Senha: true/false. Erro conta para a trava (não usa exceção, senão o registro do erro seria desfeito).
create or replace function political_private.zero19_action_password_ok(p_action text, p_password text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_hash text; v_failures integer;
begin
  select count(*) into v_failures from private.zero19_action_password_failures f
    where f.actor is not distinct from auth.uid() and f.action = p_action and f.created_at > now() - interval '10 minutes';
  if v_failures >= 8 then raise exception 'Muitas tentativas com a senha errada. Espere 10 minutos.'; end if;
  select p.password_hash into v_hash from private.zero19_action_passwords p where p.action = p_action;
  if v_hash is null then raise exception 'A senha desta ação ainda não foi cadastrada. Avise o administrador.'; end if;
  if v_hash = extensions.crypt(coalesce(p_password, ''), v_hash) then return true; end if;
  insert into private.zero19_action_password_failures(actor, action) values (auth.uid(), p_action);
  return false;
end $$;
revoke all on function political_private.zero19_action_password_ok(text, text) from public, anon, authenticated;

-- Conferir a senha antes de abrir a escolha da data (a troca confere de novo).
create or replace function public.zero19_check_action_password(p_action text, p_password text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not political_private.zero19_progress_member() then raise exception 'Entre com a conta da ZERO19.'; end if;
  if p_action not in ('CHANGE_DEADLINE') then raise exception 'Ação desconhecida.'; end if;
  return political_private.zero19_action_password_ok(p_action, p_password);
end $$;
revoke all on function public.zero19_check_action_password(text, text) from public, anon;
grant execute on function public.zero19_check_action_password(text, text) to authenticated;

-- Prazo atual do pedido e a última troca (tela do pedido e QR).
create or replace function public.zero19_order_deadline(p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_at timestamptz; v_count integer; v_last jsonb;
begin
  if not political_private.zero19_progress_member() then raise exception 'Entre com a conta da ZERO19.'; end if;
  select max(coalesce(s.pickup_at, s.estimated_ready_at)), count(*) into v_at, v_count
    from public.personalization_sales s
    where s.order_id = p_order_id and s.tenant_id = '0e885daf-b461-4384-b2c2-8ed2cf33478b' and coalesce(s.status, '') <> 'CANCELLED';
  select jsonb_build_object('at', c.created_at, 'by', c.actor_name, 'previous_at', c.previous_at, 'promised_at', c.promised_at, 'reason', c.reason, 'source', c.source)
    into v_last from public.zero19_order_deadline_changes c where c.order_id = p_order_id order by c.created_at desc limit 1;
  return jsonb_build_object('order_id', p_order_id, 'promised_at', v_at, 'has_production', coalesce(v_count, 0) > 0, 'last_change', v_last);
end $$;
revoke all on function public.zero19_order_deadline(uuid) from public, anon;
grant execute on function public.zero19_order_deadline(uuid) to authenticated;

-- Trocar a data de entrega do pedido inteiro.
create or replace function public.zero19_change_order_deadline(p_order_id uuid, p_promised_at timestamptz, p_password text,
  p_reason text default null, p_actor_name text default null, p_source text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_previous timestamptz; v_sales integer;
  v_reason text := left(nullif(btrim(coalesce(p_reason, '')), ''), 200);
  v_actor text := left(nullif(btrim(coalesce(p_actor_name, '')), ''), 120);
  v_source text := left(nullif(btrim(coalesce(p_source, '')), ''), 40);
  v_fmt text := 'DD/MM HH24:MI';
begin
  if not political_private.zero19_progress_member() then raise exception 'Entre com a conta da ZERO19.'; end if;
  if not political_private.zero19_action_password_ok('CHANGE_DEADLINE', p_password) then
    return jsonb_build_object('ok', false, 'error', 'Senha incorreta.');
  end if;
  if p_promised_at is null or not isfinite(p_promised_at) or p_promised_at < now() - interval '1 day' or p_promised_at > now() + interval '400 days' then
    raise exception 'Escolha uma data de hoje em diante.';
  end if;
  select * into v_order from public.orders o where o.id = p_order_id and o.tenant_id = '0e885daf-b461-4384-b2c2-8ed2cf33478b' for update;
  if v_order.id is null then raise exception 'Pedido não encontrado na ZERO19.'; end if;
  if v_order.status = 'CANCELADO' then raise exception 'Pedido cancelado: não dá para mudar a data.'; end if;
  select max(coalesce(s.pickup_at, s.estimated_ready_at)) into v_previous from public.personalization_sales s
    where s.order_id = v_order.id and s.tenant_id = v_order.tenant_id and coalesce(s.status, '') <> 'CANCELLED';
  -- O gatilho z19p_zero19_personalization_sync leva a data para as aplicações e o pedido do 019 (dono do 019 preservado).
  update public.personalization_sales s set pickup_at = p_promised_at, estimated_ready_at = p_promised_at, updated_at = now()
    where s.order_id = v_order.id and s.tenant_id = v_order.tenant_id and coalesce(s.status, '') <> 'CANCELLED';
  get diagnostics v_sales = row_count;
  if v_sales = 0 then raise exception 'Este pedido não tem produção (personalização) para mudar a data.'; end if;
  update public.z19p_zero19_work_items w set promised_at = p_promised_at, updated_at = now()
    where w.order_id = v_order.id and w.tenant_id = v_order.tenant_id and w.stage <> 'cancelled' and w.promised_at is distinct from p_promised_at;
  update public.orders o set pickup_due_at = p_promised_at, updated_at = now() where o.id = v_order.id and o.pickup_due_at is not null;
  insert into public.zero19_order_deadline_changes(tenant_id, order_id, previous_at, promised_at, reason, source, actor_name)
    values (v_order.tenant_id, v_order.id, v_previous, p_promised_at, v_reason, v_source, v_actor);
  insert into public.zero19_order_progress_events(tenant_id, order_id, action, detail, actor_name)
    values (v_order.tenant_id, v_order.id, 'DEADLINE', left('Prazo: ' || coalesce(to_char(v_previous at time zone 'America/Sao_Paulo', v_fmt), 'sem prazo')
      || ' → ' || to_char(p_promised_at at time zone 'America/Sao_Paulo', v_fmt) || coalesce(' · ' || v_reason, ''), 200), v_actor);
  return jsonb_build_object('ok', true, 'order_id', v_order.id, 'number', v_order.display_id, 'previous_at', v_previous, 'promised_at', p_promised_at, 'sales', v_sales);
end $$;
revoke all on function public.zero19_change_order_deadline(uuid, timestamptz, text, text, text, text) from public, anon;
grant execute on function public.zero19_change_order_deadline(uuid, timestamptz, text, text, text, text) to authenticated;

-- Dias úteis das Regras de frete (sábado, domingo e feriados fora).
create or replace function political_private.zero19_is_business_day(p_day date, p_holidays text[]) returns boolean
language sql immutable set search_path = '' as $$
  select extract(isodow from p_day) < 6 and not (to_char(p_day, 'YYYY-MM-DD') = any(coalesce(p_holidays, '{}'::text[])));
$$;
create or replace function political_private.zero19_next_business_day(p_day date, p_holidays text[]) returns date
language plpgsql immutable set search_path = '' as $$
declare d date := p_day;
begin
  for guard in 1..60 loop d := d + 1; if political_private.zero19_is_business_day(d, p_holidays) then return d; end if; end loop;
  return null;
end $$;
-- Mesmo cálculo do businessDaysBefore do site: o N-ésimo dia útil antes de p_day (0 = o próprio dia).
create or replace function political_private.zero19_business_days_before(p_day date, p_amount integer, p_holidays text[]) returns date
language plpgsql immutable set search_path = '' as $$
declare d date := p_day; counted integer := 0;
begin
  if p_day is null or p_amount is null or p_amount < 0 then return null; end if;
  for guard in 1..400 loop
    exit when counted >= p_amount;
    d := d - 1;
    if political_private.zero19_is_business_day(d, p_holidays) then counted := counted + 1; end if;
  end loop;
  return case when counted = p_amount then d end;
end $$;
revoke all on function political_private.zero19_is_business_day(date, text[]) from public, anon, authenticated;
revoke all on function political_private.zero19_next_business_day(date, text[]) from public, anon, authenticated;
revoke all on function political_private.zero19_business_days_before(date, integer, text[]) from public, anon, authenticated;

-- Fila de produção (019 Personalizações). p_order_ids vazio = todos os pedidos com aplicação aberta.
create or replace function public.zero19_production_order_queue(p_order_ids uuid[] default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_rules jsonb; v_holidays text[]; v_correios integer; v_carrier integer; v_from integer; v_by integer;
  v_now_sp timestamp := now() at time zone 'America/Sao_Paulo'; v_today date; v_hour integer;
begin
  if not political_private.zero19_progress_member() then raise exception 'Acesso não autorizado.'; end if;
  if coalesce(array_length(p_order_ids, 1), 0) > 600 then raise exception 'Muitos pedidos de uma vez.'; end if;
  select s.rules->'deadline_rules' into v_rules from zero19_freight_private.settings s where s.tenant_id = '0e885daf-b461-4384-b2c2-8ed2cf33478b';
  v_holidays := coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(v_rules->'holidays') = 'array' then v_rules->'holidays' else '[]'::jsonb end)), '{}');
  v_correios := coalesce((v_rules->>'posting_cutoff_correios_hour')::integer, 21);
  v_carrier := coalesce((v_rules->>'posting_cutoff_carrier_hour')::integer, 19);
  v_from := coalesce((v_rules->>'reduce_transport_from_days')::integer, 5);
  v_by := coalesce((v_rules->>'reduce_transport_by_days')::integer, 0);
  v_today := v_now_sp::date; v_hour := extract(hour from v_now_sp)::integer;
  return coalesce((select jsonb_agg(q.row_data order by q.held, q.sort_day nulls last, q.pdv desc, q.due_at nulls last, q.created_at) from (
    select r.*,
      row_number() over (order by r.held, r.sort_day nulls last, r.pdv desc, r.due_at nulls last, r.created_at) as position_no
    from (
      select x.*,
        case when x.held then null when x.kind = 'SEND_LATE' then x.last_post else (x.due_at at time zone 'America/Sao_Paulo')::date end as sort_day
      from (
        select f.*,
          case
            when f.manual is not null then 'MANUAL'
            when f.pickup then 'PICKUP'
            when f.last_post is null then 'SEND_UNKNOWN'
            when f.last_post < f.dispatch then 'SEND_LATE'
            else 'SEND_BY' end as kind,
          case
            when f.manual is not null or f.pickup then coalesce(f.promised_at, f.created_at + interval '1 day')
            when f.last_post is null or f.last_post < f.dispatch then (f.dispatch + make_interval(hours => f.cutoff)) at time zone 'America/Sao_Paulo'
            else (f.last_post + make_interval(hours => f.cutoff)) at time zone 'America/Sao_Paulo' end as due_at,
          case when f.manual is null and not f.pickup and f.last_post is not null and f.last_post >= f.dispatch then f.last_post else f.dispatch end as send_by
        from (
          select e.*,
            case when e.today_ok and v_hour < e.cutoff then v_today else political_private.zero19_next_business_day(v_today, v_holidays) end as dispatch,
            political_private.zero19_business_days_before(e.customer_date, e.transport_days, v_holidays) as last_post
          from (
            select d.*,
              political_private.zero19_is_business_day(v_today, v_holidays) as today_ok,
              case when coalesce(d.freight_name, '') ~* '(CORREIOS|\mPAC\M|SEDEX|MINI ?ENVIOS)' then v_correios else v_carrier end as cutoff,
              case when d.carrier_days is null then null when v_by > 0 and v_from > 0 and d.carrier_days >= v_from then greatest(1, d.carrier_days - v_by) else d.carrier_days end as transport_days,
              case when (d.option->'delivery_estimate'->>'estimated_arrival_date') ~ '^\d{4}-\d{2}-\d{2}$' then (d.option->'delivery_estimate'->>'estimated_arrival_date')::date end as customer_date
            from (
              select c.*,
                coalesce(c.option->>'name', c.shipping_method) as freight_name,
                case
                  when (c.option->'delivery_estimate'->>'carrier_transport_days') ~ '^\d+$' then (c.option->'delivery_estimate'->>'carrier_transport_days')::integer
                  when (c.option->>'transport_days') ~ '^\d+$' then (c.option->>'transport_days')::integer
                  when (c.option->>'days') ~ '^\d+$' then (c.option->>'days')::integer
                  when (c.option->>'delivery_days') ~ '^\d+$' then (c.option->>'delivery_days')::integer end as carrier_days
              from (
                select b.*,
                  (select opt from jsonb_array_elements(case when jsonb_typeof(b.options) = 'array' then b.options else '[]'::jsonb end) opt
                    where (b.selected_id is not null and opt->>'id' = b.selected_id)
                       or (b.selected_id is null or not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(b.options) = 'array' then b.options else '[]'::jsonb end) o2 where o2->>'id' = b.selected_id))
                          and lower(btrim(opt->>'name')) = lower(btrim(coalesce(b.shipping_method, '')))
                    limit 1) as option
                from (
                  select o.id, o.display_id, o.origin, o.shipping_method, o.created_at, coalesce(o.payment_status, '') = 'PAGO' as paid,
                    upper(coalesce(o.origin, 'PDV')) = 'PDV' as pdv,
                    (btrim(coalesce(o.shipping_method, '')) = '' or o.shipping_method ~* '(RETIRADA|RETIRAR|LOJA)' or coalesce(pc.snapshot->>'delivery_method', '') = 'PICKUP') as pickup,
                    cu.full_name as customer_name, w.promised_at, w.open_items,
                    coalesce(qc.change->'options', pc.snapshot->'shipping'->'options', zq.shipping_options) as options,
                    coalesce(nullif(o.chave_frete_smartenvios, ''), qc.change->>'selected_shipping_id', pc.snapshot->'shipping'->>'selected_shipping_id', pc.snapshot->'shipping'->'selected'->>'id', zq.shipping_selected) as selected_id,
                    (select jsonb_build_object('at', dc.created_at, 'by', dc.actor_name, 'previous_at', dc.previous_at, 'reason', dc.reason)
                      from public.zero19_order_deadline_changes dc where dc.order_id = o.id order by dc.created_at desc limit 1) as manual,
                    exists (select 1 from public.zero19_urgency_holds h where h.order_id = o.id and h.hold_until > now()) as held,
                    (select h.hold_until from public.zero19_urgency_holds h where h.order_id = o.id and h.hold_until > now()) as held_until
                  from (select x.order_id, min(x.promised_at) as promised_at, count(*) as open_items from public.z19p_zero19_work_items x
                    where x.tenant_id = '0e885daf-b461-4384-b2c2-8ed2cf33478b' and x.order_id is not null and x.stage not in ('ready_pickup', 'delivered', 'cancelled')
                    group by x.order_id) w
                  join public.orders o on o.id = w.order_id
                  left join public.customers cu on cu.id = o.customer_id
                  left join lateral (select p.snapshot from public.political_checkout_orders p where p.order_id = o.id and p.tenant_id = o.tenant_id
                    order by p.created_at desc limit 1) pc on true
                  left join lateral (select z.shipping_options, z.shipping_selected from public.zero19_quotes z where z.order_id = o.id and z.tenant_id = o.tenant_id
                    order by z.updated_at desc nulls last, z.created_at desc limit 1) zq on true
                  left join lateral (select d.details->'shipping_change' as change from public.quick_catalog_order_details d
                    where d.order_id = o.id and d.tenant_id = o.tenant_id and jsonb_typeof(d.details->'shipping_change'->'options') = 'array' limit 1) qc on true
                  where o.tenant_id = '0e885daf-b461-4384-b2c2-8ed2cf33478b' and o.status <> 'CANCELADO' and coalesce(o.excluido, 'N') not in ('S', '1')
                    and (p_order_ids is null or cardinality(p_order_ids) = 0 or o.id = any(p_order_ids))
                  offset 0 -- calcula cada coluna uma vez por pedido (sem isso o banco repete a escolha do frete)
                ) b
                offset 0
              ) c
              offset 0
            ) d
            offset 0
          ) e
          offset 0
        ) f
        offset 0
      ) x
    ) r
  ) q2 cross join lateral (select jsonb_build_object(
      'order_id', q2.id, 'number', q2.display_id, 'position', q2.position_no, 'origin', upper(coalesce(q2.origin, 'PDV')), 'pdv', q2.pdv,
      'pickup', q2.pickup, 'paid', q2.paid, 'customer_name', q2.customer_name, 'created_at', q2.created_at, 'open_items', q2.open_items,
      'kind', q2.kind, 'due_at', q2.due_at, 'promised_at', q2.promised_at, 'send_by', q2.send_by, 'last_post', q2.last_post,
      'dispatch', q2.dispatch, 'cutoff_hour', q2.cutoff, 'customer_date', q2.customer_date, 'transport_days', q2.transport_days,
      'freight_name', q2.freight_name, 'shipping_method', q2.shipping_method, 'manual', q2.manual, 'held_until', q2.held_until,
      'today', v_today) as row_data, q2.held, q2.sort_day, q2.pdv, q2.due_at, q2.created_at) q), '[]'::jsonb);
end $$;
revoke all on function public.zero19_production_order_queue(uuid[]) from public, anon;
grant execute on function public.zero19_production_order_queue(uuid[]) to authenticated;

notify pgrst, 'reload schema';
commit;
