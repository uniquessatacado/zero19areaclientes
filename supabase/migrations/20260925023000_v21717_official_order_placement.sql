-- v2.17.17 — pedido oficial, posições configuráveis e vínculo de arte com peça.
begin;

alter table public.z19p_projects
  add column if not exists official_order_ref text,
  add column if not exists official_order_source text,
  add column if not exists official_order_status text,
  add column if not exists official_order_synced_at timestamptz,
  add column if not exists official_order_payload jsonb not null default '{}'::jsonb;

create unique index if not exists z19p_projects_official_order_unique
  on public.z19p_projects(owner_id,official_order_source,official_order_ref)
  where official_order_ref is not null;
create index if not exists z19p_projects_official_order_workspace_idx
  on public.z19p_projects(owner_id,workspace_id,official_order_synced_at desc)
  where official_order_ref is not null;

create table if not exists public.z19p_print_positions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.z19p_current_account_owner(),
  code text not null,
  label text not null,
  surface text not null check(surface in ('front','back','left_sleeve','right_sleeve')),
  zone text not null,
  anchor_x numeric(6,5) not null check(anchor_x between 0 and 1),
  anchor_y numeric(6,5) not null check(anchor_y between 0 and 1),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,code)
);

create table if not exists public.z19p_asset_placements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.z19p_current_account_owner(),
  workspace_id uuid not null references public.z19p_workspaces(id) on delete cascade,
  project_id uuid references public.z19p_projects(id) on delete cascade,
  asset_id uuid not null references public.z19p_assets(id) on delete cascade,
  position_id uuid references public.z19p_print_positions(id) on delete set null,
  external_order_ref text,
  external_order_item_ref text,
  garment_model text not null check(garment_model in ('normal','oversized','babylook','kids')),
  garment_color text not null default 'black',
  garment_color_name text,
  garment_size text,
  garment_category text,
  surface text not null check(surface in ('front','back','left_sleeve','right_sleeve')),
  position_code text not null,
  width_cm numeric(9,3) not null check(width_cm>0),
  height_cm numeric(9,3) not null check(height_cm>0),
  mockup_asset_id uuid references public.z19p_assets(id) on delete set null,
  production_state text not null default 'pending' check(production_state in ('pending','production','printed','cancelled')),
  exported_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists z19p_asset_placements_pending_idx on public.z19p_asset_placements(owner_id,production_state,project_id,created_at);
create index if not exists z19p_asset_placements_asset_idx on public.z19p_asset_placements(asset_id,created_at desc);

alter table public.z19p_print_positions enable row level security;
alter table public.z19p_asset_placements enable row level security;
revoke all on public.z19p_print_positions,public.z19p_asset_placements from anon,authenticated;
grant select,insert,update,delete on public.z19p_print_positions,public.z19p_asset_placements to authenticated;
grant all on public.z19p_print_positions,public.z19p_asset_placements to service_role;

do $$ declare t text; begin
  foreach t in array array['z19p_print_positions','z19p_asset_placements'] loop
    execute format('drop policy if exists z19p_v21717_select on public.%I',t);
    execute format('create policy z19p_v21717_select on public.%I for select to authenticated using(owner_id=public.z19p_current_account_owner() and exists(select 1 from public.z19p_profiles p where p.id=auth.uid() and p.active))',t);
    execute format('drop policy if exists z19p_v21717_insert on public.%I',t);
    execute format('create policy z19p_v21717_insert on public.%I for insert to authenticated with check(owner_id=public.z19p_current_account_owner() and created_by=auth.uid() and updated_by=auth.uid() and exists(select 1 from public.z19p_profiles p where p.id=auth.uid() and p.active))',t);
    execute format('drop policy if exists z19p_v21717_update on public.%I',t);
    execute format('create policy z19p_v21717_update on public.%I for update to authenticated using(owner_id=public.z19p_current_account_owner() and exists(select 1 from public.z19p_profiles p where p.id=auth.uid() and p.active)) with check(owner_id=public.z19p_current_account_owner() and updated_by=auth.uid())',t);
    execute format('drop policy if exists z19p_v21717_delete on public.%I',t);
    execute format('create policy z19p_v21717_delete on public.%I for delete to authenticated using(owner_id=public.z19p_current_account_owner() and exists(select 1 from public.z19p_profiles p where p.id=auth.uid() and p.active))',t);
  end loop;
end $$;

insert into public.z19p_print_positions(owner_id,code,label,surface,zone,anchor_x,anchor_y,sort_order,created_by,updated_by)
select owner_id,v.code,v.label,v.surface,v.zone,v.x,v.y,v.sort_order,owner_id,owner_id
from (select distinct account_owner_id owner_id from public.z19p_profiles where account_owner_id is not null) owners
cross join (values
 ('front_upper','Frente · em cima','front','upper',.50,.22,10),
 ('front_center','Frente · meio','front','center',.50,.45,20),
 ('front_lower','Frente · embaixo','front','lower',.50,.72,30),
 ('front_chest_left','Peito esquerdo','front','chest_left',.34,.28,40),
 ('front_chest_right','Peito direito','front','chest_right',.66,.28,50),
 ('back_upper','Costas · em cima','back','upper',.50,.20,60),
 ('back_center','Costas · meio','back','center',.50,.45,70),
 ('back_lower','Costas · embaixo','back','lower',.50,.72,80),
 ('left_sleeve_front','Manga esquerda · frente','left_sleeve','front',.50,.30,90),
 ('left_sleeve_center','Manga esquerda · meio','left_sleeve','center',.50,.50,100),
 ('left_sleeve_back','Manga esquerda · costas','left_sleeve','back',.50,.70,110),
 ('right_sleeve_front','Manga direita · frente','right_sleeve','front',.50,.30,120),
 ('right_sleeve_center','Manga direita · meio','right_sleeve','center',.50,.50,130),
 ('right_sleeve_back','Manga direita · costas','right_sleeve','back',.50,.70,140)
) as v(code,label,surface,zone,x,y,sort_order)
on conflict(owner_id,code) do nothing;

create or replace function public.z19p_mark_official_order_production(p_project_ids uuid[],p_placement_ids uuid[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare own uuid:=public.z19p_current_account_owner(); changed_projects integer:=0; changed_placements integer:=0;
begin
  if auth.uid() is null or not exists(select 1 from public.z19p_profiles where id=auth.uid() and active) then raise exception 'Autenticação ativa obrigatória.'; end if;
  if coalesce(array_length(p_project_ids,1),0)>200 or coalesce(array_length(p_placement_ids,1),0)>2000 then raise exception 'Seleção de produção acima do limite.'; end if;
  update public.z19p_projects set official_order_status='production',updated_at=now(),updated_by=auth.uid()
  where owner_id=own and official_order_ref is not null and id=any(coalesce(p_project_ids,array[]::uuid[]));
  get diagnostics changed_projects=row_count;
  update public.z19p_asset_placements set production_state='production',exported_at=coalesce(exported_at,now()),updated_at=now(),updated_by=auth.uid()
  where owner_id=own and production_state='pending' and id=any(coalesce(p_placement_ids,array[]::uuid[]));
  get diagnostics changed_placements=row_count;
  return jsonb_build_object('projects',changed_projects,'placements',changed_placements);
end $$;
revoke all on function public.z19p_mark_official_order_production(uuid[],uuid[]) from public,anon;
grant execute on function public.z19p_mark_official_order_production(uuid[],uuid[]) to authenticated;

commit;
