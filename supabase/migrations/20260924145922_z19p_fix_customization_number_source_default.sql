-- Corrige inconsistência entre DEFAULT e CHECK de number_source_mode.
-- O CHECK aceita apenas 'font' ou 'vector', porém o DEFAULT antigo era 'legacy'.
-- O frontend cria a personalização sem enviar number_source_mode e depende do DEFAULT.
alter table public.z19p_customization_sets
  alter column number_source_mode set default 'font'::text;
