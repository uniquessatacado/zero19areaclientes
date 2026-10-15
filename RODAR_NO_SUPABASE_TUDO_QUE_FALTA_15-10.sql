-- TUDO QUE FALTA RODAR (conferido no banco em 15/10). Supabase > SQL Editor > New query > colar TUDO > Run.
-- Pode rodar de novo sem problema. No final aparece uma tabela: cada linha deve dizer OK.
-- NÃO inclui o #49842 Rickelmo (arquivo separado) nem a correção dos endereços antigos (só conferência).


-- ============================================================
-- 1/8 · 13/10 "Já despachado" (Etiquetas pendentes / Mandar rastreio)
-- ============================================================
-- Já despachado (13/10, dono): na aba "Enviar hoje · prazo" a equipe marca que o pacote já foi
-- postado/entregue à transportadora; sai da tela e fica no filtro "Despachados" (com quem/quando e Desfazer).
-- É só uma marcação: não muda status, estoque, pagamento, etiqueta, rastreio nem produção.
create table if not exists public.zero19_order_dispatches (
  order_id uuid primary key references public.orders(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  dispatched_at timestamptz not null default now(),
  dispatched_by_name text check (dispatched_by_name is null or length(dispatched_by_name) <= 120),
  actor uuid default auth.uid()
);
alter table public.zero19_order_dispatches enable row level security;
revoke all on public.zero19_order_dispatches from public, anon, authenticated;

create or replace function public.zero19_set_dispatched(p_order_id uuid, p_dispatched boolean, p_actor_name text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; row public.zero19_order_dispatches%rowtype;
begin
  if not political_private.zero19_progress_member() then raise exception 'Entre com a conta da ZERO19 para marcar o despacho.'; end if;
  select * into o from public.orders where id = p_order_id and tenant_id = '0e885daf-b461-4384-b2c2-8ed2cf33478b';
  if o.id is null then raise exception 'Pedido não encontrado na ZERO19.'; end if;
  if coalesce(p_dispatched, false) then
    insert into public.zero19_order_dispatches(order_id, tenant_id, dispatched_by_name)
    values (o.id, o.tenant_id, left(nullif(btrim(coalesce(p_actor_name, '')), ''), 120))
    on conflict (order_id) do nothing;
    select * into row from public.zero19_order_dispatches where order_id = o.id;
    return jsonb_build_object('success', true, 'dispatched', true, 'at', row.dispatched_at, 'by', row.dispatched_by_name);
  end if;
  delete from public.zero19_order_dispatches where order_id = o.id;
  return jsonb_build_object('success', true, 'dispatched', false);
end $$;
revoke all on function public.zero19_set_dispatched(uuid, boolean, text) from public, anon;
grant execute on function public.zero19_set_dispatched(uuid, boolean, text) to authenticated;

create or replace function public.zero19_dispatches(p_order_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not political_private.zero19_progress_member() then raise exception 'Entre com a conta da ZERO19.'; end if;
  if coalesce(array_length(p_order_ids, 1), 0) > 2000 then raise exception 'Muitos pedidos de uma vez.'; end if;
  return coalesce((select jsonb_object_agg(d.order_id::text, jsonb_build_object('at', d.dispatched_at, 'by', d.dispatched_by_name))
    from public.zero19_order_dispatches d where d.order_id = any(coalesce(p_order_ids, '{}'::uuid[]))), '{}'::jsonb);
end $$;
revoke all on function public.zero19_dispatches(uuid[]) from public, anon;
grant execute on function public.zero19_dispatches(uuid[]) to authenticated;


-- ============================================================
-- 2/8 · 13/10 Manter o frete do cliente
-- ============================================================
-- Manter o frete do cliente (13/10, dono): o cliente comprou já sabendo que o frete escolhido não chega
-- até 23/10. A equipe marca "seguir com este frete": somem os alertas de trocar frete, o prazo passa a ser
-- a data que o cliente viu e o "Acompanhar meu pedido" não promete mais troca por nossa conta.
-- Só marcação (quem/quando, desfazível): não muda frete, cotação, valor, etiqueta, status nem estoque.
create table if not exists public.zero19_freight_keeps (
  order_id uuid primary key references public.orders(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kept_at timestamptz not null default now(),
  kept_by_name text check (kept_by_name is null or length(kept_by_name) <= 120),
  actor uuid default auth.uid()
);
alter table public.zero19_freight_keeps enable row level security;
revoke all on public.zero19_freight_keeps from public, anon, authenticated;

create or replace function public.zero19_set_freight_keep(p_order_id uuid, p_keep boolean, p_actor_name text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; row public.zero19_freight_keeps%rowtype;
begin
  if not political_private.zero19_progress_member() then raise exception 'Entre com a conta da ZERO19 para manter o frete.'; end if;
  select * into o from public.orders where id = p_order_id and tenant_id = '0e885daf-b461-4384-b2c2-8ed2cf33478b';
  if o.id is null then raise exception 'Pedido não encontrado na ZERO19.'; end if;
  if coalesce(p_keep, false) then
    insert into public.zero19_freight_keeps(order_id, tenant_id, kept_by_name)
    values (o.id, o.tenant_id, left(nullif(btrim(coalesce(p_actor_name, '')), ''), 120)) on conflict (order_id) do nothing;
    select * into row from public.zero19_freight_keeps where order_id = o.id;
    return jsonb_build_object('success', true, 'kept', true, 'at', row.kept_at, 'by', row.kept_by_name);
  end if;
  delete from public.zero19_freight_keeps where order_id = o.id;
  return jsonb_build_object('success', true, 'kept', false);
end $$;
revoke all on function public.zero19_set_freight_keep(uuid, boolean, text) from public, anon;
grant execute on function public.zero19_set_freight_keep(uuid, boolean, text) to authenticated;

create or replace function public.zero19_freight_keeps(p_order_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not political_private.zero19_progress_member() then raise exception 'Entre com a conta da ZERO19.'; end if;
  if coalesce(array_length(p_order_ids, 1), 0) > 2000 then raise exception 'Muitos pedidos de uma vez.'; end if;
  return coalesce((select jsonb_object_agg(k.order_id::text, jsonb_build_object('at', k.kept_at, 'by', k.kept_by_name))
    from public.zero19_freight_keeps k where k.order_id = any(coalesce(p_order_ids, '{}'::uuid[]))), '{}'::jsonb);
end $$;
revoke all on function public.zero19_freight_keeps(uuid[]) from public, anon;
grant execute on function public.zero19_freight_keeps(uuid[]) to authenticated;

-- Cliente: frete mantido não mostra "vamos enviar por frete mais rápido por nossa conta".
do $patch$
declare definition text;
  anchor constant text := 'if o.id is null then return null; end if;';
  addition constant text := 'if o.id is null then return null; end if;
  if exists(select 1 from public.zero19_freight_keeps k where k.order_id = o.id) then return null; end if;';
begin
  definition := pg_get_functiondef('political_private.zero19_order_freight(uuid)'::regprocedure);
  if position('zero19_freight_keeps' in definition) > 0 then return; end if;
  if position(anchor in definition) = 0 then raise notice 'Trecho não encontrado em zero19_order_freight; aviso do cliente não alterado.'; return; end if;
  execute replace(definition, anchor, addition);
end
$patch$;


-- ============================================================
-- 3/8 · 13/10 Conferir impressão (leituras do QR)
-- ============================================================
-- Conferência de impressão (13/10, dono): página que mostra pedidos pagos sem nenhuma leitura
-- do QR do cupom (cupom talvez não impresso), lidos sem rastreio e com rastreio.
-- Ler o QR (ou mudar a etapa pelo QR) = impresso: 'first' traz a primeira leitura/ação (quando e quem).
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
        from public.zero19_order_progress_events l where l.order_id = e.order_id order by l.created_at desc limit 1),
      'first', (select jsonb_build_object('action', f.action, 'at', f.created_at, 'by', f.actor_name)
        from public.zero19_order_progress_events f where f.order_id = e.order_id order by f.created_at asc limit 1)) info
    from public.zero19_order_progress_events e
    where e.order_id = any(coalesce(p_order_ids, '{}'::uuid[])) and e.tenant_id = '0e885daf-b461-4384-b2c2-8ed2cf33478b'
    group by e.order_id) g), '{}'::jsonb);
end $$;
revoke all on function public.zero19_qr_activity(uuid[]) from public, anon;
grant execute on function public.zero19_qr_activity(uuid[]) to authenticated;
comment on function public.zero19_qr_activity(uuid[]) is 'Leituras do QR do cupom e última movimentação por pedido (somente leitura).';


-- ============================================================
-- 4/8 · 13/10 Cancelar sempre, venda sem estoque e "pedido impresso" (pode rodar de novo)
-- ============================================================
-- RODAR NO SUPABASE (13/10, dono). Pode rodar o arquivo inteiro de novo sem problema.
-- 1) Cancelar SEMPRE (não trava mais pedido do site com estampa em produção)
-- Cancelar SEMPRE (13/10, dono: "se estou cancelando é para cancelar, não trave"):
-- o pedido do site com aplicação já em produção não pode mais impedir o cancelamento.
-- Ao cancelar, o que já existe continua valendo (20260928005804): aplicações do 019 viram
-- canceladas (saem de Aguardando produção/fila/filme), personalizações e projeto cancelados,
-- pausas encerradas; o QR mostra CANCELADO e bloqueia etapas/pronta.
-- A proteção de EDITAR/REMOVER item em produção (trigger em order_items) continua igual.
drop trigger if exists political_checkout_cancel_guard on public.orders;

