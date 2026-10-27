-- TV ZERO19 (27/10, dono: "reformule o zero19 tv… agora coisa da loja… mais vendidos e promoções").
-- Mais vendidos da LOJA para a TV pública (lojazero19.com/tv e descanso do totem).
-- Só leitura, só a ZERO19, só produtos ativos com foto e estoque. Devolve nome, foto, preço,
-- unidades vendidas e estoque: nunca cliente, pedido ou valor recebido.
create or replace function public.zero19_tv_store_best_sellers(p_days integer default 30, p_limit integer default 12)
returns table(product_id bigint, name text, image_url text, price numeric, sold bigint, available bigint)
language sql stable security definer set search_path = '' as $$
  with params as (
    select greatest(1, least(coalesce(p_days, 30), 365)) as days, greatest(1, least(coalesce(p_limit, 12), 30)) as lim
  ),
  sales as (
    select i.product_id, sum(greatest(coalesce(i.quantity, 0), 0))::bigint as sold
    from public.order_items i
    join public.orders o on o.id = i.order_id
    cross join params
    where o.tenant_id = '0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid
      and o.created_at >= now() - make_interval(days => params.days)
      and upper(coalesce(o.status, '')) not like 'CANCEL%'
      and upper(coalesce(o.status, '')) not in ('DEVOLVIDO', 'DEVOLVIDA')
      and i.product_id is not null
      and coalesce(i.excluido, 'N') not in ('S', '1')
    group by i.product_id
  ),
  stock as (
    select v.product_id, sum(greatest(coalesce(v.available_quantity, 0), 0))::bigint as available
    from public.product_variants v
    where v.product_id in (select s.product_id from sales s)
      and coalesce(v.excluido, 'N') not in ('S', '1')
    group by v.product_id
  )
  select p.id, p.name::text, p.main_image_url::text, p.price, s.sold, coalesce(st.available, 0)
  from sales s
  join public.products p on p.id = s.product_id
  left join stock st on st.product_id = p.id
  where p.tenant_id = '0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid
    and p.is_active is true
    and coalesce(p.main_image_url, '') <> ''
    and coalesce(st.available, 0) > 0
  order by s.sold desc, p.id
  limit (select lim from params);
$$;
revoke all on function public.zero19_tv_store_best_sellers(integer, integer) from public;
grant execute on function public.zero19_tv_store_best_sellers(integer, integer) to anon, authenticated;
