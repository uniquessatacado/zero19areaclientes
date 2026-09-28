-- Keep the previous workspace status update for non-ZERO19 official projects.
-- ZERO19 must continue using its per-item aggregate refresh.
do $migration$
declare definition text; needle text:='where id=project_row.id and official_order_ref is not null;';
begin
  definition:=pg_get_functiondef('public.z19p_mark_selected_order_production(uuid[],uuid[],uuid[])'::regprocedure);
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
    raise exception 'Unexpected production function definition; review before applying';
  end if;
  definition:=replace(definition,needle,needle||$patch$
      update public.z19p_workspaces set status_id=coalesce(public.z19p_zero19_status_id(own,'production'),status_id),
        status_changed_at=now(),updated_at=now()
        where id=project_row.workspace_id and owner_id=own;
$patch$);
  execute definition;
end $migration$;