-- Pedidos já cancelados que ficaram com aplicação ativa por qualquer caminho: garante a cascata.
do $$
declare r record;
begin
  for r in select distinct w.order_id from public.z19p_zero19_work_items w join public.orders o on o.id = w.order_id
    where o.tenant_id = '0e885daf-b461-4384-b2c2-8ed2cf33478b' and o.status = 'CANCELADO' and w.stage is distinct from 'cancelled' loop
    perform public.z19p_cancel_zero19_order_production_internal(r.order_id);
  end loop;
end $$;

-- 2) Impresso para o cliente (primeira leitura do QR)
-- Impresso para o cliente (13/10, dono): o pedido cujo QR do cupom já foi lido (ou teve etapa
-- mudada pela página do QR) está IMPRESSO. A etapa ganha times.printed_at = primeira leitura/ação.
-- O "Acompanhar meu pedido" mostra "Pedido impresso · na fila" só quando existe; sem leitura não fala de impressão.
-- Ajusta só o trecho exato da função ativa; se o trecho não existir, nada muda (erro claro).
do $patch$
declare definition text;
  anchor constant text := '''delivered_at'', case when stage = ''DELIVERED'' then coalesce(items_delivered, o.updated_at) end),';
  addition constant text := '''delivered_at'', case when stage = ''DELIVERED'' then coalesce(items_delivered, o.updated_at) end,
      ''printed_at'', (select min(pe.created_at) from public.zero19_order_progress_events pe where pe.order_id = o.id)),';
begin
  definition := pg_get_functiondef('political_private.zero19_order_progress_row(uuid)'::regprocedure);
  if position('printed_at' in definition) > 0 then return; end if; -- já aplicado
  if position(anchor in definition) = 0 then raise exception 'Trecho da etapa não encontrado. Nada foi alterado.'; end if;
  execute replace(definition, anchor, addition);
end
$patch$;

-- 3) Camisa sem peso/medida cadastrados não barra o pedido (embalagem padrão 250 g, 20x15x3)
-- Compra no site nunca barrada por cadastro de peso/medida (13/10, dono: lisa da 30.1 "sem estoque"
-- mesmo com estoque). Camisa sem peso/medida de envio cadastrados usa a embalagem padrão já
-- autorizada (250 g, 20 × 15 × 3 cm) em vez de impedir o pedido. Peso/medida reais continuam valendo.
do $patch$
declare definition text;
  anchor constant text := 'IF r.wg<=0 OR r.hc<=0 OR r.wc<=0 OR r.lc<=0 THEN RAISE EXCEPTION ''A peça % precisa de peso e medidas de envio cadastrados.'',r.name; END IF;';
  addition constant text := 'IF coalesce(r.wg,0)<=0 THEN r.wg:=250; END IF; IF coalesce(r.hc,0)<=0 THEN r.hc:=3; END IF; IF coalesce(r.wc,0)<=0 THEN r.wc:=20; END IF; IF coalesce(r.lc,0)<=0 THEN r.lc:=15; END IF;';
