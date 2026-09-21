// Run explicitly: npm install --prefix tmp/qa-postgres --ignore-scripts @electric-sql/pglite@0.5.8
// Tests use an isolated PostgreSQL engine and synthetic records, never customer data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '../tmp/qa-postgres/node_modules/@electric-sql/pglite/dist/index.js';
const db=new PGlite(),id=n=>`00000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
create table public.z19p_profiles(id uuid primary key,account_owner_id uuid,active boolean);
create function public.z19p_current_account_owner() returns uuid language sql stable security definer as $$select coalesce((select account_owner_id from public.z19p_profiles where id=auth.uid() and active),auth.uid())$$;
create table public.z19p_workspaces(id uuid primary key,owner_id uuid,company_name text,status_id uuid,status_changed_at timestamptz,updated_at timestamptz);
create table public.z19p_statuses(id uuid primary key,owner_id uuid,queue_stage text,is_finalized boolean default false,active boolean default true,sort_order integer default 0);
create table public.z19p_projects(id uuid primary key,owner_id uuid,workspace_id uuid,title text,status_id uuid,delivery_date date,finalized_at timestamptz,desisted_at timestamptz,updated_at timestamptz,updated_by uuid,status_entered_at timestamptz,responsible_user_id uuid);
create table public.z19p_assets(id uuid primary key,owner_id uuid,workspace_id uuid,project_id uuid,asset_type text,name text,processed_path text,original_path text,metadata jsonb default '{}',created_at timestamptz default now());
create table public.z19p_products(id uuid primary key,owner_id uuid);
create table public.z19p_asset_print_profiles(asset_id uuid primary key,owner_id uuid,project_id uuid,default_width_cm numeric,default_height_cm numeric,ready_for_print boolean,halftone boolean,rotation_policy text,allow_internal_nesting boolean);
create table public.z19p_quotes(id uuid primary key,owner_id uuid,workspace_id uuid,project_id uuid,title text,delivery_date date,delivery_term text,notes text,payment_status text default 'pending',created_by uuid,updated_by uuid,updated_at timestamptz default now());
create table public.z19p_quote_items(id uuid primary key,owner_id uuid,quote_id uuid,product_id uuid,product_name text,quantity integer,pricing_mode text,piece_price numeric,total_unit_price numeric,prints jsonb,sort_order integer,created_by uuid,updated_by uuid,updated_at timestamptz default now());
create function public.z19p_transition_project(p_project_id uuid,p_status_id uuid) returns jsonb language plpgsql security invoker as $$begin update public.z19p_projects set status_id=p_status_id where id=p_project_id and owner_id=public.z19p_current_account_owner(); update public.z19p_workspaces set status_id=p_status_id where id=(select workspace_id from public.z19p_projects where id=p_project_id); return '{}'::jsonb; end$$;
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;
do $$declare t text;begin foreach t in array array['z19p_workspaces','z19p_projects','z19p_assets','z19p_products','z19p_asset_print_profiles','z19p_quotes','z19p_quote_items','z19p_statuses'] loop execute format('alter table public.%I enable row level security',t); execute format('create policy team on public.%I to authenticated using(owner_id=public.z19p_current_account_owner()) with check(owner_id=public.z19p_current_account_owner())',t);end loop;end$$;
`);
// Model the pre-existing paid-delete trigger from the deployed v2.17 baseline.
const priorMigration=await fs.readFile(new URL('../supabase/migrations/20260918031522_v217_production_projects_dtf.sql',import.meta.url),'utf8');
const legacyGuard=priorMigration.slice(priorMigration.indexOf('create or replace function public.z19p_block_paid_quote_delete()'),priorMigration.indexOf('create or replace function public.z19p_stale_quote_documents()'));
assert.ok(legacyGuard.includes('create trigger z19p_quotes_block_paid_delete'));await db.exec(legacyGuard);
// Existing payment body is preserved by the migration's guarded lock patch.
await db.exec(`create table public.z19p_test_payment_events(quote_id uuid);
 create function public.z19p_mark_quote_paid(p_quote_id uuid) returns jsonb language plpgsql security definer as $$
 declare v_owner uuid:=public.z19p_current_account_owner(); v_quote public.z19p_quotes%rowtype;
 begin select * into v_quote from public.z19p_quotes where id=p_quote_id and owner_id=v_owner;
 if not found then raise exception 'Missing quote'; end if;
 if v_quote.payment_status='paid' then return '{}'::jsonb; end if;
 update public.z19p_quotes set payment_status='paid' where id=p_quote_id;
 insert into public.z19p_test_payment_events values(p_quote_id);return '{}'::jsonb;end $$;
 grant select on public.z19p_test_payment_events to authenticated;`);
