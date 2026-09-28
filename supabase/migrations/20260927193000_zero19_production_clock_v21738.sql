begin;

create table if not exists public.z19p_production_sla_settings (
  owner_id uuid primary key,
  baseline_minutes_per_shirt numeric not null default 30 check (baseline_minutes_per_shirt > 0),
  measurement_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.z19p_production_holidays (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  holiday_date date not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique(owner_id,holiday_date)
);

create table if not exists public.z19p_pause_reasons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,name)
);

create table if not exists public.z19p_production_pauses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  project_id uuid references public.z19p_projects(id) on delete cascade,
  scope text not null check(scope in ('order','printer')),
  reason_id uuid references public.z19p_pause_reasons(id) on delete set null,
  note text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid,
  ended_by uuid,
  created_at timestamptz not null default now(),
  check((scope='printer' and project_id is null) or (scope='order' and project_id is not null))
);

create unique index if not exists z19p_one_active_printer_pause
  on public.z19p_production_pauses(owner_id) where scope='printer' and ended_at is null;
create unique index if not exists z19p_one_active_order_pause
  on public.z19p_production_pauses(owner_id,project_id) where scope='order' and ended_at is null;
create index if not exists z19p_production_pauses_timing
  on public.z19p_production_pauses(owner_id,started_at,ended_at);

alter table public.z19p_production_sla_settings enable row level security;
alter table public.z19p_production_holidays enable row level security;
alter table public.z19p_pause_reasons enable row level security;
alter table public.z19p_production_pauses enable row level security;

do $$ declare t text; begin
  foreach t in array array['z19p_production_sla_settings','z19p_production_holidays','z19p_pause_reasons','z19p_production_pauses'] loop
    execute format('drop policy if exists %I on public.%I',t||'_account',t);
    execute format('create policy %I on public.%I for all to authenticated using (owner_id=public.z19p_current_account_owner()) with check (owner_id=public.z19p_current_account_owner())',t||'_account',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  end loop;
end $$;

insert into public.z19p_production_sla_settings(owner_id,baseline_minutes_per_shirt,measurement_started_at,updated_by)
values('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,30,now(),'96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid)
on conflict(owner_id) do nothing;

insert into public.z19p_pause_reasons(owner_id,name,sort_order)
values
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'Aguardando chegar camisa',10),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'Estampa ou cor não confere',20),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'Aguardando aprovação do cliente',30),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'Impressora em manutenção',40),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'Outro motivo',100)
on conflict(owner_id,name) do nothing;
insert into public.z19p_production_holidays(owner_id,holiday_date,name)
select '96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,make_date(year_value,holiday_month,holiday_day),holiday_name
from generate_series(2026,2035) year_value
cross join (values
  (1,1,'Confraternização Universal'),(4,21,'Tiradentes'),(5,1,'Dia do Trabalho'),
  (9,7,'Independência do Brasil'),(10,12,'Nossa Senhora Aparecida'),(11,2,'Finados'),
  (11,15,'Proclamação da República'),(11,20,'Consciência Negra'),(12,25,'Natal')
) as fixed_holidays(holiday_month,holiday_day,holiday_name)
on conflict(owner_id,holiday_date) do nothing;

