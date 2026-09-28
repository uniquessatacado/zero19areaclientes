import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {orderItemProgress} from '../order-item-progress.js';
const source=fs.readFileSync(new URL('../zero19-pdv-sync.js',import.meta.url),'utf8');
const context={items:[{id:'art',personalization_sale_id:'sale-art',kind:'NEW_ART',stage:'awaiting_art',text_value:'Frente'},{id:'font',kind:'NAME_NUMBER',stage:'awaiting_font',text_value:'JOÃO'},{id:'ready',kind:'NAME_NUMBER',stage:'ready_production',text_value:'GABRIEL'}],project:{id:'current',official_order_payload:{display_id:49323}},workspace:{id:'workspace',client_name:'Roger'},stage:'awaiting_art',qty:3};
context.progress=orderItemProgress(context.items);
const globals={h:v=>String(v??''),digits:v=>String(v??''),dt:v=>String(v),orderNo:p=>p.official_order_payload.display_id,STAGE_LABELS:{awaiting_art:'Pendente arte',awaiting_font:'Pendente fonte',ready_production:'Aguardando produção'},context};
const card=source.slice(source.indexOf('  function itemLine('),source.indexOf('  async function enhanceDashboard('));
const html=vm.runInNewContext(card+';card(context)',globals);
assert.match(html,/data-work-item-id="art"/);assert.match(html,/data-project-id="current"/);
assert.match(html,/data-z19-choose-font="font"|data-z19-font="font"/);
assert.match(html,/data-z19-team-film="ready"/);
assert.match(html,/1\/3 prontas para produzir/);assert.match(html,/0\/3 concluídas/);
const chooser=source.slice(source.indexOf('  async function chooseUploadTarget('),source.indexOf('  async function openGlobalUpload('));
const choose=vm.runInNewContext(chooser+';chooseUploadTarget',{
  load:async()=>({summaries:[context]}),state:()=>({currentProjects:[{id:'old-cancelled',workspace_id:'workspace',official_order_ref:'old'}]}),...globals
});
const target=await choose('workspace',{projectId:'current',workItemId:'art',personalizationSaleId:'sale-art'});
assert.equal(target.project.id,'current');assert.equal(target.item.id,'art');
await assert.rejects(()=>choose('workspace',{projectId:'old-cancelled',workItemId:'art'}),/Não há/);
await assert.rejects(()=>choose('workspace',{projectId:'current',workItemId:'font'}),/Escolher fonte/);
await assert.rejects(()=>choose('workspace',{projectId:'current',workItemId:'art',excludeSaleIds:['sale-art']}),/Não há/);
console.log('Mixed order: art + font + ready actions coexist; upload binds exact live order/item and rejects historical/font/duplicate targets.');
