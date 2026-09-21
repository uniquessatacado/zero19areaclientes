-- v2.17.11: additive service quotes, release validation and export allocations.
-- Filename matches the version assigned by Supabase apply_migration.
-- No backfill of payments/artwork, no stock or delivery inference.
begin;
create schema if not exists z19p_private;
revoke all on schema z19p_private from public,anon;
grant usage on schema z19p_private to authenticated;

alter table public.z19p_quotes add column if not exists service_type text
  check(service_type in ('full_shirt','dtf_only','customer_shirt','refurbishment'));
alter table public.z19p_quotes add column if not exists schema_version integer;
alter table public.z19p_quotes add column if not exists official_mockup_asset_id uuid references public.z19p_assets(id) on delete set null;
alter table public.z19p_projects add column if not exists service_type text;
alter table public.z19p_quote_items add column if not exists item_kind text
  check(item_kind in ('product','art','application','removal'));
alter table public.z19p_quote_items add column if not exists reference_asset_id uuid references public.z19p_assets(id) on delete restrict;
alter table public.z19p_quote_items add column if not exists final_asset_id uuid references public.z19p_assets(id) on delete restrict;
alter table public.z19p_quote_items add column if not exists metadata jsonb not null default '{}'::jsonb;
create index if not exists z19p_quote_items_quote_kind_idx on public.z19p_quote_items(quote_id,item_kind);
create index if not exists z19p_quote_items_reference_idx on public.z19p_quote_items(reference_asset_id) where reference_asset_id is not null;
create index if not exists z19p_quote_items_final_idx on public.z19p_quote_items(final_asset_id) where final_asset_id is not null;
create index if not exists z19p_quotes_mockup_idx on public.z19p_quotes(official_mockup_asset_id) where official_mockup_asset_id is not null;

create table if not exists public.z19p_film_exports (
 id uuid not null, owner_id uuid not null references auth.users(id), fingerprint text not null,
 items jsonb not null, created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
 primary key(owner_id,id), unique(owner_id,fingerprint),
 check(fingerprint ~ '^[a-f0-9]{64}$'), check(jsonb_typeof(items)='array')
);
create table if not exists public.z19p_film_allocations (
 owner_id uuid not null references auth.users(id), film_item_id uuid not null,
 quote_item_id uuid not null references public.z19p_quote_items(id) on delete restrict,
 project_id uuid not null references public.z19p_projects(id) on delete restrict,
 asset_id uuid not null references public.z19p_assets(id) on delete restrict,
 quantity integer not null check(quantity>0), first_export_id uuid not null,
 created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
 primary key(owner_id,film_item_id),
 foreign key(owner_id,first_export_id) references public.z19p_film_exports(owner_id,id) on delete restrict
);
create index if not exists z19p_film_allocations_quote_idx on public.z19p_film_allocations(quote_item_id);
create index if not exists z19p_film_allocations_project_idx on public.z19p_film_allocations(project_id);
create index if not exists z19p_film_allocations_asset_idx on public.z19p_film_allocations(asset_id);
create index if not exists z19p_film_allocations_export_idx on public.z19p_film_allocations(owner_id,first_export_id);
create index if not exists z19p_film_allocations_creator_idx on public.z19p_film_allocations(created_by);
create index if not exists z19p_film_exports_creator_idx on public.z19p_film_exports(created_by);
alter table public.z19p_film_exports enable row level security;
alter table public.z19p_film_allocations enable row level security;
revoke all on public.z19p_film_exports,public.z19p_film_allocations from anon,authenticated;
grant select on public.z19p_film_exports,public.z19p_film_allocations to authenticated;
grant all on public.z19p_film_exports,public.z19p_film_allocations to service_role;
create policy z19p_film_exports_read on public.z19p_film_exports for select to authenticated
 using(owner_id=(select public.z19p_current_account_owner()) and exists(select 1 from public.z19p_profiles where id=(select auth.uid()) and active));
create policy z19p_film_allocations_read on public.z19p_film_allocations for select to authenticated
 using(owner_id=(select public.z19p_current_account_owner()) and exists(select 1 from public.z19p_profiles where id=(select auth.uid()) and active));

-- One validator for saving, direct writes at release, and exported item eligibility.
create or replace function public.z19p_quote_release_issues(p_quote_id uuid,p_prepared boolean default true)
returns text[] language plpgsql stable security invoker set search_path='' as $$
declare q public.z19p_quotes%rowtype; i public.z19p_quote_items%rowtype;
 issues text[]:='{}'; n integer:=0; total numeric:=0; unit numeric; arts integer:=0;
 products integer:=0; applications integer:=0; removals integer:=0; mockup_row public.z19p_assets%rowtype; layer jsonb;
