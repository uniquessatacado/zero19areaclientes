import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../production-v217.js',import.meta.url),'utf8');
const start=source.indexOf('    const drawOrders=()=>{'),end=source.indexOf('    const refreshOrders=async()=>',start);
assert(start>=0&&end>start);
const button={innerHTML:''},slot={innerHTML:'',querySelector:()=>({}),querySelectorAll:()=>[]};
const context={pageCurrent:()=>true,orderRows:[],fontOrderRows:[{id:'zero19-a'},{id:'zero19-b'}],vendussPendingRows:[{id:'venduss'}],officialPendingRows:[],filmItems:[{zero19WorkItemId:'zero19-a'},{zero19WorkItemId:'zero19-b'}],app:{querySelector:()=>button},ordersSlot:slot,refreshOrders:()=>{}};
runInNewContext(source.slice(start,end)+'drawOrders();',context);
assert.match(button.innerHTML,/>3<\/b>/,'draft items still count as awaiting production');
context.fontOrderRows=[{id:'zero19-b'}];
runInNewContext(source.slice(start,end)+'drawOrders();',{...context});
assert.match(button.innerHTML,/>2<\/b>/,'only items no longer returned as pending leave the counter');

const workflow=readFileSync(new URL('../official-order-workflow.js',import.meta.url),'utf8');
const groupStart=workflow.indexOf('  function exportGroups('),groupEnd=workflow.indexOf('\n  return {loadPositions',groupStart);
assert(groupStart>=0&&groupEnd>groupStart);
const calls=[],api=runInNewContext(workflow.slice(groupStart,groupEnd)+'\n({markProduction})',{supabase:{rpc:async(name,args)=>{calls.push({name,args});return {data:{projects:1,placements:0}};}}});
const items=[{officialProjectId:'zero19-a'},{officialProjectId:'zero19-b'},{officialProjectId:'venduss'}];
await api.markProduction(items,[]);assert.equal(calls.length,0,'unchecked export changes no production status');
await api.markProduction(items,['order:venduss']);
assert.deepEqual(JSON.parse(JSON.stringify(calls[0].args.p_project_ids)),['venduss'],'only checked order is marked in production');
const pickerStart=source.indexOf('    const openUnifiedPendingPicker=async()=>{'),pickerEnd=source.indexOf('\n    ctx.bindCommon();',pickerStart);
assert.doesNotMatch(source.slice(pickerStart,pickerEnd),/markProduction|\.rpc\(/,'adding to the film does not mark production');
console.log('PASS pending visibility: ZERO19 + Venduss remain visible in draft; export marks only checked orders.');
