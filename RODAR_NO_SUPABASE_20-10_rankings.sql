-- 20/10 (dono): "faça rank de estampas mais vendidas também, cria rank de frases mais compradas e etc!!!
-- dinâmica total no site mas sem dificultar a compra do cliente".
-- Rankings do site com o que foi VENDIDO de verdade: aplicações da produção (z19p_zero19_work_items) de pedidos
-- pagos e não cancelados, do site e do PDV.
--  * Estampas: só as do catálogo que estão ligadas; conta camisas.
--  * Frases (escrita de cima e de baixo): só entram com 3 pedidos ou mais (nome de pessoa comprado uma vez nunca
--    aparece); variações iguais (acento, ponto, espaço) viram uma só, mostrada do jeito mais comprado.
--  * Cada frase também é contada pela coleção (Bolsonaro/Lula) da arte comprada na MESMA camisa do pedido: o site
--    mostra a quem está na coleção do Lula só frases compradas com arte do Lula (e vice-versa), sem adivinhar.
--  * A equipe pode esconder uma estampa ou frase do ranking (political_private.ranking_hidden).
-- Só leitura de pedidos: não muda pedido, produção, estoque nem preço. O site recebe só nome/frase e quantidade.
begin;

create table if not exists political_private.ranking_hidden(
  tenant_id uuid not null,
  kind text not null check (kind in ('PRINT','PHRASE')),
  key text not null,
  label text,
  hidden_by uuid,
  hidden_at timestamptz not null default now(),
  primary key(tenant_id,kind,key)
);
alter table political_private.ranking_hidden enable row level security;
revoke all on political_private.ranking_hidden from public,anon,authenticated;

create or replace function political_private.phrase_key(p_text text) returns text
language sql immutable set search_path='' as $$
  select regexp_replace(translate(upper(btrim(coalesce(p_text,''))),'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ','AAAAAEEEEIIIIOOOOOUUUUCN'),'[^A-Z0-9]','','g')
$$;

