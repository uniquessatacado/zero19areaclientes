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