begin
  definition := pg_get_functiondef('public.political_prepare_items(jsonb,boolean)'::regprocedure);
  if position(addition in definition) > 0 then return; end if; -- já aplicado
  if position(anchor in definition) = 0 then raise notice 'Trecho de peso/medida não encontrado em political_prepare_items; nada alterado.'; return; end if;
  execute replace(definition, anchor, addition);
end
$patch$;

-- 4) Site não trava a compra por falta de estoque (Liberar venda sem estoque de 09/10 + LIGADO)
-- Estampa Política — "Liberar venda sem estoque" (dono 09/10).
-- Ligado: checkout vende Brasil/lisa nos tamanhos cadastrados mesmo sem estoque e,
-- ao marcar PAGO, a baixa deixa o estoque NEGATIVO. Desligado (padrão): regra atual.
-- Ajusta somente os trechos exatos das funções ATIVAS no banco; se algum trecho
-- não for encontrado, nada é alterado (a transação inteira é desfeita).
begin;

alter table public.political_catalog_settings
  add column if not exists allow_out_of_stock_sales boolean not null default false;

create or replace function political_private.out_of_stock_sales_enabled()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select s.allow_out_of_stock_sales from public.political_catalog_settings s limit 1), false);
$$;
revoke all on function political_private.out_of_stock_sales_enabled() from public, anon;
grant execute on function political_private.out_of_stock_sales_enabled() to authenticated, service_role;

-- Lista de camisas do checkout: com a venda liberada, cada tamanho aparece disponível.
create or replace function political_private.checkout_stock_view(p_products jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not political_private.out_of_stock_sales_enabled() or jsonb_typeof(p_products) is distinct from 'array' then return p_products; end if;
  return coalesce((
    select jsonb_agg(case when jsonb_typeof(product->'variants') = 'array' then jsonb_set(product, '{variants}', coalesce((
      select jsonb_agg(jsonb_set(variant, '{available}', to_jsonb(greatest(coalesce((variant->>'available')::numeric, 0), 100000)::integer), true))
      from jsonb_array_elements(product->'variants') variant), '[]'::jsonb)) else product end)
    from jsonb_array_elements(p_products) product), '[]'::jsonb);
end;
$$;
revoke all on function political_private.checkout_stock_view(jsonb) from public, anon;
grant execute on function political_private.checkout_stock_view(jsonb) to authenticated, service_role;

do $patch$
declare
  definition text;
  procedure_name regprocedure;
  patches jsonb := jsonb_build_array(
    jsonb_build_array('public.political_checkout_products()',
      'return coalesce(products,''[]'')||coalesce(brazil,''[]'');',
      'return political_private.checkout_stock_view(coalesce(products,''[]'')||coalesce(brazil,''[]''));'),
    jsonb_build_array('public.political_prepare_items(jsonb,boolean)',
      'IF qty>r.available_quantity THEN',
      'IF qty>r.available_quantity AND NOT political_private.out_of_stock_sales_enabled() THEN'),
    jsonb_build_array('public.political_prepare_items(jsonb,boolean)',
      'HAVING sum((l->>''quantity'')::integer)>root.available_quantity) THEN',
      'HAVING sum((l->>''quantity'')::integer)>root.available_quantity) AND NOT political_private.out_of_stock_sales_enabled() THEN'),
    jsonb_build_array('political_private.checkout_paid()',
      'having sum(oi.quantity)>root.available_quantity) then raise exception',
      'having sum(oi.quantity)>root.available_quantity) and not political_private.out_of_stock_sales_enabled() then raise exception')
  );
  item jsonb;
begin
  for item in select value from jsonb_array_elements(patches) loop
    procedure_name := (item->>0)::regprocedure;
    definition := pg_get_functiondef(procedure_name);
    if position(item->>2 in definition) > 0 then continue; end if; -- já aplicado
    if position(item->>1 in definition) = 0 then
      raise exception 'Trecho não encontrado em %: %. Nada foi alterado.', item->>0, item->>1;
    end if;
    execute replace(definition, item->>1, item->>2);
  end loop;
end
$patch$;

notify pgrst, 'reload schema';
commit;

-- Conferência: deve mostrar allow_out_of_stock_sales = false até ligar no admin.

-- Site não trava a compra por falta de estoque (13/10, dono: 'se não tem estoque por que mostra o tamanho'): liga o
-- "Liberar venda sem estoque" de 09/10 (20261009120000). Desligar continua no admin do Estampa Política.
-- (tirado deste arquivo: não mexe na opção Liberar venda sem estoque; ela fica como está no admin)
notify pgrst, 'reload schema';



-- ============================================================
-- 5/8 · 12/10 Camisa Brasil sem estampa 1/2/3 por R$ 80/90/100 (pode rodar de novo)
-- ============================================================
-- Camisa Brasil SEM estampa no estúdio do site (dono 12/10).
-- Preço: cada 3 camisas sem estampa = R$ 100; sobra 1 = R$ 80, sobra 2 = R$ 90
-- (1=80, 2=90, 3=100, 4=180, 5=190, 6=200...). Vale para masculina, feminina e
-- infantil misturadas. Só conta camisa Brasil sem estampa e sem escrita.
-- A camisa vai a R$ 80 no item e a diferença do combo entra como desconto do pedido.
-- Não muda estoque, produção, frete nem pedidos antigos.
begin;

-- Linha da compra (montada pela função political-checkout) que é camisa Brasil sem nada aplicado.
create or replace function political_private.checkout_blank_line(p_line jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(p_line->>'model','BRAZIL')='BRAZIL' and p_line->>'blank_shirt'='true'
   and coalesce(jsonb_array_length(case when jsonb_typeof(p_line->'applications')='array' then p_line->'applications' end),0)=0;
$$;
revoke all on function political_private.checkout_blank_line(jsonb) from public,anon,authenticated;
grant execute on function political_private.checkout_blank_line(jsonb) to service_role;

-- Desconto do combo: (quantidade × 80) − preço da promoção.
create or replace function political_private.checkout_blank_promo(p_items jsonb) returns numeric
language sql immutable set search_path='' as $$
 with n as (select coalesce(sum((l->>'quantity')::integer),0) as qty from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) l where political_private.checkout_blank_line(l))
 select qty*80 - ((qty/3)*100 + case qty%3 when 1 then 80 when 2 then 90 else 0 end) from n;
$$;
revoke all on function political_private.checkout_blank_promo(jsonb) from public,anon,authenticated;
grant execute on function political_private.checkout_blank_promo(jsonb) to service_role;

do $$
declare body text;
 old_blank constant text:='if pid is null and top_text='''' and bottom_text='''' then raise exception ''Escolha uma estampa ou escreva sua frase.'';end if;';
 old_name constant text:='coalesce(art.name,''Somente escrita'')';
 old_apps constant text:='or jsonb_array_length(line->''applications'')<1 then raise exception ''Confira quantidade e personalizações.''';
 old_base constant text:='case when line->>''model''=''PRINT_ONLY'' then 0 when line->>''model''=''COTTON'' then 39.99 else 49.99 end';
 old_else constant text:='else p_payload:=p_payload||jsonb_build_object(''is_test'',false);end if;';
begin
 -- 1) Preparação: aceita camisa Brasil sem estampa e sem escrita (lisa/algodão e estampa avulsa continuam exigindo algo).
 select pg_get_functiondef('public.political_checkout_prepare(jsonb)'::regprocedure) into body;
 if strpos(body,'model<>''BRAZIL'' and pid is null and top_text=''''')>0 then raise notice 'Preparação já aceita camisa sem estampa.';
 else
  if strpos(body,old_blank)=0 or strpos(body,old_name)=0 then raise exception 'Checkout prepare contract changed; review migration.';end if;
  body:=replace(body,old_blank,'if model<>''BRAZIL'' and pid is null and top_text='''' and bottom_text='''' then raise exception ''Escolha uma estampa ou escreva sua frase.'';end if;');
  body:=replace(body,old_name,'coalesce(art.name,case when top_text='''' and bottom_text='''' then ''Sem estampa'' else ''Somente escrita'' end)');
  execute body;
 end if;

 -- 2) Criação do pedido: camisa sem estampa a R$ 80 e desconto do combo no pedido.
 select pg_get_functiondef('public.political_checkout_create(uuid,text,jsonb)'::regprocedure) into body;
 if strpos(body,'political_private.checkout_blank_line(line)')>0 then raise notice 'Criação já tem a camisa sem estampa.';
 else
  if strpos(body,old_apps)=0 or strpos(body,old_base)=0 or strpos(body,old_else)=0 then raise exception 'Checkout create contract changed; review migration.';end if;
  body:=replace(body,old_apps,'or (jsonb_array_length(line->''applications'')<1 and not political_private.checkout_blank_line(line)) then raise exception ''Confira quantidade e personalizações.''');
  body:=replace(body,old_base,'case when line->>''model''=''PRINT_ONLY'' then 0 when line->>''model''=''COTTON'' then 39.99 when political_private.checkout_blank_line(line) then 80 else 49.99 end');
  body:=replace(body,old_else,'else discount:=political_private.checkout_blank_promo(p_payload->''items'');p_payload:=p_payload||jsonb_build_object(''is_test'',false,''blank_promo_discount'',discount);end if;');
  execute body;
 end if;