begin
 select * into q from public.z19p_quotes where id=p_quote_id and owner_id=public.z19p_current_account_owner();
 if not found then return array['Orçamento não encontrado nesta conta.']; end if;
 for i in select * from public.z19p_quote_items where quote_id=q.id loop
  n:=n+1;
  if i.owner_id<>q.owner_id or i.quantity is null or i.quantity<=0 then issues:=array_append(issues,'Quantidade ou vínculo inválido no orçamento.'); continue; end if;
  if i.pricing_mode='piece_plus_print' then
   if jsonb_typeof(i.prints) is distinct from 'array' or i.piece_price is null or i.piece_price<0 then issues:=array_append(issues,'Preço incompleto no orçamento.'); continue; end if;
   begin
    if exists(select 1 from jsonb_array_elements(i.prints) x where x->>'price' is null or (x->>'price')::numeric<0) then raise exception 'price'; end if;
    select coalesce(sum((x->>'price')::numeric),0)+i.piece_price into unit from jsonb_array_elements(i.prints) x;
   exception when others then issues:=array_append(issues,'Preço inválido no orçamento.'); continue; end;
  elsif i.pricing_mode='total_unit' then unit:=i.total_unit_price;
  else unit:=null; end if;
  if unit is null or unit<0 or unit::text in ('NaN','Infinity','-Infinity') then issues:=array_append(issues,'Preço inválido no orçamento.'); continue; end if;
  total:=total+i.quantity*unit;
  if q.service_type is null then continue; end if;
  if i.item_kind is null or i.pricing_mode<>'piece_plus_print' then issues:=array_append(issues,'Revise os itens do serviço.'); continue; end if;
  if i.item_kind='product' then
   products:=products+1;
   if q.service_type<>'full_shirt' or jsonb_array_length(i.prints)<>0 or not exists(select 1 from public.z19p_products where id=i.product_id and owner_id=q.owner_id) then issues:=array_append(issues,'Produto não pertence a este serviço/conta.'); end if;
  else
   if i.piece_price<>0 or jsonb_array_length(i.prints)<>1 then issues:=array_append(issues,'Serviço cobrado em duplicidade ou sem preço.'); end if;
   if i.product_id is not null then issues:=array_append(issues,'Serviço sem venda de camiseta não pode vincular produto.'); end if;
  end if;
  if i.item_kind='art' then
   arts:=arts+1;
   if not exists(select 1 from public.z19p_assets where id=i.reference_asset_id and owner_id=q.owner_id and workspace_id=q.workspace_id and asset_type='arte') then issues:=array_append(issues,'Escolha uma arte de referência desta empresa.'); end if;
   if i.final_asset_id is not null and not exists(select 1 from public.z19p_assets where id=i.final_asset_id and owner_id=q.owner_id and workspace_id=q.workspace_id and asset_type='arte') then issues:=array_append(issues,'A arte final não pertence a esta empresa.'); end if;
   if p_prepared and not exists(select 1 from public.z19p_assets a join public.z19p_asset_print_profiles p on p.asset_id=a.id and p.owner_id=q.owner_id where a.id=i.final_asset_id and a.owner_id=q.owner_id and a.workspace_id=q.workspace_id and a.asset_type='arte' and coalesce(a.processed_path,a.original_path) is not null and p.ready_for_print and p.default_width_cm>0 and p.default_height_cm>0 and p.default_width_cm::text not in ('NaN','Infinity','-Infinity') and p.default_height_cm::text not in ('NaN','Infinity','-Infinity')) then issues:=array_append(issues,'Vincule a arte final pronta, com medidas, a cada estampa orçada.'); end if;
  elsif i.item_kind='application' then applications:=applications+1;
   if q.service_type='dtf_only' then issues:=array_append(issues,'Somente DTF não inclui aplicação.'); end if;
  elsif i.item_kind='removal' then removals:=removals+1;
   if q.service_type<>'refurbishment' then issues:=array_append(issues,'Remoção só se aplica à reforma.'); end if;
   if unit=0 and coalesce((i.metadata->>'removal_free')::boolean,false) is not true then issues:=array_append(issues,'Confirme explicitamente a remoção gratuita.'); end if;
  end if;
 end loop;
 if n=0 then issues:=array_append(issues,'Salve um orçamento com itens válidos antes de liberar.'); end if;
 if total<=0 then issues:=array_append(issues,'O total do orçamento precisa ser positivo.'); end if;
 if q.service_type is not null then
  if arts=0 then issues:=array_append(issues,'Adicione ao menos uma arte ao orçamento.'); end if;
  if q.service_type='full_shirt' and products=0 then issues:=array_append(issues,'Selecione a camiseta vendida.'); end if;
  if q.service_type<>'dtf_only' and applications=0 then issues:=array_append(issues,'Informe a aplicação, mesmo quando gratuita.'); end if;
  if q.service_type='refurbishment' and removals=0 then issues:=array_append(issues,'Informe a remoção ou marque como gratuita.'); end if;
 end if;
 if p_prepared then
  if q.service_type is null and not exists(select 1 from public.z19p_assets a join public.z19p_asset_print_profiles p on p.asset_id=a.id where a.project_id=q.project_id and a.owner_id=q.owner_id and a.workspace_id=q.workspace_id and p.owner_id=q.owner_id and p.ready_for_print and p.default_width_cm>0 and p.default_height_cm>0 and p.default_width_cm::text not in ('NaN','Infinity','-Infinity') and p.default_height_cm::text not in ('NaN','Infinity','-Infinity') and coalesce(a.processed_path,a.original_path) is not null) then issues:=array_append(issues,'Prepare uma arte final com medidas para este projeto.'); end if;
  if coalesce(q.service_type,'full_shirt')<>'dtf_only' then
   select * into mockup_row from public.z19p_assets where owner_id=q.owner_id and workspace_id=q.workspace_id and asset_type='mockup' and project_id=q.project_id and (id=q.official_mockup_asset_id or q.service_type is null) and coalesce(processed_path,original_path) is not null order by created_at desc limit 1;
   if not found then issues:=array_append(issues,'Salve e selecione o mockup oficial deste pedido.');
   elsif q.service_type is not null then
    if coalesce(mockup_row.metadata->>'official_mockup','false')<>'true' or jsonb_typeof(mockup_row.metadata->'garment_scene'->'layers') is distinct from 'array' then issues:=array_append(issues,'O mockup oficial precisa registrar artes, medidas e posições.');
    else
     if jsonb_array_length(mockup_row.metadata->'garment_scene'->'layers')=0 then issues:=array_append(issues,'Adicione as artes finais ao mockup oficial.'); end if;
     for layer in select value from jsonb_array_elements(mockup_row.metadata->'garment_scene'->'layers') loop
      if coalesce(layer->>'width','') !~ '^[0-9]+([.][0-9]+)?$' or coalesce(layer->>'ratio','') !~ '^[0-9]+([.][0-9]+)?$' or coalesce(layer->>'x','') !~ '^-?[0-9]+([.][0-9]+)?$' or coalesce(layer->>'y','') !~ '^-?[0-9]+([.][0-9]+)?$' or coalesce(layer->>'side','') not in ('front','back','left','right') then issues:=array_append(issues,'O mockup precisa de medidas e posições numéricas válidas.');
      elsif (layer->>'width')::numeric<=0 or (layer->>'ratio')::numeric<=0 then issues:=array_append(issues,'As medidas do mockup devem ser positivas.'); end if;
      if not exists(select 1 from public.z19p_assets where id::text=layer->>'assetId' and owner_id=q.owner_id and workspace_id=q.workspace_id and asset_type='arte') then issues:=array_append(issues,'O mockup contém uma arte fora desta empresa.'); end if;
     end loop;
     if exists(select 1 from public.z19p_quote_items qi where qi.quote_id=q.id and qi.item_kind='art' and qi.final_asset_id is not null and not exists(select 1 from jsonb_array_elements(mockup_row.metadata->'garment_scene'->'layers') l where l->>'assetId'=qi.final_asset_id::text)) then issues:=array_append(issues,'O mockup oficial precisa mostrar cada arte final orçada.'); end if;
     if exists(select 1 from public.z19p_quote_items qi join public.z19p_asset_print_profiles ap on ap.asset_id=qi.final_asset_id and ap.owner_id=q.owner_id where qi.quote_id=q.id and qi.item_kind='art' and not exists(select 1 from jsonb_array_elements(mockup_row.metadata->'garment_scene'->'layers') l where l->>'assetId'=qi.final_asset_id::text and case when coalesce(l->>'width','') ~ '^[0-9]+([.][0-9]+)?$' and coalesce(l->>'ratio','') ~ '^[0-9]+([.][0-9]+)?$' then abs((l->>'width')::numeric-ap.default_width_cm)<=.01 and abs((l->>'width')::numeric/nullif((l->>'ratio')::numeric,0)-ap.default_height_cm)<=.01 else false end)) then issues:=array_append(issues,'Atualize o mockup oficial com as medidas atuais das artes finais.'); end if;
    end if;
   end if;
  end if;
 end if;
 return array(select distinct unnest(issues));
