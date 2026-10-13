import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePendingBatch,pendingRecipe,installPendingBatchAdd} from '../film-bulk-add.js';
import {createFilmReader,waitFilm,filmMapLimit} from '../film-bulk-read.js';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const OWNER=id(900000),ACTOR=id(900001),ASSET=id(800000);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function fixtures(n=1){
 const asset={id:ASSET,owner_id:OWNER,workspace_id:id(700001),asset_type:'arte',name:'Acervo',processed_path:'new-library.png',original_path:'original.png',metadata:{storage_bucket:'z19p-private'}};
 const works=Array.from({length:n},(_,i)=>({id:id(i+1),owner_id:OWNER,project_id:id(10000+i),personalization_sale_id:id(20000+i),asset_id:ASSET,stage:'ready_production',quantity:i%3+1,metadata:{details:[{production:{vdr_bundle_id:id(50000+i),width_cm:22.1,height_cm:28,file_path:'sold-snapshot.png',storage_bucket:'z19p-private'}}]}}));
 const entries=works.map(row=>({key:'vdr:'+row.id,kind:'vdr',row:{...structuredClone(row),summary:{workspace:{client_name:'Cliente'},project:{official_order_ref:row.project_id,official_order_payload:{display_id:40000+Number(row.id.slice(-5))}}}},quantity:row.quantity,title:'Pedido'}));
 return {entries,tables:{z19p_zero19_work_items:works,z19p_assets:[asset],z19p_asset_print_profiles:[],z19p_asset_placements:[],z19p_customization_sets:[]}};
}
function fake(tables,{expired=false,delay=0,fail,changeSession=false,noSession=false}={}){
 const calls=[],auth={refreshes:0,session:noSession?null:{user:{id:ACTOR},access_token:'old',expires_at:Math.floor(Date.now()/1000)+(expired?1:3600)},async getSession(){return {data:{session:this.session}};},async refreshSession(){this.refreshes++;await pause(2);this.session={user:{id:changeSession?id(900009):ACTOR},access_token:'new',expires_at:Math.floor(Date.now()/1000)+3600};return {data:{session:this.session}};}};
 const client={auth,calls,from(table){const filters={};let field,ids,columns;
  const query={select(c){columns=c;return this;},eq(k,v){filters[k]=v;return this;},in(k,v){field=k;ids=v;return this;},abortSignal(){return this;},then(resolve,reject){return (async()=>{const call={table,filters,field,ids,columns};calls.push(call);if(delay)await pause(delay);const error=fail?.(call,calls.length,auth);if(error)return {data:null,error};return {data:(tables[table]||[]).filter(row=>Object.entries(filters).every(([k,v])=>row[k]===v)&&ids.includes(row[field])).map(row=>structuredClone(row))};})().then(resolve,reject);}};return query;}};
 return client;
}
const makeAsset=(asset,profile,request)=>({localId:crypto.randomUUID(),sourceId:asset.id,type:'asset',path:asset.processed_path||asset.original_path,storageBucket:asset.metadata.storage_bucket,widthCm:profile.default_width_cm,heightCm:profile.default_height_cm,quantity:request.quantity,halftone:profile.halftone});
function setup(n=1,options={}){const f=fixtures(n),supabase=fake(f.tables,options);return {...f,supabase,args:{supabase,ownerId:OWNER,actorId:ACTOR,entries:f.entries,makeAsset,isCurrent:()=>true}};}

