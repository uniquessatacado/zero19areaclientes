import assert from 'node:assert/strict';
import {verifyFilmLetteringRevisions} from '../film-lettering-revisions.js';
import {assertCompleteFilmPhrases,letteringApplicationPart,separateFilmPhrase} from '../film-phrase-parts.js';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const production={top_text:'TEXTO LONGO',number:'22',letter_height_cm:5.5,name_max_width_cm:34};
const base={type:'team_customization',localId:'line',sourceId:'font',customizationSetId:'font',zero19WorkItemId:'work',officialProjectId:'project',externalOrderItemRef:'00000000-0000-4000-8000-000000000001',name:'TEXTO LONGO',number:'',quantity:2,applicationQuantity:2,letteringRevision:'revision',letteringProductionSnapshot:production,nameHeightCm:5.5,nameTrackingCm:0,widthCm:40,heightCm:5.5,pieceType:'name',compositionMode:'split'};
const digit={...base,localId:'digit',name:'',number:'2',pieceType:'digit',widthCm:10,heightCm:28};
const sourceItems=[base,digit],parts=sourceItems.map(letteringApplicationPart);
for(const item of sourceItems)item.letteringApplicationParts=structuredClone(parts);
const row={id:'work',quantity:2,metadata:{font_set_id:'font',lettering_revision:'revision',details:[{production:{name_max_width_cm:34,letter_height_cm:5.5,number:'22',top_text:'TEXTO LONGO'}}]}};
let current=true,error=null,readRows=[row],queries=[];
const supabase={from:table=>{const filters=[];const query={select:fields=>{queries.push({table,fields,filters});return query;},eq:(...args)=>{filters.push(['eq',...args]);return query;},in:(...args)=>{filters.push(['in',...args]);return query;},then:resolve=>resolve({data:readRows,error})};return query;}};
assert.deepEqual(await verifyFilmLetteringRevisions({supabase,ownerId:'owner',items:sourceItems,isCurrent:()=>current}),[row]);
assert.equal(queries.length,1,'Duplicate word/digit work IDs read only once');assert.equal(queries[0].table,'z19p_zero19_work_items');assert.deepEqual(queries[0].filters,[['eq','owner_id','owner'],['in','id',['work']]]);
assert.equal(assertCompleteFilmPhrases(sourceItems),true);
const split=separateFilmPhrase(sourceItems,'line');assert.equal(assertCompleteFilmPhrases(split.items),true);
const reorderKeys=value=>Array.isArray(value)?value.map(reorderKeys):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).reverse().map(key=>[key,reorderKeys(value[key])])):value;
assert.equal(assertCompleteFilmPhrases(reorderKeys(split.items)),true,'Persisted JSONB key order does not invalidate application parts');
assert.equal(split.parts[0].letteringProductionSnapshot.top_text,'TEXTO LONGO');
await verifyFilmLetteringRevisions({supabase,ownerId:'owner',items:split.items});
const missingDigit=split.items.filter(item=>item.localId!=='digit');assert.throws(()=>assertCompleteFilmPhrases(missingDigit),/faltam partes/);
for(const patch of [{quantity:1},{metadata:{...row.metadata,font_set_id:'changed'}},{metadata:{...row.metadata,lettering_revision:'next'}},{metadata:{...row.metadata,details:[{production:{...production,top_text:'ALTERADO NO PDV'}}]}}]){
  readRows=[{...row,...patch}];await assert.rejects(verifyFilmLetteringRevisions({supabase,ownerId:'owner',items:sourceItems}),/mudou|alterada/);
}
readRows=[row];await assert.rejects(verifyFilmLetteringRevisions({supabase,ownerId:'owner',items:[{...base,letteringProductionSnapshot:null}]}),/rascunho antigo.*Remova/);
for(const patch of [{nameHeightCm:3,heightCm:3},{nameHeightCm:5.5,heightCm:3}]){await assert.rejects(verifyFilmLetteringRevisions({supabase,ownerId:'owner',items:[{...base,...patch}]}),/menor.*altura do pedido.*Corrigir altura/,'Do not export a shrunken body or stale smaller print geometry');}
readRows=[{...row,stage:'cancelled'}];await assert.rejects(verifyFilmLetteringRevisions({supabase,ownerId:'owner',items:sourceItems}),/cancelada.*nenhum arquivo/,'Cancelled application cannot render old PNG/TIFF');
for(const stage of ['production','ready_pickup','delivered']){readRows=[{...row,stage}];await verifyFilmLetteringRevisions({supabase,ownerId:'owner',items:sourceItems});}
readRows=[];await assert.rejects(verifyFilmLetteringRevisions({supabase,ownerId:'owner',items:sourceItems}),/confirmar/);
readRows=[row];error={message:'rede'};await assert.rejects(verifyFilmLetteringRevisions({supabase,ownerId:'owner',items:sourceItems}),/conferir.*rede/);error=null;
current=false;await assert.rejects(verifyFilmLetteringRevisions({supabase,ownerId:'owner',items:sourceItems,isCurrent:()=>current}),/conta mudou/);current=true;
assert.deepEqual(await verifyFilmLetteringRevisions({supabase,ownerId:'owner',items:[{type:'asset',zero19WorkItemId:'work'}]}),[],'PNG has no font revision requirement');