end $$;
revoke all on function public.z19p_quote_release_issues(uuid,boolean) from public,anon;
grant execute on function public.z19p_quote_release_issues(uuid,boolean) to authenticated;

create or replace function public.z19p_save_service_quote(p_quote jsonb,p_items jsonb,p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare own uuid:=public.z19p_current_account_owner(); q public.z19p_quotes%rowtype; p public.z19p_projects%rowtype;
 qid uuid:=(p_quote->>'id')::uuid; row jsonb; iid uuid; previous public.z19p_quote_items%rowtype; ids uuid[]:='{}'; issues text[]; paid boolean:=false;
begin
 if auth.uid() is null or not exists(select 1 from public.z19p_profiles where id=auth.uid() and active) then raise exception 'Entre novamente para salvar.'; end if;
 if qid is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>500 then raise exception 'Orçamento inválido.'; end if;
 select * into p from public.z19p_projects where id=(p_quote->>'project_id')::uuid and workspace_id=(p_quote->>'workspace_id')::uuid and owner_id=own for update;
 if not found or p.finalized_at is not null or p.desisted_at is not null or exists(select 1 from public.z19p_statuses where id=p.status_id and is_finalized) then raise exception 'Projeto encerrado ou fora desta empresa. Crie um novo projeto.'; end if;
 select * into q from public.z19p_quotes where id=qid and owner_id=own for update;
 if found then
  if q.project_id<>p.id or q.workspace_id<>p.workspace_id then raise exception 'Vínculo do orçamento não pode mudar.'; end if;
  if p_expected_updated_at is distinct from q.updated_at then raise exception 'Orçamento alterado em outra tela. Reabra antes de salvar.'; end if;
  paid:=q.payment_status='paid';
  if paid and q.service_type is distinct from p_quote->>'service_type' then raise exception 'Serviço de orçamento pago não pode mudar.'; end if;
 else
  insert into public.z19p_quotes(id,owner_id,workspace_id,project_id,title,created_by,updated_by)
  values(qid,own,p.workspace_id,p.id,coalesce(p_quote->>'title','Orçamento'),auth.uid(),auth.uid());
 end if;
 if p_quote->>'service_type' is null then raise exception 'Selecione o tipo de serviço.'; end if;
 if nullif(p_quote->>'official_mockup_asset_id','') is not null and not exists(select 1 from public.z19p_assets where id=(p_quote->>'official_mockup_asset_id')::uuid and owner_id=own and workspace_id=p.workspace_id and project_id=p.id and asset_type='mockup') then raise exception 'Mockup fora deste pedido.'; end if;
 update public.z19p_quotes set title=coalesce(nullif(btrim(p_quote->>'title'),''),'Orçamento'),delivery_date=nullif(p_quote->>'delivery_date','')::date,delivery_term=p_quote->>'delivery_term',notes=p_quote->>'notes',service_type=p_quote->>'service_type',schema_version=2,official_mockup_asset_id=nullif(p_quote->>'official_mockup_asset_id','')::uuid,updated_at=clock_timestamp(),updated_by=auth.uid() where id=qid and owner_id=own;
 for row in select value from jsonb_array_elements(p_items) loop
  iid:=(row->>'id')::uuid;
  if iid is null or iid=any(ids) then raise exception 'Item repetido ou sem identificação.'; end if; ids:=array_append(ids,iid);
  if row->>'item_kind'='art' and not exists(select 1 from public.z19p_assets where id=nullif(row->>'reference_asset_id','')::uuid and owner_id=own and workspace_id=p.workspace_id and asset_type='arte') then raise exception 'Escolha uma arte de referência desta empresa.'; end if;
  if nullif(row->>'final_asset_id','') is not null and not exists(select 1 from public.z19p_assets where id=(row->>'final_asset_id')::uuid and owner_id=own and workspace_id=p.workspace_id and asset_type='arte') then raise exception 'A arte final não pertence a esta empresa.'; end if;
  if jsonb_typeof(coalesce(row->'metadata','{}'::jsonb)) is distinct from 'object' then raise exception 'Metadados do item inválidos.'; end if;
  select * into previous from public.z19p_quote_items where id=iid;
  if found and (previous.quote_id<>qid or previous.owner_id<>own) then raise exception 'Item pertence a outro orçamento.'; end if;
  if paid and (not found or previous.quantity is distinct from (row->>'quantity')::integer or previous.product_id is distinct from nullif(row->>'product_id','')::uuid or previous.item_kind is distinct from row->>'item_kind' or previous.reference_asset_id is distinct from nullif(row->>'reference_asset_id','')::uuid or previous.piece_price is distinct from (row->>'piece_price')::numeric or previous.prints is distinct from row->'prints') then raise exception 'Valores, quantidades e referências do orçamento pago são imutáveis.'; end if;
  if exists(select 1 from public.z19p_film_allocations where quote_item_id=iid) and previous.final_asset_id is distinct from nullif(row->>'final_asset_id','')::uuid then raise exception 'Esta arte já entrou em filme. Preserve seu vínculo de produção.'; end if;
  insert into public.z19p_quote_items(id,owner_id,quote_id,product_id,product_name,quantity,pricing_mode,piece_price,total_unit_price,prints,sort_order,item_kind,reference_asset_id,final_asset_id,metadata,created_by,updated_by)
  values(iid,own,qid,nullif(row->>'product_id','')::uuid,row->>'product_name',(row->>'quantity')::integer,'piece_plus_print',(row->>'piece_price')::numeric,null,row->'prints',coalesce((row->>'sort_order')::integer,0),row->>'item_kind',nullif(row->>'reference_asset_id','')::uuid,nullif(row->>'final_asset_id','')::uuid,coalesce(row->'metadata','{}'::jsonb),auth.uid(),auth.uid())
  on conflict(id) do update set product_id=excluded.product_id,product_name=excluded.product_name,quantity=excluded.quantity,pricing_mode=excluded.pricing_mode,piece_price=excluded.piece_price,total_unit_price=null,prints=excluded.prints,sort_order=excluded.sort_order,item_kind=excluded.item_kind,reference_asset_id=excluded.reference_asset_id,final_asset_id=excluded.final_asset_id,metadata=excluded.metadata,updated_by=auth.uid(),updated_at=clock_timestamp();
 end loop;
 if paid and exists(select 1 from public.z19p_quote_items where quote_id=qid and not(id=any(ids))) then raise exception 'Não remova itens de um orçamento pago.'; end if;
 delete from public.z19p_quote_items where quote_id=qid and owner_id=own and not(id=any(ids));
 issues:=public.z19p_quote_release_issues(qid,false);
 if cardinality(issues)>0 then raise exception '%',array_to_string(issues,' '); end if;
 update public.z19p_projects set service_type=(select sq.service_type from public.z19p_quotes sq where sq.project_id=p.id and sq.owner_id=own order by (sq.payment_status='paid') desc,sq.updated_at desc,sq.id limit 1),updated_at=clock_timestamp() where id=p.id and owner_id=own;
 select * into q from public.z19p_quotes where id=qid;
 return to_jsonb(q);
end $$;
revoke all on function public.z19p_save_service_quote(jsonb,jsonb,timestamptz) from public,anon;
grant execute on function public.z19p_save_service_quote(jsonb,jsonb,timestamptz) to authenticated;

-- Preserve paid figures through direct Data API writes as well as the save RPC.
create or replace function public.z19p_guard_paid_service_quote()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.payment_status='paid' and row(old.owner_id,old.workspace_id,old.project_id,old.service_type,old.schema_version,old.payment_status)
  is distinct from row(new.owner_id,new.workspace_id,new.project_id,new.service_type,new.schema_version,new.payment_status) then
  raise exception 'O vínculo, serviço e pagamento do orçamento pago são imutáveis.';
 end if;
 return new;
end $$;
revoke all on function public.z19p_guard_paid_service_quote() from public,anon,authenticated;
create trigger z19p_guard_paid_service_quote before update on public.z19p_quotes for each row execute function public.z19p_guard_paid_service_quote();

create or replace function public.z19p_guard_paid_quote_item()
returns trigger language plpgsql security invoker set search_path='' as $$
declare q public.z19p_quotes%rowtype; previous public.z19p_quote_items%rowtype; target_quote uuid;
begin
 if tg_op='DELETE' then previous:=old; target_quote:=old.quote_id;
 else
  target_quote:=new.quote_id;
  if tg_op='INSERT' then select * into previous from public.z19p_quote_items where id=new.id; else previous:=old; end if;
  if previous.id is not null and row(previous.owner_id,previous.quote_id,previous.id) is distinct from row(new.owner_id,new.quote_id,new.id) then raise exception 'O item não pode mudar de orçamento.'; end if;
 end if;
 -- Serialize edits with payment confirmation (which locks this same parent).
 select * into q from public.z19p_quotes where id=target_quote for update;
 if not found or q.owner_id<>coalesce(new.owner_id,old.owner_id) then raise exception 'Item fora do orçamento da conta.'; end if;
 if q.payment_status='paid' then
  if tg_op='DELETE' or previous.id is null then raise exception 'Não adicione nem remova itens de orçamento pago.'; end if;
  if row(previous.product_id,previous.product_name,previous.quantity,previous.pricing_mode,previous.piece_price,previous.total_unit_price,previous.prints,previous.item_kind,previous.reference_asset_id)
   is distinct from row(new.product_id,new.product_name,new.quantity,new.pricing_mode,new.piece_price,new.total_unit_price,new.prints,new.item_kind,new.reference_asset_id) then raise exception 'Valores, quantidades e referências do orçamento pago são imutáveis.'; end if;
 end if;
 if exists(select 1 from public.z19p_film_allocations where quote_item_id=previous.id) and (tg_op='DELETE' or previous.final_asset_id is distinct from new.final_asset_id) then raise exception 'Esta arte já entrou em filme. Preserve seu vínculo de produção.'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function public.z19p_guard_paid_quote_item() from public,anon,authenticated;
create trigger z19p_guard_paid_quote_item before insert or update or delete on public.z19p_quote_items for each row execute function public.z19p_guard_paid_quote_item();

-- Preserve the existing commission calculation, adding a row lock before its
-- paid check so concurrent confirmations cannot reset a decided commission.
do $payment_lock$
declare definition text; anchor text:='select * into v_quote from public.z19p_quotes where id=p_quote_id and owner_id=v_owner;';
begin
 if to_regprocedure('public.z19p_mark_quote_paid(uuid)') is not null then
  select pg_get_functiondef('public.z19p_mark_quote_paid(uuid)'::regprocedure) into definition;
  if position(anchor in definition)>0 then
   definition:=replace(definition,anchor,'if auth.uid() is null or not exists(select 1 from public.z19p_profiles where id=auth.uid() and active) then raise exception ''Autenticação ativa obrigatória.''; end if; select * into v_quote from public.z19p_quotes where id=p_quote_id and owner_id=v_owner for update;');
   execute definition;
  elsif position('where id=p_quote_id and owner_id=v_owner for update;' in definition)=0 then raise exception 'Rotina de pagamento mudou. Revise a trava antes da migration.'; end if;
 end if;
end $payment_lock$;

-- Consistent lock order with saving a quote: project, then quote/payment.
create or replace function public.z19p_mark_quote_paid_for_production(p_quote_id uuid,p_delivery_date date)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare own uuid:=public.z19p_current_account_owner(); project_id uuid; q public.z19p_quotes%rowtype; result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.z19p_profiles where id=auth.uid() and active) then raise exception 'Autenticação ativa obrigatória.'; end if;
 if p_delivery_date is null then raise exception 'Data de entrega obrigatória.'; end if;
 select sq.project_id into project_id from public.z19p_quotes sq where sq.id=p_quote_id and sq.owner_id=own;
 if not found then raise exception 'Orçamento não encontrado.'; end if;
 if project_id is not null then
  perform 1 from public.z19p_projects p where p.id=project_id and p.owner_id=own for update;
  if not found then raise exception 'Projeto não encontrado nesta conta.'; end if;
 end if;
 select * into q from public.z19p_quotes sq where sq.id=p_quote_id and sq.owner_id=own for update;
 if not found or q.project_id is distinct from project_id then raise exception 'Pedido alterado em outra tela. Reabra antes de confirmar.'; end if;
 update public.z19p_quotes set delivery_date=p_delivery_date,updated_at=clock_timestamp(),updated_by=auth.uid() where id=q.id and owner_id=own;
 if project_id is not null then update public.z19p_projects p set delivery_date=p_delivery_date,updated_at=clock_timestamp(),updated_by=auth.uid() where p.id=project_id and p.owner_id=own; end if;
 result:=public.z19p_mark_quote_paid(p_quote_id);
 return coalesce(result,'{}'::jsonb)||jsonb_build_object('delivery_date',p_delivery_date,'project_id',project_id);