insert into public.z19p_production_holidays(owner_id,holiday_date,name)
values
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'2026-02-16','Carnaval'),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'2026-02-17','Carnaval'),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'2026-04-03','Paixão de Cristo'),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'2026-06-04','Corpus Christi'),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'2027-02-08','Carnaval'),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'2027-02-09','Carnaval'),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'2027-03-26','Paixão de Cristo'),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'2027-05-27','Corpus Christi'),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'2028-02-28','Carnaval'),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'2028-02-29','Carnaval'),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'2028-04-14','Paixão de Cristo'),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'2028-06-15','Corpus Christi'),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'2029-02-12','Carnaval'),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'2029-02-13','Carnaval'),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'2029-03-30','Paixão de Cristo'),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'2029-05-31','Corpus Christi'),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'2030-03-04','Carnaval'),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'2030-03-05','Carnaval'),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'2030-04-19','Paixão de Cristo'),
 ('96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid,'2030-06-20','Corpus Christi')
on conflict(owner_id,holiday_date) do nothing;

create or replace function public.z19p_business_minutes(p_start timestamptz,p_end timestamptz,p_holidays date[] default array[]::date[])
returns numeric language plpgsql immutable set search_path=public as $$
declare d date; local_start timestamp; local_end timestamp; window_start timestamp; window_end timestamp; total_seconds numeric:=0;
begin
  if p_start is null or p_end is null or p_end<=p_start then return 0; end if;
  local_start:=p_start at time zone 'America/Sao_Paulo';local_end:=p_end at time zone 'America/Sao_Paulo';
  d:=local_start::date;
  while d<=local_end::date loop
    if extract(dow from d)<>0 and not(d=any(coalesce(p_holidays,array[]::date[]))) then
      window_start:=d::timestamp+time '10:00';window_end:=d::timestamp+time '18:00';
      total_seconds:=total_seconds+greatest(0,extract(epoch from (least(local_end,window_end)-greatest(local_start,window_start))));
    end if;
    d:=d+1;
  end loop;
  return round(total_seconds/60,2);
end $$;

create or replace function public.z19p_set_production_pause(p_project_id uuid,p_paused boolean,p_reason_id uuid default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare own uuid:=public.z19p_current_account_owner(); pause_scope text:=case when p_project_id is null then 'printer' else 'order' end; row_id uuid;
begin
  if auth.uid() is null or own is null then raise exception 'Acesso não autorizado.'; end if;
  if p_project_id is not null and not exists(select 1 from public.z19p_projects where id=p_project_id and owner_id=own) then raise exception 'Pedido não encontrado.'; end if;
  if p_reason_id is not null and not exists(select 1 from public.z19p_pause_reasons where id=p_reason_id and owner_id=own and active) then raise exception 'Motivo de pausa inválido.'; end if;
  if p_paused then
    insert into public.z19p_production_pauses(owner_id,project_id,scope,reason_id,note,created_by)
    values(own,p_project_id,pause_scope,p_reason_id,nullif(trim(coalesce(p_note,'')),''),auth.uid())
    on conflict do nothing returning id into row_id;
    if row_id is null then select id into row_id from public.z19p_production_pauses where owner_id=own and scope=pause_scope and project_id is not distinct from p_project_id and ended_at is null; end if;
  else
    update public.z19p_production_pauses set ended_at=now(),ended_by=auth.uid()
    where owner_id=own and scope=pause_scope and project_id is not distinct from p_project_id and ended_at is null returning id into row_id;
  end if;
  return jsonb_build_object('id',row_id,'paused',p_paused,'scope',pause_scope,'project_id',p_project_id);
end $$;
revoke all on function public.z19p_set_production_pause(uuid,boolean,uuid,text) from public,anon;
grant execute on function public.z19p_set_production_pause(uuid,boolean,uuid,text) to authenticated;

create or replace function public.z19p_zero19_force_stage(p_project_id uuid,p_stage text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare own uuid:=public.z19p_current_account_owner(); workspace uuid; target_status uuid; source_status text;
begin
  if auth.uid() is null or own is null then raise exception 'Acesso não autorizado.'; end if;
  if p_stage not in ('awaiting_art','art_received','awaiting_halftone','awaiting_font','ready_production','production','ready_pickup','delivered') then raise exception 'Etapa inválida.'; end if;
  select workspace_id into workspace from public.z19p_projects where id=p_project_id and owner_id=own and official_order_source='zero19_pdv' for update;
  if not found then raise exception 'Pedido ZERO19 não encontrado.'; end if;
  source_status:=case when p_stage='production' then 'IN_PROGRESS' when p_stage='ready_pickup' then 'DONE' when p_stage='delivered' then 'DELIVERED' else 'PENDING' end;
  update public.z19p_zero19_work_items set stage=p_stage,
    production_started_at=case when p_stage='production' then now() else production_started_at end,
    ready_at=case when p_stage in ('ready_pickup','delivered') then coalesce(ready_at,now()) else null end,
    delivered_at=case when p_stage='delivered' then coalesce(delivered_at,now()) else null end,updated_at=now()
  where project_id=p_project_id and owner_id=own and stage<>'cancelled';
  update public.personalization_sales s set status=source_status,
    started_at=case when source_status='IN_PROGRESS' then now() else started_at end,
    completed_at=case when source_status in ('DONE','DELIVERED') then coalesce(completed_at,now()) else null end,
    delivered_at=case when source_status='DELIVERED' then coalesce(delivered_at,now()) else null end,updated_at=now()
  where s.id in(select personalization_sale_id from public.z19p_zero19_work_items where project_id=p_project_id and owner_id=own);
  target_status:=public.z19p_zero19_status_id(own,p_stage);
  update public.z19p_projects set official_order_status=p_stage,status_id=coalesce(target_status,status_id),
    production_started_at=case when p_stage='production' then now() else production_started_at end,
    ready_at=case when p_stage in ('ready_pickup','delivered') then coalesce(ready_at,now()) else null end,
    finalized_at=case when p_stage='delivered' then coalesce(finalized_at,now()) else null end,updated_at=now(),updated_by=auth.uid()
  where id=p_project_id;
  update public.z19p_workspaces set status_id=coalesce(target_status,status_id),status_changed_at=now(),updated_at=now() where id=workspace and owner_id=own;
  return jsonb_build_object('project_id',p_project_id,'stage',p_stage);
end $$;
revoke all on function public.z19p_zero19_force_stage(uuid,text) from public,anon;
grant execute on function public.z19p_zero19_force_stage(uuid,text) to authenticated;

create or replace function public.zero19_personalization_ops_snapshot(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare own uuid:='96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid; baseline numeric:=30; cutoff timestamptz:=now(); holidays date[]:=array[]::date[]; avg_minutes numeric; sample_count integer:=0; backlog integer:=0; counts jsonb; ready jsonb; active jsonb; printer_pause jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.user_tenants where user_id=auth.uid() and tenant_id=p_tenant_id) then raise exception 'Acesso não autorizado.'; end if;
  if p_tenant_id<>'0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid then raise exception 'Tenant inválido.'; end if;
  select baseline_minutes_per_shirt,measurement_started_at into baseline,cutoff from public.z19p_production_sla_settings where owner_id=own;
  baseline:=coalesce(baseline,30);cutoff:=coalesce(cutoff,now());
  select coalesce(array_agg(holiday_date),array[]::date[]) into holidays from public.z19p_production_holidays where owner_id=own;
  with samples as (
    select greatest(1,public.z19p_business_minutes(p.production_started_at,p.ready_at,holidays)-coalesce((select sum(public.z19p_business_minutes(greatest(p.production_started_at,x.started_at),least(p.ready_at,coalesce(x.ended_at,p.ready_at)),holidays)) from public.z19p_production_pauses x where x.owner_id=own and x.started_at<p.ready_at and coalesce(x.ended_at,p.ready_at)>p.production_started_at and (x.scope='printer' or x.project_id=p.id)),0))/greatest(1,coalesce(q.qty,1)) minutes
    from public.z19p_projects p left join lateral(select sum(w.quantity)::integer qty from public.z19p_zero19_work_items w where w.project_id=p.id) q on true
    where p.owner_id=own and p.official_order_source='zero19_pdv' and coalesce(p.source_order_created_at,p.created_at)>=cutoff and p.production_started_at>=cutoff and p.ready_at>p.production_started_at
  ) select count(*),coalesce(round(avg(minutes)::numeric,1),baseline) into sample_count,avg_minutes from samples where minutes between 1 and 240;
  avg_minutes:=coalesce(avg_minutes,baseline);
  select coalesce(sum(quantity),0)::integer into backlog from public.z19p_zero19_work_items where owner_id=own and stage in ('awaiting_art','art_received','awaiting_halftone','awaiting_font','ready_production','production');
  select jsonb_build_object('awaiting_art',count(*) filter(where stage='awaiting_art'),'art_received',count(*) filter(where stage='art_received'),'awaiting_halftone',count(*) filter(where stage='awaiting_halftone'),'awaiting_font',count(*) filter(where stage='awaiting_font'),'ready_production',count(*) filter(where stage='ready_production'),'production',count(*) filter(where stage='production'),'ready_pickup',count(*) filter(where stage='ready_pickup')) into counts from public.z19p_zero19_work_items where owner_id=own;
  select to_jsonb(x) into printer_pause from (select p.id,p.started_at,p.note,r.name reason from public.z19p_production_pauses p left join public.z19p_pause_reasons r on r.id=p.reason_id where p.owner_id=own and p.scope='printer' and p.ended_at is null limit 1)x;
  select coalesce(jsonb_agg(item order by promised_at nulls last,created_at),'[]'::jsonb) into active from (select min(w.promised_at) promised_at,min(w.created_at) created_at,jsonb_build_object('project_id',w.project_id,'workspace_id',w.workspace_id,'order_id',w.order_id,'display_id',p.official_order_payload->>'display_id','client_name',ws.client_name,'phone',ws.phone,'promised_at',p.promised_at,'stage',p.official_order_status,'quantity',sum(w.quantity),'created_at',min(w.created_at)) item from public.z19p_zero19_work_items w join public.z19p_projects p on p.id=w.project_id join public.z19p_workspaces ws on ws.id=w.workspace_id where w.owner_id=own and w.stage in ('awaiting_art','art_received','awaiting_halftone','awaiting_font','ready_production','production') group by w.project_id,w.workspace_id,w.order_id,p.official_order_payload,p.promised_at,p.official_order_status,ws.client_name,ws.phone)x;
  select coalesce(jsonb_agg(item order by promised_at nulls last,created_at),'[]'::jsonb) into ready from (select min(w.promised_at) promised_at,min(w.created_at) created_at,jsonb_build_object('project_id',w.project_id,'workspace_id',w.workspace_id,'order_id',w.order_id,'display_id',p.official_order_payload->>'display_id','client_name',ws.client_name,'phone',ws.phone,'promised_at',p.promised_at,'ready_at',p.ready_at,'customer_notified_at',p.customer_notified_at) item from public.z19p_zero19_work_items w join public.z19p_projects p on p.id=w.project_id join public.z19p_workspaces ws on ws.id=w.workspace_id where w.owner_id=own and w.stage='ready_pickup' group by w.project_id,w.workspace_id,w.order_id,p.official_order_payload,p.promised_at,p.ready_at,p.customer_notified_at,ws.client_name,ws.phone)x;
  return jsonb_build_object('avg_minutes_per_shirt',avg_minutes,'baseline_minutes_per_shirt',baseline,'completed_sample_count',sample_count,'measurement_started_at',cutoff,'backlog_quantity',backlog,'counts',coalesce(counts,'{}'::jsonb),'active_queue',active,'ready_pickup',ready,'holidays',to_jsonb(holidays),'printer_pause',printer_pause,'generated_at',now());
end $$;
revoke all on function public.zero19_personalization_ops_snapshot(uuid) from public,anon;
grant execute on function public.zero19_personalization_ops_snapshot(uuid) to authenticated;

create or replace function public.z19p_close_order_pause_after_stage()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.official_order_source='zero19_pdv'
     and new.official_order_status is distinct from old.official_order_status
     and new.official_order_status<>'production' then
    update public.z19p_production_pauses
    set ended_at=coalesce(ended_at,now()),ended_by=coalesce(auth.uid(),ended_by)
    where owner_id=new.owner_id and project_id=new.id and scope='order' and ended_at is null;
  end if;
  return new;
end $$;
drop trigger if exists z19p_projects_close_order_pause on public.z19p_projects;
create trigger z19p_projects_close_order_pause
after update of official_order_status on public.z19p_projects
for each row execute function public.z19p_close_order_pause_after_stage();

commit;
