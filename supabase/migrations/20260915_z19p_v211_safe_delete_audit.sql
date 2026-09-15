-- v2.11 — exclusões seguras + histórico preservado

alter table public.z19p_audit_log
  drop constraint if exists z19p_audit_log_workspace_id_fkey;

alter table public.z19p_audit_log
  add constraint z19p_audit_log_workspace_id_fkey
  foreign key (workspace_id)
  references public.z19p_workspaces(id)
  on delete set null;

create or replace function public.z19p_audit_row_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v jsonb;
  v_owner uuid;
  v_workspace uuid;
  v_workspace_original uuid;
  v_id text;
  v_name text;
  v_desc text;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'DELETE' then v := to_jsonb(old); else v := to_jsonb(new); end if;

  v_owner := coalesce(nullif(v->>'owner_id','')::uuid, public.z19p_current_account_owner());
  v_workspace_original := nullif(v->>'workspace_id','')::uuid;
  if tg_table_name = 'z19p_workspaces' then
    v_workspace_original := nullif(v->>'id','')::uuid;
  end if;
  v_workspace := v_workspace_original;

  if v_workspace is not null
     and not exists (select 1 from public.z19p_workspaces w where w.id = v_workspace) then
    v_workspace := null;
  end if;

  v_id := coalesce(v->>'id','');
  v_name := coalesce(v->>'name', v->>'company_name', v->>'title', '');

  if tg_table_name = 'z19p_assets' then
    v_desc := case tg_op
      when 'INSERT' then 'Anexou a arte "'||v_name||'"'
      when 'DELETE' then 'Excluiu a arte "'||v_name||'"'
      else 'Editou a arte "'||v_name||'"' end;
  elsif tg_table_name = 'z19p_folders' then
    v_desc := case tg_op
      when 'INSERT' then 'Criou a pasta "'||v_name||'"'
      when 'DELETE' then 'Excluiu a pasta "'||v_name||'"'
      else 'Editou a pasta "'||v_name||'"' end;
  elsif tg_table_name = 'z19p_quotes' then
    v_desc := case tg_op
      when 'INSERT' then 'Criou o orçamento "'||v_name||'"'
      when 'DELETE' then 'Excluiu o orçamento "'||v_name||'"'
      else 'Editou o orçamento "'||v_name||'"' end;
  else
    v_desc := case tg_op
      when 'INSERT' then 'Cadastrou a empresa "'||v_name||'"'
      when 'DELETE' then 'Excluiu a empresa "'||v_name||'"'
      else 'Atualizou a empresa "'||v_name||'"' end;
  end if;

  insert into public.z19p_audit_log(
    owner_id, actor_user_id, workspace_id, entity_type, entity_id,
    action, description, metadata
  ) values (
    v_owner,
    auth.uid(),
    v_workspace,
    tg_table_name,
    v_id,
    lower(tg_op),
    v_desc,
    jsonb_build_object(
      'table', tg_table_name,
      'workspace_id', v_workspace_original,
      'entity_name', v_name,
      'operation', tg_op
    )
  );

  if tg_op = 'DELETE' then return old; else return new; end if;
end
$function$;