const workflow=readFileSync(new URL('../official-order-workflow.js',import.meta.url),'utf8'),start=workflow.indexOf('  function exportGroups('),end=workflow.indexOf('\n  return {loadPositions',start),calls=[];
let rpcError=null;
const api=runInNewContext(workflow.slice(start,end)+'\n({markProduction})',{assertCompleteFilmPhrases,verifyFilmLetteringRevisions,owner:()=> 'owner',user:()=> 'operator',supabase:{...supabase,rpc:async(name,args)=>{calls.push({name,args});return {data:{projects:1},error:rpcError};}}});
const layout={placements:split.items.flatMap(item=>[0,1].map(copy=>({id:item.localId,copy})))};
await api.markProduction(split.items,['order:project'],layout);
assert.equal(calls[0].name,'z19p_mark_selected_order_production_lettering');
const expected=JSON.parse(JSON.stringify(calls[0].args.p_expected_lettering));assert.deepEqual(expected,[{work_item_id:'work',personalization_sale_id:base.externalOrderItemRef,lettering_revision:'revision',quantity:2,font_set_id:'font',production}]);
assert.equal(calls[0].args.p_sale_ids.length,1,'Words still identify one sale/application');
await assert.rejects(api.markProduction(missingDigit,['order:project'],layout),/faltam partes/);assert.equal(calls.length,1,'Incomplete group makes no status RPC');
const missingWord=split.items.filter(item=>item.localId!==split.parts[0].localId);await assert.rejects(api.markProduction(missingWord,['order:project'],layout),/faltam partes|palavras/);assert.equal(calls.length,1);
readRows=[{...row,metadata:{...row.metadata,lettering_revision:'changed'}}];await assert.rejects(api.markProduction(split.items,['order:project'],layout),/escrita.*alterada/);assert.equal(calls.length,1,'Stale revision blocks before RPC');
readRows=[row];rpcError={message:'A escrita foi alterada durante a exportação. Atualize a aplicação.'};await assert.rejects(api.markProduction(split.items,['order:project'],layout),error=>error.message.includes('alterada durante'));assert.equal(calls.length,2,'Atomic wrapper error is surfaced, never falls back to unsafe historical RPC');
rpcError=null;await api.markProduction([{type:'asset',officialProjectId:'png-project'}],['order:png-project']);assert.equal(calls[2].name,'z19p_mark_selected_order_production','Nonlettering keeps original workflow');

const source=readFileSync(new URL('../production-v217.js',import.meta.url),'utf8');
assert.match(source,/letteringProductionSnapshot:structuredClone\(production\)/);assert.match(source,/letteringApplicationParts=structuredClone\(parts\)/);
assert.equal((source.match(/await verifyFilmLetteringRevisions\(/g)||[]).length,4,'Before opening export, PNG, TIFF and record');
assert.match(source,/markProduction\?\.\(items,\[\.\.\.selectedProductionGroups\],layout\)/);
const proof=readFileSync(new URL('film-v2176-functions.txt',import.meta.url),'utf8');assert.match(proof,/const candidates=.*!item\.phraseManifests\?\.length&&!item\.zero19WorkItemId/,'Split parts and linked application text cannot be edited by generic proof');
console.log('PASS film lettering snapshots: owner-scoped dedupe, source/revision/font/quantity CAS payload, source production JSON, missing parts/copies, stale/legacy/read/race errors cannot release application, PNG/history untouched.');
{
  const {letteringHeightLimits,letteringHeightProblem}=await import('../film-lettering-revisions.js');
  const kid={name:'ANA',nameHeightCm:3.6,heightCm:3.6,letteringProductionSnapshot:{letter_height_cm:4,studio_text_layout:'TWENTY_LETTERS'}};
  assert.deepEqual(letteringHeightLimits(kid),{official:4,minimum:4},'Infantil nunca abaixo de 4 cm');
  assert.ok(letteringHeightProblem(kid));
  assert.equal(letteringHeightProblem({...kid,nameHeightCm:4,heightCm:4}),null);
  const men={name:'JOÃO',nameHeightCm:5,heightCm:5.2,letteringProductionSnapshot:{letter_height_cm:5.5,studio_text_layout:'TWENTY_LETTERS'}};
  assert.equal(letteringHeightProblem(men),null,'Masculino 20 letras aceita até 5 cm');
  assert.equal(letteringHeightProblem({...men,letteringProductionSnapshot:{letter_height_cm:5.5}})?.official,5.5,'Pedido antigo exige a altura do pedido');
  assert.equal(letteringHeightLimits({...men,letteringProductionSnapshot:{letter_height_cm:5,studio_text_layout:'TWENTY_LETTERS'}}).minimum,4.5,'Feminino 5 → 4,5');
  console.log('PASS altura mínima por pedido: masculino 5, feminino 4,5, infantil 4 e botão Corrigir altura.');
}
{
  const {letteringHeightProblem}=await import('../film-lettering-revisions.js');
  const star={name:'*',nameHeightCm:5.5,heightCm:2.29,letteringProductionSnapshot:{letter_height_cm:5.5}};
  assert.equal(letteringHeightProblem(star),null,'Asterisco sozinho é proporcional à letra de 5,5 cm, não é erro');
  assert.ok(letteringHeightProblem({...star,nameHeightCm:4}),'Corpo da letra menor continua bloqueado');
  assert.ok(letteringHeightProblem({...star,name:'ANA *'}),'Texto com letras mantém a conferência');
  console.log('PASS sinais sozinhos (*) não acusam altura menor.');
}
