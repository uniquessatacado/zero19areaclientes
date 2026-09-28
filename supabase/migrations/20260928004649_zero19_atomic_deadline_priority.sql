-- Change the deadline for the entire owned order in one transaction.
create or replace function public.z19p_reschedule_order(p_project_id uuid,p_promised_at timestamptz,p_priority text default 'manual_deadline')
returns jsonb language plpgsql security definer set search_path=public as $$
declare own uuid:=public.z19p_current_account_owner(); sale_ids uuid[]; changed integer;
begin
  if auth.uid() is null or not exists(select 1 from public.z19p_profiles where id=auth.uid() and active and coalesce(account_owner_id,id)=own) then raise exception 'Acesso não autorizado.'; end if;
  if p_promised_at is null or not isfinite(p_promised_at) or p_priority not in ('normal','manual_deadline','in_store') then raise exception 'Informe prazo e prioridade válidos.'; end if;
  perform 1 from public.z19p_projects where id=p_project_id and owner_id=own for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  select array_agg(personalization_sale_id) into sale_ids from public.z19p_zero19_work_items
    where owner_id=own and project_id=p_project_id and tenant_id='0e885daf-b461-4384-b2c2-8ed2cf33478b';
  if sale_ids is null then raise exception 'Pedido sem personalização vinculada.'; end if;
  update public.personalization_sales sale set pickup_at=p_promised_at,estimated_ready_at=p_promised_at,
    details=(select jsonb_agg(d || jsonb_build_object('production',coalesce(d->'production','{}'::jsonb)||jsonb_build_object('priority',p_priority)))
      from jsonb_array_elements(case when jsonb_typeof(sale.details)='array' and jsonb_array_length(sale.details)>0 then sale.details else '[{}]'::jsonb end) d),
    updated_at=now()
    where id=any(sale_ids) and tenant_id='0e885daf-b461-4384-b2c2-8ed2cf33478b';
  get diagnostics changed=row_count;
  update public.z19p_zero19_work_items w set promised_at=p_promised_at,
    metadata=jsonb_set(coalesce(w.metadata,'{}'::jsonb),'{details}',
      (select jsonb_agg(d||jsonb_build_object('production',coalesce(d->'production','{}'::jsonb)||jsonb_build_object('priority',p_priority)))
       from jsonb_array_elements(case when jsonb_typeof(w.metadata->'details')='array' and jsonb_array_length(w.metadata->'details')>0 then w.metadata->'details' else '[{}]'::jsonb end) d)),
    updated_at=now() where owner_id=own and project_id=p_project_id;
  update public.z19p_projects set promised_at=p_promised_at,delivery_date=(p_promised_at at time zone 'America/Sao_Paulo')::date,updated_at=now()
    where id=p_project_id and owner_id=own;
  return jsonb_build_object('project_id',p_project_id,'promised_at',p_promised_at,'priority',p_priority,'updated',changed);
end $$;
revoke all on function public.z19p_reschedule_order(uuid,timestamptz,text) from public,anon;
grant execute on function public.z19p_reschedule_order(uuid,timestamptz,text) to authenticated;
notify pgrst,'reload schema';