end $$;
revoke all on function public.z19p_mark_quote_paid_for_production(uuid,date) from public,anon;
grant execute on function public.z19p_mark_quote_paid_for_production(uuid,date) to authenticated;

-- Existing paid/delivery rule retained; preparing artwork needs no mockup yet.
create or replace function public.z19p_validate_project_transition()
returns trigger language plpgsql security invoker set search_path='' as $$
declare stage text; final boolean; q record; issues text[];
begin
 if tg_op='UPDATE' and new.status_id is not distinct from old.status_id then return new; end if;
 select queue_stage,is_finalized into stage,final from public.z19p_statuses where id=new.status_id and owner_id=new.owner_id;
 if stage in ('art_work','ready_production','production') then
  if auth.uid() is null or not exists(select 1 from public.z19p_profiles where id=auth.uid() and active) then raise exception 'Autenticação ativa obrigatória.'; end if;
  if tg_op='INSERT' then raise exception 'Comece o pedido no atendimento; salve o orçamento antes de liberar.'; end if;
  if old.finalized_at is not null or old.desisted_at is not null or exists(select 1 from public.z19p_statuses where id=old.status_id and is_finalized) then raise exception 'Pedido encerrado. Crie um novo projeto para preservar o histórico.'; end if;
  if new.delivery_date is null then raise exception 'Defina a data de entrega antes de liberar.'; end if;
  if not exists(select 1 from public.z19p_quotes where project_id=new.id and workspace_id=new.workspace_id and owner_id=new.owner_id and payment_status='paid') then raise exception 'Crie um orçamento válido e confirme o pagamento antes de liberar.'; end if;
  for q in select id from public.z19p_quotes where project_id=new.id and workspace_id=new.workspace_id and owner_id=new.owner_id and payment_status='paid' loop
   issues:=public.z19p_quote_release_issues(q.id,stage in ('ready_production','production'));
   if cardinality(issues)>0 then raise exception '%',array_to_string(issues,' '); end if;
  end loop;
 end if;
 new.status_entered_at=now();
 if coalesce(final,false) and new.finalized_at is null then new.finalized_at=now(); end if;
 return new;
