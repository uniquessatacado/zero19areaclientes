alter table public.z19p_manual_garments
  drop constraint if exists z19p_manual_garments_category_check;
comment on column public.z19p_manual_garments.category is 'Subcategoria/qualidade da camiseta vinda do catálogo ZERO19/Vendus.';