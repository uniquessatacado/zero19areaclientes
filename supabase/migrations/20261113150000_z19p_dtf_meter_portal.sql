-- 13/11 (dono): área do cliente "DTF por metro".
-- "crie um acesso para clientes onde o cliente pode adicionar artes tipo em um filme deles, mas simplificado; no 019 eu cadastro o
-- cliente, ele sobe a arte e adiciona no filme e pode enviar para produção na ZERO19; no meu Montar filme mostra que um cliente
-- mandou o filme para imprimirmos, eu adiciono as artes dele no meu filme e posso mexer; cadastramos o preço do metro para esse
-- cliente (58 × 100 e 28 × 100); quando ele manda para produção vem como se fosse um pedido; ele acompanha os status".
-- Respostas: acesso por e-mail e senha; pagamento "a combinar" (o pedido vai direto para a fila e fica a receber); pedido automático
-- no PDV da ZERO19; cobra o metro, com a possibilidade de cobrar por arte (tabela de tamanhos) para quem quer menos de 1 metro.
--
-- Isolamento: o cliente é um usuário do Supabase SEM perfil da equipe (z19p_profiles). Ele só vê as tabelas z19p_dtf_* dele (pelo
-- user_id) e os arquivos da própria pasta <user_id>/ no bucket privado z19p-private (regras que já existem). A equipe da ZERO19
-- (perfil ativo da conta 96d8732c…) vê e lê os clientes e arquivos da conta dela. Tudo o que muda pedido passa por funções.

-- ───────────────────────────── tabelas ─────────────────────────────
create table if not exists public.z19p_dtf_clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  tenant_id uuid not null default '0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid,
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null check (length(btrim(name)) between 2 and 120),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 160),
  whatsapp text check (whatsapp is null or length(whatsapp) <= 30),
  price58 numeric(10,2) not null default 0 check (price58 >= 0 and price58 <= 100000),
  price28 numeric(10,2) not null default 0 check (price28 >= 0 and price28 <= 100000),
  pricing_mode text not null default 'meter' check (pricing_mode in ('meter','art','auto')),
  art_table jsonb not null default '[]'::jsonb check (jsonb_typeof(art_table) = 'array'),
  notes text check (notes is null or length(notes) <= 1000),
  active boolean not null default true,
  customer_id uuid,
  seen_tips text[] not null default '{}',
  last_login_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists z19p_dtf_clients_owner_email on public.z19p_dtf_clients (owner_id, lower(email));

