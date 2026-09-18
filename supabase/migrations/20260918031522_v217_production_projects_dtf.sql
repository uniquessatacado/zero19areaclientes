-- 019 Personalizacoes v2.17
-- Evolucao aditiva: projetos, filas, documentos, artes prontas, times e filmes DTF.

begin;

alter table public.z19p_statuses add column if not exists active boolean not null default true;
alter table public.z19p_statuses add column if not exists is_finalized boolean not null default false;
alter table public.z19p_statuses add column if not exists queue_stage text not null default 'none';

do $$ begin
  alter table public.z19p_statuses
    add constraint z19p_statuses_queue_stage_check
    check (queue_stage in ('none','art_work','ready_production','production'));
exception when duplicate_object then null; end $$;

-- O nome e usado apenas neste backfill de compatibilidade. Regras novas usam as chaves semanticas.
update public.z19p_statuses
set is_finalized = true
where lower(trim(name)) in ('finalizado','finalizada','concluido','concluído')
  and is_finalized = false;

update public.z19p_statuses set queue_stage = 'art_work'
where queue_stage = 'none' and lower(trim(name)) in ('produzindo arte','desenvolver arte','desenvolvendo arte');
update public.z19p_statuses set queue_stage = 'ready_production'
where queue_stage = 'none' and lower(trim(name)) in ('pronto para producao','pronto para produção','iniciar producao','iniciar produção');
update public.z19p_statuses set queue_stage = 'production'
where queue_stage = 'none' and lower(trim(name)) in ('em producao','em produção','estampar');

create unique index if not exists z19p_statuses_owner_queue_stage_unique
  on public.z19p_statuses(owner_id,queue_stage)
  where queue_stage <> 'none' and active = true;

alter table public.z19p_projects add column if not exists delivery_date date;
alter table public.z19p_projects add column if not exists status_entered_at timestamptz not null default now();
alter table public.z19p_projects add column if not exists updated_by uuid;
alter table public.z19p_quotes add column if not exists delivery_date date;
alter table public.z19p_folders add column if not exists project_id uuid;
alter table public.z19p_assets add column if not exists project_id uuid;

do $$ begin
  alter table public.z19p_folders add constraint z19p_folders_project_id_fkey
    foreign key(project_id) references public.z19p_projects(id) on delete cascade;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.z19p_assets add constraint z19p_assets_project_id_fkey
    foreign key(project_id) references public.z19p_projects(id) on delete cascade;
exception when duplicate_object then null; end $$;

-- Registros legados ficam ligados ao projeto mais recente da propria empresa.
update public.z19p_folders f set project_id = (
  select p.id from public.z19p_projects p where p.workspace_id = f.workspace_id
  order by p.sequence_no desc, p.started_at desc nulls last, p.id desc limit 1
) where f.project_id is null and exists(select 1 from public.z19p_projects p where p.workspace_id=f.workspace_id);
update public.z19p_assets a set project_id = (
  select p.id from public.z19p_projects p where p.workspace_id = a.workspace_id
  order by p.sequence_no desc, p.started_at desc nulls last, p.id desc limit 1
) where a.project_id is null and exists(select 1 from public.z19p_projects p where p.workspace_id=a.workspace_id);
update public.z19p_quotes q set delivery_date = p.delivery_date
from public.z19p_projects p where q.project_id = p.id and q.delivery_date is null;

create index if not exists z19p_projects_queue_idx on public.z19p_projects(owner_id,status_id,delivery_date,status_entered_at);
create index if not exists z19p_folders_project_idx on public.z19p_folders(project_id,parent_id,sort_order);
create index if not exists z19p_assets_project_idx on public.z19p_assets(project_id,folder_id,created_at desc);
create index if not exists z19p_quotes_project_payment_idx on public.z19p_quotes(project_id,payment_status,paid_at);

