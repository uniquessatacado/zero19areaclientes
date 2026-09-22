-- PROPOSED: execution was blocked by the tool safety check; not applied.
-- Only absence of a mockup stops being a production blocker.
-- Existing linked mockup integrity, pricing, final-art and ownership rules remain.
do $migration$
declare
 ddl text := pg_get_functiondef('public.z19p_quote_release_issues(uuid,boolean)'::regprocedure);
 old_guard text := 'if coalesce(q.service_type,''full_shirt'')<>''dtf_only'' then';
 new_guard text := 'if coalesce(q.service_type,''full_shirt'')<>''dtf_only'' and q.official_mockup_asset_id is not null then';
begin
 if position(new_guard in ddl)>0 then return; end if;
 if (length(ddl)-length(replace(ddl,old_guard,'')))/length(old_guard)<>1 then
  raise exception 'Unexpected quote release implementation; optional mockup migration aborted.';
 end if;
 execute replace(ddl,old_guard,new_guard);
end $migration$;
