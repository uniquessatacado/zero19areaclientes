-- 15/10 — SÓ CONFERÊNCIA (não muda nada). Rodar no Supabase (SQL Editor) do projeto ZERO19.
-- Compras feitas pelo site COM ENTREGA em que o cadastro do cliente NÃO tem o endereço que ele digitou
-- na última compra. Atenção principal: "sem etiqueta ainda = true" — a etiqueta usa o endereço do
-- cadastro, então confira esses antes de gerar a etiqueta.
with latest as (
 select distinct on (o.customer_id) o.customer_id,o.display_id,o.created_at,pc.snapshot->'customer' c,
  (nullif(o.smartenvios_shipment_id,'') is null and o.label_generated_at is null) sem_etiqueta
 from public.political_checkout_orders pc join public.orders o on o.id=pc.order_id and o.tenant_id=pc.tenant_id
 where pc.snapshot->>'delivery_method'='DELIVERY' and o.status<>'CANCELADO' and o.customer_id is not null
 order by o.customer_id,o.created_at desc
)
select l.display_id as "pedido",cu.full_name as "cliente",l.sem_etiqueta as "sem etiqueta ainda",
 concat_ws(', ',l.c->>'street',l.c->>'number',l.c->>'complement',l.c->>'neighborhood',l.c->>'city',l.c->>'state',l.c->>'zip_code') as "endereço digitado no site",
 coalesce((select concat_ws(', ',a.street,a.number,a.complement,a.neighborhood,a.city,a.state,a.zip_code) from public.customer_addresses a
   where a.customer_id=l.customer_id order by a.is_default desc nulls last,a.created_at desc nulls last limit 1),
  nullif(concat_ws(', ',cu.endereco,cu.numero,cu.bairro,cu.cidade,cu.estado,cu.cep),''),'(cadastro sem endereço)') as "endereço que a etiqueta usaria"
from latest l join public.customers cu on cu.id=l.customer_id
where not exists(select 1 from public.customer_addresses a where a.customer_id=l.customer_id
  and regexp_replace(coalesce(a.zip_code,''),'\D','','g')=regexp_replace(coalesce(l.c->>'zip_code',''),'\D','','g')
  and lower(btrim(coalesce(a.number,'')))=lower(btrim(coalesce(l.c->>'number',''))))
order by l.sem_etiqueta desc,l.display_id desc;
