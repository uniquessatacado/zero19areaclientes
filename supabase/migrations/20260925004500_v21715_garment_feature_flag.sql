-- v2.17.15 — chave por conta para ocultar/ativar Montar camiseta e recursos 3D.
-- Começa desativada. "Ver tamanho na camisa" não depende desta chave.
alter table public.z19p_public_settings
  add column if not exists garment_studio_enabled boolean not null default false;

comment on column public.z19p_public_settings.garment_studio_enabled
  is 'Ativa Montar camiseta, Ver em 3D e Link 3D/cliente. Default false.';
