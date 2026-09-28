-- A film assembled before cancellation must not change a cancelled order or
-- mark its saved placement as printed. Keep the artwork and history intact.
do $migration$
declare
  definition text;
  anchor constant text := 'if auth.uid() is null then raise exception ''Autenticacao obrigatoria.''; end if;';
  guard_clause constant text := $guard$
  if exists (
    select 1 from public.z19p_projects project
    join public.orders origin on origin.id::text=project.official_order_ref
    where project.owner_id=own and project.official_order_source='zero19_pdv'
      and origin.tenant_id='0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid
      and origin.status='CANCELADO'
      and (project.id=any(coalesce(p_project_ids,array[]::uuid[]))
        or exists(select 1 from public.z19p_asset_placements placement
          where placement.project_id=project.id and placement.owner_id=own
            and placement.id=any(coalesce(p_placement_ids,array[]::uuid[]))))
  ) then raise exception 'Pedido cancelado. Remova a arte deste pedido do filme antes de exportar.'; end if;
$guard$;
begin
  definition:=pg_get_functiondef('public.z19p_mark_official_order_production(uuid[],uuid[])'::regprocedure);
  if position(guard_clause in definition)>0 then return; end if;
  if position(anchor in definition)=0 then raise exception 'Film export function changed; cancellation guard was not installed.'; end if;
  execute replace(definition,anchor,anchor||guard_clause);
end $migration$;
