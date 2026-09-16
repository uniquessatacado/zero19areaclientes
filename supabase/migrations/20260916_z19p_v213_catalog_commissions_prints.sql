-- v2.13 — catálogo unificado, mídia comercial, WhatsApp, comissões, estampas e taxa de arte.
-- Aplicada em produção no projeto kedggjyerexnzmipaick.
begin;

update storage.buckets set file_size_limit=greatest(coalesce(file_size_limit,0),104857600) where id='z19p-assets';

alter table public.z19p_quality_products add column if not exists catalog_product_id uuid references public.z19p_products(id) on delete set null;
create unique index if not exists z19p_quality_product_catalog_unique on public.z19p_quality_products(owner_id,catalog_product_id) where catalog_product_id is not null;
update public.z19p_quality_products q set catalog_product_id=p.id from public.z19p_products p where q.catalog_product_id is null and p.owner_id=q.owner_id and lower(trim(p.name))=lower(trim(q.product_name));

alter table public.z19p_public_settings add column if not exists whatsapp_catalog_template text;
alter table public.z19p_public_settings add column if not exists whatsapp_product_template text;
update public.z19p_public_settings set
 whatsapp_catalog_template=coalesce(whatsapp_catalog_template,'👕 *Demonstrações de qualidade — Zero 19*\n\nOlá, *{cliente}*! Aqui é {vendedor}. Separei nossa página completa de demonstrações para você comparar as opções de tecido, acabamento e valores.\n\n👉 *Clique no link abaixo para assistir:*\n{link}\n\nSe quiser, me chama por aqui que eu te ajudo a escolher a melhor opção. 🙂'),
 whatsapp_product_template=coalesce(whatsapp_product_template,'👕 *Demonstração de qualidade — Zero 19*\n\nOlá, *{cliente}*! Aqui é {vendedor}. Separei a demonstração de *{produto}* para você ver tecido, acabamento e valores.\n\n👉 *Clique no link abaixo para assistir:*\n{link}\n\nSe quiser, me chama por aqui e continuamos seu projeto. 🙂'),updated_at=now();

create table if not exists public.z19p_portfolio_likes(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,case_id uuid not null references public.z19p_portfolio_cases(id) on delete cascade,
 visitor_hash text not null,created_at timestamptz not null default now(),unique(case_id,visitor_hash));
alter table public.z19p_portfolio_likes enable row level security;
drop policy if exists z19p_team_select on public.z19p_portfolio_likes;
create policy z19p_team_select on public.z19p_portfolio_likes for select to authenticated using(owner_id=public.z19p_current_account_owner());

create or replace function public.z19p_enforce_commercial_media_limits() returns trigger language plpgsql security definer set search_path=public as $$
declare v_count int;
begin
 if tg_table_name='z19p_portfolio_media' then select count(*) into v_count from public.z19p_portfolio_media where case_id=new.case_id and media_type=new.media_type;
 else select count(*) into v_count from public.z19p_quality_media where product_id=new.product_id and media_type=new.media_type; end if;
 if new.media_type='video' and v_count>=1 then raise exception 'Permitido no máximo 1 vídeo.'; end if;
 if new.media_type='image' and v_count>=3 then raise exception 'Permitido no máximo 3 fotos.'; end if;
 return new;
end$$;
drop trigger if exists z19p_portfolio_media_limit on public.z19p_portfolio_media;
create trigger z19p_portfolio_media_limit before insert on public.z19p_portfolio_media for each row execute function public.z19p_enforce_commercial_media_limits();
drop trigger if exists z19p_quality_media_limit on public.z19p_quality_media;
create trigger z19p_quality_media_limit before insert on public.z19p_quality_media for each row execute function public.z19p_enforce_commercial_media_limits();

alter table public.z19p_quotes add column if not exists payment_status text not null default 'unpaid' check(payment_status in ('unpaid','paid'));
alter table public.z19p_quotes add column if not exists paid_at timestamptz;
alter table public.z19p_quotes add column if not exists paid_by uuid;

