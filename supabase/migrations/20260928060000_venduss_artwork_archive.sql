-- Private bridge from the Venduss print-art bucket to the ZERO19 staff archive.
-- The public catalog must never receive the print-ready PNG URL.
alter table public.venduss_shared_print_artworks
  add column if not exists print_position_code text;

create or replace function public.z19p_can_read_partner_artwork_path(p_path text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.venduss_shared_print_artworks a
    join public.z19p_partner_tenants partner on partner.tenant_id = a.tenant_id and partner.enabled
    join public.z19p_profiles profile on profile.account_owner_id = partner.owner_id
      and profile.id = auth.uid() and profile.active
    where a.prepared_path = p_path or a.original_path = p_path
  );
$$;

revoke all on function public.z19p_can_read_partner_artwork_path(text) from public;
grant execute on function public.z19p_can_read_partner_artwork_path(text) to authenticated;

drop policy if exists z19p_partner_artwork_read on storage.objects;
create policy z19p_partner_artwork_read on storage.objects
for select to authenticated
using (bucket_id = 'venduss-print-artworks' and public.z19p_can_read_partner_artwork_path(name));

create or replace function public.z19p_list_partner_artworks()
returns table(product_id bigint, tenant_id uuid, product_name text, brand_name text,
  main_image_url text, original_path text, prepared_path text,
  width_cm numeric, height_cm numeric, pixel_width integer, pixel_height integer,
  print_position_code text, print_position_label text, created_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select a.product_id, a.tenant_id, p.name, coalesce(b.name, 'Sem marca'),
    p.main_image_url, a.original_path, a.prepared_path,
    a.width_cm, a.height_cm, a.pixel_width, a.pixel_height,
    a.print_position_code, pos.label, a.created_at
  from public.venduss_shared_print_artworks a
  join public.products p on p.id = a.product_id and p.tenant_id = a.tenant_id
  left join public.brands b on b.id = p.brand_id
  join public.z19p_partner_tenants partner on partner.tenant_id = a.tenant_id and partner.enabled
  join public.z19p_profiles profile on profile.account_owner_id = partner.owner_id
    and profile.id = auth.uid() and profile.active
  left join public.z19p_print_positions pos on pos.owner_id = partner.owner_id
    and pos.code = a.print_position_code
  order by b.name nulls last, p.name, a.created_at desc
  limit 1000;
$$;

revoke all on function public.z19p_list_partner_artworks() from public;
grant execute on function public.z19p_list_partner_artworks() to authenticated;

create or replace function public.create_shared_stock_product_with_position(
  p_tenant_id uuid, p_source_id bigint, p_details jsonb, p_artwork jsonb,
  p_position_code text)
returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare v_product_id bigint;
begin
  if not exists (
    select 1 from public.z19p_partner_tenants partner
    join public.z19p_print_positions pos on pos.owner_id = partner.owner_id
    where partner.tenant_id = p_tenant_id and partner.enabled
      and pos.code = p_position_code and pos.active
  ) then
    raise exception 'Escolha uma posição de estampa válida.';
  end if;
  v_product_id := public.create_shared_stock_product_with_artwork(
    p_tenant_id, p_source_id, p_details, p_artwork);
  update public.venduss_shared_print_artworks
    set print_position_code = p_position_code
    where product_id = v_product_id and tenant_id = p_tenant_id;
  return v_product_id;
end;
$$;

revoke all on function public.create_shared_stock_product_with_position(uuid,bigint,jsonb,jsonb,text) from public;
grant execute on function public.create_shared_stock_product_with_position(uuid,bigint,jsonb,jsonb,text) to authenticated;

create or replace function public.z19p_list_venduss_print_positions(p_tenant_id uuid)
returns table(code text, label text)
language sql stable security definer
set search_path = ''
as $$
  select pos.code, pos.label
  from public.z19p_partner_tenants partner
  join public.z19p_print_positions pos on pos.owner_id = partner.owner_id
  where partner.tenant_id = p_tenant_id and partner.enabled and pos.active
    and exists (select 1 from public.user_tenants u
      where u.tenant_id = p_tenant_id and u.user_id = auth.uid()
        and u.role::text in ('ADMIN', 'SUPER_ADMIN'))
  order by pos.sort_order, pos.label;
$$;

revoke all on function public.z19p_list_venduss_print_positions(uuid) from public;
grant execute on function public.z19p_list_venduss_print_positions(uuid) to authenticated;
