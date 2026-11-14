-- 14/11 (dono: "no sistema do cliente que compra só DTF, uma opção de colocar uma observação na arte que ele adicionar no filme, ex.:
-- 'a arte não está pronta, preciso que remova o fundo'; quando chegar no nosso sistema, ao adicionar no filme fica o alerta do que temos
-- que fazer e NÃO deixa jogar no filme, só se apertarmos 'arte pronta' ou fizermos a modificação e substituirmos por outra, mantendo as
-- medidas e a quantidade que o cliente pediu").
-- (1) z19p_dtf_send_film passa a levar a observação de cada arte (items[].note, até 300 letras) para sent_items.
-- (2) z19p_dtf_staff_resolve_item: a equipe marca a arte como pronta (mesmo arquivo) ou troca pelo arquivo modificado (fixedPath);
--     medida e quantidade continuam as do cliente; a miniatura do cliente continua a dele.
begin;

do $patch$
declare d text; a text := $a$'widthCm', v_w, 'heightCm', v_h, 'quantity', v_q, 'widthPx', a.width_px, 'heightPx', a.height_px);$a$;
begin
  d := pg_get_functiondef('public.z19p_dtf_send_film(uuid, numeric, text, text)'::regprocedure);
  if position('''note''' in d) > 0 then return; end if;
  if position(a in d) = 0 then raise exception 'send_film: trecho não encontrado'; end if;
  d := replace(d, a, $b$'widthCm', v_w, 'heightCm', v_h, 'quantity', v_q, 'widthPx', a.width_px, 'heightPx', a.height_px,
      'note', nullif(left(btrim(coalesce(v_item->>'note', '')), 300), ''));$b$);
  execute d;
end $patch$;

create or replace function public.z19p_dtf_staff_resolve_item(p_film_id uuid, p_index integer, p_path text default null, p_width_px integer default null, p_height_px integer default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_owner uuid := public.z19p_dtf_assert_staff(); f public.z19p_dtf_films; v_item jsonb; v_size bigint;
begin
  select f2.* into f from public.z19p_dtf_films f2 join public.z19p_dtf_clients c on c.id = f2.client_id
    where f2.id = p_film_id and c.owner_id = v_owner for update of f2;
  if not found then raise exception 'Pedido DTF não encontrado.'; end if;
  if f.status not in ('sent', 'printing', 'ready') then raise exception 'Este pedido não está em aberto.'; end if;
  if p_index is null or p_index < 0 or p_index >= jsonb_array_length(coalesce(f.sent_items, '[]'::jsonb)) then raise exception 'Arte não encontrada no pedido.'; end if;
  v_item := f.sent_items->p_index;
  v_item := v_item || jsonb_build_object('resolved', true, 'resolvedAt', now(), 'resolvedBy', auth.uid());
  if p_path is not null then
    if p_path !~ ('^' || v_owner::text || '/dtf-fix/' || p_film_id::text || '/[0-9a-f-]{36}\.png$') then raise exception 'Arquivo inválido.'; end if;
    select (o.metadata->>'size')::bigint into v_size from storage.objects o where o.bucket_id = 'z19p-private' and o.name = p_path;
    if coalesce(v_size, 0) <= 0 then raise exception 'O arquivo modificado não chegou. Envie de novo.'; end if;
    if coalesce(p_width_px, 0) < 10 or coalesce(p_height_px, 0) < 10 then raise exception 'Imagem inválida.'; end if;
    v_item := v_item || jsonb_build_object('fixedPath', p_path, 'fixedWidthPx', p_width_px, 'fixedHeightPx', p_height_px, 'fixedAt', now());
  end if;
  update public.z19p_dtf_films set sent_items = jsonb_set(sent_items, array[p_index::text], v_item), updated_at = now() where id = f.id;
  return jsonb_build_object('success', true, 'item', v_item);
end $$;
revoke all on function public.z19p_dtf_staff_resolve_item(uuid, integer, text, integer, integer) from public, anon;
grant execute on function public.z19p_dtf_staff_resolve_item(uuid, integer, text, integer, integer) to authenticated;
commit;
