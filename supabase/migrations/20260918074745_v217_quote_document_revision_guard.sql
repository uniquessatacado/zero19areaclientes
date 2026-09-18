begin;
create or replace function public.z19p_validate_quote_document_revision() returns trigger
language plpgsql security invoker set search_path='' as $$
declare quote_row public.z19p_quotes%rowtype;
begin
  -- Lock the source through INSERT. A concurrent quote edit waits, then marks
  -- this document stale through the existing quote invalidation trigger.
  select * into quote_row from public.z19p_quotes where id=new.quote_id and owner_id=new.owner_id for share;
  if not found then raise exception 'Orçamento não encontrado nesta conta.'; end if;
  if new.project_id is distinct from quote_row.project_id then raise exception 'O projeto do PDF não corresponde ao orçamento.'; end if;
  if new.quote_updated_at is distinct from quote_row.updated_at then raise exception 'O orçamento foi alterado durante a geração. Reabra e gere o PDF atualizado.'; end if;
  if new.generated_by is distinct from auth.uid() then raise exception 'O autor do documento não corresponde ao usuário atual.'; end if;
  new.stale:=false;
  return new;
end;
$$;
revoke all on function public.z19p_validate_quote_document_revision() from public,anon,authenticated;
create trigger z19p_validate_quote_document_revision before insert on public.z19p_quote_documents for each row execute function public.z19p_validate_quote_document_revision();
commit;