await db.exec(await fs.readFile(new URL('../supabase/migrations/20260921012637_v21711_services_production.sql',import.meta.url),'utf8'));
await db.exec(`create trigger z19p_projects_validate_transition before insert or update of status_id on public.z19p_projects for each row execute function public.z19p_validate_project_transition();`);
const run=(sql,params=[])=>db.query(sql,params),scalar=async(sql,params)=>Object.values((await run(sql,params)).rows[0])[0];
await run("select set_config('test.user',$1,false)",[id(1)]);
await db.exec(`insert into auth.users values('${id(1)}'),('${id(2)}'); insert into z19p_profiles values('${id(1)}','${id(1)}',true),('${id(2)}','${id(2)}',true);
 insert into z19p_statuses(id,owner_id,queue_stage) values('${id(10)}','${id(1)}','none'),('${id(11)}','${id(1)}','art_work'),('${id(12)}','${id(1)}','ready_production'),('${id(13)}','${id(1)}','production');
 insert into z19p_statuses(id,owner_id,queue_stage,is_finalized) values('${id(14)}','${id(1)}','none',true);
 insert into z19p_workspaces(id,owner_id,company_name) values('${id(20)}','${id(1)}','Synthetic test');
 insert into z19p_projects(id,owner_id,workspace_id,status_id,delivery_date) values('${id(30)}','${id(1)}','${id(20)}','${id(10)}','2026-12-01');
 insert into z19p_assets(id,owner_id,workspace_id,project_id,asset_type,name,processed_path) values('${id(40)}','${id(1)}','${id(20)}','${id(30)}','arte','Reference','synthetic.png'),('${id(41)}','${id(1)}','${id(20)}','${id(30)}','arte','Final','synthetic.png');
 insert into z19p_asset_print_profiles(asset_id,owner_id,default_width_cm,default_height_cm,ready_for_print) values('${id(41)}','${id(1)}',10,20,true);
 insert into z19p_products values('${id(45)}','${id(1)}');
 set role authenticated;`);
