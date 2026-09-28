-- Staff workflows write under the account owner, while older upload flows use
-- the actor folder. Permit both only within the active caller's own team.
-- Never grant public access or disable RLS. Text comparison avoids UUID cast
-- errors for unrelated/legacy object paths in this shared storage table.
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $$
declare allowed text := $policy$
  bucket_id = 'z19p-assets'
  and exists (select 1 from public.z19p_profiles actor where actor.id=(select auth.uid()) and actor.active)
  and exists (select 1 from public.z19p_profiles folder
    where folder.id::text=(storage.foldername(name))[1]
      and folder.account_owner_id=(select public.z19p_current_account_owner()))
$policy$;
begin
  execute 'alter policy z19p_storage_insert on storage.objects to authenticated with check ('||allowed||')';
  execute 'alter policy z19p_storage_select on storage.objects to authenticated using ('||allowed||')';
  execute 'alter policy z19p_storage_update on storage.objects to authenticated using ('||allowed||') with check ('||allowed||')';
  execute 'alter policy z19p_storage_delete on storage.objects to authenticated using ('||allowed||')';
end $$;
