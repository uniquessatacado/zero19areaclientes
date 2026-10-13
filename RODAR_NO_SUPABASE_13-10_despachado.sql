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