create table if not exists public.z19p_commission_config(owner_id uuid primary key,enabled boolean not null default false,payment_weekday smallint check(payment_weekday between 0 and 6),updated_at timestamptz not null default now(),updated_by uuid);
alter table public.z19p_commission_config enable row level security;
drop policy if exists z19p_team_select on public.z19p_commission_config;
create policy z19p_team_select on public.z19p_commission_config for select to authenticated using(owner_id=public.z19p_current_account_owner());
drop policy if exists z19p_admin_write on public.z19p_commission_config;
create policy z19p_admin_write on public.z19p_commission_config for all to authenticated using(public.z19p_is_admin() and owner_id=public.z19p_current_account_owner()) with check(public.z19p_is_admin() and owner_id=public.z19p_current_account_owner());
insert into public.z19p_commission_config(owner_id,enabled) select distinct account_owner_id,false from public.z19p_profiles on conflict(owner_id) do nothing;

create table if not exists public.z19p_commission_rules(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default public.z19p_current_account_owner(),seller_user_id uuid not null references public.z19p_profiles(id) on delete cascade,tier_id uuid not null references public.z19p_price_tiers(id) on delete cascade,
 basis text not null default 'total' check(basis in ('total','product','print','split')),total_percent numeric(7,4) not null default 0,product_percent numeric(7,4) not null default 0,print_percent numeric(7,4) not null default 0,active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,seller_user_id,tier_id));
alter table public.z19p_commission_rules enable row level security;
drop policy if exists z19p_team_select on public.z19p_commission_rules;
create policy z19p_team_select on public.z19p_commission_rules for select to authenticated using(owner_id=public.z19p_current_account_owner());
drop policy if exists z19p_admin_write on public.z19p_commission_rules;
create policy z19p_admin_write on public.z19p_commission_rules for all to authenticated using(public.z19p_is_admin() and owner_id=public.z19p_current_account_owner()) with check(public.z19p_is_admin() and owner_id=public.z19p_current_account_owner());

create table if not exists public.z19p_commissions(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default public.z19p_current_account_owner(),quote_id uuid not null references public.z19p_quotes(id) on delete cascade,workspace_id uuid references public.z19p_workspaces(id) on delete set null,project_id uuid references public.z19p_projects(id) on delete set null,seller_user_id uuid not null references public.z19p_profiles(id) on delete restrict,
 product_amount numeric(12,2) not null default 0,print_amount numeric(12,2) not null default 0,total_amount numeric(12,2) not null default 0,commission_amount numeric(12,2) not null default 0,detail jsonb not null default '[]'::jsonb,status text not null default 'pending' check(status in ('pending','approved','rejected','paid')),created_at timestamptz not null default now(),decided_at timestamptz,decided_by uuid,paid_at timestamptz,paid_by uuid,unique(owner_id,quote_id,seller_user_id));
alter table public.z19p_commissions enable row level security;
drop policy if exists z19p_commission_team_select on public.z19p_commissions;
create policy z19p_commission_team_select on public.z19p_commissions for select to authenticated using(owner_id=public.z19p_current_account_owner() and (public.z19p_is_admin() or seller_user_id=auth.uid()));
drop policy if exists z19p_commission_admin_write on public.z19p_commissions;
create policy z19p_commission_admin_write on public.z19p_commissions for all to authenticated using(public.z19p_is_admin() and owner_id=public.z19p_current_account_owner()) with check(public.z19p_is_admin() and owner_id=public.z19p_current_account_owner());