const quote={id:id(50),workspace_id:id(20),project_id:id(30),title:'Test DTF',service_type:'dtf_only',delivery_date:'2026-12-01'};
const art={id:id(60),item_kind:'art',product_name:'Print',quantity:10,piece_price:0,prints:[{price:2,placement:'Frente',kind:'art'}],reference_asset_id:id(40),final_asset_id:null,metadata:{}};
const save=(q,items,version=null)=>scalar('select public.z19p_save_service_quote($1::jsonb,$2::jsonb,$3::timestamptz)',[q,items,version]);
const transition=stage=>scalar('select public.z19p_transition_project($1::uuid,$2::uuid)',[id(30),id(stage)]);
await assert.rejects(transition(12),/orçamento/i);
const saved=await save(quote,[art]);assert.equal(saved.service_type,'dtf_only','quote before final/mockup');
await assert.rejects(save({...quote,id:id(51)},[{...art,id:id(61),reference_asset_id:id(999)}]),/referência/i);
assert.equal(await scalar('select count(*)::int from z19p_quotes'),1,'failed save fully rolls back');
await run("update z19p_quotes set payment_status='paid' where id=$1",[quote.id]);
await transition(11);await assert.rejects(transition(12),/arte final/i);
await assert.rejects(save(quote,[{...art,quantity:11}],saved.updated_at),/imutáveis/i);
const prepared=await save(quote,[{...art,final_asset_id:id(41)}],saved.updated_at);
await transition(12);
const pending=()=>scalar('select public.z19p_pending_film_items()');
assert.equal((await pending())[0].remaining_quantity,10);
const entry={film_item_id:id(70),quote_item_id:art.id,project_id:id(30),asset_id:id(41),quantity:4,width_cm:10,height_cm:20};
const record=(n,items,hash=String(n).padStart(64,'0'))=>scalar('select public.z19p_record_film_export($1::uuid,$2,$3::jsonb)',[id(n),hash,items]);
const first=await record(80,[entry]);assert.equal(first.added_quantity,4);
assert.equal(await scalar('select status_id from z19p_projects where id=$1',[id(30)]),id(13));
assert.equal((await pending())[0].remaining_quantity,6);
assert.equal((await record(80,[entry])).replayed,true,'same PNG/TIFF key is replay');
assert.equal((await record(81,[entry])).added_quantity,0,'same film item rearranged does not double count');
await assert.rejects(record(82,[{...entry,film_item_id:id(71),quantity:7}]),/já atendida/i);
assert.equal((await pending())[0].remaining_quantity,6,'over-allocation rolls back');
await assert.rejects(record(83,[{...entry,film_item_id:id(71),quantity:1,width_cm:11}]),/Medidas/i);
assert.equal((await record(84,[{...entry,film_item_id:id(71),quantity:6}])).added_quantity,6);
assert.deepEqual(await pending(),[]);
await assert.rejects(save(quote,[{...art,final_asset_id:id(40)}],prepared.updated_at),/já entrou em filme/i);
await run('update z19p_projects set status_id=$1 where id=$2',[id(14),id(30)]);
assert.equal((await record(80,[entry])).replayed,true,'historical reexport safe');
await assert.rejects(transition(12),/encerrado/i);
// Expanded release/security cases. Each audit case rolls back independently so a
// regression cannot contaminate subsequent cases; all failures are reported.
const auditResults=[];
async function audit(name,test){
 await run('begin');
 try{await test();auditResults.push({name,passed:true});}
 catch(error){auditResults.push({name,passed:false,error:error.message});}
 finally{await run('rollback');}
}
async function makeOrder(service,n,{prepared=true,mockup=true}={}){
 const w=id(n),p=id(n+1),ref=id(n+2),final=id(n+3),mock=id(n+4),qid=id(n+5);
 await run('insert into z19p_workspaces(id,owner_id,company_name) values($1,$2,$3)',[w,id(1),`Synthetic ${service}`]);
 await run('insert into z19p_projects(id,owner_id,workspace_id,status_id,delivery_date) values($1,$2,$3,$4,$5)',[p,id(1),w,id(10),'2026-12-02']);
 for(const [assetId,type] of [[ref,'arte'],[final,'arte'],[mock,'mockup']])await run('insert into z19p_assets(id,owner_id,workspace_id,project_id,asset_type,name,processed_path,metadata) values($1,$2,$3,$4,$5,$5,$6,$7)',[assetId,id(1),w,p,type,'synthetic.png',type==='mockup'?{official_mockup:true,garment_scene:{layers:[{id:id(n+20),assetId:final,side:'front',width:10,ratio:.5,x:25,y:30}]}}:{}]);
 await run('insert into z19p_asset_print_profiles(asset_id,owner_id,project_id,default_width_cm,default_height_cm,ready_for_print) values($1,$2,$3,10,20,true)',[final,id(1),p]);
 const q={id:qid,workspace_id:w,project_id:p,title:`Synthetic ${service}`,service_type:service,delivery_date:'2026-12-02',official_mockup_asset_id:mockup&&service!=='dtf_only'?mock:null};
 const artItem={id:id(n+6),item_kind:'art',product_name:'Print',quantity:5,piece_price:0,prints:[{price:2,placement:'Frente',kind:'art'}],reference_asset_id:ref,final_asset_id:prepared?final:null,metadata:{}};
 const items=[artItem];
 if(service==='full_shirt')items.unshift({id:id(n+7),item_kind:'product',product_id:id(45),product_name:'Shirt',quantity:3,piece_price:12,prints:[],metadata:{}});
 if(service!=='dtf_only')items.push({id:id(n+8),item_kind:'application',product_name:'Application',quantity:5,piece_price:0,prints:[{price:1,kind:'application'}],metadata:{}});
 if(service==='refurbishment')items.push({id:id(n+9),item_kind:'removal',product_name:'Removal',quantity:3,piece_price:0,prints:[{price:0,kind:'removal'}],metadata:{removal_free:true}});
 return {q,items,artItem,w,p,ref,final,mock,n};
}
const payAndRelease=async order=>{const result=await save(order.q,order.items);await run("update z19p_quotes set payment_status='paid' where id=$1",[order.q.id]);await scalar('select z19p_transition_project($1,$2)',[order.p,id(12)]);return result;};
const filmEntry=(order,itemId,quantity=2)=>({film_item_id:id(itemId),quote_item_id:order.artItem.id,project_id:order.p,asset_id:order.final,quantity,width_cm:10,height_cm:20});
for(const [index,service] of ['full_shirt','dtf_only','customer_shirt','refurbishment'].entries())await audit(`valid ${service}, independent quantities and full release`,async()=>{
 const order=await makeOrder(service,1000+index*100);await payAndRelease(order);
 const rows=await pending();assert.equal(rows.find(r=>r.project_id===order.p).remaining_quantity,5);
 assert.equal(await scalar("select count(*)::int from z19p_quote_items where quote_id=$1 and item_kind='product'",[order.q.id]),service==='full_shirt'?1:0);
 assert.equal((await record(2000+index,[filmEntry(order,2100+index)])).added_quantity,2);
 assert.equal((await pending()).find(r=>r.project_id===order.p).remaining_quantity,3);
});
await audit('quote before preparation; full shirt needs official mockup only for release',async()=>{
 const order=await makeOrder('full_shirt',3000,{prepared:false,mockup:false});const savedQuote=await save(order.q,order.items);
 assert.deepEqual(await scalar('select z19p_quote_release_issues($1,false)',[order.q.id]),[]);
 await run("update z19p_quotes set payment_status='paid' where id=$1",[order.q.id]);await scalar('select z19p_transition_project($1,$2)',[order.p,id(11)]);
 await assert.rejects(scalar('select z19p_transition_project($1,$2)',[order.p,id(12)]),/arte final|mockup/i);
});
await audit('refurbishment zero removal must be explicit',async()=>{
 const order=await makeOrder('refurbishment',3200);const removal=order.items.find(i=>i.item_kind==='removal');removal.metadata={};
 await assert.rejects(save(order.q,order.items),/gratuita/i);
});
await audit('dtf only rejects product/application double charging',async()=>{
 const order=await makeOrder('dtf_only',3300);order.items.push({id:id(3310),item_kind:'application',product_name:'Application',quantity:5,piece_price:0,prints:[{price:1}],metadata:{}});
 await assert.rejects(save(order.q,order.items),/aplicação/i);
});
await audit('missing prints/price is rejected, not silently zeroed',async()=>{
 const order=await makeOrder('dtf_only',3400);const noPrice={...order.artItem,id:id(3420)};delete noPrice.prints;order.items.push(noPrice);
 await assert.rejects(save(order.q,order.items),/preço|inválido|serviço/i);
});
await audit('malformed metadata and nonfinite price are rejected atomically',async()=>{
 const order=await makeOrder('dtf_only',3500);order.artItem.prints=[{price:'NaN'}];await assert.rejects(save(order.q,order.items),/preço/i);
});
await audit('fake official mockup without measures does not release',async()=>{
 const order=await makeOrder('full_shirt',3600);await run('update z19p_assets set metadata=$1 where id=$2',[{official_mockup:true,garment_scene:{layers:[{}]}},order.mock]);await save(order.q,order.items);
 const issues=await scalar('select z19p_quote_release_issues($1,true)',[order.q.id]);assert.ok(issues.some(x=>/mockup|medida|posi|arte/i.test(x)),JSON.stringify(issues));
});
await audit('mockup must represent every quoted final artwork',async()=>{
 const order=await makeOrder('customer_shirt',3700);await run('update z19p_assets set metadata=$1 where id=$2',[{official_mockup:true,garment_scene:{layers:[{assetId:order.ref,side:'front',width:10,ratio:.5,x:20,y:20}]}},order.mock]);await save(order.q,order.items);
 const issues=await scalar('select z19p_quote_release_issues($1,true)',[order.q.id]);assert.ok(issues.length>0,'unrelated reference is not the quoted final art');
});
await audit('foreign workspace art cannot become quote final',async()=>{
 const order=await makeOrder('dtf_only',3800);order.artItem.final_asset_id=id(41);await assert.rejects(save(order.q,order.items),/empresa/i);
});
await audit('mockup dimensions cannot contradict a resized final profile',async()=>{
 const order=await makeOrder('customer_shirt',5800);await save(order.q,order.items);
 await run('update z19p_asset_print_profiles set default_width_cm=14,default_height_cm=28 where asset_id=$1',[order.artItem.final_asset_id]);
 const issues=await scalar('select z19p_quote_release_issues($1,true)',[order.q.id]);assert.ok(issues.some(x=>/medidas atuais/i.test(x)),JSON.stringify(issues));
});
await audit('mixed orders export is all-or-nothing on second-order rejection',async()=>{
 const one=await makeOrder('dtf_only',3900),two=await makeOrder('dtf_only',4000);await payAndRelease(one);await save(two.q,two.items);
 const before=await scalar('select count(*)::int from z19p_film_exports');
 // Catch the error using a savepoint so rollback assertions can run in this transaction.
 await run('savepoint failed_export');await assert.rejects(record(4100,[filmEntry(one,4101),filmEntry(two,4102)]),/liberado/i);await run('rollback to savepoint failed_export');
 assert.equal(await scalar('select count(*)::int from z19p_film_exports'),before);assert.equal(await scalar('select count(*)::int from z19p_film_allocations where project_id=$1',[one.p]),0);assert.equal(await scalar('select status_id from z19p_projects where id=$1',[one.p]),id(12));
});
await audit('mixed released orders preserve each partial balance and replay',async()=>{
 const one=await makeOrder('dtf_only',4200),two=await makeOrder('customer_shirt',4300);await payAndRelease(one);await payAndRelease(two);
 const entries=[filmEntry(one,4401,2),filmEntry(two,4402,3)];assert.equal((await record(4400,entries)).added_quantity,5);assert.equal((await record(4400,entries)).added_quantity,0);
 const rows=await pending();assert.equal(rows.find(r=>r.project_id===one.p).remaining_quantity,3);assert.equal(rows.find(r=>r.project_id===two.p).remaining_quantity,2);
});
await audit('nonfinite film dimensions cannot consume quantities',async()=>{
 const order=await makeOrder('dtf_only',4500);await payAndRelease(order);await assert.rejects(record(4600,[{...filmEntry(order,4601),width_cm:'NaN'}]),/Medidas/i);
});
await audit('raw paid item UPDATE cannot bypass immutable quote values',async()=>{
 const order=await makeOrder('dtf_only',4700);await payAndRelease(order);await assert.rejects(run('update z19p_quote_items set piece_price=999 where id=$1',[order.artItem.id]),/pag[oa]|imut|alter/i);
});
await audit('raw paid item DELETE cannot bypass immutable quote values',async()=>{
 const order=await makeOrder('dtf_only',4800);await payAndRelease(order);await assert.rejects(run('delete from z19p_quote_items where id=$1',[order.artItem.id]),/pag[oa]|imut|remov|exclu/i);
});
await audit('raw paid quote cannot reset service to legacy/null',async()=>{
 const order=await makeOrder('dtf_only',4900);await payAndRelease(order);await assert.rejects(run('update z19p_quotes set service_type=null where id=$1',[order.q.id]),/pag[oa]|imut|alter/i);
});
await audit('existing paid quote delete guard stays effective',async()=>{
 const order=await makeOrder('dtf_only',5000);await payAndRelease(order);await assert.rejects(run('delete from z19p_quotes where id=$1',[order.q.id]),/pag[oa]|exclu/i);
});
await audit('raw paid quote cannot transplant project/workspace',async()=>{
 const order=await makeOrder('dtf_only',5100);await payAndRelease(order);await assert.rejects(run('update z19p_quotes set project_id=$1,workspace_id=$2 where id=$3',[id(30),id(20),order.q.id]),/pag[oa]|imut|vínculo/i);
});
await audit('paid quote descriptive notes may change without changing totals',async()=>{
 const order=await makeOrder('dtf_only',5200);await payAndRelease(order);await run('update z19p_quotes set notes=$1 where id=$2',['Production note',order.q.id]);assert.equal(await scalar('select notes from z19p_quotes where id=$1',[order.q.id]),'Production note');assert.equal(await scalar('select quantity from z19p_quote_items where id=$1',[order.artItem.id]),5);
});
await audit('paid quote rejects new items through direct writes',async()=>{
 const order=await makeOrder('dtf_only',5300);await payAndRelease(order);await assert.rejects(run("insert into z19p_quote_items(id,owner_id,quote_id,item_kind,quantity,pricing_mode,piece_price,prints) values($1,$2,$3,'art',1,'piece_plus_print',0,'[{\"price\":10}]')",[id(5320),id(1),order.q.id]),/pag[oa]|adicione/i);
});
await audit('malformed array metadata cannot pass quote save',async()=>{
 const order=await makeOrder('refurbishment',5400);order.items[0].metadata=[];await assert.rejects(save(order.q,order.items),/Metadados/i);
});
await audit('nonfinite prepared profile dimensions never qualify for release',async()=>{
 const order=await makeOrder('dtf_only',5500);await save(order.q,order.items);
 for(const invalid of ['NaN','Infinity','-Infinity']){
  await run('update z19p_asset_print_profiles set default_width_cm=$1::numeric where asset_id=$2',[invalid,order.artItem.final_asset_id]);
  const issues=await scalar('select z19p_quote_release_issues($1,true)',[order.q.id]);assert.ok(issues.some(x=>/medidas/i.test(x)),invalid);
 }
});
await audit('legacy released orders are visible for review without inferred quantities',async()=>{
 const order=await makeOrder('dtf_only',5600);await save(order.q,order.items);
 await run('update z19p_quotes set service_type=null where id=$1',[order.q.id]);
 await run('update z19p_quotes set payment_status=\'paid\' where id=$1',[order.q.id]);
 // Reproduce an already-released historical order, not a new release bypass.
 await run('reset role');await run("alter table z19p_projects disable trigger z19p_projects_validate_transition");
 await run('update z19p_projects set status_id=$1 where id=$2',[id(12),order.p]);
 await run("alter table z19p_projects enable trigger z19p_projects_validate_transition");await run('set role authenticated');
 const row=(await pending()).find(r=>r.kind==='legacy_review'&&r.project_id===order.p);assert.ok(row);assert.equal(row.remaining_quantity,undefined);assert.equal(row.asset_id,undefined);
 await run('update z19p_projects set finalized_at=now() where id=$1',[order.p]);assert.ok(!(await pending()).some(r=>r.project_id===order.p));
});
await audit('payment wrapper preserves date and does not repeat payment event',async()=>{
 const order=await makeOrder('dtf_only',5700);await save(order.q,order.items);
 for(let i=0;i<2;i++)await scalar('select z19p_mark_quote_paid_for_production($1,$2)',[order.q.id,'2026-12-15']);
 assert.equal(await scalar('select payment_status from z19p_quotes where id=$1',[order.q.id]),'paid');
 assert.equal(await scalar('select delivery_date::text from z19p_projects where id=$1',[order.p]),'2026-12-15');
 assert.equal(await scalar('select count(*)::int from z19p_test_payment_events where quote_id=$1',[order.q.id]),1);
 const body=await scalar("select pg_get_functiondef('public.z19p_mark_quote_paid(uuid)'::regprocedure)");assert.match(body,/owner_id=v_owner for update/);
});
console.log(JSON.stringify({auditResults},null,2));
await run("select set_config('test.user',$1,false)",[id(2)]);
assert.equal(await scalar('select count(*)::int from z19p_film_allocations'),0,'other tenant RLS');
await assert.rejects(record(85,[entry]),/não encontrada/i);
await assert.rejects(run('insert into z19p_film_allocations(owner_id,film_item_id) values($1,$2)',[id(2),id(99)]),/permission denied/i);
await run("select set_config('test.user',$1,false)",[id(1)]);
await run('reset role');await run('update z19p_profiles set active=false where id=$1',[id(1)]);await run('set role authenticated');
await assert.rejects(record(86,[entry]),/ativa obrigatória/i);
await db.close();assert.equal(auditResults.filter(r=>!r.passed).length,0,'Expanded service database audit has failing cases above');console.log('service database: all four services, mockup preparation, atomic mixed films, malformed values, direct writes, partial/reexport/high-water ledger, tenant RLS and historical closure PASS');
