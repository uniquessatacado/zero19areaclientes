begin;

alter table public.z19p_production_sla_settings add column if not exists production_parameters jsonb not null default '{}'::jsonb;
alter table public.z19p_zero19_work_items add column if not exists production_step text not null default 'printing'
  check (production_step in ('printing','cutting','curing','pressing'));

create or replace function public.z19p_save_production_parameters(p_parameters jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare own uuid:=public.z19p_current_account_owner(); field record; value numeric; result jsonb;
begin
  if auth.uid() is null or own is null then raise exception 'Acesso não autorizado.'; end if;
  if jsonb_typeof(p_parameters)<>'object' then raise exception 'Configuração inválida.'; end if;
  for field in select * from (values
    ('art_minutes',0,240),('print_minutes_per_meter',1,480),('film_width_cm',10,200),('print_batch_cm',10,500),
    ('cut_minutes_per_art',0,120),('oven_width_cm',10,200),('oven_height_cm',10,200),('cure_minutes_per_cycle',0.1,60),
    ('cure_cycles',1,10),('press_minutes_per_side',0,120),('default_art_width_cm',1,100),('default_art_height_cm',1,200),('gap_cm',0,5)
  ) as limits(key,minimum,maximum) loop
    if not(p_parameters ? field.key) or jsonb_typeof(p_parameters->field.key)<>'number' then raise exception 'Informe todos os tempos e medidas.'; end if;
    value:=(p_parameters->>field.key)::numeric;
    if value<field.minimum or value>field.maximum then raise exception 'Valor fora do limite para %.',field.key; end if;
  end loop;
  if (p_parameters->>'cure_cycles')::numeric<>trunc((p_parameters->>'cure_cycles')::numeric) then raise exception 'O número de ciclos deve ser inteiro.'; end if;
  insert into public.z19p_production_sla_settings(owner_id,production_parameters,updated_by)
  values(own,p_parameters,auth.uid()) on conflict(owner_id) do update
  set production_parameters=excluded.production_parameters,updated_at=now(),updated_by=auth.uid()
  returning production_parameters into result;
  return result;
end $$;
revoke all on function public.z19p_save_production_parameters(jsonb) from public,anon;
grant execute on function public.z19p_save_production_parameters(jsonb) to authenticated;

create or replace function public.z19p_set_production_step(p_project_id uuid,p_step text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare own uuid:=public.z19p_current_account_owner(); affected integer;
begin
  if auth.uid() is null or own is null then raise exception 'Acesso não autorizado.'; end if;
  if p_step not in ('printing','cutting','curing','pressing') then raise exception 'Etapa inválida.'; end if;
  update public.z19p_zero19_work_items set production_step=p_step,updated_at=now()
  where owner_id=own and project_id=p_project_id and stage='production';
  get diagnostics affected=row_count;
  if affected=0 then raise exception 'Inicie a produção do pedido antes de registrar a etapa.'; end if;
  return jsonb_build_object('project_id',p_project_id,'step',p_step,'updated',affected);
end $$;
revoke all on function public.z19p_set_production_step(uuid,text) from public,anon;
grant execute on function public.z19p_set_production_step(uuid,text) to authenticated;

create or replace function public.z19p_reset_production_step()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if old.stage in ('ready_pickup','delivered','cancelled') and new.stage not in ('ready_pickup','delivered','cancelled') then new.production_step:='printing'; end if;
  return new;
end $$;
revoke all on function public.z19p_reset_production_step() from public,anon;
drop trigger if exists z19p_reset_production_step on public.z19p_zero19_work_items;
create trigger z19p_reset_production_step before update of stage on public.z19p_zero19_work_items for each row execute function public.z19p_reset_production_step();

create or replace function public.z19p_close_order_pause_after_stage()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.official_order_source='zero19_pdv' and new.official_order_status is distinct from old.official_order_status
     and new.official_order_status in ('ready_pickup','delivered','cancelled') then
    update public.z19p_production_pauses set ended_at=coalesce(ended_at,now()),ended_by=coalesce(auth.uid(),ended_by)
    where owner_id=new.owner_id and project_id=new.id and scope='order' and ended_at is null;
  end if;
  return new;
end $$;
revoke all on function public.z19p_close_order_pause_after_stage() from public,anon;

-- Keep the validated authenticated snapshot contract and enrich it once with
-- physical dimensions/progress for the identical scheduler used by both apps.
do $$ begin
  if to_regprocedure('public.zero19_personalization_ops_snapshot_v21738(uuid)') is null then
    alter function public.zero19_personalization_ops_snapshot(uuid) rename to zero19_personalization_ops_snapshot_v21738;
  end if;
end $$;
revoke all on function public.zero19_personalization_ops_snapshot_v21738(uuid) from public,anon,authenticated;
create or replace function public.zero19_personalization_ops_snapshot(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; own uuid; parameters jsonb; items jsonb; pauses jsonb;
begin
  -- Original function enforces user_tenants and the ZERO19 tenant.
  result:=public.zero19_personalization_ops_snapshot_v21738(p_tenant_id);
  select owner_id into own from public.z19p_zero19_work_items where tenant_id=p_tenant_id limit 1;
  select production_parameters into parameters from public.z19p_production_sla_settings where owner_id=own;
  select coalesce(jsonb_agg(to_jsonb(w)||jsonb_build_object('prepared_artworks',coalesce(a.artworks,'[]'::jsonb)) order by w.promised_at nulls last,w.created_at),'[]'::jsonb)
  into items from public.z19p_zero19_work_items w
  left join lateral (
    select jsonb_agg(jsonb_build_object('asset_id',ap.asset_id,'width_cm',ap.width_cm,'height_cm',ap.height_cm,'side',ap.surface)) artworks
    from public.z19p_asset_placements ap where ap.owner_id=w.owner_id and ap.project_id=w.project_id
      and (ap.external_order_item_ref=w.personalization_sale_id::text or ap.asset_id=w.asset_id)
  ) a on true
  where w.owner_id=own and w.stage not in ('ready_pickup','delivered','cancelled');
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'project_id',p.project_id,'scope',p.scope,'reason',r.name,'note',p.note,'started_at',p.started_at)),'[]'::jsonb)
  into pauses from public.z19p_production_pauses p left join public.z19p_pause_reasons r on r.id=p.reason_id and r.owner_id=p.owner_id
  where p.owner_id=own and p.ended_at is null;
  return result||jsonb_build_object('production_settings',coalesce(parameters,'{}'::jsonb),'production_items',items,'pauses',pauses,'scheduler_version',1);
end $$;
revoke all on function public.zero19_personalization_ops_snapshot(uuid) from public,anon;
grant execute on function public.zero19_personalization_ops_snapshot(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
