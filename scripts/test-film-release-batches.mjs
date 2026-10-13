import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {assertCompleteFilmPhrases} from '../film-phrase-parts.js';
import {pendingReleaseKeys,compactFilmRelease} from '../film-release-store.js';

// 13/10 (dono): filme de 40 m gerado e nada saiu da fila. Um pedido ocupado/alterado
// não pode segurar os outros; lentidão/ocupado tenta de novo sozinho.
const workflow=readFileSync(new URL('../official-order-workflow.js',import.meta.url),'utf8');
const start=workflow.indexOf('  function exportGroups('),end=workflow.indexOf('\n  return {loadPositions',start);
assert(start>=0&&end>start);
let calls=[],behaviour={};
const api=runInNewContext(workflow.slice(start,end)+'\n({markProduction})',{assertCompleteFilmPhrases,supabase:{rpc:async(name,args)=>{
  const project=args.p_project_ids[0]||'manual';calls.push({name,project,args});
  const next=(behaviour[project]||[]).shift();
  if(next==='throw')throw new TypeError('Failed to fetch');
  if(next)return {data:null,error:{message:next}};
  return {data:{projects:args.p_project_ids.length,placements:args.p_placement_ids.length},error:null};
}}});
const items=['a','b','c'].map(id=>({type:'asset',officialProjectId:id,officialOrderRef:'#'+id,companyName:'Cliente '+id,productionGroupKeys:['order:'+id],productionPlacementIds:['p-'+id]}));
items.push({type:'asset',manualGarmentGroupId:'m1',productionPlacementIds:['p-m1'],companyName:'Grupo'});

behaviour={b:['Outra aplicação do pedido mudou de etapa. Atualize o filme antes de exportar.'],c:['Pedido em atualização. Tente novamente.','throw']};
const result=await api.markProduction(items,['order:a','order:b','order:c','manual:m1']);
assert.deepEqual([...result.done],['order:a','order:c','manual:m1'],'b failing does not block a, c or the manual group');
assert.equal(result.failed.length,1);assert.equal(result.failed[0].key,'order:b');assert.match(result.failed[0].label,/Pedido #b/);assert.match(result.failed[0].message,/mudou de etapa/);
assert.equal(calls.filter(call=>call.project==='b').length,1,'a real change is not retried blindly');
assert.equal(calls.filter(call=>call.project==='c').length,3,'busy order and network failure are retried automatically');
assert.equal(result.projects,2);assert.equal(result.placements,3);
for(const call of calls)assert.ok(call.args.p_project_ids.length<=1,'one order per call');
assert.deepEqual(JSON.parse(JSON.stringify(calls.find(call=>call.project==='manual').args.p_placement_ids)),['p-m1']);

calls=[];behaviour={a:['x falhou'],b:['y falhou']};
await assert.rejects(api.markProduction(items,['order:a','order:b']),error=>error.message==='x falhou'&&error.failed.length===2,'nothing released → error with every reason');
calls=[];behaviour={};
assert.equal((await api.markProduction(items,[])).done.length,0);assert.equal(calls.length,0,'unchecked orders never change');

assert.deepEqual(pendingReleaseKeys({selectedKeys:['order:a','order:b'],releasedKeys:['order:a']}),['order:b']);
const compact=compactFilmRelease([{localId:'1',previewDataUrl:'data:image/png;base64,AAAA',mask:{w:1},zero19WorkItemId:'w'}]);
assert.deepEqual(compact,[{localId:'1',zero19WorkItemId:'w'}],'pending film keeps ids, not previews');

const source=readFileSync(new URL('../production-v217.js',import.meta.url),'utf8');
assert.match(source,/data-release-without-file|releaseOnlyButton\.dataset\.releaseWithoutFile/,'reopened film can leave the queue without generating 40 m again');
assert.match(source,/filmReleaseStore\.put\(releaseEntry\)/,'generated film is kept until it leaves the queue');
assert.match(source,/Tirar da fila agora/,'warning survives a page refresh');
console.log('PASS fila após exportar: pedido por pedido, nova tentativa em ocupado/rede, falha de um não segura os outros, filme pendente guardado e botão só tirar da fila.');
