-- 15/10 — rodar UMA vez no Supabase (SQL Editor) do projeto ZERO19. Pode rodar de novo sem problema.
-- 1) Endereço digitado no checkout do site vai para o cadastro do cliente (compras novas).
-- 2) ZERO19 TV: pessoas que entraram hoje e onde desistiram.
-- 3) Medida das artes do estúdio: comum pela LARGURA (28/25/20), 22 no nome e números pela ALTURA (pedidos novos).
-- No final aparece a lista das estampas que ficam pela altura (com 22 no nome).

-- 15/10 (dono): "endereço que cliente está cadastrando no site não está ficando salvo no cadastro do cliente".
-- Causas no checkout do site (political_checkout_create):
--  1) cliente que já existia (mesmo WhatsApp) era reaproveitado SEM gravar o endereço novo;
--  2) cliente novo ganhava o endereço só nas colunas internas de customers, nunca na ficha de
--     endereço (customer_addresses) — que é o que a tela do cliente mostra e a etiqueta usa primeiro;
--  3) WhatsApp novo com CPF já cadastrado em outro cliente travava a compra ("CPF ja vinculado").
-- Correção (só para compras feitas daqui para frente): mesmo cliente por WhatsApp ou, sem ele, pelo
-- CPF; o endereço digitado vira o endereço principal do cadastro (customers + customer_addresses).
-- CPF/e-mail/nome só completam o que estava vazio. Não muda pedido, valor, frete, pagamento,
-- estoque, produção nem etiqueta já gerada.
begin;