end $$;

notify pgrst,'reload schema';
commit;


-- ============================================================
-- 6/8 · 14/10 Etiqueta sumiu? Gerar de novo (precisa do 1/7)
-- ============================================================
-- Gerar etiqueta de novo (14/10, dono): "tem pedido que a etiqueta sumiu, preciso gerar de novo".
-- Libera a etiqueta atual do pedido (ou a tentativa de compra travada) para a equipe gerar outra pelo
-- fluxo normal de Etiquetas pendentes (mesmas travas: pago ou autorizado, valor conferido, uma compra por vez).
-- Guarda TUDO da etiqueta antiga no histórico (ID do envio, rastreio, PDFs, tentativa, despacho, quem,
-- quando e motivo) e limpa só os campos da etiqueta no pedido.
-- NÃO compra etiqueta, NÃO chama a SmartEnvios e NÃO cancela a etiqueta antiga lá (se ela existir no
-- portal, a equipe cancela). Não muda status, pagamento, estoque, frete cobrado do cliente nem produção.
-- Pode rodar mais de uma vez.
begin;
set local lock_timeout = '10s';

create table if not exists shipping_label_private.label_releases (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 3 and 300),
  actor uuid,
  actor_name text check (actor_name is null or length(actor_name) <= 120),
  released_at timestamptz not null default now(),
  shipment_id text,
  tracking_code text,
  label_url text,
  declaration_url text,
  label_generated_at timestamptz,
  order_label jsonb not null,
  attempt jsonb,
  dispatch jsonb
);
alter table shipping_label_private.label_releases enable row level security;
revoke all on shipping_label_private.label_releases from public, anon, authenticated;
grant all on shipping_label_private.label_releases to service_role;
create index if not exists label_releases_order_idx on shipping_label_private.label_releases(order_id, released_at desc);