create table if not exists public.z19p_print_rules(id uuid primary key default gen_random_uuid(),owner_id uuid not null default public.z19p_current_account_owner(),name text not null,garment_type text not null default 'normal' check(garment_type in ('normal','team')),placement text not null,pricing_mode text not null default 'size' check(pricing_mode in ('size','per_character','special')),max_width_cm numeric(7,2),max_height_cm numeric(7,2),sort_order integer not null default 0,active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table public.z19p_print_rules enable row level security;
drop policy if exists z19p_team_all on public.z19p_print_rules;
create policy z19p_team_all on public.z19p_print_rules for all to authenticated using(owner_id=public.z19p_current_account_owner()) with check(owner_id=public.z19p_current_account_owner());
create table if not exists public.z19p_print_rule_prices(rule_id uuid not null references public.z19p_print_rules(id) on delete cascade,tier_id uuid not null references public.z19p_price_tiers(id) on delete cascade,owner_id uuid not null default public.z19p_current_account_owner(),standalone_price numeric(12,2),combined_price numeric(12,2),char_price numeric(12,2),number_price numeric(12,2),special_price numeric(12,2),primary key(rule_id,tier_id));
alter table public.z19p_print_rule_prices enable row level security;
drop policy if exists z19p_team_all on public.z19p_print_rule_prices;
create policy z19p_team_all on public.z19p_print_rule_prices for all to authenticated using(owner_id=public.z19p_current_account_owner()) with check(owner_id=public.z19p_current_account_owner());

create table if not exists public.z19p_artwork_fee_settings(owner_id uuid primary key,enabled boolean not null default true,fee_per_art numeric(12,2) not null default 30,free_from_tier_id uuid references public.z19p_price_tiers(id) on delete set null,updated_at timestamptz not null default now(),updated_by uuid);
alter table public.z19p_artwork_fee_settings enable row level security;
drop policy if exists z19p_team_select on public.z19p_artwork_fee_settings;
create policy z19p_team_select on public.z19p_artwork_fee_settings for select to authenticated using(owner_id=public.z19p_current_account_owner());
drop policy if exists z19p_admin_write on public.z19p_artwork_fee_settings;
create policy z19p_admin_write on public.z19p_artwork_fee_settings for all to authenticated using(public.z19p_is_admin() and owner_id=public.z19p_current_account_owner()) with check(public.z19p_is_admin() and owner_id=public.z19p_current_account_owner());
insert into public.z19p_artwork_fee_settings(owner_id) select distinct account_owner_id from public.z19p_profiles on conflict(owner_id) do nothing;

insert into public.z19p_print_rules(owner_id,name,garment_type,placement,pricing_mode,max_width_cm,max_height_cm,sort_order)
select o.owner_id,v.name,'normal',v.placement,'size',v.w,v.h,v.ord from (select distinct account_owner_id owner_id from public.z19p_profiles)o cross join (values
 ('Peito esquerdo até 9 cm','Peito esquerdo',9::numeric,9::numeric,10),('Peito direito até 9 cm','Peito direito',9::numeric,9::numeric,20),('Peito central','Peito central',30::numeric,30::numeric,30),('Barriga / patrocínio','Barriga',30::numeric,20::numeric,40),('Manga direita','Manga direita',12::numeric,12::numeric,50),('Manga esquerda','Manga esquerda',12::numeric,12::numeric,60),('Nuca / costas pequena','Nuca',12::numeric,12::numeric,70),('Costas padrão','Costas',30::numeric,40::numeric,80),('Mega estampa frente','Mega frente',45::numeric,55::numeric,90),('Mega estampa costas','Mega costas',45::numeric,60::numeric,100)
)as v(name,placement,w,h,ord) where not exists(select 1 from public.z19p_print_rules r where r.owner_id=o.owner_id and r.name=v.name);

create or replace function public.z19p_get_quality_catalog(p_slug text default 'zero19') returns jsonb language sql stable security definer set search_path=public as $$
with site as(select ps.* from public.z19p_public_settings ps where ps.slug=p_slug and ps.quality_catalog_enabled=true limit 1),products as(select p.*,coalesce((select min(pr.price) from public.z19p_quality_prices pr where pr.product_id=p.id),999999999::numeric) min_price,(select count(*)::int from public.z19p_quality_likes l where l.product_id=p.id) like_count from public.z19p_quality_products p join site s on s.owner_id=p.owner_id where p.active=true)
select jsonb_build_object('site',(select jsonb_build_object('slug',s.slug,'comments_enabled',s.comments_enabled) from site s),'tiers',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'label',t.label,'min_qty',t.min_qty,'max_qty',t.max_qty,'sort_order',t.sort_order) order by t.sort_order,t.min_qty) from public.z19p_price_tiers t join site s on s.owner_id=t.owner_id where t.active=true),'[]'::jsonb),'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'catalog_product_id',p.catalog_product_id,'share_token',p.share_token,'product_name',p.product_name,'fabric_quality',p.fabric_quality,'composition',p.composition,'description',p.description,'width_cm',p.width_cm,'height_cm',p.height_cm,'like_count',p.like_count,'min_price',case when p.min_price=999999999 then null else p.min_price end,'prices',coalesce((select jsonb_agg(jsonb_build_object('tier_id',pr.tier_id,'price',pr.price) order by t.sort_order,t.min_qty) from public.z19p_quality_prices pr join public.z19p_price_tiers t on t.id=pr.tier_id where pr.product_id=p.id),'[]'::jsonb),'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'asset_id',a.id,'type',m.media_type,'path',coalesce(a.original_path,a.processed_path),'mime_type',a.mime_type,'size_bytes',a.size_bytes,'name',a.name,'sort_order',m.sort_order,'is_primary',m.is_primary) order by m.is_primary desc,m.sort_order,a.created_at) from public.z19p_quality_media m join public.z19p_assets a on a.id=m.asset_id where m.product_id=p.id),'[]'::jsonb),'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'body',c.body,'created_at',c.created_at) order by c.created_at desc) from public.z19p_quality_comments c where c.product_id=p.id and c.visible=true),'[]'::jsonb)) order by p.min_price,p.sort_order,p.product_name) from products p),'[]'::jsonb));$$;
grant execute on function public.z19p_get_quality_catalog(text) to anon,authenticated;