create table if not exists public.z19p_quote_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.z19p_current_account_owner(),
  quote_id uuid not null references public.z19p_quotes(id) on delete cascade,
  project_id uuid references public.z19p_projects(id) on delete set null,
  storage_path text not null,
  public_token uuid not null default gen_random_uuid() unique,
  content_hash text not null,
  quote_updated_at timestamptz,
  document_version integer not null default 1,
  stale boolean not null default false,
  generated_at timestamptz not null default now(),
  generated_by uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  unique(quote_id,document_version)
);
create index if not exists z19p_quote_documents_latest_idx on public.z19p_quote_documents(quote_id,stale,document_version desc);

create table if not exists public.z19p_asset_print_profiles (
  asset_id uuid primary key references public.z19p_assets(id) on delete cascade,
  owner_id uuid not null default public.z19p_current_account_owner(),
  project_id uuid references public.z19p_projects(id) on delete cascade,
  default_width_cm numeric(9,3) not null check(default_width_cm > 0),
  default_height_cm numeric(9,3) not null check(default_height_cm > 0),
  aspect_ratio numeric(14,8) not null check(aspect_ratio > 0),
  halftone boolean not null default false,
  allow_internal_nesting boolean not null default true,
  rotation_policy text not null default 'none' check(rotation_policy in ('none','180','90','free')),
  ready_for_print boolean not null default false,
  defined_at timestamptz not null default now(),
  created_by uuid not null,
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);
create index if not exists z19p_asset_print_profiles_project_idx on public.z19p_asset_print_profiles(project_id,ready_for_print);

create table if not exists public.z19p_asset_size_presets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.z19p_current_account_owner(),
  asset_id uuid not null references public.z19p_assets(id) on delete cascade,
  label text not null,
  width_cm numeric(9,3) not null check(width_cm > 0),
  height_cm numeric(9,3) not null check(height_cm > 0),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique(asset_id,label)
);

create table if not exists public.z19p_teams (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default public.z19p_current_account_owner(),
  name text not null, crest_asset_id uuid references public.z19p_assets(id) on delete set null,
  active boolean not null default true, created_by uuid not null, updated_by uuid not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(owner_id,name)
);
create table if not exists public.z19p_team_kits (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default public.z19p_current_account_owner(),
  team_id uuid not null references public.z19p_teams(id) on delete cascade, season text not null,
  name text not null, photo_asset_id uuid references public.z19p_assets(id) on delete set null,
  notes text, active boolean not null default true, created_by uuid not null, updated_by uuid not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(team_id,season,name)
);
create table if not exists public.z19p_customization_sets (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default public.z19p_current_account_owner(),
  kit_id uuid not null references public.z19p_team_kits(id) on delete cascade, name text not null,
  status text not null default 'draft' check(status in ('draft','preparing','ready','archived')),
  default_name_height_cm numeric(9,3) not null default 5.5 check(default_name_height_cm > 0),
  default_number_height_cm numeric(9,3) not null default 28 check(default_number_height_cm > 0),
  name_number_gap_cm numeric(9,3) not null default 1.5 check(name_number_gap_cm >= 0),
  letter_tracking_cm numeric(9,3) not null default 0.15,
  digit_spacing_cm numeric(9,3) not null default 0.2,
  color_mode text not null default 'preserve' check(color_mode in ('preserve','recolor')),
  halftone boolean not null default false, tested_at timestamptz, tested_by uuid,
  created_by uuid not null, updated_by uuid not null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(kit_id,name)
);
create table if not exists public.z19p_customization_sources (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default public.z19p_current_account_owner(),
  set_id uuid not null references public.z19p_customization_sets(id) on delete cascade,
  source_type text not null check(source_type in ('cdr','svg','pdf','ttf','otf')),
  storage_path text not null, original_name text not null, mime_type text, size_bytes bigint,
  is_working_source boolean not null default false, created_by uuid not null, created_at timestamptz not null default now()
);
create table if not exists public.z19p_customization_glyphs (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default public.z19p_current_account_owner(),
  set_id uuid not null references public.z19p_customization_sets(id) on delete cascade,
  glyph_key text not null, source_kind text not null check(source_kind in ('font','vector')),
  svg_markup text, font_source_id uuid references public.z19p_customization_sources(id) on delete set null,
  advance_width numeric(14,6), bounds jsonb not null default '{}'::jsonb,
  styles jsonb not null default '{}'::jsonb, sort_order integer not null default 0,
  created_by uuid not null, updated_by uuid not null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(set_id,glyph_key)
);
create table if not exists public.z19p_customization_palettes (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default public.z19p_current_account_owner(),
  set_id uuid not null references public.z19p_customization_sets(id) on delete cascade,
  role text not null check(role in ('primary','outline','secondary','detail','name','number')),
  color_hex text not null check(color_hex ~ '^#[0-9A-Fa-f]{6}$'), created_by uuid not null,
  updated_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(set_id,role)
);

