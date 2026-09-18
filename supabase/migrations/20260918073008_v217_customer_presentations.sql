begin;
-- Isolate explicitly published, sanitized client presentations from internal data.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('z19p-presentations','z19p-presentations',true,25165824,array['application/json','application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create policy z19p_presentations_insert on storage.objects for insert to authenticated
with check(bucket_id='z19p-presentations' and (storage.foldername(name))[1]=(select public.z19p_current_account_owner())::text and (storage.foldername(name))[2]='presentations' and exists(select 1 from public.z19p_profiles p where p.id=(select auth.uid()) and p.active));
create policy z19p_presentations_read on storage.objects for select to authenticated
using(bucket_id='z19p-presentations' and (storage.foldername(name))[1]=(select public.z19p_current_account_owner())::text and exists(select 1 from public.z19p_profiles p where p.id=(select auth.uid()) and p.active));
-- Published revisions are immutable: no UPDATE/upsert; a new publication has a new UUID.
commit;
