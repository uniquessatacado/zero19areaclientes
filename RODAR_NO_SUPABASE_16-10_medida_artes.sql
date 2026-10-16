-- 16/10 (dono): 8 artes novas no estúdio. "os que tem numero 22 padrao masculino altura 28, feminino 23,
-- infantil 18 cm; as outras 2 (Bolsonaro pisando no Lula) com 30 cm de largura".
-- Respostas do dono: 28/23/18 vale para TODAS as artes com 22 no nome (só pedidos novos); as duas
-- "pisando" ficam 30 (masculina/lisa adulto), 25 (feminina) e 20 (infantil) de LARGURA, altura proporcional.
-- Regra nova (substitui a de 15/10 só nesses dois pontos):
--   1) medida própria da arte (political_prints.art_size_cm) quando existir;
--   2) Números Brasil: altura do gênero no admin (28/25/20), como antes;
--   3) "22" no nome: ALTURA 28/23/18;
--   4) demais artes: LARGURA do gênero no admin (28/25/20), altura proporcional (regra de 15/10).
-- Fila, filmes e pedidos já feitos não mudam (a medida fica gravada no pedido).
begin;

alter table public.political_prints add column if not exists art_size_cm jsonb;
alter table public.political_prints drop constraint if exists political_prints_art_size_cm_check;
alter table public.political_prints add constraint political_prints_art_size_cm_check check (
 art_size_cm is null or (jsonb_typeof(art_size_cm)='object' and art_size_cm->>'by' in ('width','height'))
);
comment on column public.political_prints.art_size_cm is
 'Medida própria da arte por gênero: {"by":"width"|"height","MEN":cm,"WOMEN":cm,"KIDS":cm}. Vazio = regra geral.';

create or replace function political_private.print_art_spec(p_spec jsonb,p_id uuid,p_name text,p_width numeric,p_height numeric,p_audience text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare o jsonb; v numeric;
 g text:=case upper(coalesce(p_audience,'')) when 'WOMEN' then 'WOMEN' when 'KIDS' then 'KIDS' else 'MEN' end;
begin
 if p_id is not null then select art_size_cm into o from public.political_prints where id=p_id;end if;
 if jsonb_typeof(o)='object' and jsonb_typeof(o->g)='number' and (o->>g)::numeric>0 then
  v:=(o->>g)::numeric;
  if o->>'by'='height' then return (p_spec-'art_width_cm')||jsonb_build_object('art_height_cm',v);end if;
  if o->>'by'='width' and coalesce(p_width,0)>0 and coalesce(p_height,0)>0 then
   return p_spec||jsonb_build_object('art_height_cm',round(v*p_height/p_width,4),'art_width_cm',v);
  end if;
 end if;
 if p_id is not null and political_private.brasil_number_digits(p_id::text) is not null then return p_spec;end if;
 if coalesce(p_name,'')~'(^|[^0-9])22([^0-9]|$)' then
  return (p_spec-'art_width_cm')||jsonb_build_object('art_height_cm',case g when 'WOMEN' then 23 when 'KIDS' then 18 else 28 end);
 end if;
 return political_private.generic_brazil_spec(p_spec,p_width,p_height,p_audience);
end $$;
revoke all on function political_private.print_art_spec(jsonb,uuid,text,numeric,numeric,text) from public,anon;
grant execute on function political_private.print_art_spec(jsonb,uuid,text,numeric,numeric,text) to authenticated,service_role;

-- As duas artes do Bolsonaro pisando no Lula (cadastradas 16/10).
update public.political_prints set art_size_cm='{"by":"width","MEN":30,"WOMEN":25,"KIDS":20}'::jsonb
where id in ('f901a045-a3cf-4339-b768-61b67c93911a','597c8c91-4169-4db6-a401-438f25b215f0');

-- Checkout, estúdio, prévia e TV: troca só a condição da medida (padrão das correções de 15/10).
do $$
declare f record; def text; changed text; total integer:=0;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('public','political_private','political_live_private') and p.proname not in('generic_brazil_spec','print_art_spec')
   and p.prosrc ilike '%political_private.art_sized_by_height(%' and p.prosrc ilike '%generic_brazil_spec(%'
 loop
  def:=pg_get_functiondef(f.oid);
  changed:=regexp_replace(def,
   'not\s+political_private\.art_sized_by_height\(([a-z_]+)\.id,\s*[a-z_]+\.name\)(\s+then\s+spec\s*:=\s*)political_private\.generic_brazil_spec\(spec,',
   'true\2political_private.print_art_spec(spec,\1.id,\1.name,','gi');
  if changed<>def then execute changed;total:=total+1;end if;
 end loop;
 -- Pode rodar de novo: na segunda vez não troca nada, mas as 4 já estão com a regra nova.
 select count(*) into total from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in('public','political_private','political_live_private') and p.prosrc ilike '%political_private.print_art_spec(spec,%';
 if total<4 then raise exception 'Esperava 4 funções com a medida por arte (checkout, estúdio, itens e TV) e achei %. Nada foi gravado.',total;end if;
 raise notice 'Funções com a medida por arte: %',total;
end $$;

-- Catálogo público passa a mandar a medida própria para a prévia do estúdio.
do $$
declare def text; changed text;
begin
 select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='political_private' and p.proname='catalog';
 if def is null then raise exception 'Função do catálogo não encontrada.';end if;
 if def ilike '%''art_size_cm''%' then return;end if;
 changed:=replace(def,'''height_cm'',height_cm,','''height_cm'',height_cm,''art_size_cm'',art_size_cm,');
 if changed=def then raise exception 'Não achei onde incluir a medida no catálogo. Nada foi gravado.';end if;
 execute changed;
end $$;

notify pgrst,'reload schema';
commit;

-- Conferência (só leitura): medida que cada arte terá nos próximos pedidos.
select p.name as arte,
 political_private.print_art_spec('{"art_height_cm":28}'::jsonb,p.id,p.name,p.width_cm,p.height_cm,'MEN')->>'art_height_cm' as "masc. altura",
 political_private.print_art_spec('{"art_height_cm":25}'::jsonb,p.id,p.name,p.width_cm,p.height_cm,'WOMEN')->>'art_height_cm' as "fem. altura",
 political_private.print_art_spec('{"art_height_cm":20}'::jsonb,p.id,p.name,p.width_cm,p.height_cm,'KIDS')->>'art_height_cm' as "inf. altura",
 coalesce(political_private.print_art_spec('{"art_height_cm":28}'::jsonb,p.id,p.name,p.width_cm,p.height_cm,'MEN')->>'art_width_cm','pela altura') as "masc. largura"
from public.political_prints p
where p.enabled and political_private.brasil_number_digits(p.id::text) is null and (p.art_size_cm is not null or p.name~'(^|[^0-9])22([^0-9]|$)')
order by p.sort_order,p.name;