end $$;
revoke all on function public.z19p_validate_project_transition() from public,anon,authenticated;

-- Read-only balance. An unavailable RPC is an error, never an empty ready list.
create or replace function public.z19p_pending_film_items()
returns jsonb language sql stable security invoker set search_path='' as $$
 select (select coalesce(jsonb_agg(to_jsonb(r) order by r.delivery_date,r.project_id,r.quote_item_id),'[]'::jsonb) from (
 select p.id project_id,p.workspace_id,w.company_name,p.title project_title,p.delivery_date,p.responsible_user_id,q.id quote_id,q.service_type,
 i.id quote_item_id,i.product_name label,i.quantity ordered_quantity,i.final_asset_id asset_id,
 coalesce((select sum(f.quantity) from public.z19p_film_allocations f where f.quote_item_id=i.id and f.owner_id=q.owner_id),0) exported_quantity,
 i.quantity-coalesce((select sum(f.quantity) from public.z19p_film_allocations f where f.quote_item_id=i.id and f.owner_id=q.owner_id),0) remaining_quantity,
 coalesce((select jsonb_agg(jsonb_build_object('film_item_id',f.film_item_id,'quantity',f.quantity)) from public.z19p_film_allocations f where f.quote_item_id=i.id and f.owner_id=q.owner_id),'[]'::jsonb) allocations,
 ap.default_width_cm width_cm,ap.default_height_cm height_cm,ap.halftone,ap.rotation_policy,ap.allow_internal_nesting,
 a.name asset_name,a.processed_path,a.original_path,a.metadata
 from public.z19p_projects p join public.z19p_statuses s on s.id=p.status_id and s.owner_id=p.owner_id
 join public.z19p_workspaces w on w.id=p.workspace_id and w.owner_id=p.owner_id
 join public.z19p_quotes q on q.project_id=p.id and q.workspace_id=p.workspace_id and q.owner_id=p.owner_id and q.payment_status='paid'
 join public.z19p_quote_items i on i.quote_id=q.id and i.owner_id=p.owner_id and i.item_kind='art'
 join public.z19p_assets a on a.id=i.final_asset_id and a.owner_id=p.owner_id and a.workspace_id=p.workspace_id
 join public.z19p_asset_print_profiles ap on ap.asset_id=a.id and ap.owner_id=p.owner_id and ap.ready_for_print
 where p.owner_id=public.z19p_current_account_owner() and p.finalized_at is null and p.desisted_at is null and not s.is_finalized
 and s.queue_stage in ('ready_production','production') and cardinality(public.z19p_quote_release_issues(q.id,true))=0
 and exists(select 1 from public.z19p_profiles where id=auth.uid() and active)
 ) r where r.remaining_quantity>0) || (select coalesce(jsonb_agg(jsonb_build_object('kind','legacy_review','project_id',p.id,'workspace_id',p.workspace_id,'quote_id',q.id,'company_name',w.company_name,'project_title',p.title,'delivery_date',p.delivery_date) order by p.delivery_date,p.id,q.id),'[]'::jsonb)
 from public.z19p_projects p join public.z19p_statuses s on s.id=p.status_id and s.owner_id=p.owner_id
 join public.z19p_workspaces w on w.id=p.workspace_id and w.owner_id=p.owner_id
 join public.z19p_quotes q on q.project_id=p.id and q.workspace_id=p.workspace_id and q.owner_id=p.owner_id and q.payment_status='paid' and q.service_type is null
 where p.owner_id=public.z19p_current_account_owner() and p.finalized_at is null and p.desisted_at is null and not s.is_finalized
 and s.queue_stage in ('ready_production','production') and exists(select 1 from public.z19p_profiles where id=auth.uid() and active));
