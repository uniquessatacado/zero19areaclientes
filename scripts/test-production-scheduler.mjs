import assert from 'node:assert/strict';
import {calculateProductionSchedule as schedule,addProductionMinutes,packProductionRectangles} from '../production-scheduler.js';
const now=new Date('2026-09-27T15:00:00Z'); // Sunday, São Paulo.
const item=(id,production={},overrides={})=>({id,project_id:id,quantity:1,stage:'ready_production',kind:'NEW_ART',metadata:{details:[{production:{width_cm:10,height_cm:10,...production}}]},...overrides});
assert.equal(addProductionMinutes(now,30).toISOString(),'2026-09-28T13:30:00.000Z');
assert.equal(addProductionMinutes(now,480).toISOString(),'2026-09-28T21:00:00.000Z');
assert.equal(addProductionMinutes(now,481).toISOString(),'2026-09-29T13:01:00.000Z');
assert.equal(addProductionMinutes(now,30,['2026-09-28']).toISOString(),'2026-09-29T13:30:00.000Z');
const two=schedule({production_items:[item('a'),item('b')]},{now});
const single=schedule({production_items:[item('a')]},{now});
assert.equal(two.breakdown.printing,single.breakdown.printing,'two small designs share film length');
assert.equal(two.breakdown.ovenBatches,1,'two small designs share one A3 cure');
assert.equal(two.breakdown.curing,4,'two cycles of two minutes');
assert.equal(two.breakdown.pressing,10,'separate garments each need pressing');
const sides=schedule({production_items:[item('a',{}, {metadata:{details:[{production:{width_cm:10,height_cm:10,position_code:'back_top'}},{production:{width_cm:10,height_cm:10,position_code:'back_center'}},{production:{width_cm:10,height_cm:10,position_code:'front_center'}}]}})]},{now});
assert.equal(sides.breakdown.pressing,10,'several designs on same side = one pressing');
const sameGarment=schedule({production_items:[
  item('front-a',{garment_key:'store:variant:shirt-a',position_code:'FRONT_UPPER'},{project_id:'order'}),
  item('front-b',{garment_key:'store:variant:shirt-a',position_code:'frente_centro'},{project_id:'order'}),
  item('back-a',{garment_key:'store:variant:shirt-a',position_code:'BACK_CENTER'},{project_id:'order'}),
  item('back-b',{garment_key:'store:variant:shirt-a'},{project_id:'order',prepared_artworks:[{width_cm:10,height_cm:10,side:'Costas'}]}),
]},{now});
assert.equal(sameGarment.breakdown.pressing,10,'same physical shirt and same side merge across work items, case and prepared placements');
const distinctGarments=schedule({production_items:[
  item('shirt-a',{garment_key:'customer:batch-a',position_code:'FRONT_CENTER'},{project_id:'order'}),
  item('shirt-b',{garment_key:'customer:batch-b',position_code:'front_center'},{project_id:'order'}),
]},{now});
assert.equal(distinctGarments.breakdown.pressing,10,'two distinct customer garment batches must not merge');
const unspecifiedGarments=schedule({production_items:[item('a',{}, {project_id:'order'}),item('b',{}, {project_id:'order'})]},{now});
assert.equal(unspecifiedGarments.breakdown.pressing,10,'old rows without physical identity remain separate');
const sleeveSides=schedule({production_items:[
  item('left-a',{garment_key:'store:shirt',position_code:'LEFT_SLEEVE_FRONT'},{project_id:'order'}),
  item('left-b',{garment_key:'store:shirt',position_code:'left_sleeve_center'},{project_id:'order'}),
  item('right',{garment_key:'store:shirt',position_code:'RIGHT_SLEEVE_FRONT'},{project_id:'order'}),
]},{now});
assert.equal(sleeveSides.breakdown.pressing,10,'each sleeve is its own physical pressing side');
const dtf=schedule({production_items:[item('a',{kind:'DTF_METER',width_cm:58,height_cm:100},{without_application:true})]},{now});
assert.equal(dtf.breakdown.printing,50);assert.equal(dtf.breakdown.pressing,0);
const develop=schedule({production_items:[item('a',{art_source:'DEVELOP'},{stage:'awaiting_art',requires_art:true})]},{now});
assert.equal(develop.breakdown.art,30);assert.ok(develop.totalMinutes>single.totalMinutes);
const paused=schedule({production_items:[item('a'),item('b')],pauses:[{scope:'order',project_id:'a'}]},{now});
assert.equal(paused.projects.find(x=>x.project_id==='a').predictedAt,null);assert.equal(paused.pausedCount,1);
assert.equal(paused.nextAvailableAt,null,'paused queue must not be offered as a definite free slot');
assert.equal(paused.newUnitAvailableAt,null,'a new order cannot receive a definite deadline while the queue is paused');
assert.ok(paused.conditionalNextAvailableAt,'show a conditional estimate assuming the orders resume');
assert.equal(paused.breakdown.cutting,10,'paused work still reserves its cutting time');
assert.equal(paused.breakdown.pressing,10,'paused work still reserves its pressing time');
assert.ok(paused.totalMinutes>single.totalMinutes,'paused work is not removed from the backlog');
assert.equal(schedule({production_items:[item('a')],printer_pause:{id:'p'}},{now}).nextAvailableAt,null);
assert.equal(schedule({production_items:[item('a',{}, {stage:'ready_pickup'})]},{now}).backlogUnits,0);
const progress=schedule({production_items:[item('a',{}, {stage:'production',production_step:'pressing'})]},{now});
assert.equal(progress.totalMinutes,5);assert.equal(progress.breakdown.printing,0);assert.equal(progress.breakdown.curing,0);
assert.throws(()=>packProductionRectangles([{width:60,height:60}],58,100));
assert.ok(two.totalMinutes<2*single.totalMinutes,'batching and machine concurrency reduce elapsed queue');
assert.equal(schedule({production_items:[]},{now}).nextAvailableAt,'2026-09-28T13:30:00.000Z','new order never promised at opening');
assert.equal(schedule({production_items:[]},{now}).newUnitAvailableAt,'2026-09-28T13:30:00.000Z','empty queue still reserves 30 minutes for one new unit');
assert.equal(schedule({backlog_quantity:10},{now}).newUnitAvailableAt,'2026-09-28T18:30:00.000Z','300 minutes in the queue plus 30 minutes for the next new unit');
const fallback=schedule({backlog_quantity:10},{now,extraItems:[item('new')]});
assert.equal(fallback.backlogUnits,11);assert.ok(fallback.totalMinutes>300,'missing detailed backlog still reserves older pending work before the new order');
const partial=schedule({production_items:[],backlog_quantity:10},{now,extraItems:[item('new')]});
assert.equal(partial.backlogUnits,11);assert.ok(partial.totalMinutes>300);
assert.equal(schedule({production_items:[item('big',{}, {quantity:10001})]},{now}).nextAvailableAt,null);
const differentStages=schedule({production_items:[item('waiting'),item('started',{}, {stage:'production',production_step:'printing'})]},{now});
assert.equal(differentStages.breakdown.printBatches,2,'waiting and already in production do not share a simulated print batch');
assert.equal(differentStages.breakdown.ovenBatches,2,'future oven readiness cannot combine orders in different current stages');
const sameProduction=schedule({production_items:[item('a',{}, {stage:'production',production_step:'curing'}),item('b',{}, {stage:'production',production_step:'curing'})]},{now});
assert.equal(sameProduction.breakdown.ovenBatches,1,'two currently curing pieces with exact dimensions share A3');
const differentSteps=schedule({production_items:[item('a',{}, {stage:'production',production_step:'cutting'}),item('b',{}, {stage:'production',production_step:'curing'})]},{now});
assert.equal(differentSteps.breakdown.ovenBatches,2,'cutting now is not curing now, even if a future simulation makes both ready');
const unprepared=schedule({production_items:[item('art', {art_source:'WILL_SEND'}, {stage:'awaiting_art'}),item('font',{}, {stage:'needs_font'}),item('halftone',{}, {stage:'awaiting_halftone'})]},{now});
assert.equal(unprepared.breakdown.preparation,90,'every unprepared request gets a visible conservative preparation allowance');
assert.equal(unprepared.breakdown.printBatches,3,'pending artwork is never batched speculatively');
assert.equal(unprepared.backlogUnits,3);assert.ok(unprepared.totalMinutes>90);
const noDimensions=schedule({production_items:[item('a',{width_cm:null,height_cm:null}),item('b',{width_cm:null,height_cm:null})]},{now});
assert.equal(noDimensions.breakdown.printBatches,2,'unknown dimensions cannot imply shared film savings');
assert.equal(noDimensions.breakdown.ovenBatches,2,'unknown dimensions cannot imply shared A3 savings');
const staleProgress=schedule({production_items:[item('art',{}, {stage:'awaiting_art',production_step:'pressing'})]},{now});
assert.equal(staleProgress.breakdown.preparation,30);assert.ok(staleProgress.breakdown.printing>0,'old pressing flag cannot skip pending art and printing');
const pausedFallback=schedule({backlog_quantity:10,pauses:[{scope:'order',project_id:'unknown'}]},{now});
assert.equal(pausedFallback.nextAvailableAt,null);assert.equal(pausedFallback.totalMinutes,300);
const older=[item('old-a',{}, {promised_at:'2026-09-28T13:20:00Z',created_at:'2026-09-26T12:00:00Z'}),item('old-b',{}, {created_at:'2026-09-26T13:00:00Z'})];
const olderOnly=schedule({production_items:older},{now});
const normalAfter=schedule({production_items:older},{now,extraItems:[item('new',{}, {promised_at:'2026-09-28T13:00:00Z'})]});
assert.equal(normalAfter.projects.find(x=>x.project_id==='new').startMinutes,olderOnly.totalMinutes,'even a single small normal job with an early draft deadline starts after all reserved backlog');
assert.equal(normalAfter.projects.find(x=>x.project_id==='old-a').predictedAt,olderOnly.projects.find(x=>x.project_id==='old-a').predictedAt,'normal new work does not push itself into earlier queue capacity');
assert.equal(normalAfter.totalMinutes,olderOnly.totalMinutes+single.totalMinutes,'normal draft reserves complete workflow after the previous complete workflow');
const rushDraft=item('rush',{priority:'in_store',priority_requested_at:'2026-09-27T14:00:00Z'});
const rushOrder=schedule({production_items:older},{now,extraItems:[rushDraft]});
assert.equal(rushOrder.projects.find(x=>x.project_id==='rush').startMinutes,0);
assert.equal(rushOrder.projects.find(x=>x.project_id==='rush').minutes,single.totalMinutes,'express finishes its complete printer/operator/oven workflow before old orders resume');
assert.ok(rushOrder.projects.filter(x=>x.project_id!=='rush').every(x=>x.startMinutes===single.totalMinutes),'express reserves a boundary across every production resource');
assert.equal(rushOrder.totalMinutes,single.totalMinutes+olderOnly.totalMinutes);
assert.ok(rushOrder.projects.find(x=>x.project_id==='old-a').atRisk,'displaced promise is flagged instead of silently rewritten');
assert.equal(rushOrder.projects.find(x=>x.project_id==='old-a').promisedAt,'2026-09-28T13:20:00.000Z');
const manual=schedule({production_items:[item('early',{}, {promised_at:'2026-09-28T14:00:00Z'}),item('late',{}, {promised_at:'2026-09-28T18:00:00Z'})]},
  {now,extraItems:[item('forced',{priority:'manual_deadline'},{promised_at:'2026-09-28T15:00:00Z'})]});
assert.deepEqual(manual.phases.map(x=>x.projectIds),[['early'],['forced'],['late']],'manual deadline inserts between existing deadline groups');
assert.equal(manual.projects.find(x=>x.project_id==='forced').startMinutes,manual.projects.find(x=>x.project_id==='early').minutes);
assert.equal(manual.projects.find(x=>x.project_id==='late').startMinutes,manual.projects.find(x=>x.project_id==='forced').minutes,'forced deadline cannot overlap the displaced normal workflow');
const impossible=schedule({production_items:older},{now,extraItems:[item('forced',{priority:'manual_deadline'},{promised_at:'2026-09-28T13:01:00Z'})]});
assert.equal(impossible.projects.find(x=>x.project_id==='forced').startMinutes,0);
assert.equal(impossible.projects.find(x=>x.project_id==='forced').atRisk,true,'manual date before physically possible completion is flagged');
assert.ok(impossible.atRiskProjects.some(x=>x.project_id==='forced'));
console.log('Production scheduler: current-stage-only film/A3 cohorts, preparation, estimated art isolation, full paused workload, physical sides and business calendar passed.');