create or replace function political_private.checkout_save_customer(p_tenant uuid,p_customer uuid,p_data jsonb,p_delivery boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_zip text:=regexp_replace(coalesce(p_data->>'zip_code',''),'\D','','g');
 v_street text:=btrim(coalesce(p_data->>'street',''));
 v_num text:=btrim(coalesce(p_data->>'number',''));
 v_hood text:=btrim(coalesce(p_data->>'neighborhood',''));
 v_city text:=btrim(coalesce(p_data->>'city',''));
 v_uf text:=upper(btrim(coalesce(p_data->>'state','')));
 v_comp text:=nullif(btrim(coalesce(p_data->>'complement','')),'');
 cpf_value text:=regexp_replace(coalesce(p_data->>'cpf',''),'\D','','g');
 email_value text:=lower(btrim(coalesce(p_data->>'email','')));
 name_value text:=btrim(coalesce(p_data->>'full_name',''));
 addr_id uuid;
begin
 if p_tenant is null or p_customer is null or jsonb_typeof(p_data) is distinct from 'object' then return jsonb_build_object('saved',false); end if;
 -- Completa só o que está vazio. CPF de outro cadastro nunca é copiado (a trava do banco recusaria a compra).
 update public.customers c set
  cpf=case when coalesce(btrim(c.cpf),'')='' and cpf_value~'^[0-9]{11}$' and not exists(
    select 1 from public.customers o where o.tenant_id=p_tenant and o.id<>c.id and regexp_replace(coalesce(o.cpf,''),'\D','','g')=cpf_value)
   then cpf_value else c.cpf end,
  email=case when coalesce(btrim(c.email),'')='' and email_value~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then email_value else c.email end,
  full_name=case when coalesce(btrim(c.full_name),'')='' and name_value<>'' then name_value else c.full_name end
 where c.id=p_customer and c.tenant_id=p_tenant;
 if not coalesce(p_delivery,false) then return jsonb_build_object('saved',false); end if;
 if v_zip!~'^[0-9]{8}$' or v_street='' or v_num='' or v_hood='' or v_city='' or v_uf!~'^[A-Z]{2}$' then return jsonb_build_object('saved',false); end if;
 -- O endereço digitado na compra é o endereço atual do cliente.
 update public.customers c set cep=v_zip,endereco=v_street,numero=v_num,bairro=v_hood,cidade=v_city,estado=v_uf,complemento=v_comp
 where c.id=p_customer and c.tenant_id=p_tenant;
 select a.id into addr_id from public.customer_addresses a
 where a.tenant_id=p_tenant and a.customer_id=p_customer
  and regexp_replace(coalesce(a.zip_code,''),'\D','','g')=v_zip
  and lower(btrim(coalesce(a.street,'')))=lower(v_street) and lower(btrim(coalesce(a.number,'')))=lower(v_num)
 order by a.is_default desc nulls last,a.created_at desc nulls last limit 1 for update;
 update public.customer_addresses set is_default=false
 where tenant_id=p_tenant and customer_id=p_customer and is_default and id is distinct from addr_id;
 if addr_id is null then
  insert into public.customer_addresses(tenant_id,customer_id,zip_code,street,number,neighborhood,city,state,complement,is_default)
  values(p_tenant,p_customer,v_zip,v_street,v_num,v_hood,v_city,v_uf,v_comp,true) returning id into addr_id;
 else
  update public.customer_addresses a set zip_code=v_zip,street=v_street,number=v_num,neighborhood=v_hood,city=v_city,
   state=v_uf,complement=v_comp,is_default=true
  where a.id=addr_id;
 end if;
 return jsonb_build_object('saved',true,'address_id',addr_id);
end $$;
revoke all on function political_private.checkout_save_customer(uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function political_private.checkout_save_customer(uuid,uuid,jsonb,boolean) to service_role;

-- Remenda a função atual do checkout no mesmo padrão das correções anteriores (só os dois trechos).
do $$
declare body text;
 find_phone constant text:='=customer->>''whatsapp'' order by created_at limit 1;';
 created constant text:='returning id into cid;end if;';
begin
 select pg_get_functiondef('public.political_checkout_create(uuid,text,jsonb)'::regprocedure) into body;
 if strpos(body,'political_private.checkout_save_customer')>0 then raise notice 'Checkout já grava o endereço no cadastro.'; return; end if;
 if strpos(body,find_phone)=0 or strpos(body,created)=0
  or (length(body)-length(replace(body,find_phone,'')))<>length(find_phone)
  or (length(body)-length(replace(body,created,'')))<>length(created) then
  raise exception 'A função do checkout mudou; nada foi alterado. Avise o desenvolvedor.';
 end if;
 body:=replace(body,find_phone,find_phone||E'\n if cid is null and coalesce(customer->>''cpf'','''')~''^[0-9]{11}$'' then select id into cid from public.customers where tenant_id=tid and regexp_replace(coalesce(cpf,''''),''[^0-9]'','''',''g'')=customer->>''cpf'' order by created_at limit 1;end if;');
 body:=replace(body,created,created||E'\n perform political_private.checkout_save_customer(tid,cid,customer,p_payload->>''delivery_method''=''DELIVERY'');');
 execute body;
end $$;

notify pgrst,'reload schema';
commit;

-- 15/10 (dono): na ZERO19 TV, junto do "online", quantas pessoas entraram no site HOJE; e quantas
-- desistiram: antes de chegar no frete, no cálculo do frete (destacando quando nenhum frete chegava
-- antes do 2º turno), no pagamento, e quantas fizeram o pedido.
-- Privacidade: cada aparelho manda um número aleatório que troca TODO DIA (não liga dias diferentes),
-- sem nome, WhatsApp, IP, montagem ou preferência. Só a função do servidor (service_role) lê e grava.
begin;

create table if not exists political_live_private.site_visits(
 tenant_id uuid not null references public.tenants(id),
 day date not null,
 visitor_id uuid not null,
 first_seen timestamptz not null default now(),
 last_seen timestamptz not null default now(),
 composed boolean not null default false,
 carted boolean not null default false,
 freight boolean not null default false,
 freight_result text check(freight_result is null or freight_result in('ON_TIME','LATE','NO_DATE','PICKUP')),
 payment boolean not null default false,
 ordered boolean not null default false,
 primary key(tenant_id,day,visitor_id)
);
create index if not exists political_site_visits_day_idx on political_live_private.site_visits(day);
alter table political_live_private.site_visits enable row level security;
revoke all on political_live_private.site_visits from public,anon,authenticated;
grant all on political_live_private.site_visits to service_role;

-- Uma chamada por batida de presença (10 s) ou mudança de etapa. Etapas só avançam no dia.
create or replace function public.political_site_visit(p_tenant_id uuid,p_visitor_id uuid,p_stage text,p_step text,p_freight text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz:=clock_timestamp(); today date:=(clock_timestamp() at time zone 'America/Sao_Paulo')::date;
 step text:=upper(coalesce(p_step,'')); freight_value text:=upper(coalesce(p_freight,''));
 rank integer;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Operação interna.'; end if;
 if p_tenant_id is distinct from '0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid or p_visitor_id is null then raise exception 'Visita inválida.'; end if;
 rank:=case step when 'ORDER' then 5 when 'PAYMENT' then 4 when 'FREIGHT' then 3 when 'CART' then 2 else 0 end;
 if freight_value not in('ON_TIME','LATE','NO_DATE','PICKUP') or rank<3 then freight_value:=null; end if;
 -- Limite diário contra números aleatórios em massa: não derruba a presença, só deixa de contar.
 if not exists(select 1 from political_live_private.site_visits where tenant_id=p_tenant_id and day=today and visitor_id=p_visitor_id)
  and (select count(*) from political_live_private.site_visits where tenant_id=p_tenant_id and day=today)>=50000 then
  return jsonb_build_object('ok',false);
 end if;
 insert into political_live_private.site_visits as v(tenant_id,day,visitor_id,first_seen,last_seen,composed,carted,freight,freight_result,payment,ordered)
 values(p_tenant_id,today,p_visitor_id,stamp,stamp,p_stage='COMPOSING' or step='COMPOSE',rank>=2,rank>=3,freight_value,rank>=4,rank>=5)
 on conflict(tenant_id,day,visitor_id) do update set
  last_seen=greatest(v.last_seen,excluded.last_seen),
  composed=v.composed or excluded.composed,carted=v.carted or excluded.carted,freight=v.freight or excluded.freight,
  freight_result=coalesce(excluded.freight_result,v.freight_result),payment=v.payment or excluded.payment,ordered=v.ordered or excluded.ordered
 where v.last_seen<=excluded.last_seen-interval '20 seconds'
  or (excluded.composed and not v.composed) or (excluded.carted and not v.carted) or (excluded.freight and not v.freight)
  or (excluded.freight_result is not null and excluded.freight_result is distinct from v.freight_result)
  or (excluded.payment and not v.payment) or (excluded.ordered and not v.ordered);
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.political_site_visit(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.political_site_visit(uuid,uuid,text,text,text) to service_role;

-- Números do dia (fuso de São Paulo). "Desistiu" = parado há 15 min ou mais sem fazer o pedido;
-- quem ainda está mexendo aparece como "ainda no site".
create or replace function public.political_site_funnel_today()
returns jsonb language sql stable security invoker set search_path='' as $$
 with v as (
  select * from political_live_private.site_visits
  where tenant_id='0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid and day=(clock_timestamp() at time zone 'America/Sao_Paulo')::date
 ), q as (select *,not ordered and last_seen<=clock_timestamp()-interval '15 minutes' as quit from v)
 select jsonb_build_object(
  'visitors',count(*),'composed',count(*) filter(where composed),'carted',count(*) filter(where carted),
  'freight',count(*) filter(where freight),'payment',count(*) filter(where payment),'ordered',count(*) filter(where ordered),
  'active',count(*) filter(where not ordered and not quit),
  'quit_before_freight',count(*) filter(where quit and not freight),
  'quit_without_composing',count(*) filter(where quit and not freight and not composed and not carted),
  'quit_after_composing',count(*) filter(where quit and not freight and composed and not carted),
  'quit_with_cart',count(*) filter(where quit and not freight and carted),
  'quit_at_freight',count(*) filter(where quit and freight and not payment),
  'quit_at_freight_late',count(*) filter(where quit and freight and not payment and freight_result='LATE'),
  'quit_at_freight_on_time',count(*) filter(where quit and freight and not payment and freight_result='ON_TIME'),
  'quit_at_freight_no_quote',count(*) filter(where quit and freight and not payment and freight_result is null),
  'quit_at_freight_pickup',count(*) filter(where quit and freight and not payment and freight_result='PICKUP'),
  'quit_at_payment',count(*) filter(where quit and payment),
  'quit_minutes',15,'day',(clock_timestamp() at time zone 'America/Sao_Paulo')::date,'server_time',clock_timestamp())
 from q
$$;
revoke all on function public.political_site_funnel_today() from public,anon,authenticated;
grant execute on function public.political_site_funnel_today() to service_role;

-- Guarda só 90 dias de números do dia.
select cron.schedule('political-site-visits-cleanup','17 4 * * *',$$delete from political_live_private.site_visits where day<current_date-90$$);

notify pgrst,'reload schema';
commit;

-- 15/10 (dono): "as artes por padrão devem vir do studio com 28 de largura e proporcional de altura;
-- somente os 22 com fotos do Flávio vêm com 28 de altura; números sem fotos (0 a 9) com 28 de altura".
-- Respostas do dono: feminina/infantil menores (25/20, como já era a altura); "toda arte com 22 no
-- nome" fica pela altura; só pedidos NOVOS (fila, filmes e pedidos já feitos não mudam).
-- Regra: medida do gênero (masc. 28, fem. 25, inf. 20, do admin) vira a LARGURA da arte comum, com a
-- altura proporcional; arte com "22" no nome e Números Brasil continuam pela ALTURA.
begin;

create or replace function political_private.art_sized_by_height(p_id uuid,p_name text) returns boolean
language sql immutable security definer set search_path='' as $$
 select political_private.brasil_number_digits(p_id::text) is not null or coalesce(p_name,'')~'(^|[^0-9])22([^0-9]|$)'
$$;
revoke all on function political_private.art_sized_by_height(uuid,text) from public,anon;
grant execute on function political_private.art_sized_by_height(uuid,text) to authenticated,service_role;

-- Arte comum: largura = medida do gênero; altura proporcional. art_width_cm vai junto para o servidor
-- usar a proporção exata do arquivo preparado.
create or replace function political_private.generic_brazil_spec(p_spec jsonb,p_width numeric,p_height numeric,p_audience text) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare reference numeric:=(p_spec->>'art_height_cm')::numeric;
begin
 if coalesce(reference,0)<=0 then raise exception 'Configure as medidas de impressão deste modelo no admin.';end if;
 -- Sem largura/altura cadastradas a arte segue pela altura do gênero (nunca trava a compra).
 if coalesce(p_width,0)<=0 or coalesce(p_height,0)<=0 then return p_spec;end if;
 return p_spec||jsonb_build_object('art_height_cm',round(reference*p_height/p_width,4),'art_width_cm',reference);
end $$;
revoke all on function political_private.generic_brazil_spec(jsonb,numeric,numeric,text) from public,anon,authenticated;
grant execute on function political_private.generic_brazil_spec(jsonb,numeric,numeric,text) to service_role;

-- Quem decide se a arte vai pela largura passa a ser o nome/número, não mais "arte com escrita".
-- Troca só a condição dentro das funções atuais (checkout, estúdio, prévia), no padrão das correções anteriores.
do $$
declare f record; def text; changed text; total integer:=0;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('public','political_private','political_live_private') and p.proname<>'generic_brazil_spec'
   and p.prosrc ilike '%generic_brazil_spec(%' and p.prosrc ~* 'not\s+[a-z_]+\.text_personalization'
 loop
  def:=pg_get_functiondef(f.oid);
  changed:=regexp_replace(def,'not\s+([a-z_]+)\.text_personalization(\s+then\s+spec\s*:=\s*political_private\.generic_brazil_spec\()',
   'not political_private.art_sized_by_height(\1.id,\1.name)\2','gi');
  if changed<>def then execute changed;total:=total+1;end if;
 end loop;
 raise notice 'Funções com a regra nova da medida: %',total;
end $$;

notify pgrst,'reload schema';
commit;

-- Conferência (só leitura): estampas que ficam pela ALTURA (com 22 no nome). Os Números Brasil também.
select name as "fica pela altura (22 no nome)" from public.political_prints
where political_private.brasil_number_digits(id::text) is null and political_private.art_sized_by_height(id,name) order by name;
