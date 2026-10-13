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
update public.political_catalog_settings set allow_out_of_stock_sales = true;
notify pgrst, 'reload schema';
-- Conferência: deve mostrar true
select allow_out_of_stock_sales from public.political_catalog_settings;