test('386 itens: nove consultas em lote, sem recarregar a fila por estampa',async()=>{
 const {args,supabase}=setup(386,{delay:1}),events=[],start=performance.now();const r=await preparePendingBatch({...args,onProgress:e=>events.push(e)});
 assert.equal(r.ready.length,386);assert.equal(r.errors.length,0);assert.equal(supabase.calls.length,9);assert.ok(supabase.calls.every(c=>c.ids.length<=100&&c.filters.owner_id===OWNER));
 assert.equal(supabase.calls.filter(c=>c.table==='z19p_assets').length,1);assert.equal(events.at(-1).percent,100);assert.ok(events.some(e=>e.phase.startsWith('Preparando')&&e.done===100));
 console.log('386 itens simulados:',Math.round(performance.now()-start)+'ms;',supabase.calls.length,'consultas; não mede a internet da loja.');
});
test('1234 itens são paginados sem perder registros',async()=>{const {args}=setup(1234);assert.equal((await preparePendingBatch(args)).ready.length,1234);});
test('PNG vendido, tamanho e quantidade preservados; arte reutilizada não mistura pedidos',async()=>{
 const {args}=setup(2),r=await preparePendingBatch(args),a=r.ready[0].items[0],b=r.ready[1].items[0];assert.equal(a.path,'sold-snapshot.png');assert.equal(a.widthCm,22.1);assert.equal(a.heightCm,28);assert.equal(a.quantity,1);assert.equal(b.quantity,2);assert.equal(a.sourceId,b.sourceId);assert.notEqual(a.zero19WorkItemId,b.zero19WorkItemId);assert.notEqual(a.localId,b.localId);
});
test('Sessão perto de vencer é renovada uma vez antes de consultar',async()=>{const {args,supabase}=setup(5,{expired:true});assert.equal((await preparePendingBatch(args)).ready.length,5);assert.equal(supabase.auth.refreshes,1);});
test('JWT expired em leitura é renovado e repetido uma vez',async()=>{const {args,supabase}=setup(1,{fail:(c,n)=>n===1?{message:'JWT expired',code:'PGRST301'}:null});assert.equal((await preparePendingBatch(args)).ready.length,1);assert.equal(supabase.auth.refreshes,1);});
test('JWT persiste: termina com mensagem útil, sem loop',async()=>{const {args,supabase}=setup(1,{fail:()=>({message:'JWT expired'})});await assert.rejects(preparePendingBatch(args),/sessão não pôde ser renovada/);assert.equal(supabase.calls.length,2);});
test('Permissão negada não é tratada como token vencido',async()=>{const {args,supabase}=setup(1,{fail:()=>({message:'permission denied'})});await assert.rejects(preparePendingBatch(args),e=>e.message==='permission denied');assert.equal(supabase.auth.refreshes,0);assert.equal(supabase.calls.length,1);});
test('Sem sessão não consulta e pede autenticação',async()=>{const {args,supabase}=setup(1,{noSession:true});await assert.rejects(preparePendingBatch(args),/sessão terminou/);assert.equal(supabase.calls.length,0);});
test('Mudança de usuário durante renovação aborta o lote',async()=>{const {args}=setup(1,{expired:true,changeSession:true});await assert.rejects(preparePendingBatch(args),/conta mudou/);});
test('Prontos, entregues e cancelados não entram; outro pedido da mesma arte permanece',async()=>{const {args,tables}=setup(4);['ready_pickup','delivered','cancelled'].forEach((stage,i)=>tables.z19p_zero19_work_items[i].stage=stage);const r=await preparePendingBatch(args);assert.equal(r.ready.length,1);assert.equal(r.unavailable.length,3);});
test('Pedido concluído pelo QR durante preparação é retirado na conferência final',async()=>{const {args,tables}=setup(1);const r=await preparePendingBatch({...args,makeAsset:(...p)=>{tables.z19p_zero19_work_items[0].stage='ready_pickup';return makeAsset(...p);}});assert.equal(r.ready.length,0);assert.equal(r.unavailable.length,1);});
test('Alteração de receita/medida não é aceita pela seleção antiga',async()=>{const {args,tables}=setup(2);tables.z19p_zero19_work_items[0].metadata.details[0].production.width_cm=31;const r=await preparePendingBatch(args);assert.equal(r.ready.length,1);assert.equal(r.errors.length,1);});
test('Erro em uma arte preserva as outras aplicações válidas',async()=>{const {args,tables}=setup(2);tables.z19p_zero19_work_items[0].metadata.details[0].production.storage_bucket='forbidden';args.entries[0].row.metadata.details[0].production.storage_bucket='forbidden';const r=await preparePendingBatch(args);assert.equal(r.errors.length,1);assert.equal(r.ready.length,1);});
test('Cancelamento não produz resultado tardio',async()=>{const {args}=setup(1,{delay:25}),controller=new AbortController();const task=preparePendingBatch({...args,signal:controller.signal});setTimeout(()=>controller.abort(),3);await assert.rejects(task,e=>e.name==='AbortError');});
test('Prazo de leitura encerra promessa pendurada',async()=>{await assert.rejects(waitFilm(new Promise(()=>{}),{timeoutMs:10}),/conexão demorou/);});
test('Fontes verificam versão e recuperam JWT do carregamento sem gravações',async()=>{
 const {args,tables,supabase}=setup(1),set={id:id(60000),status:'ready',tested_at:'2026-10-12',updated_at:'v1'};tables.z19p_customization_sets=[{...set,owner_id:OWNER}];args.entries[0].kind='font';args.entries[0].row.set=set;let calls=0;
 const r=await preparePendingBatch({...args,makeFont:async row=>{if(++calls===1)throw new Error('JWT expired');return [{zero19WorkItemId:row.id,localId:crypto.randomUUID()}];}});assert.equal(r.ready.length,1);assert.equal(calls,2);assert.equal(supabase.auth.refreshes,1);
});
test('Fonte alterada fica para revisão, sem preparar pela versão antiga',async()=>{const {args,tables}=setup(1),set={id:id(60000),status:'ready',tested_at:'yes',updated_at:'v1'};args.entries[0].kind='font';args.entries[0].row.set=set;tables.z19p_customization_sets=[{...set,owner_id:OWNER,updated_at:'v2'}];let calls=0;const r=await preparePendingBatch({...args,makeFont:()=>{calls++;}});assert.equal(r.errors.length,1);assert.equal(calls,0);});
test('Venduss já importado usa asset/perfil em lote e não reimporta',async()=>{const {args,tables}=setup(3);args.entries.forEach(e=>e.kind='venduss');tables.z19p_asset_print_profiles=[{owner_id:OWNER,asset_id:ASSET,default_width_cm:10,default_height_cm:20,ready_for_print:true}];const r=await preparePendingBatch({...args,makeVenduss:()=>{throw new Error('não deveria importar');}});assert.equal(r.ready.length,3);});
test('Falha da importação Venduss não é repetida automaticamente',async()=>{const {args,tables}=setup(1);args.entries[0].kind='venduss';args.entries[0].row.asset_id=null;tables.z19p_zero19_work_items[0].asset_id=null;let calls=0;const r=await preparePendingBatch({...args,makeVenduss:async()=>{calls++;throw new Error('JWT expired');}});assert.equal(calls,1);assert.equal(r.errors.length,1);});
test('Entrada repetida não duplica preparo',async()=>{const {args}=setup(1);args.entries.push(args.entries[0]);assert.equal((await preparePendingBatch(args)).ready.length,1);});
test('Identidade inválida bloqueia antes de ler dados',async()=>{const {args,supabase}=setup(1);args.entries[0].row.id='invalid';await assert.rejects(preparePendingBatch(args),/vínculo válido/);assert.equal(supabase.calls.length,0);});
test('Consultas simultâneas compartilham a renovação da sessão',async()=>{const {args,supabase}=setup(1,{expired:true});const reader=createFilmReader(args);await Promise.all([reader.ensure(),reader.ensure(),reader.ensure()]);assert.equal(supabase.auth.refreshes,1);});
test('Concorrência limitada a três operações',async()=>{let active=0,peak=0;await filmMapLimit(Array.from({length:30},(_,i)=>i),3,async()=>{peak=Math.max(peak,++active);await pause(1);active--;});assert.equal(peak,3);});

