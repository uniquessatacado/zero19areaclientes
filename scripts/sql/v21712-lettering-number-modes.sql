-- PROPOSED: not applied to the production database.
-- Additive configuration. Existing presets keep their current mixed behavior.
alter table public.z19p_customization_sets
  add column number_source_mode text not null default 'legacy'
    check (number_source_mode in ('legacy','none','font','vector')),
  add column number_font_source_id uuid
    references public.z19p_customization_sources(id) on delete set null;

create or replace function public.z19p_check_number_source()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.number_font_source_id is not null and not exists (
    select 1 from public.z19p_customization_sources s
    where s.id = new.number_font_source_id and s.set_id = new.id
      and s.owner_id = new.owner_id and s.source_type in ('ttf','otf')
  ) then raise exception 'A fonte dos números deve ser um TTF/OTF desta personalização e conta.';
  end if;
  if tg_op = 'UPDATE' then
    if new.number_source_mode is distinct from old.number_source_mode
      or new.number_font_source_id is distinct from old.number_font_source_id then
      new.status := 'preparing';
      new.tested_at := null;
      new.tested_by := null;
    end if;
  end if;
  return new;
end $$;
create trigger z19p_check_number_source
before insert or update on public.z19p_customization_sets
for each row execute function public.z19p_check_number_source();
-- Existing RLS policies and permissions are unchanged. No source is removed.
