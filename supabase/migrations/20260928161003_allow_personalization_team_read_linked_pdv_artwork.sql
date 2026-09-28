-- Personalizações staff have their own authenticated profiles, not necessarily
-- a Venduss user_tenants login. Allow SELECT only for an exact source file of
-- their linked ZERO19 work item. Keep PDV write/delete rules unchanged.
-- This is the existing approved ZERO19 tenant/account pair used by the bridge;
-- it does not activate any future partner tenant or expose the bucket publicly.
create policy z19p_team_read_linked_zero19_source
on storage.objects for select to authenticated
using (
  bucket_id='personalization-artwork'
  and (storage.foldername(name))[1]='0e885daf-b461-4384-b2c2-8ed2cf33478b'
  and exists (
    select 1 from public.z19p_profiles actor
    where actor.id=(select auth.uid()) and actor.active
      and actor.account_owner_id='96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid
  )
  and exists (
    select 1 from public.z19p_zero19_work_items item
    where item.owner_id='96d8732c-9576-4af9-9fe7-cdee065c14e6'::uuid
      and item.tenant_id='0e885daf-b461-4384-b2c2-8ed2cf33478b'::uuid
      and item.source_file_path=storage.objects.name
  )
);