create or replace function public.zero19_release_shipping_label(p_order_id uuid, p_reason text, p_actor_name text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  a shipping_label_private.attempts%rowtype;
  has_attempt boolean;
  v_reason text := left(btrim(coalesce(p_reason, '')), 300);
  v_actor text := left(nullif(btrim(coalesce(p_actor_name, '')), ''), 120);
  v_dispatch jsonb;
  v_release shipping_label_private.label_releases%rowtype;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or not shipping_label_private.actor_can_manage(auth.uid(), o.tenant_id) then
    raise exception 'Acesso não autorizado para este pedido.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tenants t where t.id = o.tenant_id and t.subdomain = 'zero19') then
    raise exception 'Gerar etiqueta de novo é só da ZERO19.';
  end if;
  if o.status = 'CANCELADO' or coalesce(o.excluido, 'N') in ('S', '1') then raise exception 'Pedido cancelado: não gera etiqueta.'; end if;
  if length(v_reason) < 3 then raise exception 'Informe o motivo de gerar a etiqueta de novo.'; end if;

  select * into a from shipping_label_private.attempts where order_id = o.id for update;
  has_attempt := found;
  if nullif(btrim(coalesce(o.smartenvios_shipment_id, '')), '') is null and not has_attempt and o.label_generated_at is null
     and nullif(btrim(coalesce(o.shipping_label_url, '')), '') is null and nullif(btrim(coalesce(o.arquivo_etiqueta, '')), '') is null then
    return jsonb_build_object('success', true, 'released', false, 'message', 'Este pedido não tem etiqueta para tirar. Pode gerar normalmente.');
  end if;

  -- "Já despachado" (13/10) é marcação da etiqueta antiga: volta para a lista Enviar hoje.
  if to_regclass('public.zero19_order_dispatches') is not null then
    execute 'select to_jsonb(d) from public.zero19_order_dispatches d where d.order_id = $1' into v_dispatch using o.id;
    execute 'delete from public.zero19_order_dispatches where order_id = $1' using o.id;
  end if;

  insert into shipping_label_private.label_releases(order_id, tenant_id, reason, actor, actor_name, shipment_id, tracking_code,
    label_url, declaration_url, label_generated_at, order_label, attempt, dispatch)
  values (o.id, o.tenant_id, v_reason, auth.uid(), v_actor,
    coalesce(nullif(btrim(coalesce(o.smartenvios_shipment_id, '')), ''), case when has_attempt then a.shipment_id end),
    coalesce(nullif(btrim(coalesce(o.tracking_code, '')), ''), nullif(btrim(coalesce(o.codigo_rastreio, '')), ''), case when has_attempt then a.receipt->>'tracking_code' end),
    coalesce(nullif(btrim(coalesce(o.shipping_label_url, '')), ''), nullif(btrim(coalesce(o.arquivo_etiqueta, '')), ''), case when has_attempt then a.receipt->>'shipping_label_url' end),
    coalesce(nullif(btrim(coalesce(o.shipping_declaration_url, '')), ''), case when has_attempt then a.receipt->>'shipping_declaration_url' end),
    o.label_generated_at,
    jsonb_build_object('smartenvios_shipment_id', o.smartenvios_shipment_id, 'tracking_code', o.tracking_code, 'codigo_rastreio', o.codigo_rastreio,
      'shipping_label_url', o.shipping_label_url, 'arquivo_etiqueta', o.arquivo_etiqueta, 'shipping_declaration_url', o.shipping_declaration_url,
      'label_generated_at', o.label_generated_at, 'shipping_method', o.shipping_method, 'chave_frete_smartenvios', o.chave_frete_smartenvios,
      'status', o.status, 'payment_status', o.payment_status),
    case when has_attempt then to_jsonb(a) end, v_dispatch)
  returning * into v_release;

  delete from shipping_label_private.attempts where order_id = o.id;
  update public.orders set smartenvios_shipment_id = null, tracking_code = null, codigo_rastreio = null, shipping_label_url = null,
    arquivo_etiqueta = null, shipping_declaration_url = null, label_generated_at = null
  where id = o.id;

  return jsonb_build_object('success', true, 'released', true, 'release_id', v_release.id, 'shipment_id', v_release.shipment_id,
    'tracking_code', v_release.tracking_code, 'released_at', v_release.released_at);
end $$;
revoke all on function public.zero19_release_shipping_label(uuid, text, text) from public, anon;
grant execute on function public.zero19_release_shipping_label(uuid, text, text) to authenticated;

-- Histórico para a tela (rastreio/ID antigos para conferir e cancelar no portal SmartEnvios).
create or replace function public.zero19_label_releases(p_order_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Entre no sistema.' using errcode = '42501'; end if;
  if coalesce(array_length(p_order_ids, 1), 0) > 500 then raise exception 'Muitos pedidos de uma vez.'; end if;
  return coalesce((select jsonb_object_agg(x.order_id::text, x.rows) from (
    select r.order_id, jsonb_agg(jsonb_build_object('at', r.released_at, 'by', r.actor_name, 'reason', r.reason,
      'tracking_code', r.tracking_code, 'shipment_id', r.shipment_id) order by r.released_at desc) as rows
    from shipping_label_private.label_releases r
    where r.order_id = any(coalesce(p_order_ids, '{}'::uuid[])) and shipping_label_private.actor_can_manage(auth.uid(), r.tenant_id)
    group by r.order_id) x), '{}'::jsonb);
end $$;
revoke all on function public.zero19_label_releases(uuid[]) from public, anon;
grant execute on function public.zero19_label_releases(uuid[]) to authenticated;

commit;
notify pgrst, 'reload schema';


-- ============================================================
-- 7/8 · 15/10 Endereço do site no cadastro, ZERO19 TV (entraram hoje/desistências), medida das artes
-- ============================================================
-- 15/10 (dono): "endereço que cliente está cadastrando no site não está ficando salvo no cadastro do cliente".
-- Causas no checkout do site (political_checkout_create):
--  1) cliente que já existia (mesmo WhatsApp) era reaproveitado SEM gravar o endereço novo;
--  2) cliente novo ganhava o endereço só nas colunas internas de customers, nunca na ficha de
--     endereço (customer_addresses) — que é o que a tela do cliente mostra e a etiqueta usa primeiro;
--  3) WhatsApp novo com CPF já cadastrado em outro cliente travava a compra ("CPF ja vinculado").
-- Correção (só para compras feitas daqui para frente): mesmo cliente por WhatsApp ou, sem ele, pelo
-- CPF; o endereço digitado vira o endereço principal do cadastro (customers + customer_addresses).
-- CPF/e-mail/nome só completam o que estava vazio. Não muda pedido, valor, frete, pagamento,
-- estoque, produção nem etiqueta já gerada.
begin;

