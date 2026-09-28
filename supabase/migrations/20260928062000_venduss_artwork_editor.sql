-- Atomic replacement of a Venduss artwork and its customer-safe catalog thumbnail.
create or replace function public.z19p_update_venduss_shared_artwork(
  p_tenant_id uuid, p_product_id bigint, p_expected_prepared_path text,
  p_position_code text, p_artwork jsonb default null, p_preview_path text default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_art public.venduss_shared_print_artworks%rowtype;
  v_original text; v_prepared text;
  v_original_object storage.objects%rowtype;
  v_prepared_object storage.objects%rowtype;
  v_preview_object storage.objects%rowtype;
  v_preview_url text;
  v_old_preview text;
  v_details jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.tenants t
    join public.user_tenants u on u.tenant_id = t.id
    where t.id = p_tenant_id and t.subdomain = 'venduss'
      and u.user_id = auth.uid() and u.role::text in ('ADMIN','SUPER_ADMIN')
  ) then raise exception 'Acesso negado à arte desta loja.'; end if;
  if not exists (
    select 1 from public.z19p_partner_tenants partner
    join public.z19p_print_positions pos on pos.owner_id = partner.owner_id
    where partner.tenant_id = p_tenant_id and partner.enabled
      and pos.code = p_position_code and pos.active
  ) then raise exception 'Escolha uma posição válida da ZERO19.'; end if;
  select * into v_art from public.venduss_shared_print_artworks
    where product_id = p_product_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Arte vinculada não encontrada.'; end if;
  if v_art.prepared_path is distinct from p_expected_prepared_path then
    raise exception 'Esta estampa foi alterada em outra tela. Atualize antes de salvar.';
  end if;
  if p_artwork is not null then
    if jsonb_typeof(p_artwork) <> 'object' then raise exception 'Arte inválida.'; end if;
    v_original := p_artwork->>'original_path';
    v_prepared := p_artwork->>'prepared_path';
    if not public.can_manage_venduss_artwork_path(v_original)
       or not public.can_manage_venduss_artwork_path(v_prepared)
       or v_original not like p_tenant_id::text||'/print-artworks/%-original.%'
       or v_prepared not like p_tenant_id::text||'/print-artworks/%-prepared.png'
       or left(split_part(v_original,'/',3),36) <> left(split_part(v_prepared,'/',3),36)
       or split_part(v_original,'/',3) !~ '^[0-9a-f-]{36}-original\.(png|webp)$'
       or split_part(v_prepared,'/',3) !~ '^[0-9a-f-]{36}-prepared\.png$'
    then raise exception 'Arquivos fora do ambiente protegido.'; end if;
    select * into v_original_object from storage.objects where bucket_id='venduss-print-artworks' and name=v_original;
    select * into v_prepared_object from storage.objects where bucket_id='venduss-print-artworks' and name=v_prepared;
    if v_original_object.id is null or v_prepared_object.id is null
      or v_original_object.metadata->>'mimetype' not in ('image/png','image/webp')
      or v_prepared_object.metadata->>'mimetype' <> 'image/png'
      or (v_original_object.metadata->>'size')::bigint not between 1 and 26214400
      or (v_prepared_object.metadata->>'size')::bigint not between 1 and 26214400
      or coalesce((p_artwork->>'width_cm')::numeric,0) not between 0.1 and 100
      or coalesce((p_artwork->>'height_cm')::numeric,0) not between 0.1 and 300
      or coalesce((p_artwork->>'pixel_width')::integer,0) not between 1 and 16384
      or coalesce((p_artwork->>'pixel_height')::integer,0) not between 1 and 16384
      or coalesce((p_artwork->>'effective_dpi')::integer,0) not between 150 and 10000
    then raise exception 'Arquivo, medidas ou resolução de impressão inválidos.'; end if;
  end if;
  if p_preview_path is not null then
    if p_preview_path not like p_tenant_id::text||'/products/art-preview-%.webp'
      or split_part(p_preview_path,'/',3) !~ '^art-preview-[0-9a-f-]{36}\.webp$'
    then raise exception 'Prévia pública fora da loja.'; end if;
    select * into v_preview_object from storage.objects where bucket_id='product_images' and name=p_preview_path;
    if v_preview_object.id is null or v_preview_object.metadata->>'mimetype' <> 'image/webp'
      or (v_preview_object.metadata->>'size')::bigint not between 1 and 2097152
    then raise exception 'Prévia de catálogo inválida.'; end if;
    v_preview_url := 'https://kedggjyerexnzmipaick.supabase.co/storage/v1/object/public/product_images/'||p_preview_path;
    select coalesce(p.detail_image_urls,'[]'::jsonb) into v_details
      from public.products p where p.id=p_product_id and p.tenant_id=p_tenant_id for update;
    if jsonb_typeof(v_details) <> 'array' then v_details := '[]'::jsonb; end if;
    select value into v_old_preview from jsonb_array_elements_text(v_details) as x(value)
      where value like '%/products/art-preview-%' limit 1;
    select coalesce(jsonb_agg(value), '[]'::jsonb) into v_details
      from jsonb_array_elements_text(v_details) as x(value)
      where value not like '%/products/art-preview-%';
    update public.products set detail_image_urls = v_details || to_jsonb(v_preview_url)
      where id=p_product_id and tenant_id=p_tenant_id;
  end if;
  if p_artwork is null then
    update public.venduss_shared_print_artworks set print_position_code=p_position_code
      where product_id=p_product_id and tenant_id=p_tenant_id;
  else
    update public.venduss_shared_print_artworks
      set original_path=v_original, prepared_path=v_prepared,
        width_cm=(p_artwork->>'width_cm')::numeric,
        height_cm=(p_artwork->>'height_cm')::numeric,
        pixel_width=(p_artwork->>'pixel_width')::integer,
        pixel_height=(p_artwork->>'pixel_height')::integer,
        effective_dpi=(p_artwork->>'effective_dpi')::integer,
        print_position_code=p_position_code
      where product_id=p_product_id and tenant_id=p_tenant_id;
  end if;
  return jsonb_build_object('old_original_path',case when p_artwork is not null then v_art.original_path end,
    'old_prepared_path',case when p_artwork is not null then v_art.prepared_path end,
    'old_preview_url',v_old_preview);
end;
$$;

revoke all on function public.z19p_update_venduss_shared_artwork(uuid,bigint,text,text,jsonb,text) from public;
grant execute on function public.z19p_update_venduss_shared_artwork(uuid,bigint,text,text,jsonb,text) to authenticated;