create table if not exists public.z19p_print_media_profiles (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default public.z19p_current_account_owner(),
  name text not null, nominal_width_cm numeric(9,3) not null check(nominal_width_cm > 0),
  usable_width_cm numeric(9,3) not null check(usable_width_cm > 0), lateral_margin_mm numeric(9,3) not null default 0,
  default_gap_mm numeric(9,3) not null default 3 check(default_gap_mm >= 0),
  rotation_policy text not null default '180' check(rotation_policy in ('none','180','90','free')),
  max_segment_cm numeric(9,3) not null default 100 check(max_segment_cm > 0), active boolean not null default true,
  created_by uuid not null, updated_by uuid not null, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(owner_id,name)
);
create table if not exists public.z19p_print_jobs (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default public.z19p_current_account_owner(),
  project_id uuid references public.z19p_projects(id) on delete set null,
  name text not null, media_profile_id uuid references public.z19p_print_media_profiles(id) on delete restrict,
  film_width_cm numeric(9,3) not null check(film_width_cm > 0),
  nesting_mode text not null default 'normal' check(nesting_mode in ('normal','maximum')),
  gap_mm numeric(9,3) not null default 3 check(gap_mm >= 0),
  status text not null default 'draft' check(status in ('draft','calculated','exported','printed')),
  calculated_length_cm numeric(12,3), settings_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid not null, updated_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.z19p_print_job_items (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default public.z19p_current_account_owner(),
  job_id uuid not null references public.z19p_print_jobs(id) on delete cascade,
  item_type text not null check(item_type in ('team_customization','asset')),
  asset_id uuid references public.z19p_assets(id) on delete restrict,
  customization_set_id uuid references public.z19p_customization_sets(id) on delete restrict,
  label text not null, quantity integer not null default 1 check(quantity > 0),
  width_cm numeric(9,3) not null check(width_cm > 0), height_cm numeric(9,3) not null check(height_cm > 0),
  rotation_deg numeric(8,3) not null default 0, position_x_mm numeric(12,3), position_y_mm numeric(12,3),
  bounds jsonb not null default '{}'::jsonb, locked boolean not null default false,
  halftone boolean not null default false, size_override boolean not null default false,
  metadata jsonb not null default '{}'::jsonb, sort_order integer not null default 0,
  created_by uuid not null, updated_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check((item_type='asset' and asset_id is not null) or (item_type='team_customization' and customization_set_id is not null))
);
create index if not exists z19p_print_jobs_owner_updated_idx on public.z19p_print_jobs(owner_id,updated_at desc);
create index if not exists z19p_print_job_items_job_idx on public.z19p_print_job_items(job_id,sort_order);

-- RLS e grants explicitos (novas tabelas podem nao ser expostas automaticamente pela Data API).
do $$ declare t text; begin
  foreach t in array array[
    'z19p_quote_documents','z19p_asset_print_profiles','z19p_asset_size_presets',
    'z19p_teams','z19p_team_kits','z19p_customization_sets','z19p_customization_sources',
    'z19p_customization_glyphs','z19p_customization_palettes','z19p_print_media_profiles',
    'z19p_print_jobs','z19p_print_job_items'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists z19p_team_select on public.%I',t);
    execute format('create policy z19p_team_select on public.%I for select to authenticated using (owner_id = public.z19p_current_account_owner())',t);
    execute format('drop policy if exists z19p_team_insert on public.%I',t);
    execute format('create policy z19p_team_insert on public.%I for insert to authenticated with check (owner_id = public.z19p_current_account_owner())',t);
    execute format('drop policy if exists z19p_team_update on public.%I',t);
    execute format('create policy z19p_team_update on public.%I for update to authenticated using (owner_id = public.z19p_current_account_owner()) with check (owner_id = public.z19p_current_account_owner())',t);
    execute format('drop policy if exists z19p_team_delete on public.%I',t);
    execute format('create policy z19p_team_delete on public.%I for delete to authenticated using (owner_id = public.z19p_current_account_owner())',t);
    execute format('grant select,insert,update,delete on table public.%I to authenticated',t);
  end loop;
end $$;

create or replace function public.z19p_fill_project_scope()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if new.project_id is null and new.workspace_id is not null then
    select id into new.project_id from public.z19p_projects
    where workspace_id=new.workspace_id and owner_id=new.owner_id
    order by sequence_no desc,started_at desc nulls last,id desc limit 1;
  end if;
  return new;
end $$;
drop trigger if exists z19p_folders_fill_project on public.z19p_folders;
create trigger z19p_folders_fill_project before insert on public.z19p_folders for each row execute function public.z19p_fill_project_scope();
drop trigger if exists z19p_assets_fill_project on public.z19p_assets;
create trigger z19p_assets_fill_project before insert on public.z19p_assets for each row execute function public.z19p_fill_project_scope();

create or replace function public.z19p_validate_project_transition()
returns trigger language plpgsql security invoker set search_path=public as $$
declare v_stage text; v_final boolean;
begin
  if new.status_id is not distinct from old.status_id then return new; end if;
  select queue_stage,is_finalized into v_stage,v_final from public.z19p_statuses
  where id=new.status_id and owner_id=new.owner_id;
  if v_stage in ('art_work','ready_production','production') then
    if new.delivery_date is null then raise exception 'Defina a data de entrega antes de liberar para producao.'; end if;
    if not exists(select 1 from public.z19p_quotes q where q.project_id=new.id and q.owner_id=new.owner_id and q.payment_status='paid') then
      raise exception 'O projeto precisa de um orcamento pago antes de entrar na fila operacional.';
    end if;
  end if;
  new.status_entered_at=now();
  if coalesce(v_final,false) and new.finalized_at is null then new.finalized_at=now(); end if;
  return new;
end $$;
drop trigger if exists z19p_projects_validate_transition on public.z19p_projects;
create trigger z19p_projects_validate_transition before update of status_id on public.z19p_projects
for each row execute function public.z19p_validate_project_transition();

create or replace function public.z19p_block_paid_quote_delete()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if old.payment_status='paid' then raise exception 'Orcamento pago nao pode ser excluido. Estorne a venda primeiro.'; end if;
  return old;
end $$;
drop trigger if exists z19p_quotes_block_paid_delete on public.z19p_quotes;
create trigger z19p_quotes_block_paid_delete before delete on public.z19p_quotes
for each row execute function public.z19p_block_paid_quote_delete();

create or replace function public.z19p_stale_quote_documents()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  update public.z19p_quote_documents set stale=true where quote_id=new.id and stale=false;
  return new;
end $$;
drop trigger if exists z19p_quotes_stale_documents on public.z19p_quotes;
create trigger z19p_quotes_stale_documents after update on public.z19p_quotes
for each row execute function public.z19p_stale_quote_documents();

create or replace function public.z19p_mark_quote_paid_for_production(p_quote_id uuid,p_delivery_date date)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_owner uuid:=public.z19p_current_account_owner(); v_project uuid; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Autenticacao obrigatoria.'; end if;
  if p_delivery_date is null then raise exception 'Data de entrega obrigatoria.'; end if;
  select project_id into v_project from public.z19p_quotes where id=p_quote_id and owner_id=v_owner;
  if not found then raise exception 'Orcamento nao encontrado.'; end if;
  update public.z19p_quotes set delivery_date=p_delivery_date,updated_at=now(),updated_by=auth.uid() where id=p_quote_id;
  if v_project is not null then update public.z19p_projects set delivery_date=p_delivery_date,updated_at=now(),updated_by=auth.uid() where id=v_project and owner_id=v_owner; end if;
  select public.z19p_mark_quote_paid(p_quote_id) into v_result;
  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('delivery_date',p_delivery_date,'project_id',v_project);
end $$;
revoke all on function public.z19p_mark_quote_paid_for_production(uuid,date) from public,anon;
grant execute on function public.z19p_mark_quote_paid_for_production(uuid,date) to authenticated;

create or replace function public.z19p_transition_project(p_project_id uuid,p_status_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_owner uuid:=public.z19p_current_account_owner(); v_project public.z19p_projects%rowtype;
  v_status public.z19p_statuses%rowtype; v_old uuid;
begin
  if auth.uid() is null then raise exception 'Autenticacao obrigatoria.'; end if;
  select * into v_project from public.z19p_projects where id=p_project_id and owner_id=v_owner for update;
  if not found then raise exception 'Projeto nao encontrado.'; end if;
  select * into v_status from public.z19p_statuses where id=p_status_id and owner_id=v_owner and active=true;
  if not found then raise exception 'Status nao encontrado ou inativo.'; end if;
  if v_status.queue_stage in ('art_work','ready_production','production') then
    if v_project.delivery_date is null then raise exception 'Defina a data de entrega antes de liberar para producao.'; end if;
    if not exists(select 1 from public.z19p_quotes q where q.project_id=v_project.id and q.owner_id=v_owner and q.payment_status='paid') then
      raise exception 'Crie e marque um orcamento como pago antes de liberar para producao.';
    end if;
  end if;
  v_old:=v_project.status_id;
  update public.z19p_projects set status_id=p_status_id,status_entered_at=now(),updated_at=now(),updated_by=auth.uid(),
    finalized_at=case when v_status.is_finalized then coalesce(finalized_at,now()) else finalized_at end
  where id=v_project.id;
  update public.z19p_workspaces set status_id=p_status_id,status_changed_at=now(),updated_at=now() where id=v_project.workspace_id and owner_id=v_owner;
  insert into public.z19p_status_history(owner_id,workspace_id,project_id,from_status_id,to_status_id,changed_by)
  values(v_owner,v_project.workspace_id,v_project.id,v_old,p_status_id,auth.uid());
  return jsonb_build_object('project_id',v_project.id,'status_id',p_status_id,'queue_stage',v_status.queue_stage,'is_finalized',v_status.is_finalized);
end $$;
revoke all on function public.z19p_transition_project(uuid,uuid) from public,anon;
grant execute on function public.z19p_transition_project(uuid,uuid) to authenticated;

create or replace function public.z19p_get_public_quote_documents(p_workspace_token uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'quote_id',d.quote_id,'storage_path',d.storage_path,'public_token',d.public_token,
    'generated_at',d.generated_at,'document_version',d.document_version,'stale',d.stale
  ) order by d.document_version desc),'[]'::jsonb)
  from public.z19p_workspaces w join public.z19p_quotes q on q.workspace_id=w.id
  join public.z19p_quote_documents d on d.quote_id=q.id
  where w.share_token=p_workspace_token and w.share_enabled=true and d.stale=false;
$$;
revoke all on function public.z19p_get_public_quote_documents(uuid) from public;
grant execute on function public.z19p_get_public_quote_documents(uuid) to anon,authenticated;

-- Perfis padrao para contas existentes. Contas futuras tambem sao inicializadas pela interface.
insert into public.z19p_print_media_profiles(owner_id,name,nominal_width_cm,usable_width_cm,created_by,updated_by)
select distinct p.account_owner_id,'Filme 28 cm',28,28,p.account_owner_id,p.account_owner_id from public.z19p_profiles p
where p.account_owner_id is not null on conflict(owner_id,name) do nothing;
insert into public.z19p_print_media_profiles(owner_id,name,nominal_width_cm,usable_width_cm,created_by,updated_by)
select distinct p.account_owner_id,'Filme 58 cm',58,58,p.account_owner_id,p.account_owner_id from public.z19p_profiles p
where p.account_owner_id is not null on conflict(owner_id,name) do nothing;

commit;
