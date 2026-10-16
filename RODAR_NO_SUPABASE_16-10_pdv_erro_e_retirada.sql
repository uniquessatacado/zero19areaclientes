-- RODAR NO SUPABASE (SQL Editor) — 16/10
-- 1) Corrige o erro do PDV "duplicate key value violates unique constraint z19p_projects_workspace_id_sequence_no_key".
-- 2) Libera trocar entre envio e retirada na loja ao corrigir pedido no PDV (inclusive pedido do site).
-- Pode rodar de novo sem problema. Mesma migração: NovoVenduss supabase/migrations/20261016200000_zero19_pdv_sequence_and_fulfillment.sql

-- 16/10 (dono, URGENTE): ao finalizar/confirmar pagamento no PDV aparecia
--   "duplicate key value violates unique constraint z19p_projects_workspace_id_sequence_no_key"
-- e o pedido não era gravado. Causa: o número do pedido dentro do cliente na produção 019
-- (sequence_no) era calculado só com os pedidos do mesmo dono da conta; pedido do mesmo
-- cliente gravado por outro usuário (019 sem o perfil carregado) ficava de fora da conta e o
-- número se repetia. Agora, ao gravar QUALQUER pedido da produção (PDV, site, 019, portal),
-- se o número já está ocupado naquele cliente ele passa a ser o próximo livre.
-- Só muda o número quando ele já está ocupado; nada mais (pedido, estoque, pagamento iguais).
--
-- 16/10 (dono): "pelo PDV, mesmo editando pedido que o cliente fez no site, poder trocar
-- de frete para retirada na loja e vice-versa". Nova gravação da correção do pedido no PDV
-- com a troca de entrega, tudo ou nada na mesma transação:
--   PICKUP:   frete R$ 0, "RETIRADA NA LOJA", sem chave SmartEnvios (sai de Etiquetas pendentes);
--   DELIVERY: frete calculado no PDV (cotação SmartEnvios do cliente), vinculada ao pedido.
-- O total do pedido é o que o PDV calculou (produtos + frete novo). Bloqueado se já tem
-- etiqueta, rastreio, ou se está enviado/entregue/cancelado. O registro original do checkout
-- do site (political_checkout_orders) não é reescrito. Status e estoque seguem a correção normal.
begin;

-- 1) Número do pedido no cliente nunca repete.
create or replace function public.z19p_projects_free_sequence_no()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_next integer;
begin
  if new.workspace_id is null or new.sequence_no is null then return new; end if;
  if tg_op = 'UPDATE' and new.workspace_id is not distinct from old.workspace_id
     and new.sequence_no is not distinct from old.sequence_no then
    return new;
  end if;
  -- Uma gravação por cliente de cada vez escolhe o número.
  perform pg_advisory_xact_lock(hashtext('z19p_project_sequence:' || new.workspace_id::text));
  if exists (
    select 1 from public.z19p_projects p
    where p.workspace_id = new.workspace_id and p.sequence_no = new.sequence_no
      and p.id is distinct from new.id
  ) then
    select coalesce(max(p.sequence_no), 0) + 1 into v_next
    from public.z19p_projects p
    where p.workspace_id = new.workspace_id and p.id is distinct from new.id;
    if new.title = 'Projeto ' || new.sequence_no then
      new.title := 'Projeto ' || v_next;
    elsif new.title = 'Pedido de produção #' || new.sequence_no then
      new.title := 'Pedido de produção #' || v_next;
    end if;
    new.sequence_no := v_next;
  end if;
  return new;
end $$;
revoke all on function public.z19p_projects_free_sequence_no() from public, anon, authenticated;

drop trigger if exists z19p_projects_free_sequence_no on public.z19p_projects;
create trigger z19p_projects_free_sequence_no
before insert or update of workspace_id, sequence_no on public.z19p_projects
for each row execute function public.z19p_projects_free_sequence_no();

