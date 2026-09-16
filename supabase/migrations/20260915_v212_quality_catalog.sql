-- v2.12 — Catálogo público de qualidades, faixas, comentários/curtidas e portfólio

create table if not exists public.z19p_public_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  slug text not null unique,
  quality_catalog_enabled boolean not null default true,
  portfolio_enabled boolean not null default true,
  comments_enabled boolean not null default true,
  comments_default_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.z19p_price_tiers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.z19p_current_account_owner() references auth.users(id) on delete cascade,
  label text not null,
  min_qty integer not null check (min_qty >= 1),
  max_qty integer check (max_qty is null or max_qty >= min_qty),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists z19p_price_tiers_owner_sort_idx on public.z19p_price_tiers(owner_id, active, sort_order);

create table if not exists public.z19p_quality_products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.z19p_current_account_owner() references auth.users(id) on delete cascade,
  share_token uuid not null default gen_random_uuid() unique,
  product_name text not null,
  fabric_quality text,
  composition text,
  description text,
  width_cm numeric(10,2) check (width_cm is null or width_cm > 0),
  height_cm numeric(10,2) check (height_cm is null or height_cm > 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists z19p_quality_products_owner_idx on public.z19p_quality_products(owner_id, active, sort_order);

create table if not exists public.z19p_quality_prices (
  product_id uuid not null references public.z19p_quality_products(id) on delete cascade,
  tier_id uuid not null references public.z19p_price_tiers(id) on delete cascade,
  owner_id uuid not null default public.z19p_current_account_owner() references auth.users(id) on delete cascade,
  price numeric(12,2) not null check (price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(product_id,tier_id)
);

create table if not exists public.z19p_quality_media (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.z19p_current_account_owner() references auth.users(id) on delete cascade,
  product_id uuid not null references public.z19p_quality_products(id) on delete cascade,
  asset_id uuid not null references public.z19p_assets(id) on delete cascade,
  media_type text not null check (media_type in ('video','image')),
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique(product_id,asset_id)
);
create index if not exists z19p_quality_media_product_idx on public.z19p_quality_media(product_id, sort_order);

create table if not exists public.z19p_quality_likes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.z19p_quality_products(id) on delete cascade,
  visitor_hash text not null,
  created_at timestamptz not null default now(),
  unique(product_id,visitor_hash)
);
create index if not exists z19p_quality_likes_product_idx on public.z19p_quality_likes(product_id);

create table if not exists public.z19p_quality_comments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.z19p_quality_products(id) on delete cascade,
  name text not null,
  phone text not null,
  body text not null,
  visible boolean not null default true,
  visitor_hash text,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists z19p_quality_comments_owner_seen_idx on public.z19p_quality_comments(owner_id, seen_at, created_at desc);
create index if not exists z19p_quality_comments_product_idx on public.z19p_quality_comments(product_id, visible, created_at desc);

create table if not exists public.z19p_portfolio_cases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.z19p_current_account_owner() references auth.users(id) on delete cascade,
  share_token uuid not null default gen_random_uuid() unique,
  workspace_id uuid references public.z19p_workspaces(id) on delete set null,
  company_name text,
  product_name text not null,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists z19p_portfolio_cases_owner_idx on public.z19p_portfolio_cases(owner_id, active, sort_order);

create table if not exists public.z19p_portfolio_media (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default public.z19p_current_account_owner() references auth.users(id) on delete cascade,
  case_id uuid not null references public.z19p_portfolio_cases(id) on delete cascade,
  asset_id uuid not null references public.z19p_assets(id) on delete cascade,
  media_type text not null check (media_type in ('video','image')),
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique(case_id,asset_id)
);
create index if not exists z19p_portfolio_media_case_idx on public.z19p_portfolio_media(case_id, sort_order);

-- RLS: gerenciamento apenas por usuários autenticados da mesma conta.
do $$
declare t text;
begin
  foreach t in array array[
    'z19p_public_settings','z19p_price_tiers','z19p_quality_products','z19p_quality_prices',
    'z19p_quality_media','z19p_quality_likes','z19p_quality_comments','z19p_portfolio_cases','z19p_portfolio_media'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists z19p_team_all on public.%I',t);
    execute format('create policy z19p_team_all on public.%I for all to authenticated using (owner_id = public.z19p_current_account_owner()) with check (owner_id = public.z19p_current_account_owner())',t);
  end loop;
end $$;

-- Configuração pública da conta Zero 19 sem depender de UUID hardcoded.
insert into public.z19p_public_settings(owner_id,slug)
select distinct p.account_owner_id,'zero19'
from public.z19p_profiles p
join auth.users u on u.id=p.id
where lower(coalesce(u.email,''))='ussloja@gmail.com'
on conflict (owner_id) do update set slug=excluded.slug,updated_at=now();

-- Faixas padrão para a conta Zero 19.
with target as (
  select ps.owner_id from public.z19p_public_settings ps where ps.slug='zero19' limit 1
), defs(label,min_qty,max_qty,sort_order) as (
  values ('1 a 4 peças',1,4,10),('5 a 19 peças',5,19,20),('20 a 49 peças',20,49,30),('50 peças ou mais',50,null::integer,40)
)
insert into public.z19p_price_tiers(owner_id,label,min_qty,max_qty,sort_order)
select t.owner_id,d.label,d.min_qty,d.max_qty,d.sort_order from target t cross join defs d
where not exists (
  select 1 from public.z19p_price_tiers x where x.owner_id=t.owner_id and x.min_qty=d.min_qty and x.max_qty is not distinct from d.max_qty
);

-- Migra vídeos já cadastrados para produtos de qualidade, sem usar nome do arquivo como título público.
insert into public.z19p_quality_products(owner_id,share_token,product_name,fabric_quality,description,created_by,updated_by,created_at,updated_at)
select a.owner_id,
       a.share_token,
       case
         when coalesce(a.metadata->>'description','') ilike '%30.1%' then 'Camiseta 30.1'
         when nullif(trim(coalesce(a.metadata->>'description','')),'') is not null then trim(a.metadata->>'description')
         else 'Demonstração de qualidade'
       end,
       case when coalesce(a.metadata->>'description','') ilike '%30.1%' then 'Fio 30.1' else null end,
       nullif(trim(coalesce(a.metadata->>'description','')),''),
       coalesce(a.created_by,a.owner_id),coalesce(a.updated_by,a.created_by,a.owner_id),a.created_at,a.updated_at
from public.z19p_assets a
join public.z19p_workspaces w on w.id=a.workspace_id
where a.asset_type='video' and w.workspace_type='library_videos'
  and not exists (select 1 from public.z19p_quality_products p where p.share_token=a.share_token)
on conflict (share_token) do nothing;

insert into public.z19p_quality_media(owner_id,product_id,asset_id,media_type,sort_order,is_primary)
select p.owner_id,p.id,a.id,'video',0,true
from public.z19p_quality_products p
join public.z19p_assets a on a.share_token=p.share_token
where a.asset_type='video'
  and not exists(select 1 from public.z19p_quality_media m where m.product_id=p.id and m.asset_id=a.id);

create or replace function public.z19p_get_quality_catalog(p_slug text default 'zero19')
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
with site as (
  select ps.* from public.z19p_public_settings ps where ps.slug=p_slug and ps.quality_catalog_enabled=true limit 1
), products as (
  select p.*,
    coalesce((select min(pr.price) from public.z19p_quality_prices pr where pr.product_id=p.id),999999999::numeric) as min_price,
    (select count(*)::int from public.z19p_quality_likes l where l.product_id=p.id) as like_count
  from public.z19p_quality_products p join site s on s.owner_id=p.owner_id
  where p.active=true
)
select jsonb_build_object(
  'site', (select jsonb_build_object('slug',s.slug,'comments_enabled',s.comments_enabled) from site s),
  'tiers', coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'label',t.label,'min_qty',t.min_qty,'max_qty',t.max_qty,'sort_order',t.sort_order) order by t.sort_order,t.min_qty) from public.z19p_price_tiers t join site s on s.owner_id=t.owner_id where t.active=true),'[]'::jsonb),
  'products', coalesce((select jsonb_agg(
    jsonb_build_object(
      'id',p.id,'share_token',p.share_token,'product_name',p.product_name,'fabric_quality',p.fabric_quality,
      'composition',p.composition,'description',p.description,'width_cm',p.width_cm,'height_cm',p.height_cm,
      'like_count',p.like_count,'min_price',case when p.min_price=999999999 then null else p.min_price end,
      'prices',coalesce((select jsonb_agg(jsonb_build_object('tier_id',pr.tier_id,'price',pr.price) order by t.sort_order,t.min_qty) from public.z19p_quality_prices pr join public.z19p_price_tiers t on t.id=pr.tier_id where pr.product_id=p.id),'[]'::jsonb),
      'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'asset_id',a.id,'type',m.media_type,'path',coalesce(a.original_path,a.processed_path),'mime_type',a.mime_type,'size_bytes',a.size_bytes,'name',a.name,'sort_order',m.sort_order,'is_primary',m.is_primary) order by m.is_primary desc,m.sort_order,a.created_at) from public.z19p_quality_media m join public.z19p_assets a on a.id=m.asset_id where m.product_id=p.id),'[]'::jsonb),
      'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'body',c.body,'created_at',c.created_at) order by c.created_at desc) from public.z19p_quality_comments c where c.product_id=p.id and c.visible=true),'[]'::jsonb)
    ) order by p.min_price,p.sort_order,p.product_name
  ) from products p),'[]'::jsonb)
);
$$;

