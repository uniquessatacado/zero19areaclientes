-- A financial reversal is not a reversal of supplier separation/production.
do $patch$
declare definition text; anchor text:='v_next_status := CASE';
begin
  definition:=pg_get_functiondef('public.reverse_manual_order_payment(uuid)'::regprocedure);
  if position(anchor in definition)=0 then raise exception 'Review payment reversal before patching'; end if;
  execute replace(definition,anchor,anchor||E'\n    WHEN v_order.venduss_source_order_id IS NOT NULL THEN v_order.status');
end $patch$;
notify pgrst,'reload schema';
