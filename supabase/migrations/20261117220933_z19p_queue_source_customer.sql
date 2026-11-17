-- Nome do comprador da Venduss nas consultas de produção da equipe ZERO19.
CREATE OR REPLACE FUNCTION venduss_fulfillment_private.zero19_production_buyer_name(p_supplier_order uuid)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT nullif(btrim(buyer.full_name), '')
  FROM public.orders supplier
  JOIN public.venduss_order_integration link ON link.supplier_order_id = supplier.id
    AND link.supplier_tenant_id = supplier.tenant_id AND link.source_order_id = supplier.venduss_source_order_id
  JOIN public.orders original ON original.id = link.source_order_id AND original.tenant_id = link.source_tenant_id
  JOIN public.tenants shop ON shop.id = original.tenant_id AND shop.subdomain = 'venduss'
  JOIN public.customers buyer ON buyer.id = original.customer_id AND buyer.tenant_id = original.tenant_id
  WHERE supplier.id = p_supplier_order AND supplier.tenant_id = '0e885daf-b461-4384-b2c2-8ed2cf33478b'
    AND upper(supplier.origin) = 'VENDUSS' AND NOT coalesce(link.source_deleted, false)
$function$;
REVOKE ALL ON FUNCTION venduss_fulfillment_private.zero19_production_buyer_name(uuid) FROM PUBLIC, anon, authenticated;

-- Keep the installed RPC bodies, access checks and grants. Stop on an unexpected version.
DO $migration$
DECLARE
  edit record;
  body text;
BEGIN
  FOR edit IN SELECT * FROM (VALUES
    ('public.zero19_production_order_queue(uuid[])'::regprocedure, $before$if not political_private.zero19_progress_member() then$before$, $after$if political_private.zero19_progress_member() is not true then$after$, 1),
    ('public.zero19_production_order_queue(uuid[])'::regprocedure, $before$'pickup', q2.pickup, 'paid', q2.paid, 'customer_name', q2.customer_name,$before$, $after$'pickup', q2.pickup, 'paid', q2.paid, 'customer_name', q2.customer_name,
      'source_customer_name', case when upper(q2.origin) = 'VENDUSS' then venduss_fulfillment_private.zero19_production_buyer_name(q2.id) end,$after$, 1),
    ('public.z19p_zero19_order_picker(integer,integer,text)'::regprocedure, $before$auth.uid() is null or v_owner<>$before$, $after$auth.uid() is null or v_owner is distinct from $after$, 1),
    ('public.z19p_zero19_order_picker(integer,integer,text)'::regprocedure, $before$left join public.customers c on c.id=o.customer_id$before$, $after$left join public.customers c on c.id=o.customer_id
    left join lateral (select venduss_fulfillment_private.zero19_production_buyer_name(o.id) as name) buyer
      on o.venduss_source_order_id is not null$after$, 2),
    ('public.z19p_zero19_order_picker(integer,integer,text)'::regprocedure, $before$c.full_name customer_name,$before$, $after$c.full_name customer_name,
      buyer.name as source_customer_name,$after$, 2),
    ('public.z19p_zero19_order_picker(integer,integer,text)'::regprocedure, $before$or lower(coalesce(c.full_name,'')) like '%'||v_query||'%'$before$, $after$or lower(coalesce(c.full_name,'')) like '%'||v_query||'%'
      or lower(buyer.name) like '%'||v_query||'%'$after$, 2),
    ('public.z19p_zero19_order_picker(integer,integer,text)'::regprocedure, $before$'customer_name',coalesce(f.customer_name,'Cliente'),$before$, $after$'customer_name',coalesce(f.customer_name,'Cliente'),
    'source_customer_name',f.source_customer_name,$after$, 1)
  ) AS edits(signature, old_text, new_text, occurrences)
  LOOP
    body := replace(pg_get_functiondef(edit.signature), E'\r\n', E'\n');
    IF (length(body) - length(replace(body, edit.new_text, ''))) / length(edit.new_text) = edit.occurrences THEN
      CONTINUE;
    END IF;
    IF (length(body) - length(replace(body, edit.old_text, ''))) / length(edit.old_text) <> edit.occurrences THEN
      RAISE EXCEPTION 'Unexpected definition for %', edit.signature;
    END IF;
    EXECUTE replace(body, edit.old_text, edit.new_text);
  END LOOP;
END
$migration$;

NOTIFY pgrst, 'reload schema';
