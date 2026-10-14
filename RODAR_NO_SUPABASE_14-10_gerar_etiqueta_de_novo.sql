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
