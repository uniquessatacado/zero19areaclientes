import assert from 'node:assert/strict';
import {buildQueueSnapshot,fetchQueueRecords,missingQueueStages,scopeQueueRows} from '../queue-core.js';
import {createProductionModule} from '../production-v217.js';

const statuses=[
  {id:'art',name:'Nome personalizado',queue_stage:'art_work',active:true},
  {id:'ready',name:'Pronto',queue_stage:'ready_production',active:true},
  {id:'printing',name:'Imprimindo',queue_stage:'production',active:true},
  {id:'sales',name:'Em atendimento',queue_stage:'none'},
  {id:'done',name:'Entregue',queue_stage:'none',is_finalized:true}
];
const workspace=(id,extra={})=>({id,company_name:id,workspace_type:'client',status_id:'art',responsible_user_id:'seller',...extra});
const project=(id,workspace_id,extra={})=>({id,workspace_id,sequence_no:1,status_id:'art',started_at:'2026-09-01T12:00:00Z',status_entered_at:'2026-09-15T12:00:00Z',delivery_date:'2026-09-30',...extra});
const quote=(id,project_id,extra={})=>({id,project_id,payment_status:'paid',paid_at:'2026-09-16T12:00:00Z',created_at:'2026-09-16T12:00:00Z',...extra});

const snapshot=buildQueueSnapshot({statuses,
  workspaces:[workspace('early'),workspace('late',{responsible_user_id:'other'}),workspace('new-project'),workspace('pending'),workspace('no-date'),workspace('legacy'),workspace('closed'),workspace('sales',{status_id:'sales'}),workspace('library',{workspace_type:'library_artes'})],
  projects:[project('a','early',{delivery_date:'2026-09-20'}),project('b','late'),project('old','new-project'),project('new','new-project',{sequence_no:2,status_id:'sales'}),project('pending-p','pending'),project('date-p','no-date',{delivery_date:null}),project('legacy-p','legacy'),project('closed-p','closed',{finalized_at:'2026-09-17T12:00:00Z'}),project('sales-p','sales',{status_id:'sales'}),project('library-p','library')],
  quotes:[quote('paid-a','a'),quote('draft-a','a',{payment_status:'pending',paid_at:null,updated_at:'2026-09-18T12:00:00Z',created_at:'2026-09-18T12:00:00Z'}),quote('paid-b','b'),quote('old-paid','old'),quote('pending-q','pending-p',{payment_status:'pending',paid_at:null}),quote('date-q','date-p',{delivery_date:'2026-10-01'}),quote('legacy-q',null,{workspace_id:'legacy'}),quote('closed-q','closed-p'),quote('sales-q','sales-p',{payment_status:'pending',paid_at:null}),quote('library-q','library-p')]
});
assert.deepEqual(snapshot.rows.map(row=>row.project.id),['a','b'],'a new draft must not hide a paid order, and old/closed/library projects must not enter queues');
assert.equal(snapshot.rows[0].quote.id,'paid-a');
assert.equal(snapshot.rows[0].position,1);
assert.equal(snapshot.rows[1].position,2);
assert.deepEqual(scopeQueueRows(snapshot.rows,'other','mine').map(row=>row.position),[2],'mine keeps the real team queue position');
assert.equal(snapshot.cards.find(row=>row.workspace.id==='new-project').payment,'none','payment does not leak from the prior project');
assert.equal(snapshot.cards.find(row=>row.workspace.id==='legacy').payment,'unlinked','a legacy paid quote without project is not assumed paid for the current project');
assert.equal(snapshot.cards.find(row=>row.workspace.id==='sales').payment,'pending','payment badges also exist outside production queues');
assert.ok(snapshot.blocked.find(row=>row.workspace.id==='no-date').reasons.some(reason=>reason.includes('data de entrega')),'quote delivery date cannot replace a missing project delivery date');
assert.ok(snapshot.blocked.find(row=>row.workspace.id==='pending').reasons.some(reason=>reason.includes('pagamento')));
assert.ok(snapshot.blocked.find(row=>row.workspace.id==='new-project').reasons.some(reason=>reason.includes('status do projeto')),'workspace/project disagreement is visible without inventing a stage');
assert.deepEqual(missingQueueStages(statuses),[]);
assert.deepEqual(missingQueueStages([{id:'legacy-status',name:'Produzindo arte',queue_stage:'none'}]),['art_work','ready_production','production'],'queue meaning must never depend on the name');
assert.ok(missingQueueStages([{queue_stage:'art_work',active:false}]).includes('art_work'));