$$;
revoke all on function public.z19p_pending_film_items() from public,anon;
grant execute on function public.z19p_pending_film_items() to authenticated;

create or replace function public.z19p_queue_readiness()
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('project_id',r.id,'issues',r.issues)),'[]'::jsonb) from (
  select p.id,case when not exists(select 1 from public.z19p_quotes q where q.project_id=p.id and q.owner_id=p.owner_id and q.workspace_id=p.workspace_id and q.payment_status='paid') then array['Crie um orçamento válido e confirme o pagamento antes de liberar.'] else array(select distinct unnest(public.z19p_quote_release_issues(q.id,s.queue_stage in ('ready_production','production'))) from public.z19p_quotes q where q.project_id=p.id and q.owner_id=p.owner_id and q.workspace_id=p.workspace_id and q.payment_status='paid') end issues
  from public.z19p_projects p join public.z19p_statuses s on s.id=p.status_id and s.owner_id=p.owner_id
  where p.owner_id=public.z19p_current_account_owner() and exists(select 1 from public.z19p_profiles where id=auth.uid() and active) and p.finalized_at is null and p.desisted_at is null and not s.is_finalized and s.queue_stage in ('art_work','ready_production','production')
 ) r where cardinality(r.issues)>0;
$$;
revoke all on function public.z19p_queue_readiness() from public,anon;
grant execute on function public.z19p_queue_readiness() to authenticated;

