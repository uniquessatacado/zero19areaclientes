import assert from 'node:assert/strict';
import {loadProjectHistory,filterProjectHistoryAssets} from '../project-history.js';

const tables={
  z19p_projects:[{id:'old',workspace_id:'company',owner_id:'account',sequence_no:1},{id:'new',workspace_id:'company',owner_id:'account',sequence_no:2}],
  z19p_assets:[{id:'art-old',name:'Árvore',workspace_id:'company',project_id:'old',owner_id:'account',asset_type:'arte',folder_id:'folder-old'},{id:'mockup-old',name:'Camisa',workspace_id:'company',project_id:'old',owner_id:'account',asset_type:'mockup'},{id:'art-new',workspace_id:'company',project_id:'new',owner_id:'account'},{id:'wrong-owner',workspace_id:'company',project_id:'old',owner_id:'other'},{id:'unlinked',workspace_id:'company',project_id:null,owner_id:'account'}],
  z19p_folders:[{id:'folder-old',workspace_id:'company',project_id:'old',owner_id:'account',name:'Arquivos antigos'}],
  z19p_quotes:[{id:'quote-old',workspace_id:'company',project_id:'old',owner_id:'account',payment_status:'paid'},{id:'quote-new',workspace_id:'company',project_id:'new',owner_id:'account'}],
  z19p_quote_items:[{id:'item-2',quote_id:'quote-old',owner_id:'account',sort_order:2},{id:'item-1',quote_id:'quote-old',owner_id:'account',sort_order:1},{id:'item-new',quote_id:'quote-new',owner_id:'account'}],
  z19p_quote_documents:[{id:'pdf-old',quote_id:'quote-old',owner_id:'account',project_id:null,document_version:1},{id:'pdf-new',quote_id:'quote-new',owner_id:'account'}],
  z19p_asset_print_profiles:[{id:'profile-old',asset_id:'art-old',project_id:'old',owner_id:'account'}],
  z19p_print_jobs:[{id:'job-old',project_id:'old',owner_id:'account'}],
  z19p_status_history:[]
};
const calls=[];
function client(failTable){return {from(table){const filters=[],ins=[];return{
  select(){calls.push({operation:'select',table});return this},eq(key,value){filters.push({key,value});return this},in(key,values){ins.push({key,values});return this},order(){return this},
  async maybeSingle(){return {data:(tables[table]||[]).find(row=>filters.every(({key,value})=>row[key]===value))||null}},
  async range(start,end){if(table===failTable)return {error:{message:'Consulta indisponível'}};calls.push({table,filters,ins});return {data:(tables[table]||[]).filter(row=>filters.every(({key,value})=>row[key]===value)&&ins.every(({key,values})=>values.includes(row[key]))).slice(start,end+1)}}
}}}}
const originals=structuredClone(tables),scope={workspaceId:'company',projectId:'old',ownerId:'account'};
const archive=await loadProjectHistory(client(),scope);
assert.equal(archive.project.id,'old');
assert.deepEqual(archive.assets.map(asset=>asset.id),['art-old','mockup-old'],'only the requested project and account assets may appear');
assert.deepEqual(archive.quotes.map(quote=>quote.id),['quote-old']);
assert.deepEqual(archive.quotes[0].items.map(item=>item.id),['item-1','item-2']);
assert.deepEqual(archive.quotes[0].documents.map(document=>document.id),['pdf-old'],'legacy PDF scope is resolved by its already verified quote, never by workspace alone');
assert.deepEqual(tables,originals,'read-only archive loading must never mutate the active project or input records');
assert.ok(calls.filter(call=>call.filters).every(call=>call.filters.some(filter=>filter.key==='owner_id'&&filter.value==='account')));
assert.deepEqual(filterProjectHistoryAssets(archive.assets,{query:'arvore'}).map(asset=>asset.id),['art-old']);
assert.deepEqual(filterProjectHistoryAssets(archive.assets,{kind:'mockup',folder:'root'}).map(asset=>asset.id),['mockup-old']);
assert.deepEqual(filterProjectHistoryAssets(archive.assets,{folder:'folder-old'}).map(asset=>asset.id),['art-old']);
const partial=await loadProjectHistory(client('z19p_quote_items'),scope);
assert.equal(partial.quotes[0].items,null,'query errors must not be presented as an empty, zero-value quote');
assert.ok(partial.warnings.some(warning=>warning.includes('Itens de orçamento')));
assert.equal(partial.assets.length,2,'an optional section failure does not hide healthy sections');
await assert.rejects(loadProjectHistory(client(),{...scope,projectId:'new',workspaceId:'other-company'}),/não encontrado/);
await assert.rejects(loadProjectHistory(client(),{...scope,ownerId:''}),/identificar/);
console.log('project history tests: strict read-only scope, archived quotes/PDFs, partial failure and file filtering passed');