create or replace function political_private.rankings(p_tenant uuid, p_admin boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_prints jsonb; v_phrases jsonb; v_limit integer:=case when p_admin then 40 else 12 end;
begin
  with apps as (
    select w.kind, w.order_id, greatest(coalesce(w.quantity,1),1) qty, d.value->'production' prod, w.text_value
    from public.z19p_zero19_work_items w
    join public.orders o on o.id=w.order_id and o.tenant_id=p_tenant and o.status<>'CANCELADO'
    cross join lateral jsonb_array_elements(case when jsonb_typeof(w.metadata->'details')='array' then w.metadata->'details' else '[]'::jsonb end) d
    where w.tenant_id=p_tenant and w.kind in ('NEW_ART','PHRASE') and coalesce(w.stage,'') not in ('cancelled','awaiting_release')
  ), sold as (
    select pp.id, pp.name, pp.preview_url, pp.candidate, sum(a.qty) sold, count(distinct a.order_id) orders
    from apps a join public.political_prints pp on pp.id::text=a.prod->>'source_political_print_id' and pp.tenant_id=p_tenant and pp.enabled
    where a.kind='NEW_ART' group by pp.id, pp.name, pp.preview_url, pp.candidate
  ), ranked as (
    select s.*, h.key is not null hidden, row_number() over (order by s.sold desc, s.orders desc, s.name) position
    from sold s left join political_private.ranking_hidden h on h.tenant_id=p_tenant and h.kind='PRINT' and h.key=s.id::text
    where p_admin or h.key is null
  )
  select coalesce(jsonb_agg(jsonb_build_object('print_id',r.id,'name',r.name,'preview_url',r.preview_url,'candidate',r.candidate,'sold',r.sold,'rank',r.position)
    || case when p_admin then jsonb_build_object('orders',r.orders,'hidden',r.hidden) else '{}'::jsonb end order by r.position),'[]'::jsonb)
  into v_prints from ranked r where r.position<=v_limit;

  with apps as (
    select w.order_id, greatest(coalesce(w.quantity,1),1) qty, d.value->'production' prod, w.text_value
    from public.z19p_zero19_work_items w
    join public.orders o on o.id=w.order_id and o.tenant_id=p_tenant and o.status<>'CANCELADO'
    cross join lateral jsonb_array_elements(case when jsonb_typeof(w.metadata->'details')='array' then w.metadata->'details' else '[]'::jsonb end) d
    where w.tenant_id=p_tenant and w.kind='PHRASE' and coalesce(w.stage,'') not in ('cancelled','awaiting_release')
  ), rows_ as (
    select case a.prod->>'position_code' when 'back_upper' then 'TOP' when 'back_lower' then 'BOTTOM' else 'OTHER' end pos,
      upper(btrim(regexp_replace(coalesce(nullif(a.prod->>'original_text',''),a.text_value,''),'\s+',' ','g'))) txt, a.order_id, a.qty,
      (select pp.candidate from public.z19p_zero19_work_items w2
        cross join lateral jsonb_array_elements(case when jsonb_typeof(w2.metadata->'details')='array' then w2.metadata->'details' else '[]'::jsonb end) d2
        join public.political_prints pp on pp.id::text=d2.value->'production'->>'source_political_print_id'
        where w2.order_id=a.order_id and w2.tenant_id=p_tenant and w2.kind='NEW_ART' and coalesce(a.prod->>'garment_key','')<>''
          and d2.value->'production'->>'garment_key'=a.prod->>'garment_key' limit 1) candidate
    from apps a
  ), keyed as (
    select r.*, political_private.phrase_key(r.txt) k from rows_ r where char_length(r.txt) between 2 and 60
  ), labels as (
    select distinct on (k) k, txt from (select k, txt, sum(qty) q from keyed group by k, txt) v order by k, q desc, txt
  ), phrases as (
    select k.k, l.txt, sum(k.qty) sold, count(distinct k.order_id) orders,
      coalesce(sum(k.qty) filter (where k.pos='TOP'),0) top_sold, coalesce(sum(k.qty) filter (where k.pos='BOTTOM'),0) bottom_sold,
      coalesce(sum(k.qty) filter (where k.candidate='BOLSONARO'),0) bolsonaro_sold, coalesce(sum(k.qty) filter (where k.candidate='LULA'),0) lula_sold
    from keyed k join labels l on l.k=k.k where k.k<>'' group by k.k, l.txt having count(distinct k.order_id)>=3
  ), ranked as (
    select p.*, h.key is not null hidden, row_number() over (order by p.sold desc, p.orders desc, p.txt) position
    from phrases p left join political_private.ranking_hidden h on h.tenant_id=p_tenant and h.kind='PHRASE' and h.key=p.k
    where p_admin or h.key is null
  )
  select coalesce(jsonb_agg(jsonb_build_object('text',r.txt,'sold',r.sold,'top',r.top_sold,'bottom',r.bottom_sold,'bolsonaro',r.bolsonaro_sold,'lula',r.lula_sold,'rank',r.position)
    || case when p_admin then jsonb_build_object('key',r.k,'orders',r.orders,'hidden',r.hidden) else '{}'::jsonb end order by r.position),'[]'::jsonb)
  into v_phrases from ranked r where r.position<=case when p_admin then 60 else 30 end;

  return jsonb_build_object('updated_at',now(),'prints',v_prints,'phrases',v_phrases);
end $$;
revoke all on function political_private.rankings(uuid,boolean) from public,anon,authenticated;

-- Site (público): sem dados de cliente nem de pedido, só o ranking.
create or replace function public.political_rankings()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tid uuid;
begin
  select s.tenant_id into tid from public.political_catalog_settings s where s.enabled limit 1;
  if tid is null then return jsonb_build_object('prints','[]'::jsonb,'phrases','[]'::jsonb); end if;
  return political_private.rankings(tid,false);
end $$;
revoke all on function public.political_rankings() from public;
grant execute on function public.political_rankings() to anon,authenticated,service_role;

-- Painel (equipe ZERO19): ranking completo com o que está escondido.
create or replace function public.political_rankings_admin()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tid uuid;
begin
  select s.tenant_id into tid from public.political_catalog_settings s limit 1;
  if tid is null or not coalesce(political_private.can_manage(tid),false) then raise exception 'Acesso não autorizado.' using errcode='42501'; end if;
  return political_private.rankings(tid,true);
end $$;
revoke all on function public.political_rankings_admin() from public,anon;
grant execute on function public.political_rankings_admin() to authenticated,service_role;

create or replace function public.political_ranking_hide(p_kind text,p_key text,p_label text,p_hidden boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tid uuid;
begin
  select s.tenant_id into tid from public.political_catalog_settings s limit 1;
  if tid is null or not coalesce(political_private.can_manage(tid),false) then raise exception 'Acesso não autorizado.' using errcode='42501'; end if;
  if p_kind not in ('PRINT','PHRASE') or coalesce(btrim(p_key),'')='' or char_length(p_key)>120 then raise exception 'Item do ranking inválido.'; end if;
  if coalesce(p_hidden,false) then
    insert into political_private.ranking_hidden(tenant_id,kind,key,label,hidden_by) values(tid,p_kind,btrim(p_key),left(p_label,120),auth.uid())
    on conflict(tenant_id,kind,key) do update set label=excluded.label,hidden_by=excluded.hidden_by,hidden_at=now();
  else
    delete from political_private.ranking_hidden where tenant_id=tid and kind=p_kind and key=btrim(p_key);
  end if;
  return jsonb_build_object('ok',true,'hidden',coalesce(p_hidden,false));
end $$;
revoke all on function public.political_ranking_hide(text,text,text,boolean) from public,anon;
grant execute on function public.political_ranking_hide(text,text,text,boolean) to authenticated,service_role;

commit;