create or replace function public.z19p_get_portfolio_catalog(p_slug text default 'zero19')
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
with site as (
  select ps.* from public.z19p_public_settings ps where ps.slug=p_slug and ps.portfolio_enabled=true limit 1
), cases as (
  select c.*, coalesce(nullif(c.company_name,''),w.company_name) as display_company
  from public.z19p_portfolio_cases c join site s on s.owner_id=c.owner_id
  left join public.z19p_workspaces w on w.id=c.workspace_id
  where c.active=true
)
select jsonb_build_object(
  'site',(select jsonb_build_object('slug',s.slug) from site s),
  'cases',coalesce((select jsonb_agg(jsonb_build_object(
    'id',c.id,'share_token',c.share_token,'company_name',c.display_company,'product_name',c.product_name,'description',c.description,
    'company_logo_path',(select coalesce(a.processed_path,a.original_path) from public.z19p_folders f join public.z19p_assets a on a.folder_id=f.id where f.workspace_id=c.workspace_id and f.purpose='logo_empresa' order by a.created_at desc limit 1),
    'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'asset_id',a.id,'type',m.media_type,'path',coalesce(a.original_path,a.processed_path),'mime_type',a.mime_type,'size_bytes',a.size_bytes,'name',a.name,'sort_order',m.sort_order,'is_primary',m.is_primary) order by m.is_primary desc,m.sort_order,a.created_at) from public.z19p_portfolio_media m join public.z19p_assets a on a.id=m.asset_id where m.case_id=c.id),'[]'::jsonb)
  ) order by c.sort_order,c.created_at desc) from cases c),'[]'::jsonb)
);
$$;

grant execute on function public.z19p_get_quality_catalog(text) to anon,authenticated;
grant execute on function public.z19p_get_portfolio_catalog(text) to anon,authenticated;
