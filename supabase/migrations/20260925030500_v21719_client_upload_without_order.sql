-- v2.17.19 — temporary client upload override while official-order integration is being completed.
alter table public.z19p_public_settings
  add column if not exists client_upload_without_order_enabled boolean not null default true;

comment on column public.z19p_public_settings.client_upload_without_order_enabled
  is 'Permite subir e posicionar arte em cliente sem pedido oficial sincronizado. Default true enquanto a integração externa não está concluída.';