-- 2) Correção do pedido no PDV trocando entre envio e retirada.
create or replace function public.zero19_refinalize_pdv_order_with_fulfillment(
 p_order_id uuid,p_cash_register_id uuid,p_billing_mode text,p_total_amount numeric,p_subtotal_amount numeric,p_discount_value numeric,
 p_payment_method text,p_amount_paid numeric,p_change_amount numeric,p_status text,p_payment_status text,p_is_fiado boolean,p_profit_amount numeric,
 p_payment_timing text,p_pickup_balance_due numeric,p_pickup_due_at timestamptz,p_items jsonb,p_payments jsonb,p_personalizations jsonb,p_user_name text,
 p_seller_id uuid,p_fulfillment jsonb,p_seller_change_mode text default null,p_use_vdr boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  after_row public.orders%rowtype;
  q public.zero19_quotes%rowtype;
  mode text := upper(btrim(coalesce(p_fulfillment->>'mode', '')));
  quote_id uuid;
  opt jsonb;
  price numeric;
  ui_price numeric;
  method_name text;
  cep text;
  change jsonb;
  result jsonb;
begin
  if auth.uid() is null then raise exception 'Entre no painel para corrigir o pedido.'; end if;
  if mode not in ('PICKUP', 'DELIVERY') then raise exception 'Escolha retirada na loja ou envio com frete.'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.tenant_id is distinct from '0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid then
    raise exception 'Pedido da ZERO19 não encontrado.';
  end if;
  if not political_private.can_manage(o.tenant_id) then raise exception 'Acesso não autorizado.' using errcode = '42501'; end if;
  if upper(coalesce(o.status, '')) in ('CANCELADO', 'ENVIADO', 'ENTREGUE') then
    raise exception 'O pedido #% está %: não dá mais para trocar entre envio e retirada.', o.display_id, lower(o.status);
  end if;
  if nullif(o.smartenvios_shipment_id, '') is not null or o.label_generated_at is not null
     or nullif(o.shipping_label_url, '') is not null or nullif(o.arquivo_etiqueta, '') is not null then
    raise exception 'O pedido #% já tem etiqueta gerada. Para trocar entre envio e retirada, primeiro tire a etiqueta em Etiquetas pendentes ("Etiqueta sumiu? Gerar de novo") e cancele a antiga no portal SmartEnvios.', o.display_id;
  end if;
  if nullif(btrim(coalesce(o.tracking_code, '')), '') is not null or nullif(btrim(coalesce(o.codigo_rastreio, '')), '') is not null then
    raise exception 'O pedido #% já tem rastreio. Não dá para trocar entre envio e retirada.', o.display_id;
  end if;

  if mode = 'DELIVERY' then
    begin
      quote_id := nullif(p_fulfillment->>'quote_id', '')::uuid;
    exception when others then
      quote_id := null;
    end;
    select * into q from public.zero19_quotes where id = quote_id and tenant_id = o.tenant_id for update;
    if not found or q.source is distinct from 'QUICK' then raise exception 'Cotação de frete não encontrada. Calcule o frete de novo.'; end if;
    if q.order_id is not null and q.order_id <> o.id then raise exception 'Esta cotação já está ligada a outro pedido. Calcule o frete de novo.'; end if;
    select value into opt
    from jsonb_array_elements(case when jsonb_typeof(q.shipping_options) = 'array' then q.shipping_options else '[]'::jsonb end)
    where value->>'id' = p_fulfillment->>'option_id'
    limit 1;
    if opt is null or q.shipping_selected is distinct from opt->>'id' then raise exception 'Escolha uma das opções de frete calculadas.'; end if;
    price := round((opt->>'price')::numeric, 2);
    if price is null or price < 0 then raise exception 'Valor de frete inválido. Calcule o frete de novo.'; end if;
    ui_price := round(nullif(p_fulfillment->>'price', '')::numeric, 2);
    if ui_price is distinct from price then raise exception 'O valor do frete mudou. Calcule o frete de novo antes de finalizar.'; end if;
    method_name := coalesce(nullif(btrim(opt->>'name'), ''), 'Frete SmartEnvios');
    cep := regexp_replace(coalesce(q.cep, ''), '[^0-9]', '', 'g');
  end if;

  change := jsonb_build_object('at', now(), 'actor', auth.uid(), 'source', 'PDV_REFINALIZATION', 'mode', mode,
    'before', jsonb_build_object('shipping_method', o.shipping_method, 'shipping_cost', o.shipping_cost,
      'chave_frete_smartenvios', o.chave_frete_smartenvios, 'total_amount', o.total_amount),
    'options', case when mode = 'DELIVERY' then q.shipping_options else '[]'::jsonb end,
    'selected', case when mode = 'DELIVERY' then opt else null end,
    'selected_shipping_id', case when mode = 'DELIVERY' then opt->>'id' else null end,
    'calculation_id', case when mode = 'DELIVERY' then q.id else null end,
    'quoted_at', case when mode = 'DELIVERY' then q.shipping_quoted_at else null end,
    'cep', case when mode = 'DELIVERY' then cep else null end);

  -- Frete antes da correção: a comissão (sync dentro da correção) já lê o frete novo.
  if mode = 'PICKUP' then
    update public.orders set shipping_cost = 0, shipping_method = 'RETIRADA NA LOJA',
      chave_frete_smartenvios = null, texto_frete = 'RETIRADA NA LOJA'
    where id = o.id;
  else
    update public.orders set shipping_cost = price, shipping_method = method_name,
      chave_frete_smartenvios = opt->>'id',
      texto_frete = 'Cotação #' || coalesce(q.display_id::text, '') || ' · ' || method_name || ' · CEP '
        || case when length(cep) = 8 then substr(cep, 1, 5) || '-' || substr(cep, 6) else cep end
    where id = o.id;
    -- Uma cotação por pedido: a anterior (frete antigo) fica arquivada, sem pedido.
    update public.zero19_quotes set order_id = null, status = 'ARCHIVED', revision = revision + 1,
      updated_by = auth.uid(), updated_at = now()
    where order_id = o.id and id <> q.id;
    perform public.link_zero19_quick_quote_to_pdv_order(q.id, o.id);
  end if;

  result := public.zero19_refinalize_pdv_order_with_seller(
    p_order_id => p_order_id, p_cash_register_id => p_cash_register_id, p_billing_mode => p_billing_mode,
    p_total_amount => p_total_amount, p_subtotal_amount => p_subtotal_amount, p_discount_value => p_discount_value,
    p_payment_method => p_payment_method, p_amount_paid => p_amount_paid, p_change_amount => p_change_amount,
    p_status => p_status, p_payment_status => p_payment_status, p_is_fiado => p_is_fiado, p_profit_amount => p_profit_amount,
    p_payment_timing => p_payment_timing, p_pickup_balance_due => p_pickup_balance_due, p_pickup_due_at => p_pickup_due_at,
    p_items => p_items, p_payments => p_payments, p_personalizations => p_personalizations, p_user_name => p_user_name,
    p_seller_id => p_seller_id, p_seller_change_mode => p_seller_change_mode, p_use_vdr => p_use_vdr);

  select * into after_row from public.orders where id = o.id;
  change := change || jsonb_build_object('after', jsonb_build_object('shipping_method', after_row.shipping_method,
    'shipping_cost', after_row.shipping_cost, 'chave_frete_smartenvios', after_row.chave_frete_smartenvios,
    'total_amount', after_row.total_amount));

  -- Pedido do site: tela do pedido e quadro de prazo usam a entrega nova.
  update public.quick_catalog_order_details
  set details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
    'fulfillment', mode,
    'shipping', case when mode = 'DELIVERY' then opt else null end,
    'shipping_change', change,
    'shipping_changes', coalesce(details->'shipping_changes', '[]'::jsonb) || jsonb_build_array(change - 'options'))
  where order_id = o.id;
  -- "Seguir com este frete" valia para o frete antigo (tabela de 13/10, pode não existir).
  if to_regclass('public.zero19_freight_keeps') is not null then
    execute 'delete from public.zero19_freight_keeps where order_id = $1' using o.id;
  end if;

  insert into public.order_history(order_id, action_type, user_name, description)
  values (o.id, 'ZERO19_FULFILLMENT_CHANGED', coalesce(nullif(btrim(p_user_name), ''), 'PDV'),
    case when mode = 'PICKUP' then 'Correção no PDV: trocado para RETIRADA NA LOJA (antes: '
        || coalesce(o.shipping_method, 'sem frete') || ' · R$ ' || to_char(coalesce(o.shipping_cost, 0), 'FM9999990.00') || ').'
      else 'Correção no PDV: trocado para ENVIO · ' || method_name || ' · R$ ' || to_char(price, 'FM9999990.00')
        || ' (antes: ' || coalesce(o.shipping_method, 'sem frete') || ').' end);

  if jsonb_typeof(result) = 'object' and result ? 'order' then
    result := jsonb_set(result, '{order}', to_jsonb(after_row));
  end if;
  return coalesce(result, '{}'::jsonb) || jsonb_build_object('fulfillment', mode);