const ties=buildQueueSnapshot({statuses,workspaces:['z','y','x','w'].map(id=>workspace(id)),projects:[
  project('z','z',{status_entered_at:'2026-09-11T12:00:00Z'}),project('y','y',{status_entered_at:'2026-09-10T12:00:00Z'}),project('x','x',{status_entered_at:'2026-09-10T12:00:00Z'}),project('w','w',{status_entered_at:'2026-09-10T12:00:00Z'})
],quotes:[quote('qz','z'),quote('qy','y',{paid_at:'2026-09-16T12:00:00Z'}),quote('qx','x',{paid_at:'2026-09-15T12:00:00Z'}),quote('qw','w',{paid_at:'2026-09-15T12:00:00Z'})]});
assert.deepEqual(ties.rows.map(row=>row.project.id),['w','x','y','z'],'delivery ties use stage entry, paid date and stable id');

function fakeSupabase(tables,{failTable=null}={}){
  const calls=[];
  return {calls,from(table){let filters={};return{
    select(){return this},eq(key,value){filters[key]=value;return this},order(){return this},
    async range(start,end){calls.push({table,start,end,filters});return table===failTable?{error:{message:'Network unavailable'}}:{data:(tables[table]||[]).slice(start,end+1)}}
  }}};
}
const paged=fakeSupabase({z19p_projects:[{id:1},{id:2},{id:3},{id:4},{id:5}],z19p_quotes:[{id:1},{id:2},{id:3}]});
const data=await fetchQueueRecords(paged,'account',2);
assert.equal(data.projects.length,5);
assert.equal(data.quotes.length,3);
assert.ok(paged.calls.every(call=>call.filters.owner_id==='account'),'every page remains account scoped');
await assert.rejects(fetchQueueRecords(fakeSupabase({},{failTable:'z19p_quotes'}),'account'),/pagamentos.*Network unavailable/,'a failed query must not look like an empty queue');

function fakeCard(id){
  const flags=new Set(),attributes={},card={dataset:{},html:'',count:0};
  card.classList={toggle(name,on){on?flags.add(name):flags.delete(name)},contains(name){return flags.has(name)}};
  card.querySelector=selector=>selector.includes('open-workspace')?{dataset:{id}}:selector==='.workspace-copy'?{insertAdjacentHTML(where,html){card.html=html;card.count++}}:null;
  card.querySelectorAll=()=>card.count?[{remove(){card.count=0;card.html=''}}]:[];
  card.removeAttribute=name=>{delete attributes[name];if(name==='data-queue-stage')delete card.dataset.queueStage};
  return card;
}
let cards=[fakeCard('early'),fakeCard('sales')];
const app={querySelector:selector=>selector==='.dashboard-home'?{}:null,querySelectorAll:()=>cards};
const state={session:{user:{id:'seller'}},statuses,workspaces:[workspace('early'),workspace('sales',{status_id:'sales'})],currentProjects:[project('wrong-detail-state','elsewhere')]};
const db=fakeSupabase({z19p_projects:[project('a','early'),project('sales-p','sales',{status_id:'sales'})],z19p_quotes:[quote('qa','a'),quote('qs','sales-p',{payment_status:'pending'})]});
const module=createProductionModule({app,supabase:db,state:()=>state,accountOwnerId:()=>'account',escapeHTML:value=>String(value)});
await module.loadQueues();
module.enhanceDashboardCards();
assert.match(cards[0].html,/#1 para desenvolver arte/,'cards load from full account data, not the currently open workspace state');
assert.match(cards[0].html,/>PAGO</);
assert.match(cards[1].html,/>PENDENTE</);
assert.equal(cards[0].classList.contains('mine'),true);
module.enhanceDashboardCards();
assert.equal(cards[0].count,1,'redrawing cards does not duplicate badges');
cards=[fakeCard('early')]; // Simulate search / status filter / minute refresh replacing the DOM.
module.enhanceDashboardCards();
assert.match(cards[0].html,/#1 para desenvolver arte/,'newly rendered cards regain queue badges');

console.log('queue regression tests: payment, project isolation, legacy diagnostics, ordering, pagination and card redraw passed');
