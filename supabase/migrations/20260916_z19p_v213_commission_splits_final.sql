-- v2.13 final: hardened commission split + per-user summary.
alter table public.z19p_commission_shares add column if not exists created_by uuid default auth.uid();
alter table public.z19p_commission_shares add column if not exists updated_by uuid default auth.uid();
create index if not exists z19p_commission_shares_owner_idx on public.z19p_commission_shares(owner_id);
create index if not exists z19p_commission_shares_recipient_idx on public.z19p_commission_shares(recipient_user_id);

drop policy if exists z19p_commission_shares_admin_all on public.z19p_commission_shares;
create policy z19p_commission_shares_admin_all on public.z19p_commission_shares for all to authenticated
using (public.z19p_is_admin() and owner_id=public.z19p_current_account_owner())
with check (public.z19p_is_admin() and owner_id=public.z19p_current_account_owner());
drop policy if exists z19p_commission_shares_team_select on public.z19p_commission_shares;
create policy z19p_commission_shares_team_select on public.z19p_commission_shares for select to authenticated
using (owner_id=public.z19p_current_account_owner() and (public.z19p_is_admin() or recipient_user_id=auth.uid() or exists(select 1 from public.z19p_commissions c where c.id=commission_id and c.owner_id=public.z19p_current_account_owner() and c.seller_user_id=auth.uid())));

create or replace function public.z19p_set_commission_split(p_commission_id uuid,p_shares jsonb) returns jsonb language plpgsql security definer set search_path='public' as $$
declare v_owner uuid:=public.z19p_current_account_owner(); v_comm public.z19p_commissions%rowtype; v_total numeric:=0; v_count int:=0; v_i int:=0; v_item jsonb; v_user uuid; v_percent numeric; v_amount numeric; v_allocated numeric:=0; v_seen uuid[]:=array[]::uuid[];
begin
 if auth.uid() is null or not public.z19p_is_admin() then raise exception 'Somente o administrador pode dividir comissões.'; end if;
 select * into v_comm from public.z19p_commissions where id=p_commission_id and owner_id=v_owner for update;
 if not found then raise exception 'Comissão não encontrada.'; end if;
 if v_comm.status not in ('pending','approved') then raise exception 'Comissão paga ou recusada não pode ser alterada.'; end if;
 if p_shares is null or jsonb_typeof(p_shares)<>'array' then raise exception 'Divisão inválida.'; end if;
 v_count:=jsonb_array_length(p_shares);
 if v_count=0 then delete from public.z19p_commission_shares where commission_id=v_comm.id; return jsonb_build_object('ok',true,'split',false,'commission_id',v_comm.id,'commission_amount',v_comm.commission_amount); end if;
 for v_item in select value from jsonb_array_elements(p_shares) loop
   begin v_user:=(v_item->>'user_id')::uuid; v_percent:=replace(coalesce(v_item->>'percent','0'),',','.')::numeric; exception when others then raise exception 'Participante ou percentual inválido.'; end;
   if v_user is null or v_percent<=0 or v_percent>100 then raise exception 'Percentual inválido.'; end if;
   if v_user=any(v_seen) then raise exception 'Usuário repetido na divisão.'; end if;
   if not exists(select 1 from public.z19p_profiles p where p.id=v_user and p.account_owner_id=v_owner and p.active=true) then raise exception 'Usuário da divisão não pertence à equipe ativa.'; end if;
   v_seen:=array_append(v_seen,v_user); v_total:=v_total+v_percent;
 end loop;
 if abs(v_total-100)>.01 then raise exception 'A divisão precisa somar 100%%.'; end if;
 delete from public.z19p_commission_shares where commission_id=v_comm.id;
 for v_item in select value from jsonb_array_elements(p_shares) loop
   v_i:=v_i+1; v_user:=(v_item->>'user_id')::uuid; v_percent:=replace(v_item->>'percent',',','.')::numeric;
   if v_i=v_count then v_amount:=round(v_comm.commission_amount-v_allocated,2); else v_amount:=round(v_comm.commission_amount*v_percent/100,2); v_allocated:=v_allocated+v_amount; end if;
   insert into public.z19p_commission_shares(owner_id,commission_id,recipient_user_id,share_percent,share_amount,created_by,updated_by) values(v_owner,v_comm.id,v_user,v_percent,v_amount,auth.uid(),auth.uid());
 end loop;
 return jsonb_build_object('ok',true,'split',true,'commission_id',v_comm.id,'commission_amount',v_comm.commission_amount,'shares',(select coalesce(jsonb_agg(jsonb_build_object('user_id',s.recipient_user_id,'percent',s.share_percent,'amount',s.share_amount) order by s.created_at),'[]'::jsonb) from public.z19p_commission_shares s where s.commission_id=v_comm.id));
end$$;

create or replace function public.z19p_get_my_commission_summary() returns jsonb language sql stable security definer set search_path='public' as $$
with ctx as (select public.z19p_current_account_owner() owner_id,auth.uid() user_id), cfg as (select c.* from public.z19p_commission_config c,ctx where c.owner_id=ctx.owner_id), mine as (
 select c.id,c.status,case when exists(select 1 from public.z19p_commission_shares x where x.commission_id=c.id) then coalesce((select sum(x.share_amount) from public.z19p_commission_shares x,ctx where x.commission_id=c.id and x.recipient_user_id=ctx.user_id),0) when c.seller_user_id=(select user_id from ctx) then c.commission_amount else 0 end amount from public.z19p_commissions c,ctx where c.owner_id=ctx.owner_id)
select jsonb_build_object('enabled',coalesce((select enabled from cfg),false),'payment_weekday',(select payment_weekday from cfg),'pending',coalesce((select sum(amount) from mine where status='pending'),0),'approved',coalesce((select sum(amount) from mine where status='approved'),0),'paid',coalesce((select sum(amount) from mine where status='paid'),0),'rejected',coalesce((select sum(amount) from mine where status='rejected'),0));
$$;
grant execute on function public.z19p_set_commission_split(uuid,jsonb) to authenticated;
grant execute on function public.z19p_get_my_commission_summary() to authenticated;
