-- 019 Personalizacoes v2.17
-- Fontes, CDRs e SVGs oficiais ficam em bucket privado e isolado por conta.

begin;

insert into storage.buckets(id,name,public,file_size_limit)
values('z19p-private','z19p-private',false,104857600)
on conflict(id) do update set public=false,file_size_limit=greatest(coalesce(storage.buckets.file_size_limit,0),104857600);

drop policy if exists z19p_private_select on storage.objects;
create policy z19p_private_select on storage.objects for select to authenticated
using(bucket_id='z19p-private' and (storage.foldername(name))[1]=public.z19p_current_account_owner()::text);

drop policy if exists z19p_private_insert on storage.objects;
create policy z19p_private_insert on storage.objects for insert to authenticated
with check(bucket_id='z19p-private' and (storage.foldername(name))[1]=public.z19p_current_account_owner()::text);

drop policy if exists z19p_private_update on storage.objects;
create policy z19p_private_update on storage.objects for update to authenticated
using(bucket_id='z19p-private' and (storage.foldername(name))[1]=public.z19p_current_account_owner()::text)
with check(bucket_id='z19p-private' and (storage.foldername(name))[1]=public.z19p_current_account_owner()::text);

drop policy if exists z19p_private_delete on storage.objects;
create policy z19p_private_delete on storage.objects for delete to authenticated
using(bucket_id='z19p-private' and (storage.foldername(name))[1]=public.z19p_current_account_owner()::text);

commit;