end $$;
revoke all on function public.zero19_refinalize_pdv_order_with_fulfillment(uuid,uuid,text,numeric,numeric,numeric,text,numeric,numeric,text,text,boolean,numeric,text,numeric,timestamptz,jsonb,jsonb,jsonb,text,uuid,jsonb,text,boolean) from public, anon;
grant execute on function public.zero19_refinalize_pdv_order_with_fulfillment(uuid,uuid,text,numeric,numeric,numeric,text,numeric,numeric,text,text,boolean,numeric,text,numeric,timestamptz,jsonb,jsonb,jsonb,text,uuid,jsonb,text,boolean) to authenticated;

notify pgrst, 'reload schema';
commit;

-- Conferência (só leitura): as duas primeiras linhas devem dizer OK; a terceira é só um número para conferência.
select 'Erro do número repetido no PDV (produção 019)' as item,
  case when exists(select 1 from pg_trigger where tgname='z19p_projects_free_sequence_no' and not tgisinternal) then 'OK' else 'FALTA' end as situacao
union all
select 'Trocar envio/retirada na correção do PDV',
  case when to_regprocedure('public.zero19_refinalize_pdv_order_with_fulfillment(uuid,uuid,text,numeric,numeric,numeric,text,numeric,numeric,text,text,boolean,numeric,text,numeric,timestamptz,jsonb,jsonb,jsonb,text,uuid,jsonb,text,boolean)') is not null then 'OK' else 'FALTA' end
union all
select 'Pedidos da produção gravados por outro usuário (explica o número repetido)',
  (select count(*)::text from public.z19p_projects p join public.z19p_workspaces w on w.id=p.workspace_id where p.owner_id is distinct from w.owner_id);
