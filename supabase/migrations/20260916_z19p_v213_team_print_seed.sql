-- v2.13 — regras iniciais para camisa de time, sem inventar preços.
begin;
insert into public.z19p_print_rules(owner_id,name,garment_type,placement,pricing_mode,max_width_cm,max_height_cm,sort_order)
select o.owner_id,v.name,'team',v.placement,v.mode,v.w,v.h,v.ord from(select distinct account_owner_id owner_id from public.z19p_profiles)o cross join(values
 ('Camisa de time — nome e número','Costas','per_character',45::numeric,55::numeric,110),
 ('Camisa de time — personalização especial','Costas','special',45::numeric,60::numeric,120)
)as v(name,placement,mode,w,h,ord) where not exists(select 1 from public.z19p_print_rules r where r.owner_id=o.owner_id and r.name=v.name);
commit;
