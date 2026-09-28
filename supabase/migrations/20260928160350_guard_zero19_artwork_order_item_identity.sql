-- Imported PDV artwork has a stable sale identity. A shirt repeated in the
-- same order is not permission to replace the artwork of its other position.
create or replace function public.z19p_zero19_mark_art_ready(
  p_project_id uuid, p_personalization_sale_id uuid, p_asset_id uuid
) returns jsonb language plpgsql security definer set search_path=public
as $$
declare
  v_owner uuid:=public.z19p_current_account_owner();
  v_stage text; v_now timestamptz:=now();
  v_project public.z19p_projects%rowtype;
  v_asset public.z19p_assets%rowtype;
  v_item public.z19p_zero19_work_items%rowtype;
begin
  if auth.uid() is null or v_owner is distinct from '96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid then
    raise exception 'Acesso nao autorizado.';
  end if;
  select * into v_project from public.z19p_projects
    where id=p_project_id and owner_id=v_owner and official_order_source='zero19_pdv';
  if not found then raise exception 'Pedido ZERO19 nao encontrado.'; end if;
  select * into v_asset from public.z19p_assets where id=p_asset_id and owner_id=v_owner;
  if not found or v_asset.workspace_id is distinct from v_project.workspace_id
    or (v_asset.project_id is not null and v_asset.project_id<>p_project_id) then
    raise exception 'Arte nao pertence a este pedido/cliente.';
  end if;
  if nullif(v_asset.metadata->>'personalization_sale_id','') is not null
    and (v_asset.metadata->>'personalization_sale_id') is distinct from p_personalization_sale_id::text then
    raise exception 'Esta arte pertence a outra posicao do pedido. Nenhum vinculo foi alterado.';
  end if;
  select * into v_item from public.z19p_zero19_work_items
    where owner_id=v_owner and project_id=p_project_id and personalization_sale_id=p_personalization_sale_id for update;
  if not found then raise exception 'Item de personalizacao nao encontrado neste pedido.'; end if;
  if v_item.stage not in ('awaiting_art','art_received','awaiting_halftone','ready_production') then
    raise exception 'A etapa atual deste item nao permite alterar a arte. Atualize o pedido.';
  end if;
  update public.z19p_zero19_work_items
    set asset_id=p_asset_id,stage='ready_production',art_received_at=coalesce(art_received_at,v_now),
        art_ready_at=coalesce(art_ready_at,v_now),updated_at=v_now where id=v_item.id;
  update public.z19p_projects set art_received_at=coalesce(art_received_at,v_now),updated_at=v_now
    where id=p_project_id and owner_id=v_owner;
  v_stage:=public.z19p_zero19_refresh_project(p_project_id);
  return jsonb_build_object('project_id',p_project_id,'stage',v_stage);
end $$;
revoke all on function public.z19p_zero19_mark_art_ready(uuid,uuid,uuid) from public,anon;
grant execute on function public.z19p_zero19_mark_art_ready(uuid,uuid,uuid) to authenticated;

create or replace function public.z19p_guard_placement_source_item()
returns trigger language plpgsql set search_path=public as $$
declare v_source_ref text;
begin
  if new.project_id is not null and exists(select 1 from public.z19p_projects
      where id=new.project_id and owner_id=new.owner_id and official_order_source='zero19_pdv') then
    select nullif(metadata->>'personalization_sale_id','') into v_source_ref
      from public.z19p_assets where id=new.asset_id and owner_id=new.owner_id;
    if v_source_ref is not null and v_source_ref is distinct from new.external_order_item_ref then
      raise exception 'A posicao escolhida pertence a outra arte do pedido.';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.z19p_guard_placement_source_item() from public,anon;
create trigger z19p_placement_source_item_guard
before insert or update of asset_id,project_id,external_order_item_ref
on public.z19p_asset_placements for each row execute function public.z19p_guard_placement_source_item();
