-- 019 Personalizacoes v2.17
-- Fecha bypasses de insercao/status direto fora do RPC operacional.

begin;

-- Backfill unico: depois disso a regra usa purpose, nunca o nome visivel.
update public.z19p_folder_templates set purpose='artes_prontas'
where purpose is distinct from 'artes_prontas' and lower(trim(name)) in ('artes prontas','arte pronta');
update public.z19p_folders set purpose='artes_prontas'
where purpose is distinct from 'artes_prontas' and lower(trim(name)) in ('artes prontas','arte pronta');

create or replace function public.z19p_validate_project_transition()
returns trigger language plpgsql security invoker set search_path=public as $$
declare v_stage text; v_final boolean;
begin
  if tg_op='UPDATE' and new.status_id is not distinct from old.status_id then return new; end if;
  select queue_stage,is_finalized into v_stage,v_final from public.z19p_statuses where id=new.status_id and owner_id=new.owner_id;
  if v_stage in ('art_work','ready_production','production') then
    if tg_op='INSERT' then raise exception 'Projeto novo deve iniciar em etapa comercial; libere a producao pelo fluxo de pagamento.'; end if;
    if new.delivery_date is null then raise exception 'Defina a data de entrega antes de liberar para producao.'; end if;
    if not exists(select 1 from public.z19p_quotes q where q.project_id=new.id and q.owner_id=new.owner_id and q.payment_status='paid') then
      raise exception 'O projeto precisa de um orcamento pago antes de entrar na fila operacional.';
    end if;
  end if;
  new.status_entered_at=now();
  if coalesce(v_final,false) and new.finalized_at is null then new.finalized_at=now(); end if;
  return new;
end $$;
drop trigger if exists z19p_projects_validate_transition on public.z19p_projects;
create trigger z19p_projects_validate_transition before insert or update of status_id on public.z19p_projects
for each row execute function public.z19p_validate_project_transition();

create or replace function public.z19p_validate_workspace_operational_status()
returns trigger language plpgsql security invoker set search_path=public as $$
declare v_stage text; v_project public.z19p_projects%rowtype;
begin
  if tg_op='UPDATE' and new.status_id is not distinct from old.status_id then return new; end if;
  select queue_stage into v_stage from public.z19p_statuses where id=new.status_id and owner_id=new.owner_id;
  if v_stage in ('art_work','ready_production','production') then
    select * into v_project from public.z19p_projects p where p.workspace_id=new.id and p.owner_id=new.owner_id order by p.sequence_no desc,p.started_at desc nulls last,p.id desc limit 1;
    if not found or v_project.status_id is distinct from new.status_id or v_project.delivery_date is null or
       not exists(select 1 from public.z19p_quotes q where q.project_id=v_project.id and q.owner_id=new.owner_id and q.payment_status='paid') then
      raise exception 'Status operacional deve ser aplicado pelo fluxo seguro do projeto.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists z19p_workspaces_validate_operational_status on public.z19p_workspaces;
create trigger z19p_workspaces_validate_operational_status before insert or update of status_id on public.z19p_workspaces
for each row execute function public.z19p_validate_workspace_operational_status();

commit;