create table if not exists public.z19p_dtf_access_tokens (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.z19p_dtf_clients(id) on delete cascade,
  token_hash text not null unique,
  purpose text not null check (purpose in ('first','reset')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists z19p_dtf_access_tokens_client on public.z19p_dtf_access_tokens (client_id, created_at desc);

create table if not exists public.z19p_dtf_folders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.z19p_dtf_clients(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists z19p_dtf_folders_client on public.z19p_dtf_folders (client_id);

create table if not exists public.z19p_dtf_assets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.z19p_dtf_clients(id) on delete cascade,
  folder_id uuid references public.z19p_dtf_folders(id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 120),
  original_path text,
  print_path text not null,
  thumb_path text,
  original_mime text,
  size_bytes bigint,
  width_px integer not null check (width_px > 0),
  height_px integer not null check (height_px > 0),
  dpi numeric(8,2) not null check (dpi > 0),
  width_cm numeric(8,2) not null check (width_cm > 0 and width_cm <= 1000),
  height_cm numeric(8,2) not null check (height_cm > 0 and height_cm <= 1000),
  has_alpha boolean not null default true,
  trimmed boolean not null default false,
  upscaled boolean not null default false,
  source_dpi numeric(8,2) check (source_dpi is null or source_dpi > 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists z19p_dtf_assets_client on public.z19p_dtf_assets (client_id, created_at desc);
-- Resolução de origem (a arte ampliada para 300 DPI continua mostrando a qualidade real).
alter table public.z19p_dtf_assets add column if not exists source_dpi numeric(8,2) check (source_dpi is null or source_dpi > 0);

create table if not exists public.z19p_dtf_films (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.z19p_dtf_clients(id) on delete cascade,
  name text not null default 'Meu filme' check (length(btrim(name)) between 1 and 80),
  film_width_cm integer not null default 58 check (film_width_cm in (58,28)),
  allow_rotate boolean not null default true,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  length_cm numeric(8,2),
  status text not null default 'draft' check (status in ('draft','sent','printing','ready','delivered','cancelled')),
  delivery text check (delivery is null or delivery in ('pickup','shipping')),
  client_note text check (client_note is null or length(client_note) <= 600),
  sent_items jsonb,
  price jsonb,
  total numeric(10,2),
  order_id uuid,
  order_display_id bigint,
  sent_at timestamptz,
  printing_at timestamptz,
  printing_by uuid,
  ready_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  cancelled_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists z19p_dtf_films_client on public.z19p_dtf_films (client_id, updated_at desc);
create index if not exists z19p_dtf_films_status on public.z19p_dtf_films (status, sent_at);

-- ───────────────────────────── quem é quem ─────────────────────────────
-- Dono da conta do 019 para um membro ATIVO da equipe (nulo para cliente DTF ou qualquer outro login).
create or replace function public.z19p_dtf_staff_owner()
returns uuid language sql stable security definer set search_path to '' as $$
  select coalesce(p.account_owner_id, p.id) from public.z19p_profiles p where p.id = auth.uid() and p.active limit 1
$$;
-- Cliente DTF do login atual (nulo para a equipe ou quem não é cliente).
create or replace function public.z19p_dtf_my_client_id()
returns uuid language sql stable security definer set search_path to '' as $$
  select c.id from public.z19p_dtf_clients c where c.user_id = auth.uid() and c.active limit 1
$$;
create or replace function public.z19p_dtf_staff_can_read(p_path text)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists(select 1 from public.z19p_dtf_clients c
    where c.user_id::text = split_part(coalesce(p_path, ''), '/', 1) and c.owner_id = public.z19p_dtf_staff_owner())
$$;
revoke all on function public.z19p_dtf_staff_owner() from public, anon;
revoke all on function public.z19p_dtf_my_client_id() from public, anon;
revoke all on function public.z19p_dtf_staff_can_read(text) from public, anon;
grant execute on function public.z19p_dtf_staff_owner() to authenticated;
grant execute on function public.z19p_dtf_my_client_id() to authenticated;
grant execute on function public.z19p_dtf_staff_can_read(text) to authenticated;

-- ───────────────────────────── RLS ─────────────────────────────
alter table public.z19p_dtf_clients enable row level security;
alter table public.z19p_dtf_access_tokens enable row level security;
alter table public.z19p_dtf_folders enable row level security;
alter table public.z19p_dtf_assets enable row level security;
alter table public.z19p_dtf_films enable row level security;
revoke all on public.z19p_dtf_access_tokens from anon, authenticated;
revoke all on public.z19p_dtf_clients from anon;
revoke all on public.z19p_dtf_folders from anon;
revoke all on public.z19p_dtf_assets from anon;
revoke all on public.z19p_dtf_films from anon;
-- Cadastro: só leitura direta (cliente vê o dele; equipe vê os da conta). Gravar só pelas funções.
revoke insert, update, delete on public.z19p_dtf_clients from authenticated;
grant select on public.z19p_dtf_clients to authenticated;

drop policy if exists z19p_dtf_clients_read on public.z19p_dtf_clients;
create policy z19p_dtf_clients_read on public.z19p_dtf_clients for select to authenticated
  using (user_id = (select auth.uid()) or owner_id = (select public.z19p_dtf_staff_owner()));

grant select, insert, update, delete on public.z19p_dtf_folders to authenticated;
drop policy if exists z19p_dtf_folders_client on public.z19p_dtf_folders;
create policy z19p_dtf_folders_client on public.z19p_dtf_folders for all to authenticated
  using (client_id = (select public.z19p_dtf_my_client_id()))
  with check (client_id = (select public.z19p_dtf_my_client_id()));
drop policy if exists z19p_dtf_folders_staff on public.z19p_dtf_folders;
create policy z19p_dtf_folders_staff on public.z19p_dtf_folders for select to authenticated
  using (exists(select 1 from public.z19p_dtf_clients c where c.id = client_id and c.owner_id = (select public.z19p_dtf_staff_owner())));

grant select, insert, update, delete on public.z19p_dtf_assets to authenticated;
drop policy if exists z19p_dtf_assets_client on public.z19p_dtf_assets;
create policy z19p_dtf_assets_client on public.z19p_dtf_assets for all to authenticated
  using (client_id = (select public.z19p_dtf_my_client_id()))
  with check (client_id = (select public.z19p_dtf_my_client_id())
    and print_path like (select auth.uid())::text || '/dtf/%'
    and (original_path is null or original_path like (select auth.uid())::text || '/dtf/%')
    and (thumb_path is null or thumb_path like (select auth.uid())::text || '/dtf/%')
    and (folder_id is null or exists(select 1 from public.z19p_dtf_folders f where f.id = folder_id and f.client_id = z19p_dtf_assets.client_id)));
drop policy if exists z19p_dtf_assets_staff on public.z19p_dtf_assets;
create policy z19p_dtf_assets_staff on public.z19p_dtf_assets for select to authenticated
  using (exists(select 1 from public.z19p_dtf_clients c where c.id = client_id and c.owner_id = (select public.z19p_dtf_staff_owner())));

grant select, insert, update, delete on public.z19p_dtf_films to authenticated;
drop policy if exists z19p_dtf_films_client_read on public.z19p_dtf_films;
create policy z19p_dtf_films_client_read on public.z19p_dtf_films for select to authenticated
  using (client_id = (select public.z19p_dtf_my_client_id()));
drop policy if exists z19p_dtf_films_client_insert on public.z19p_dtf_films;
create policy z19p_dtf_films_client_insert on public.z19p_dtf_films for insert to authenticated
  with check (client_id = (select public.z19p_dtf_my_client_id()) and status = 'draft' and order_id is null and sent_at is null);
drop policy if exists z19p_dtf_films_client_update on public.z19p_dtf_films;
create policy z19p_dtf_films_client_update on public.z19p_dtf_films for update to authenticated
  using (client_id = (select public.z19p_dtf_my_client_id()) and status = 'draft')
  with check (client_id = (select public.z19p_dtf_my_client_id()) and status = 'draft' and order_id is null and sent_at is null);
drop policy if exists z19p_dtf_films_client_delete on public.z19p_dtf_films;
create policy z19p_dtf_films_client_delete on public.z19p_dtf_films for delete to authenticated
  using (client_id = (select public.z19p_dtf_my_client_id()) and status = 'draft');
drop policy if exists z19p_dtf_films_staff on public.z19p_dtf_films;
create policy z19p_dtf_films_staff on public.z19p_dtf_films for select to authenticated
  using (exists(select 1 from public.z19p_dtf_clients c where c.id = client_id and c.owner_id = (select public.z19p_dtf_staff_owner())));

-- A equipe lê os arquivos (pasta <user_id>/ do cliente) no bucket privado; o cliente já grava e lê a própria pasta.
drop policy if exists z19p_dtf_staff_read_private on storage.objects;
create policy z19p_dtf_staff_read_private on storage.objects for select to authenticated
  using (bucket_id = 'z19p-private' and (select public.z19p_dtf_staff_can_read(objects.name)));

-- ───────────────────────────── preço (mesma conta da tela: dtf-pricing.js) ─────────────────────────────
-- meter: metro inteiro para cima × preço do metro da largura. art: cada arte cai na 1ª faixa (menor área) em que cabe (pode
-- girar). auto: menos de 1 m = por arte, mas nunca mais que 1 metro; 1 m ou mais = metro. Faltou faixa para uma arte = metro.
create or replace function public.z19p_dtf_price(p_price58 numeric, p_price28 numeric, p_mode text, p_table jsonb, p_width integer, p_length numeric, p_items jsonb)
returns jsonb language plpgsql immutable set search_path to '' as $$
declare
  v_per numeric := case when p_width = 28 then p_price28 else p_price58 end;
  v_meters integer; v_meter_total numeric; v_art_total numeric := 0; v_art_ok boolean := true; v_lines jsonb := '[]'::jsonb;
  v_item jsonb; v_unit numeric; v_w numeric; v_h numeric; v_q integer; v_use_art boolean; v_total numeric; v_charged text;
begin
  if coalesce(v_per, 0) > 0 and coalesce(p_length, 0) > 0 then
    v_meters := greatest(1, ceil(p_length / 100 - 1e-9)::integer);
    v_meter_total := round(v_meters * v_per, 2);
  end if;
  v_use_art := p_mode = 'art' or (p_mode = 'auto' and coalesce(p_length, 0) < 100);
  if v_use_art then
    for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
      v_w := (v_item->>'widthCm')::numeric; v_h := (v_item->>'heightCm')::numeric; v_q := greatest(0, round(coalesce((v_item->>'quantity')::numeric, 0))::integer);
      v_unit := null;
      select (r.value->>'price')::numeric into v_unit
        from jsonb_array_elements(coalesce(p_table, '[]'::jsonb)) r
        where (r.value->>'maxWidthCm')::numeric > 0 and (r.value->>'maxHeightCm')::numeric > 0 and (r.value->>'price')::numeric >= 0
          and ((v_w <= (r.value->>'maxWidthCm')::numeric + 1e-6 and v_h <= (r.value->>'maxHeightCm')::numeric + 1e-6)
            or (v_h <= (r.value->>'maxWidthCm')::numeric + 1e-6 and v_w <= (r.value->>'maxHeightCm')::numeric + 1e-6))
        order by (r.value->>'maxWidthCm')::numeric * (r.value->>'maxHeightCm')::numeric, (r.value->>'price')::numeric
        limit 1;
      if v_unit is null then v_art_ok := false; end if;
      v_lines := v_lines || jsonb_build_object('assetId', v_item->'assetId', 'name', v_item->'name', 'widthCm', v_w, 'heightCm', v_h,
        'quantity', v_q, 'unit', v_unit, 'subtotal', case when v_unit is null then null else round(v_unit * v_q, 2) end);
      v_art_total := v_art_total + coalesce(v_unit * v_q, 0);
    end loop;
    v_art_total := round(v_art_total, 2);
  end if;
  if v_use_art and v_art_ok and (p_mode = 'art' or v_meter_total is null or v_art_total <= v_meter_total) then
    v_total := v_art_total; v_charged := 'art';
  elsif v_meter_total is not null then
    v_total := v_meter_total; v_charged := 'meter';
  end if;
  return jsonb_build_object('mode', p_mode, 'charged', v_charged, 'total', v_total,
    'meter', case when v_meter_total is null then null else jsonb_build_object('meters', v_meters, 'perMeter', v_per, 'total', v_meter_total) end,
    'art', case when v_use_art then jsonb_build_object('lines', v_lines, 'total', case when v_art_ok then v_art_total end, 'complete', v_art_ok) end);
end $$;
grant execute on function public.z19p_dtf_price(numeric, numeric, text, jsonb, integer, numeric, jsonb) to authenticated;

-- ───────────────────────────── cliente no PDV (customers da ZERO19) ─────────────────────────────
create or replace function public.z19p_dtf_ensure_customer(p_client_id uuid)
returns uuid language plpgsql security definer set search_path to '' as $$
declare c public.z19p_dtf_clients; v_digits text; v_local text; v_id uuid;
begin
  select * into c from public.z19p_dtf_clients where id = p_client_id;
  if not found then raise exception 'Cliente DTF não encontrado.'; end if;
  if c.customer_id is not null and exists(select 1 from public.customers x where x.id = c.customer_id and x.tenant_id = c.tenant_id) then return c.customer_id; end if;
  v_digits := regexp_replace(coalesce(c.whatsapp, ''), '\D', '', 'g');
  v_local := case when length(v_digits) in (12, 13) and v_digits like '55%' then substr(v_digits, 3) else v_digits end;
  if length(v_local) >= 10 then
    select x.id into v_id from public.customers x
      where x.tenant_id = c.tenant_id and regexp_replace(coalesce(x.whatsapp, ''), '\D', '', 'g') in (v_local, '55' || v_local)
      order by x.created_at nulls last limit 1;
  end if;
  if v_id is null and c.email is not null then
    select x.id into v_id from public.customers x where x.tenant_id = c.tenant_id and lower(x.email) = lower(c.email) order by x.created_at nulls last limit 1;
  end if;
  if v_id is null then
    insert into public.customers (tenant_id, full_name, whatsapp, email, customer_type, observacao)
    values (c.tenant_id, btrim(c.name), coalesce(nullif(v_local, ''), '0'), lower(c.email), 'USO_PROPRIO', 'Cliente DTF por metro (área do cliente no 019)')
    returning id into v_id;
  end if;
  update public.z19p_dtf_clients set customer_id = v_id where id = c.id;
  return v_id;
end $$;
revoke all on function public.z19p_dtf_ensure_customer(uuid) from public, anon, authenticated;

-- ───────────────────────────── área do cliente ─────────────────────────────
-- Quem sou eu. Liga sozinho pelo e-mail uma conta que já existia ANTES do cadastro (ex.: conta Venduss com o mesmo e-mail),
-- nunca uma conta criada depois (ninguém consegue "pegar" o cadastro de outro criando conta com o e-mail dele).
create or replace function public.z19p_dtf_me()
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := auth.uid(); c public.z19p_dtf_clients; v_email text; v_created timestamptz; v_confirmed timestamptz;
begin
  if v_uid is null then raise exception 'Entre com seu e-mail e senha.'; end if;
  if exists(select 1 from public.z19p_profiles p where p.id = v_uid) then return jsonb_build_object('error', 'staff'); end if;
  select * into c from public.z19p_dtf_clients where user_id = v_uid;
  if not found then
    select lower(u.email), u.created_at, u.email_confirmed_at into v_email, v_created, v_confirmed from auth.users u where u.id = v_uid;
    if v_email is not null and v_confirmed is not null then
      select * into c from public.z19p_dtf_clients x
        where lower(x.email) = v_email and x.user_id is null and x.active and x.created_at > v_created
        order by x.created_at limit 1 for update;
      if found then update public.z19p_dtf_clients set user_id = v_uid, updated_at = now() where id = c.id returning * into c; end if;
    end if;
  end if;
  if c.id is null then return jsonb_build_object('error', 'not_client'); end if;
  if not c.active then return jsonb_build_object('error', 'inactive'); end if;
  update public.z19p_dtf_clients set last_login_at = now() where id = c.id and (last_login_at is null or last_login_at < now() - interval '5 minutes');
  return jsonb_build_object('id', c.id, 'name', c.name, 'email', c.email, 'whatsapp', c.whatsapp,
    'price58', c.price58, 'price28', c.price28, 'mode', c.pricing_mode, 'artTable', c.art_table, 'seenTips', to_jsonb(c.seen_tips),
    'store', jsonb_build_object('name', 'ZERO19', 'whatsapp', '5519995125752'));
end $$;
revoke all on function public.z19p_dtf_me() from public, anon;
grant execute on function public.z19p_dtf_me() to authenticated;

create or replace function public.z19p_dtf_tip_seen(p_key text)
returns void language plpgsql security definer set search_path to '' as $$
declare v_key text := left(btrim(coalesce(p_key, '')), 60);
begin
  if v_key = '' then return; end if;
  update public.z19p_dtf_clients set seen_tips = case when v_key = '*reset*' then '{}' else (select array(select distinct k from unnest(seen_tips || v_key) k limit 400)) end
    where user_id = auth.uid() and active and (v_key = '*reset*' or not (v_key = any(seen_tips)));
end $$;
revoke all on function public.z19p_dtf_tip_seen(text) from public, anon;
grant execute on function public.z19p_dtf_tip_seen(text) to authenticated;

-- Situação que o cliente vê: a do filme, puxada para frente pelo pedido no PDV (pronto, entregue, pago, cancelado).
create or replace function public.z19p_dtf_film_view(f public.z19p_dtf_films, o public.orders)
returns jsonb language sql stable set search_path to '' as $$
  select jsonb_build_object('id', f.id, 'name', f.name, 'filmWidthCm', f.film_width_cm, 'lengthCm', f.length_cm, 'total', f.total,
    'price', f.price, 'items', coalesce(f.sent_items, '[]'::jsonb), 'delivery', f.delivery, 'note', f.client_note,
    'orderId', f.order_id, 'orderNumber', f.order_display_id, 'sentAt', f.sent_at, 'printingAt', f.printing_at,
    'readyAt', coalesce(f.ready_at, case when o.status = 'PRONTO_RETIRADA' then o.updated_at end),
    'deliveredAt', coalesce(f.delivered_at, o.picked_up_at, case when o.status in ('ENTREGUE','CONCLUIDO','ENVIADO') then o.updated_at end),
    'cancelledAt', coalesce(f.cancelled_at, case when o.status = 'CANCELADO' then o.updated_at end), 'cancelReason', f.cancel_reason,
    'status', case
      when f.status = 'cancelled' or o.status = 'CANCELADO' then 'cancelled'
      when f.status = 'delivered' or o.picked_up_at is not null or o.status in ('ENTREGUE','CONCLUIDO','ENVIADO') then 'delivered'
      when f.status = 'ready' or o.status = 'PRONTO_RETIRADA' then 'ready'
      when f.status = 'printing' then 'printing'
      else 'sent' end,
    'payment', jsonb_build_object('status', coalesce(o.payment_status, 'PENDENTE'), 'paid', coalesce(o.amount_paid, 0), 'total', coalesce(o.total_amount, f.total)))
$$;
revoke all on function public.z19p_dtf_film_view(public.z19p_dtf_films, public.orders) from public, anon, authenticated;

create or replace function public.z19p_dtf_my_orders()
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_client uuid := public.z19p_dtf_my_client_id();
begin
  if v_client is null then raise exception 'Acesso de cliente DTF não encontrado.'; end if;
  return coalesce((select jsonb_agg(public.z19p_dtf_film_view(f, o) order by f.sent_at desc)
    from public.z19p_dtf_films f left join public.orders o on o.id = f.order_id
    where f.client_id = v_client and f.status <> 'draft'), '[]'::jsonb);
end $$;
revoke all on function public.z19p_dtf_my_orders() from public, anon;
grant execute on function public.z19p_dtf_my_orders() to authenticated;

-- Enviar para produção: confere as artes, a medida, o comprimento e o preço no servidor e cria o pedido no PDV da ZERO19
-- (pagar na retirada = a combinar: entra em "Pagamentos na retirada" do PDV com o valor a receber).
create or replace function public.z19p_dtf_send_film(p_film_id uuid, p_length_cm numeric, p_delivery text, p_note text default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_client uuid := public.z19p_dtf_my_client_id(); c public.z19p_dtf_clients; f public.z19p_dtf_films;
  v_items jsonb := '[]'::jsonb; v_item jsonb; a public.z19p_dtf_assets; v_w numeric; v_h numeric; v_q integer;
  v_width integer; v_area numeric := 0; v_min_len numeric := 0; v_count integer := 0; v_units integer := 0;
  v_price jsonb; v_total numeric; v_customer uuid; v_order uuid; v_display bigint; v_note text; v_line jsonb; v_names text;
begin
  if v_client is null then raise exception 'Acesso de cliente DTF não encontrado.'; end if;
  select * into c from public.z19p_dtf_clients where id = v_client;
  select * into f from public.z19p_dtf_films where id = p_film_id and client_id = v_client for update;
  if not found then raise exception 'Filme não encontrado.'; end if;
  if f.status <> 'draft' then raise exception 'Este filme já foi enviado para a produção.'; end if;
  if coalesce(p_delivery, '') not in ('pickup','shipping') then raise exception 'Escolha se vai retirar na loja ou receber.'; end if;
  v_width := f.film_width_cm;
  for v_item in select value from jsonb_array_elements(f.items) loop
    select * into a from public.z19p_dtf_assets where id = (v_item->>'assetId')::uuid and client_id = v_client and deleted_at is null;
    if not found then raise exception 'Uma arte deste filme foi excluída. Tire-a do filme e envie de novo.'; end if;
    v_w := round((v_item->>'widthCm')::numeric, 2); v_h := round((v_item->>'heightCm')::numeric, 2);
    v_q := round(coalesce((v_item->>'quantity')::numeric, 0))::integer;
    if not (v_w > 0 and v_h > 0 and v_w <= 1000 and v_h <= 1000) then raise exception 'A arte "%" está com medida inválida.', a.name; end if;
    if v_q < 1 or v_q > 999 then raise exception 'A quantidade da arte "%" precisa ser de 1 a 999.', a.name; end if;
    if not (v_w <= v_width + 0.01 or (f.allow_rotate and v_h <= v_width + 0.01)) then
      raise exception 'A arte "%" (% × % cm) não cabe no filme de % cm.', a.name, v_w, v_h, v_width;
    end if;
    v_min_len := greatest(v_min_len, case when f.allow_rotate and greatest(v_w, v_h) <= v_width + 0.01 then least(v_w, v_h) when v_w <= v_width + 0.01 then v_h else v_w end);
    v_area := v_area + v_w * v_h * v_q; v_count := v_count + 1; v_units := v_units + v_q;
    v_items := v_items || jsonb_build_object('assetId', a.id, 'name', a.name, 'path', a.print_path, 'thumbPath', a.thumb_path,
      'widthCm', v_w, 'heightCm', v_h, 'quantity', v_q, 'widthPx', a.width_px, 'heightPx', a.height_px);
  end loop;
  if v_count = 0 then raise exception 'Coloque pelo menos uma arte no filme.'; end if;
  if v_count > 300 or v_units > 5000 then raise exception 'Filme grande demais para um pedido só: divida em mais de um filme.'; end if;
  if p_length_cm is null or p_length_cm > 100000 or p_length_cm < greatest(v_min_len, v_area / v_width) - 0.5 then
    raise exception 'O comprimento do filme não confere. Toque em Atualizar e envie de novo.';
  end if;
  v_price := public.z19p_dtf_price(c.price58, c.price28, c.pricing_mode, c.art_table, v_width, p_length_cm, v_items);
  v_total := (v_price->>'total')::numeric;
  if v_total is null or v_total <= 0 then raise exception 'O preço do filme de % cm ainda não está cadastrado. Fale com a ZERO19.', v_width; end if;

  v_customer := public.z19p_dtf_ensure_customer(c.id);
  v_note := left(btrim(coalesce(p_note, '')), 600);
  v_names := 'DTF POR METRO · Filme ' || v_width || ' cm · ' || case when p_length_cm < 100 then replace(to_char(p_length_cm, 'FM9990.0'), '.', ',') || ' cm · ' else replace(to_char(p_length_cm / 100, 'FM9990.00'), '.', ',') || ' m · ' end
    || v_units || case when v_units = 1 then ' arte' else ' artes' end
    || ' · ' || case when p_delivery = 'pickup' then 'Retirar na loja' else 'Receber (frete a combinar)' end
    || ' · Pagamento a combinar' || case when v_note <> '' then ' · Obs.: ' || v_note else '' end;
  insert into public.orders (tenant_id, customer_id, status, payment_status, origin, total_amount, subtotal_amount, shipping_cost,
    shipping_method, payment_method, observacao_cliente, amount_paid, payment_timing, pickup_balance_due, discount_type, discount_value)
  values (c.tenant_id, v_customer, 'RECEBIDO', 'PENDENTE', 'PDV', v_total, v_total, 0,
    case when p_delivery = 'pickup' then 'RETIRADA NA LOJA' else 'A COMBINAR (DTF)' end, 'A COMBINAR', v_names, 0, 'PAY_AT_PICKUP', v_total, 'value', 0)
  returning id, display_id into v_order, v_display;
  if v_price->>'charged' = 'meter' then
    insert into public.order_items (tenant_id, order_id, product_name, size, quantity, unit_price, cost_price, subtotal, metadata)
    values (c.tenant_id, v_order, 'DTF por metro · filme ' || v_width || ' cm', v_width || ' cm',
      (v_price->'meter'->>'meters')::integer, (v_price->'meter'->>'perMeter')::numeric, 0, (v_price->'meter'->>'total')::numeric,
      jsonb_build_object('source', 'z19p_dtf', 'film_id', f.id, 'length_cm', p_length_cm, 'charged', 'meter', 'arts', v_units));
  else
    for v_line in select value from jsonb_array_elements(v_price->'art'->'lines') loop
      insert into public.order_items (tenant_id, order_id, product_name, size, quantity, unit_price, cost_price, subtotal, metadata)
      values (c.tenant_id, v_order, left('DTF por arte · ' || coalesce(v_line->>'name', 'arte'), 200),
        replace((v_line->>'widthCm'), '.', ',') || ' × ' || replace((v_line->>'heightCm'), '.', ',') || ' cm',
        (v_line->>'quantity')::integer, (v_line->>'unit')::numeric, 0, (v_line->>'subtotal')::numeric,
        jsonb_build_object('source', 'z19p_dtf', 'film_id', f.id, 'charged', 'art', 'asset_id', v_line->'assetId'));
    end loop;
  end if;
  update public.z19p_dtf_films set status = 'sent', length_cm = round(p_length_cm, 2), delivery = p_delivery, client_note = nullif(v_note, ''),
    sent_items = v_items, price = v_price, total = v_total, order_id = v_order, order_display_id = v_display, sent_at = now(), updated_at = now()
    where id = f.id;
  return jsonb_build_object('orderId', v_order, 'orderNumber', v_display, 'total', v_total, 'price', v_price);
end $$;
revoke all on function public.z19p_dtf_send_film(uuid, numeric, text, text) from public, anon;
grant execute on function public.z19p_dtf_send_film(uuid, numeric, text, text) to authenticated;

-- Cancelar: o cliente só enquanto a ZERO19 não começou (ainda "na fila"); a equipe a qualquer momento antes de entregar.
create or replace function public.z19p_dtf_cancel_internal(p_film_id uuid, p_reason text, p_by text)
returns void language plpgsql security definer set search_path to '' as $$
declare f public.z19p_dtf_films;
begin
  select * into f from public.z19p_dtf_films where id = p_film_id for update;
  update public.z19p_dtf_films set status = 'cancelled', cancelled_at = now(), cancel_reason = nullif(left(btrim(coalesce(p_reason, '')), 300), ''),
    cancelled_by = p_by, updated_at = now() where id = p_film_id;
  if f.order_id is not null then
    update public.orders set status = 'CANCELADO', payment_status = case when coalesce(amount_paid, 0) > 0 then payment_status else 'CANCELADO' end,
      pickup_balance_due = 0, updated_at = now()
      where id = f.order_id and status <> 'CANCELADO';
  end if;
end $$;
revoke all on function public.z19p_dtf_cancel_internal(uuid, text, text) from public, anon, authenticated;

create or replace function public.z19p_dtf_cancel_film(p_film_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_client uuid := public.z19p_dtf_my_client_id(); f public.z19p_dtf_films; o public.orders;
begin
  if v_client is null then raise exception 'Acesso de cliente DTF não encontrado.'; end if;
  select * into f from public.z19p_dtf_films where id = p_film_id and client_id = v_client for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  select * into o from public.orders where id = f.order_id;
  if f.status <> 'sent' or coalesce(o.status, '') in ('PRONTO_RETIRADA','ENTREGUE','CONCLUIDO','ENVIADO','CANCELADO') or coalesce(o.amount_paid, 0) > 0 then
    raise exception 'A ZERO19 já começou este pedido. Para mudar, fale com a gente no WhatsApp.';
  end if;
  perform public.z19p_dtf_cancel_internal(f.id, coalesce(nullif(btrim(p_reason), ''), 'Cancelado pelo cliente'), 'client');
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.z19p_dtf_cancel_film(uuid, text) from public, anon;
grant execute on function public.z19p_dtf_cancel_film(uuid, text) to authenticated;

-- ───────────────────────────── equipe (019) ─────────────────────────────
create or replace function public.z19p_dtf_assert_staff()
returns uuid language plpgsql stable security definer set search_path to '' as $$
declare v_owner uuid := public.z19p_dtf_staff_owner();
begin
  if auth.uid() is null or v_owner is distinct from '96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid then raise exception 'Acesso não autorizado.'; end if;
  return v_owner;
end $$;
revoke all on function public.z19p_dtf_assert_staff() from public, anon, authenticated;

-- Normaliza a tabela de preço por arte: [{maxWidthCm, maxHeightCm, price}], até 30 faixas.
create or replace function public.z19p_dtf_clean_table(p jsonb)
returns jsonb language sql immutable set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('maxWidthCm', w, 'maxHeightCm', h, 'price', pr) order by w * h, pr), '[]'::jsonb)
  from (select round(coalesce(r->>'maxWidthCm', r->>'max_width_cm')::numeric, 2) w, round(coalesce(r->>'maxHeightCm', r->>'max_height_cm')::numeric, 2) h,
          round((r->>'price')::numeric, 2) pr
        from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) r limit 30) t
  where w > 0 and h > 0 and w <= 1000 and h <= 1000 and pr >= 0 and pr <= 100000
$$;

create or replace function public.z19p_dtf_save_client(p jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_owner uuid := public.z19p_dtf_assert_staff(); v_id uuid := nullif(p->>'id', '')::uuid; c public.z19p_dtf_clients;
  v_email text := lower(btrim(coalesce(p->>'email', ''))); v_name text := btrim(coalesce(p->>'name', ''));
  v_whats text := nullif(regexp_replace(coalesce(p->>'whatsapp', ''), '[^0-9+() -]', '', 'g'), '');
  v_mode text := coalesce(nullif(p->>'mode', ''), 'meter'); v_p58 numeric := round(coalesce(nullif(p->>'price58', '')::numeric, 0), 2);
  v_p28 numeric := round(coalesce(nullif(p->>'price28', '')::numeric, 0), 2); v_table jsonb := public.z19p_dtf_clean_table(p->'artTable');
begin
  if length(v_name) < 2 then raise exception 'Escreva o nome do cliente.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail inválido.'; end if;
  if v_mode not in ('meter','art','auto') then raise exception 'Forma de cobrança inválida.'; end if;
  if length(regexp_replace(coalesce(v_whats, ''), '\D', '', 'g')) < 10 then raise exception 'Informe o WhatsApp do cliente com DDD (é o cadastro dele no PDV).'; end if;
  if v_p58 <= 0 and v_p28 <= 0 then raise exception 'Informe o preço do metro de pelo menos um filme (58 ou 28 cm).'; end if;
  if v_mode in ('art','auto') and jsonb_array_length(v_table) = 0 then raise exception 'Para cobrar por arte, cadastre pelo menos uma faixa de tamanho com preço.'; end if;
  if exists(select 1 from public.z19p_dtf_clients x where x.owner_id = v_owner and lower(x.email) = v_email and x.id is distinct from v_id) then
    raise exception 'Já existe um cliente DTF com este e-mail.';
  end if;
  if exists(select 1 from public.z19p_profiles pr join auth.users u on u.id = pr.id where lower(u.email) = v_email) then
    raise exception 'Este e-mail é de uma conta da equipe do 019. Use o e-mail do cliente.';
  end if;
  if v_id is null then
    insert into public.z19p_dtf_clients (owner_id, name, email, whatsapp, price58, price28, pricing_mode, art_table, notes, created_by, updated_by)
    values (v_owner, v_name, v_email, v_whats, v_p58, v_p28, v_mode, v_table, nullif(left(btrim(coalesce(p->>'notes', '')), 1000), ''), auth.uid(), auth.uid())
    returning * into c;
  else
    select * into c from public.z19p_dtf_clients where id = v_id and owner_id = v_owner for update;
    if not found then raise exception 'Cliente não encontrado.'; end if;
    if c.user_id is not null and lower(c.email) <> v_email then
      raise exception 'O cliente já criou a senha com o e-mail %. Para trocar o e-mail, cadastre de novo.', c.email;
    end if;
    update public.z19p_dtf_clients set name = v_name, email = v_email, whatsapp = v_whats, price58 = v_p58, price28 = v_p28, pricing_mode = v_mode,
      art_table = v_table, notes = nullif(left(btrim(coalesce(p->>'notes', '')), 1000), ''), active = coalesce((p->>'active')::boolean, active),
      customer_id = case when coalesce(whatsapp, '') is distinct from coalesce(v_whats, '') then null else customer_id end,
      updated_by = auth.uid(), updated_at = now()
      where id = c.id returning * into c;
  end if;
  if c.whatsapp is not null then perform public.z19p_dtf_ensure_customer(c.id); end if;
  return jsonb_build_object('id', c.id);
end $$;
revoke all on function public.z19p_dtf_save_client(jsonb) from public, anon;
grant execute on function public.z19p_dtf_save_client(jsonb) to authenticated;

-- Link de acesso (primeiro acesso ou trocar a senha). Guarda só o hash; o link vale 7 dias e uma vez.
create or replace function public.z19p_dtf_issue_access(p_client_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_owner uuid := public.z19p_dtf_assert_staff(); c public.z19p_dtf_clients; v_token text; v_expires timestamptz := now() + interval '7 days';
begin
  select * into c from public.z19p_dtf_clients where id = p_client_id and owner_id = v_owner;
  if not found then raise exception 'Cliente não encontrado.'; end if;
  if not c.active then raise exception 'Este cliente está desativado.'; end if;
  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  update public.z19p_dtf_access_tokens set used_at = coalesce(used_at, now()) where client_id = c.id and used_at is null;
  insert into public.z19p_dtf_access_tokens (client_id, token_hash, purpose, expires_at, created_by)
  values (c.id, encode(extensions.digest(v_token, 'sha256'), 'hex'), case when c.user_id is null then 'first' else 'reset' end, v_expires, auth.uid());
  return jsonb_build_object('token', v_token, 'expiresAt', v_expires, 'purpose', case when c.user_id is null then 'first' else 'reset' end);
end $$;
revoke all on function public.z19p_dtf_issue_access(uuid) from public, anon;
grant execute on function public.z19p_dtf_issue_access(uuid) to authenticated;

create or replace function public.z19p_dtf_staff_clients()
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_owner uuid := public.z19p_dtf_assert_staff();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'email', c.email, 'whatsapp', c.whatsapp,
      'price58', c.price58, 'price28', c.price28, 'mode', c.pricing_mode, 'artTable', c.art_table, 'notes', c.notes, 'active', c.active,
      'hasAccess', c.user_id is not null, 'lastLoginAt', c.last_login_at, 'createdAt', c.created_at,
      'arts', (select count(*) from public.z19p_dtf_assets a where a.client_id = c.id and a.deleted_at is null),
      'orders', (select count(*) from public.z19p_dtf_films f where f.client_id = c.id and f.status not in ('draft','cancelled')),
      'linkPending', exists(select 1 from public.z19p_dtf_access_tokens t where t.client_id = c.id and t.used_at is null and t.expires_at > now()))
    order by c.active desc, lower(c.name)) from public.z19p_dtf_clients c where c.owner_id = v_owner), '[]'::jsonb);
end $$;
revoke all on function public.z19p_dtf_staff_clients() from public, anon;
grant execute on function public.z19p_dtf_staff_clients() to authenticated;

-- Pedidos DTF para o Montar filme. p_scope: 'open' (na fila, em produção, prontos) ou 'all' (últimos 60 dias).
create or replace function public.z19p_dtf_staff_orders(p_scope text default 'open')
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_owner uuid := public.z19p_dtf_assert_staff();
begin
  return coalesce((select jsonb_agg(public.z19p_dtf_film_view(f, o) || jsonb_build_object('clientId', c.id, 'clientName', c.name,
        'clientWhatsapp', c.whatsapp, 'clientEmail', c.email, 'orderStatus', o.status, 'printingBy', f.printing_by)
      order by case when f.status = 'sent' then 0 else 1 end, f.sent_at)
    from public.z19p_dtf_films f join public.z19p_dtf_clients c on c.id = f.client_id left join public.orders o on o.id = f.order_id
    where c.owner_id = v_owner and f.status <> 'draft'
      and (case when coalesce(p_scope, 'open') = 'all' then f.sent_at > now() - interval '60 days'
           else f.status in ('sent','printing','ready') and coalesce(o.status, '') not in ('CANCELADO','ENTREGUE','CONCLUIDO','ENVIADO') and o.picked_up_at is null end)), '[]'::jsonb);
end $$;
revoke all on function public.z19p_dtf_staff_orders(text) from public, anon;
grant execute on function public.z19p_dtf_staff_orders(text) to authenticated;

create or replace function public.z19p_dtf_staff_count()
returns integer language sql stable security definer set search_path to '' as $$
  select count(*)::integer from public.z19p_dtf_films f join public.z19p_dtf_clients c on c.id = f.client_id
    left join public.orders o on o.id = f.order_id
  where c.owner_id = public.z19p_dtf_staff_owner() and f.status = 'sent' and coalesce(o.status, '') <> 'CANCELADO'
$$;
revoke all on function public.z19p_dtf_staff_count() from public, anon;
grant execute on function public.z19p_dtf_staff_count() to authenticated;

-- Andamento pela equipe: printing (pôs no filme), ready (pronto: pedido do PDV fica Pronto para retirada), delivered (entregue:
-- o pedido fica Entregue; o valor a combinar continua em "Pagamentos na retirada" do PDV até receber), sent (voltar para a fila),
-- cancelled (cancela também o pedido do PDV).
create or replace function public.z19p_dtf_staff_set_status(p_film_id uuid, p_status text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_owner uuid := public.z19p_dtf_assert_staff(); f public.z19p_dtf_films; o public.orders;
begin
  select f2.* into f from public.z19p_dtf_films f2 join public.z19p_dtf_clients c on c.id = f2.client_id
    where f2.id = p_film_id and c.owner_id = v_owner for update of f2;
  if not found then raise exception 'Pedido DTF não encontrado.'; end if;
  select * into o from public.orders where id = f.order_id;
  if f.status = 'cancelled' or coalesce(o.status, '') = 'CANCELADO' then raise exception 'Este pedido foi cancelado.'; end if;
  if f.status = 'draft' then raise exception 'Este filme ainda não foi enviado pelo cliente.'; end if;
  if p_status = 'printing' then
    update public.z19p_dtf_films set status = case when status = 'sent' then 'printing' else status end,
      printing_at = coalesce(printing_at, now()), printing_by = coalesce(printing_by, auth.uid()), updated_at = now() where id = f.id;
  elsif p_status = 'sent' then
    update public.z19p_dtf_films set status = 'sent', printing_at = null, printing_by = null, ready_at = null, updated_at = now() where id = f.id;
    update public.orders set status = 'RECEBIDO', updated_at = now() where id = f.order_id and status = 'PRONTO_RETIRADA';
  elsif p_status = 'ready' then
    update public.z19p_dtf_films set status = 'ready', printing_at = coalesce(printing_at, now()), ready_at = now(), updated_at = now() where id = f.id;
    update public.orders set status = 'PRONTO_RETIRADA', updated_at = now() where id = f.order_id and status in ('RECEBIDO','AGUARDANDO_PAGAMENTO');
  elsif p_status = 'delivered' then
    update public.z19p_dtf_films set status = 'delivered', printing_at = coalesce(printing_at, now()), ready_at = coalesce(ready_at, now()),
      delivered_at = now(), updated_at = now() where id = f.id;
    update public.orders set status = 'ENTREGUE', updated_at = now() where id = f.order_id and status in ('RECEBIDO','AGUARDANDO_PAGAMENTO','PRONTO_RETIRADA');
  elsif p_status = 'cancelled' then
    if coalesce(o.amount_paid, 0) > 0 then raise exception 'Este pedido já tem pagamento recebido no PDV. Cancele pela tela do pedido para devolver o valor.'; end if;
    perform public.z19p_dtf_cancel_internal(f.id, coalesce(nullif(btrim(p_reason), ''), 'Cancelado pela ZERO19'), 'staff');
  else
    raise exception 'Situação inválida.';
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.z19p_dtf_staff_set_status(uuid, text, text) from public, anon;
grant execute on function public.z19p_dtf_staff_set_status(uuid, text, text) to authenticated;

-- ───────────────────────────── link de acesso (só a função do servidor z19p-dtf-access, com a chave de serviço) ─────────────────────────────
create or replace function public.z19p_dtf_token_check(p_token text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare t public.z19p_dtf_access_tokens; c public.z19p_dtf_clients; v_uid uuid; v_uemail text; v_meta jsonb;
begin
  select * into t from public.z19p_dtf_access_tokens where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then return jsonb_build_object('error', 'invalid'); end if;
  if t.used_at is not null then return jsonb_build_object('error', 'used'); end if;
  if t.expires_at < now() then return jsonb_build_object('error', 'expired'); end if;
  select * into c from public.z19p_dtf_clients where id = t.client_id;
  if not c.active then return jsonb_build_object('error', 'inactive'); end if;
  if c.user_id is not null then
    select u.id, u.email, u.raw_app_meta_data into v_uid, v_uemail, v_meta from auth.users u where u.id = c.user_id;
  else
    select u.id, u.email, u.raw_app_meta_data into v_uid, v_uemail, v_meta from auth.users u where lower(u.email) = lower(c.email) limit 1;
  end if;
  return jsonb_build_object('tokenId', t.id, 'clientId', c.id, 'name', c.name, 'email', c.email, 'purpose', t.purpose,
    'userId', v_uid, 'userEmail', v_uemail, 'userIsDtf', coalesce((v_meta->>'z19p_dtf')::boolean, false),
    'userIsStaff', v_uid is not null and exists(select 1 from public.z19p_profiles p where p.id = v_uid));
end $$;
create or replace function public.z19p_dtf_token_use(p_token_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare t public.z19p_dtf_access_tokens;
begin
  select * into t from public.z19p_dtf_access_tokens where id = p_token_id for update;
  if not found or t.used_at is not null or t.expires_at < now() then raise exception 'Link de acesso inválido ou já usado.'; end if;
  if exists(select 1 from public.z19p_dtf_clients x where x.user_id = p_user_id and x.id <> t.client_id) then
    raise exception 'Esta conta já está ligada a outro cliente DTF.';
  end if;
  update public.z19p_dtf_access_tokens set used_at = now() where id = t.id;
  update public.z19p_dtf_clients set user_id = p_user_id, updated_at = now() where id = t.client_id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.z19p_dtf_token_check(text) from public, anon, authenticated;
revoke all on function public.z19p_dtf_token_use(uuid, uuid) from public, anon, authenticated;
grant execute on function public.z19p_dtf_token_check(text) to service_role;
grant execute on function public.z19p_dtf_token_use(uuid, uuid) to service_role;