function ui(options){
 const film=[],selected=new Set(options.entries.map(e=>e.key));
 const node=()=>({dataset:{},style:{},children:[],hidden:false,classList:{add(){}},setAttribute(){},append(...nodes){this.children.push(...nodes);},before(){},remove(){this.removed=true;},closest(){return null;}});
 const document={createElement:node},button=node(),alert=node(),footer=node(),inputs=options.entries.map((e,i)=>({...node(),dataset:{entry:String(i)},hasAttribute:k=>k==='data-entry'}));
 const modal={...node(),isConnected:true,ownerDocument:document,querySelector:s=>s==='.modal-footer'?footer:s==='.film-pending-error'?alert:s.startsWith('[data-entry=')?inputs[Number(s.match(/"(\d+)"/)[1])]:null,querySelectorAll:()=>inputs,remove(){this.isConnected=false;}};
 let busy=false,commits=0;const handle=installPendingBatchAdd({...options,modal,button,selected,getBusy:()=>busy,setBusy:v=>busy=v,updateCount:()=>{},getFilmItems:()=>film,commit:items=>{commits++;film.push(...items);},afterCommit:async()=>{}});
 return {film,selected,button,modal,alert,handle,commits:()=>commits};
}
test('Clique duplo inclui uma única vez e entrega progresso',async()=>{const {args}=setup(3,{delay:4}),x=ui(args);await Promise.all([x.button.onclick(),x.button.onclick()]);assert.equal(x.film.length,3);assert.equal(x.commits(),1);assert.equal(x.selected.size,0);assert.equal(x.modal.isConnected,false);});
test('UI mantém falhas selecionadas; retentativa não duplica os sucessos',async()=>{const {args}=setup(2);let fail=true;const x=ui({...args,makeAsset:(...p)=>{if(fail&&p[2].quantity===2)throw new Error('simulated');return makeAsset(...p);}});await x.button.onclick();assert.equal(x.film.length,1);assert.equal(x.selected.size,1);assert.ok(x.alert.textContent.includes('precisam de atenção'));fail=false;await x.button.onclick();assert.equal(x.film.length,2);assert.equal(new Set(x.film.map(i=>i.zero19WorkItemId)).size,2);});
test('UI cancelar não adiciona depois de a resposta chegar',async()=>{const {args}=setup(1,{delay:25}),x=ui(args),task=x.button.onclick();setTimeout(()=>x.handle.cancel(),3);await task;await pause(30);assert.equal(x.film.length,0);assert.equal(x.selected.size,1);});
