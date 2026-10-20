-- 20/10/2026 · TUDO que falta rodar no Supabase (pode rodar inteiro de uma vez, pode repetir sem problema).
-- 1) Contato antes do frete · 2) Rankings do site · 3) TV com cenas de 15 a 30 s.

-- 19/10 (dono): "nome e whatsapp peça antes da tela de frete logo depois do carrinho para mesmo que o cliente
-- desista a gente pega o contato dele e vira cliente cadastrado já".
-- O site (Estampa Política) grava nome + WhatsApp assim que o cliente digita, antes do frete:
--  * vira cliente da ZERO19 (mesmo cliente pelo WhatsApp, com ou sem 55, igual ao checkout);
--    cliente que já existia só ganha o nome se estava vazio; contato novo do site (marcado SITE_CONTATO,
--    criado hoje e sem pedido) pode corrigir o próprio nome enquanto a pessoa termina de digitar;
--  * guarda o carrinho daquele momento em political_private.site_contacts (um registro por WhatsApp por dia),
--    para a equipe poder chamar quem desistiu.
-- Não cria pedido, não reserva estoque, não muda frete, pagamento nem produção. Nunca devolve dados do
-- cliente (quem chama só recebe ok), para ninguém descobrir cadastro pelo número.
begin;

create table if not exists political_private.site_contacts(
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  customer_id uuid,
  whatsapp text not null,
  full_name text not null,
  contact_day date not null,
  cart jsonb not null default '[]'::jsonb,
  products_total numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,whatsapp,contact_day)
);
alter table political_private.site_contacts enable row level security;
revoke all on political_private.site_contacts from public,anon,authenticated;

create or replace function public.political_site_contact(p_name text,p_whatsapp text,p_cart jsonb default '[]'::jsonb,p_total numeric default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 tid uuid;
 v_name text:=left(regexp_replace(btrim(coalesce(p_name,'')),'\s+',' ','g'),120);
 v_phone text:=regexp_replace(coalesce(p_whatsapp,''),'\D','','g');
 v_local text; cid uuid; v_ip text; v_count integer;
 v_day date:=(now() at time zone 'America/Sao_Paulo')::date;
 v_cart jsonb:=case when jsonb_typeof(p_cart)='array' and jsonb_array_length(p_cart)<=50 and octet_length(p_cart::text)<=20000 then p_cart else '[]'::jsonb end;
 v_total numeric:=case when p_total between 0 and 1000000 then round(p_total,2) end;
begin
 if v_name!~'[[:alpha:]].*[[:alpha:]]' or v_phone!~'^(55)?[1-9][0-9]9?[0-9]{8}$' then return jsonb_build_object('ok',false); end if;
 v_local:=case when length(v_phone)>=12 and v_phone like '55%' then substr(v_phone,3) else v_phone end;
 select s.tenant_id into tid from public.political_catalog_settings s where s.enabled limit 1;
 if tid is null then return jsonb_build_object('ok',false); end if;
 -- Até 30 contatos a cada 10 minutos por conexão (mesma tabela de limites do site).
 begin v_ip:=split_part(coalesce(current_setting('request.headers',true)::json->>'x-forwarded-for',''),',',1);
 exception when others then v_ip:=''; end;
 insert into political_private.request_limits(key,count) values('site-contact:'||md5(coalesce(nullif(v_ip,''),'?')),1)
 on conflict(key) do update set
  count=case when political_private.request_limits.window_start<now()-interval '10 minutes' then 1 else political_private.request_limits.count+1 end,
  window_start=case when political_private.request_limits.window_start<now()-interval '10 minutes' then now() else political_private.request_limits.window_start end
 returning count into v_count;
 if v_count>30 then return jsonb_build_object('ok',false); end if;

 perform pg_advisory_xact_lock(hashtextextended(tid::text||':checkout_customer:'||v_phone,0));
 select c.id into cid from public.customers c
 where c.tenant_id=tid and regexp_replace(coalesce(c.whatsapp,''),'[^0-9]','','g') in (v_local,'55'||v_local)
 order by c.created_at limit 1;
 if cid is null then
  insert into public.customers(tenant_id,full_name,whatsapp,customer_type,tags,observacao)
  values(tid,v_name,v_phone,'USO_PROPRIO',array['SITE_CONTATO'],'Contato deixado no site Estampa Política antes do frete ('||to_char(v_day,'DD/MM/YYYY')||').')
  returning id into cid;
 else
  update public.customers c set full_name=v_name
  where c.id=cid and (coalesce(btrim(c.full_name),'')='' or ('SITE_CONTATO'=any(coalesce(c.tags,'{}'::text[]))
   and (c.created_at at time zone 'America/Sao_Paulo')::date=v_day
   and not exists(select 1 from public.orders o where o.customer_id=c.id)));
 end if;

 insert into political_private.site_contacts(tenant_id,customer_id,whatsapp,full_name,contact_day,cart,products_total)
 values(tid,cid,v_local,v_name,v_day,v_cart,v_total)
 on conflict(tenant_id,whatsapp,contact_day) do update set
  customer_id=excluded.customer_id,full_name=excluded.full_name,
  cart=case when jsonb_array_length(excluded.cart)>0 then excluded.cart else political_private.site_contacts.cart end,
  products_total=coalesce(excluded.products_total,political_private.site_contacts.products_total),updated_at=now();
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.political_site_contact(text,text,jsonb,numeric) from public;
grant execute on function public.political_site_contact(text,text,jsonb,numeric) to anon,authenticated,service_role;

commit;

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

-- 20/10 (dono): TV com cenas mais longas ("mais tempo mostrando tipo de 15 a 30 segundos").
-- Só a ZERO19 e só se ainda estiver no padrão antigo (5–10 s): um tempo escolhido no painel continua valendo.
begin;
update public.store_tv_settings set scene_min_seconds=15, scene_max_seconds=30
where tenant_id='0e885daf-b461-4384-b2c2-8ed2cf33478b' and scene_min_seconds=5 and scene_max_seconds=10;
commit;