-- Only this authenticated, account-checked private function can mutate allocation tables.
create or replace function z19p_private.record_film_export(p_export_id uuid,p_fingerprint text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare own uuid:=public.z19p_current_account_owner(); row jsonb; i public.z19p_quote_items%rowtype; q public.z19p_quotes%rowtype;
 p public.z19p_projects%rowtype; ap public.z19p_asset_print_profiles%rowtype; previous public.z19p_film_allocations%rowtype;
 existing public.z19p_film_exports%rowtype; count_now integer; delta integer; allocated bigint; added integer:=0; has_previous boolean:=false; stage text; production_status uuid; issues text[];
begin
 if auth.uid() is null or not exists(select 1 from public.z19p_profiles where id=auth.uid() and active) then raise exception 'Autenticação ativa obrigatória.'; end if;
 if p_export_id is null or p_fingerprint !~ '^[a-f0-9]{64}$' or p_fingerprint is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>1000 then raise exception 'Exportação inválida.'; end if;
 -- Serialize the account's short registration transaction; never held during rendering/network.
 perform pg_advisory_xact_lock(hashtextextended(own::text,21711));
 select * into existing from public.z19p_film_exports where owner_id=own and (id=p_export_id or fingerprint=p_fingerprint);
 if found then
  if existing.fingerprint<>p_fingerprint or existing.items<>p_items then raise exception 'Identificação de exportação conflitante.'; end if;
  return jsonb_build_object('export_id',existing.id,'replayed',true,'added_quantity',0,'has_previous_items',true);
 end if;
 if exists(select 1 from jsonb_array_elements(p_items) x group by x->>'film_item_id' having count(*)>1) then raise exception 'Item de filme duplicado.'; end if;
 -- Match the save lock order: projects, then quote items. Deterministic within each group.
 perform 1 from public.z19p_projects where owner_id=own and id in (select (x->>'project_id')::uuid from jsonb_array_elements(p_items) x) order by id for update;
 perform 1 from public.z19p_quote_items where owner_id=own and id in (select (x->>'quote_item_id')::uuid from jsonb_array_elements(p_items) x) order by id for update;
 insert into public.z19p_film_exports(id,owner_id,fingerprint,items,created_by) values(p_export_id,own,p_fingerprint,p_items,auth.uid());
 for row in select value from jsonb_array_elements(p_items) loop
  count_now:=(row->>'quantity')::integer;
  if count_now is null or count_now<1 or count_now>10000 or row->>'film_item_id' is null then raise exception 'Quantidade de filme inválida.'; end if;
  select * into i from public.z19p_quote_items where id=(row->>'quote_item_id')::uuid and owner_id=own and item_kind='art';
  if not found then raise exception 'Estampa orçada não encontrada.'; end if;
  select * into q from public.z19p_quotes where id=i.quote_id and owner_id=own;
  select * into p from public.z19p_projects where id=q.project_id and id=(row->>'project_id')::uuid and owner_id=own and workspace_id=q.workspace_id;
  if not found or i.final_asset_id is distinct from (row->>'asset_id')::uuid then raise exception 'A arte exportada não corresponde ao pedido.'; end if;
  select * into previous from public.z19p_film_allocations where owner_id=own and film_item_id=(row->>'film_item_id')::uuid;
  if found and (previous.quote_item_id<>i.id or previous.asset_id<>i.final_asset_id or previous.project_id<>p.id) then raise exception 'Vínculo de filme já registrado não pode mudar.'; end if;
  if previous.film_item_id is not null then has_previous:=true; end if;
  delta:=greatest(0,count_now-coalesce(previous.quantity,0));
  if delta=0 then continue; end if;
  select queue_stage into stage from public.z19p_statuses where id=p.status_id and owner_id=own and not is_finalized;
  if stage is null or stage not in ('ready_production','production') or p.finalized_at is not null or p.desisted_at is not null or q.payment_status<>'paid' then raise exception 'Pedido não está liberado para produção.'; end if;
  issues:=public.z19p_quote_release_issues(q.id,true); if cardinality(issues)>0 then raise exception '%',array_to_string(issues,' '); end if;
  select * into ap from public.z19p_asset_print_profiles where asset_id=i.final_asset_id and owner_id=own for share;
  if not found or not ap.ready_for_print or ap.default_width_cm is null or ap.default_height_cm is null or ap.default_width_cm<=0 or ap.default_height_cm<=0 or ap.default_width_cm::text in ('NaN','Infinity','-Infinity') or ap.default_height_cm::text in ('NaN','Infinity','-Infinity') then raise exception 'Medidas da arte final indisponíveis. Atualize a fila.'; end if;
  if row->>'width_cm' is null or row->>'height_cm' is null or abs(ap.default_width_cm-(row->>'width_cm')::numeric)>.005 or abs(ap.default_height_cm-(row->>'height_cm')::numeric)>.005 then raise exception 'Medidas do filme diferem da arte final. Revise o cadastro antes de exportar.'; end if;
  select coalesce(sum(quantity),0) into allocated from public.z19p_film_allocations where quote_item_id=i.id and owner_id=own;
  if allocated+delta>i.quantity then raise exception 'Quantidade já atendida em outro filme. Atualize as pendências antes de gerar.'; end if;
  insert into public.z19p_film_allocations(owner_id,film_item_id,quote_item_id,project_id,asset_id,quantity,first_export_id,created_by)
  values(own,(row->>'film_item_id')::uuid,i.id,p.id,i.final_asset_id,count_now,p_export_id,auth.uid())
  on conflict(owner_id,film_item_id) do update set quantity=excluded.quantity;
  added:=added+delta;
  if stage='ready_production' then
   select id into production_status from public.z19p_statuses where owner_id=own and active and not is_finalized and queue_stage='production' order by sort_order,id limit 1;
   if production_status is null then raise exception 'Configure o status Em produção antes de gerar arquivos de pedidos.'; end if;
   perform public.z19p_transition_project(p.id,production_status);
  end if;
 end loop;
 return jsonb_build_object('export_id',p_export_id,'replayed',false,'added_quantity',added,'has_previous_items',has_previous);
end $$;
revoke all on function z19p_private.record_film_export(uuid,text,jsonb) from public,anon;
grant execute on function z19p_private.record_film_export(uuid,text,jsonb) to authenticated;
create or replace function public.z19p_record_film_export(p_export_id uuid,p_fingerprint text,p_items jsonb)
returns jsonb language sql security invoker set search_path='' as $$select z19p_private.record_film_export(p_export_id,p_fingerprint,p_items)$$;
revoke all on function public.z19p_record_film_export(uuid,text,jsonb) from public,anon;
grant execute on function public.z19p_record_film_export(uuid,text,jsonb) to authenticated;
-- Preserve the existing token-based public endpoint and its complete allowlist.
-- Only add service/item labels; never expose reference/final IDs or internal metadata.
do $public_quote_labels$
declare definition text;
begin
 if to_regprocedure('public.z19p_get_public_workspace(uuid)') is not null then
  select pg_get_functiondef('public.z19p_get_public_workspace(uuid)'::regprocedure) into definition;
  if position('''service_type'',q.service_type' in definition)=0 then
   if position('''title'',q.title,' in definition)=0 or position('''product_name'',qi.product_name,' in definition)=0 then raise exception 'Endpoint público mudou. Revise a lista explícita antes da migration.'; end if;
   definition:=replace(definition,'''title'',q.title,','''title'',q.title,''service_type'',q.service_type,''schema_version'',q.schema_version,');
   definition:=replace(definition,'''product_name'',qi.product_name,','''product_name'',qi.product_name,''item_kind'',qi.item_kind,');
   execute definition;
  end if;
 end if;
end $public_quote_labels$;
comment on table public.z19p_film_allocations is 'Successfully generated film quantities; not proof of physical printing, stock deduction, payment or delivery. Per-film-item high-water mark prevents double counting across formats/reexports.';
commit;