create or replace function political_private.checkout_save_customer(p_tenant uuid,p_customer uuid,p_data jsonb,p_delivery boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_zip text:=regexp_replace(coalesce(p_data->>'zip_code',''),'\D','','g');
 v_street text:=btrim(coalesce(p_data->>'street',''));
 v_num text:=btrim(coalesce(p_data->>'number',''));
 v_hood text:=btrim(coalesce(p_data->>'neighborhood',''));
 v_city text:=btrim(coalesce(p_data->>'city',''));
 v_uf text:=upper(btrim(coalesce(p_data->>'state','')));
 v_comp text:=nullif(btrim(coalesce(p_data->>'complement','')),'');
 cpf_value text:=regexp_replace(coalesce(p_data->>'cpf',''),'\D','','g');
 email_value text:=lower(btrim(coalesce(p_data->>'email','')));
 name_value text:=btrim(coalesce(p_data->>'full_name',''));
 addr_id uuid;
begin
 if p_tenant is null or p_customer is null or jsonb_typeof(p_data) is distinct from 'object' then return jsonb_build_object('saved',false); end if;
 -- Completa só o que está vazio. CPF de outro cadastro nunca é copiado (a trava do banco recusaria a compra).
 update public.customers c set
  cpf=case when coalesce(btrim(c.cpf),'')='' and cpf_value~'^[0-9]{11}$' and not exists(
    select 1 from public.customers o where o.tenant_id=p_tenant and o.id<>c.id and regexp_replace(coalesce(o.cpf,''),'\D','','g')=cpf_value)
   then cpf_value else c.cpf end,
  email=case when coalesce(btrim(c.email),'')='' and email_value~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then email_value else c.email end,
  full_name=case when coalesce(btrim(c.full_name),'')='' and name_value<>'' then name_value else c.full_name end
 where c.id=p_customer and c.tenant_id=p_tenant;
 if not coalesce(p_delivery,false) then return jsonb_build_object('saved',false); end if;
 if v_zip!~'^[0-9]{8}$' or v_street='' or v_num='' or v_hood='' or v_city='' or v_uf!~'^[A-Z]{2}$' then return jsonb_build_object('saved',false); end if;
 -- O endereço digitado na compra é o endereço atual do cliente.
 update public.customers c set cep=v_zip,endereco=v_street,numero=v_num,bairro=v_hood,cidade=v_city,estado=v_uf,complemento=v_comp
 where c.id=p_customer and c.tenant_id=p_tenant;
 select a.id into addr_id from public.customer_addresses a
 where a.tenant_id=p_tenant and a.customer_id=p_customer
  and regexp_replace(coalesce(a.zip_code,''),'\D','','g')=v_zip
  and lower(btrim(coalesce(a.street,'')))=lower(v_street) and lower(btrim(coalesce(a.number,'')))=lower(v_num)
 order by a.is_default desc nulls last,a.created_at desc nulls last limit 1 for update;
 update public.customer_addresses set is_default=false
 where tenant_id=p_tenant and customer_id=p_customer and is_default and id is distinct from addr_id;
 if addr_id is null then
  insert into public.customer_addresses(tenant_id,customer_id,zip_code,street,number,neighborhood,city,state,complement,is_default)
  values(p_tenant,p_customer,v_zip,v_street,v_num,v_hood,v_city,v_uf,v_comp,true) returning id into addr_id;
 else
  update public.customer_addresses a set zip_code=v_zip,street=v_street,number=v_num,neighborhood=v_hood,city=v_city,
   state=v_uf,complement=v_comp,is_default=true
  where a.id=addr_id;
 end if;
 return jsonb_build_object('saved',true,'address_id',addr_id);
end $$;
revoke all on function political_private.checkout_save_customer(uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function political_private.checkout_save_customer(uuid,uuid,jsonb,boolean) to service_role;

-- Remenda a função atual do checkout no mesmo padrão das correções anteriores (só os dois trechos).
do $$
declare body text;
 find_phone constant text:='=customer->>''whatsapp'' order by created_at limit 1;';
 created constant text:='returning id into cid;end if;';
begin
 select pg_get_functiondef('public.political_checkout_create(uuid,text,jsonb)'::regprocedure) into body;
 if strpos(body,'political_private.checkout_save_customer')>0 then raise notice 'Checkout já grava o endereço no cadastro.'; return; end if;
 if strpos(body,find_phone)=0 or strpos(body,created)=0
  or (length(body)-length(replace(body,find_phone,'')))<>length(find_phone)
  or (length(body)-length(replace(body,created,'')))<>length(created) then
  -- Não derruba o resto do arquivo: a tabela de conferência no final mostra se ficou aplicado.
  raise warning 'A função do checkout mudou; endereço no cadastro NÃO foi aplicado. Avise o desenvolvedor.';return;
 end if;
 body:=replace(body,find_phone,find_phone||E'\n if cid is null and coalesce(customer->>''cpf'','''')~''^[0-9]{11}$'' then select id into cid from public.customers where tenant_id=tid and regexp_replace(coalesce(cpf,''''),''[^0-9]'','''',''g'')=customer->>''cpf'' order by created_at limit 1;end if;');
 body:=replace(body,created,created||E'\n perform political_private.checkout_save_customer(tid,cid,customer,p_payload->>''delivery_method''=''DELIVERY'');');
 execute body;
end $$;

notify pgrst,'reload schema';
commit;

-- 15/10 (dono): na ZERO19 TV, junto do "online", quantas pessoas entraram no site HOJE; e quantas
-- desistiram: antes de chegar no frete, no cálculo do frete (destacando quando nenhum frete chegava
-- antes do 2º turno), no pagamento, e quantas fizeram o pedido.
-- Privacidade: cada aparelho manda um número aleatório que troca TODO DIA (não liga dias diferentes),
-- sem nome, WhatsApp, IP, montagem ou preferência. Só a função do servidor (service_role) lê e grava.
begin;

create table if not exists political_live_private.site_visits(
 tenant_id uuid not null references public.tenants(id),
 day date not null,
 visitor_id uuid not null,
 first_seen timestamptz not null default now(),
 last_seen timestamptz not null default now(),
 composed boolean not null default false,
 carted boolean not null default false,
 freight boolean not null default false,
 freight_result text check(freight_result is null or freight_result in('ON_TIME','LATE','NO_DATE','PICKUP')),
 payment boolean not null default false,
 ordered boolean not null default false,
 primary key(tenant_id,day,visitor_id)
);
create index if not exists political_site_visits_day_idx on political_live_private.site_visits(day);
alter table political_live_private.site_visits enable row level security;
revoke all on political_live_private.site_visits from public,anon,authenticated;
grant all on political_live_private.site_visits to service_role;

-- Uma chamada por batida de presença (10 s) ou mudança de etapa. Etapas só avançam no dia.
create or replace function public.political_site_visit(p_tenant_id uuid,p_visitor_id uuid,p_stage text,p_step text,p_freight text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz:=clock_timestamp(); today date:=(clock_timestamp() at time zone 'America/Sao_Paulo')::date;
 step text:=upper(coalesce(p_step,'')); freight_value text:=upper(coalesce(p_freight,''));
 rank integer;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Operação interna.'; end if;
 if p_tenant_id is distinct from '0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid or p_visitor_id is null then raise exception 'Visita inválida.'; end if;
 rank:=case step when 'ORDER' then 5 when 'PAYMENT' then 4 when 'FREIGHT' then 3 when 'CART' then 2 else 0 end;
 if freight_value not in('ON_TIME','LATE','NO_DATE','PICKUP') or rank<3 then freight_value:=null; end if;
 -- Limite diário contra números aleatórios em massa: não derruba a presença, só deixa de contar.
 if not exists(select 1 from political_live_private.site_visits where tenant_id=p_tenant_id and day=today and visitor_id=p_visitor_id)
  and (select count(*) from political_live_private.site_visits where tenant_id=p_tenant_id and day=today)>=50000 then
  return jsonb_build_object('ok',false);
 end if;
 insert into political_live_private.site_visits as v(tenant_id,day,visitor_id,first_seen,last_seen,composed,carted,freight,freight_result,payment,ordered)
 values(p_tenant_id,today,p_visitor_id,stamp,stamp,p_stage='COMPOSING' or step='COMPOSE',rank>=2,rank>=3,freight_value,rank>=4,rank>=5)
 on conflict(tenant_id,day,visitor_id) do update set
  last_seen=greatest(v.last_seen,excluded.last_seen),
  composed=v.composed or excluded.composed,carted=v.carted or excluded.carted,freight=v.freight or excluded.freight,
  freight_result=coalesce(excluded.freight_result,v.freight_result),payment=v.payment or excluded.payment,ordered=v.ordered or excluded.ordered
 where v.last_seen<=excluded.last_seen-interval '20 seconds'
  or (excluded.composed and not v.composed) or (excluded.carted and not v.carted) or (excluded.freight and not v.freight)
  or (excluded.freight_result is not null and excluded.freight_result is distinct from v.freight_result)
  or (excluded.payment and not v.payment) or (excluded.ordered and not v.ordered);
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.political_site_visit(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.political_site_visit(uuid,uuid,text,text,text) to service_role;

-- Números do dia (fuso de São Paulo). "Desistiu" = parado há 15 min ou mais sem fazer o pedido;
-- quem ainda está mexendo aparece como "ainda no site".
create or replace function public.political_site_funnel_today()
returns jsonb language sql stable security invoker set search_path='' as $$
 with v as (
  select * from political_live_private.site_visits
  where tenant_id='0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid and day=(clock_timestamp() at time zone 'America/Sao_Paulo')::date
 ), q as (select *,not ordered and last_seen<=clock_timestamp()-interval '15 minutes' as quit from v)
 select jsonb_build_object(
  'visitors',count(*),'composed',count(*) filter(where composed),'carted',count(*) filter(where carted),
  'freight',count(*) filter(where freight),'payment',count(*) filter(where payment),'ordered',count(*) filter(where ordered),
  'active',count(*) filter(where not ordered and not quit),
  'quit_before_freight',count(*) filter(where quit and not freight),
  'quit_without_composing',count(*) filter(where quit and not freight and not composed and not carted),
  'quit_after_composing',count(*) filter(where quit and not freight and composed and not carted),
  'quit_with_cart',count(*) filter(where quit and not freight and carted),
  'quit_at_freight',count(*) filter(where quit and freight and not payment),
  'quit_at_freight_late',count(*) filter(where quit and freight and not payment and freight_result='LATE'),
  'quit_at_freight_on_time',count(*) filter(where quit and freight and not payment and freight_result='ON_TIME'),
  'quit_at_freight_no_quote',count(*) filter(where quit and freight and not payment and freight_result is null),
  'quit_at_freight_pickup',count(*) filter(where quit and freight and not payment and freight_result='PICKUP'),
  'quit_at_payment',count(*) filter(where quit and payment),
  'quit_minutes',15,'day',(clock_timestamp() at time zone 'America/Sao_Paulo')::date,'server_time',clock_timestamp())
 from q
$$;
revoke all on function public.political_site_funnel_today() from public,anon,authenticated;
grant execute on function public.political_site_funnel_today() to service_role;

-- Guarda só 90 dias de números do dia.
select cron.schedule('political-site-visits-cleanup','17 4 * * *',$$delete from political_live_private.site_visits where day<current_date-90$$);

notify pgrst,'reload schema';
commit;

-- 15/10 (dono): "as artes por padrão devem vir do studio com 28 de largura e proporcional de altura;
-- somente os 22 com fotos do Flávio vêm com 28 de altura; números sem fotos (0 a 9) com 28 de altura".
-- Respostas do dono: feminina/infantil menores (25/20, como já era a altura); "toda arte com 22 no
-- nome" fica pela altura; só pedidos NOVOS (fila, filmes e pedidos já feitos não mudam).
-- Regra: medida do gênero (masc. 28, fem. 25, inf. 20, do admin) vira a LARGURA da arte comum, com a
-- altura proporcional; arte com "22" no nome e Números Brasil continuam pela ALTURA.
begin;

create or replace function political_private.art_sized_by_height(p_id uuid,p_name text) returns boolean
language sql immutable security definer set search_path='' as $$
 select political_private.brasil_number_digits(p_id::text) is not null or coalesce(p_name,'')~'(^|[^0-9])22([^0-9]|$)'
$$;
revoke all on function political_private.art_sized_by_height(uuid,text) from public,anon;
grant execute on function political_private.art_sized_by_height(uuid,text) to authenticated,service_role;

-- Arte comum: largura = medida do gênero; altura proporcional. art_width_cm vai junto para o servidor
-- usar a proporção exata do arquivo preparado.
create or replace function political_private.generic_brazil_spec(p_spec jsonb,p_width numeric,p_height numeric,p_audience text) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare reference numeric:=(p_spec->>'art_height_cm')::numeric;
begin
 if coalesce(reference,0)<=0 then raise exception 'Configure as medidas de impressão deste modelo no admin.';end if;
 -- Sem largura/altura cadastradas a arte segue pela altura do gênero (nunca trava a compra).
 if coalesce(p_width,0)<=0 or coalesce(p_height,0)<=0 then return p_spec;end if;
 return p_spec||jsonb_build_object('art_height_cm',round(reference*p_height/p_width,4),'art_width_cm',reference);
end $$;
revoke all on function political_private.generic_brazil_spec(jsonb,numeric,numeric,text) from public,anon,authenticated;
grant execute on function political_private.generic_brazil_spec(jsonb,numeric,numeric,text) to service_role;

-- Quem decide se a arte vai pela largura passa a ser o nome/número, não mais "arte com escrita".
-- Troca só a condição dentro das funções atuais (checkout, estúdio, prévia), no padrão das correções anteriores.
do $$
declare f record; def text; changed text; total integer:=0;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('public','political_private','political_live_private') and p.proname<>'generic_brazil_spec'
   and p.prosrc ilike '%generic_brazil_spec(%' and p.prosrc ~* 'not\s+[a-z_]+\.text_personalization'
 loop
  def:=pg_get_functiondef(f.oid);
  changed:=regexp_replace(def,'not\s+([a-z_]+)\.text_personalization(\s+then\s+spec\s*:=\s*political_private\.generic_brazil_spec\()',
   'not political_private.art_sized_by_height(\1.id,\1.name)\2','gi');
  if changed<>def then execute changed;total:=total+1;end if;
 end loop;
 raise notice 'Funções com a regra nova da medida: %',total;
end $$;

notify pgrst,'reload schema';
commit;

-- Conferência (só leitura): estampas que ficam pela ALTURA (com 22 no nome). Os Números Brasil também.
select name as "fica pela altura (22 no nome)" from public.political_prints
where political_private.brasil_number_digits(id::text) is null and political_private.art_sized_by_height(id,name) order by name;

-- ============================================================
-- 8/8 · 15/10 Etapas reais com etiqueta já gerada + "impresso" só pela leitura do QR
-- ============================================================
-- 15/10 (dono): (1) pedido com etiqueta gerada antes de separar/prensar/pronta: as etapas continuam a fazer
-- e podem ser marcadas no QR (antes o banco recusava: "O pedido já está pronto"); só trava depois de PRONTA
-- de verdade (com foto) ou entregue. (2) "Pedido impresso" no Acompanhar meu pedido só com a LEITURA do QR
-- do cupom (abrir pelo número ou mudar etapa não conta). Não muda pedido, pagamento, estoque, frete nem etiqueta.
do $patch$
declare definition text;
  old_guard constant text := 'if before_stage in (''READY'',''SHIPPED'',''DELIVERED'') then raise exception ''O pedido já está pronto. Esta etapa não pode mudar por aqui.''; end if;';
  new_guard constant text := 'if before_stage in (''READY'',''DELIVERED'') or (political_private.zero19_order_progress_row(o.id)->''times''->>''ready_at'') is not null then raise exception ''O pedido já está pronto. Esta etapa não pode mudar por aqui.''; end if;';
begin
  definition := pg_get_functiondef('public.zero19_order_progress_action(uuid,text,text)'::regprocedure);
  if position(new_guard in definition) > 0 then raise notice 'Etapas com etiqueta gerada: já aplicado.';
  elsif position(old_guard in definition) = 0 then raise warning 'Etapas com etiqueta gerada NÃO aplicado: a função mudou. Avise o desenvolvedor.';
  else execute replace(definition, old_guard, new_guard); end if;
end $patch$;

do $patch$
declare definition text;
  old_printed constant text := '(select min(pe.created_at) from public.zero19_order_progress_events pe where pe.order_id = o.id)';
  new_printed constant text := '(select min(pe.created_at) from public.zero19_order_progress_events pe where pe.order_id = o.id and pe.action = ''QR_OPEN'')';
begin
  definition := pg_get_functiondef('political_private.zero19_order_progress_row(uuid)'::regprocedure);
  if position(new_printed in definition) > 0 then raise notice 'Impresso só pelo QR: já aplicado.';
  elsif position(old_printed in definition) = 0 then raise notice 'Impresso: o "pedido impresso" ainda não existe neste banco (nada a mudar).';
  else execute replace(definition, old_printed, new_printed); end if;
end $patch$;

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA (só leitura): todas as linhas devem dizer OK
-- ============================================================
select item as "o que", case when ok then 'OK' else 'NÃO APLICADO — avise o desenvolvedor' end as "situação" from (values
 (1,'Já despachado (13/10)',to_regclass('public.zero19_order_dispatches') is not null),
 (2,'Manter o frete (13/10)',to_regclass('public.zero19_freight_keeps') is not null),
 (3,'Conferir impressão (13/10)',to_regprocedure('public.zero19_qr_activity(uuid[])') is not null),
 (4,'Cancelar sempre (13/10)',not exists(select 1 from pg_trigger where tgname='political_checkout_cancel_guard')),
 (5,'Camisa sem estampa (12/10)',to_regprocedure('political_private.checkout_blank_line(jsonb)') is not null),
 (6,'Etiqueta: gerar de novo (14/10)',to_regprocedure('public.zero19_release_shipping_label(uuid,text,text)') is not null),
 (7,'Endereço do site no cadastro (15/10)',coalesce(pg_get_functiondef(to_regprocedure('public.political_checkout_create(uuid,text,jsonb)')) like '%checkout_save_customer%',false)),
 (8,'ZERO19 TV: entraram hoje e desistências (15/10)',to_regprocedure('public.political_site_funnel_today()') is not null),
 (9,'Medida das artes: largura / 22 e números pela altura (15/10)',to_regprocedure('political_private.art_sized_by_height(uuid,text)') is not null),
 (10,'Etapas do QR com etiqueta já gerada (15/10)',coalesce(pg_get_functiondef(to_regprocedure('public.zero19_order_progress_action(uuid,text,text)')) like '%''times''->>''ready_at''%',false))
) t(n,item,ok) order by n;