create or replace function public.z19p_get_portfolio_catalog(p_slug text default 'zero19') returns jsonb language sql stable security definer set search_path=public as $$
with site as(select ps.* from public.z19p_public_settings ps where ps.slug=p_slug and ps.portfolio_enabled=true limit 1),cases as(select c.*,coalesce(nullif(c.company_name,''),w.company_name) display_company,(select count(*)::int from public.z19p_portfolio_likes l where l.case_id=c.id) like_count from public.z19p_portfolio_cases c join site s on s.owner_id=c.owner_id left join public.z19p_workspaces w on w.id=c.workspace_id where c.active=true)
select jsonb_build_object('site',(select jsonb_build_object('slug',s.slug) from site s),'cases',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'share_token',c.share_token,'company_name',c.display_company,'product_name',c.product_name,'description',c.description,'like_count',c.like_count,'company_logo_path',(select coalesce(a.processed_path,a.original_path) from public.z19p_folders f join public.z19p_assets a on a.folder_id=f.id where f.workspace_id=c.workspace_id and f.purpose='logo_empresa' order by a.created_at desc limit 1),'media',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'asset_id',a.id,'type',m.media_type,'path',coalesce(a.original_path,a.processed_path),'mime_type',a.mime_type,'size_bytes',a.size_bytes,'name',a.name,'sort_order',m.sort_order,'is_primary',m.is_primary) order by m.is_primary desc,m.sort_order,a.created_at) from public.z19p_portfolio_media m join public.z19p_assets a on a.id=m.asset_id where m.case_id=c.id),'[]'::jsonb)) order by c.sort_order,c.created_at desc) from cases c),'[]'::jsonb));$$;
grant execute on function public.z19p_get_portfolio_catalog(text) to anon,authenticated;
commit;
