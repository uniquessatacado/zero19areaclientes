import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {removeFilmEntry} from '../film-edit-core.js';
import {rotatedBoundsMm} from '../nesting-core.js';
import {mountFilmPreview as mountRealPreview} from '../film-preview.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const items=[{localId:'a',sourceId:'asset-a',type:'asset',quantity:3,widthCm:2,heightCm:1,rotationPolicy:'90',label:'A'},{localId:'b',sourceId:'asset-b',type:'asset',quantity:1,widthCm:3,heightCm:2,rotationPolicy:'none',label:'B'}];
const position=(id,copy,xMm,yMm,rotation=0,locked=false)=>{const item=items.find(i=>i.localId===id);return {id,copy,xMm,yMm,rotation,locked,label:item.label,sourceWidthMm:item.widthCm*10,sourceHeightMm:item.heightCm*10,...rotatedBoundsMm(item.widthCm*10,item.heightCm*10,rotation)};};
const layout={filmWidthMm:280,lengthMm:400,gapMm:3,cellMm:2,mode:'maximum',freeRotation:false,angleStep:30,efficiency:20,waste:80,placements:[position('a',0,0,0),position('a',1,40,60,90,true),position('a',2,100,120),position('b',0,180,200,0,true)]};
const before=clone({items,layout});

const all=removeFilmEntry(items,layout,{id:'a'});
assert.deepEqual(all.items,[items[1]]);
assert.deepEqual(all.layout.placements,[layout.placements[3]],'list X removes every copy without shifting the remaining placement');
for(const field of ['filmWidthMm','lengthMm','gapMm','cellMm','mode','freeRotation','angleStep'])assert.equal(all.layout[field],layout[field],field+' must stay unchanged');
assert.equal(all.layout.efficiency,null);assert.equal(all.layout.waste,null);assert.equal(all.layout.metricsNeedRecalculation,true);
for(const copy of [0,1,2]){
  const result=removeFilmEntry(items,layout,{id:'a',copy});
  assert.equal(result.items[0].quantity,2);
  const expected=layout.placements.filter(p=>!(p.id==='a'&&p.copy===copy)).map(p=>({...p,copy:p.id==='a'&&p.copy>copy?p.copy-1:p.copy}));
  assert.deepEqual(result.layout.placements,expected,'only the removed copy and higher copy indices may change');
  assert.equal(result.layout.lengthMm,400,'deleting final/lower artwork must not shorten the film');
}
const bRemoved=removeFilmEntry(items,layout,{id:'b',copy:0});
assert.deepEqual(bRemoved.items,[items[0]]);
const empty=removeFilmEntry(all.items,all.layout,{id:'b',copy:0});
assert.deepEqual(empty.items,[]);assert.equal(empty.layout,null);
assert.deepEqual(removeFilmEntry(items,null,{id:'a'}).items,[items[1]],'uncalculated list can be edited without a layout');
assert.equal(removeFilmEntry(items,layout,{id:'missing'}).changed,false);
assert.throws(()=>removeFilmEntry(items,layout,{id:'a',copy:3}),/Cópia inválida/);
assert.deepEqual({items,layout},before,'original snapshot never mutated');

// Use the actual export/job snapshot validator, not a parallel reimplementation.
const source=await readFile(new URL('../production-v217.js',import.meta.url),'utf8');
const snapshotCode=source.slice(source.indexOf('  function checkedFilmSnapshot('),source.indexOf('  function reviewLegacyFilmLettering('));
const checked=new Function('rotatedBoundsMm',snapshotCode+';return checkedFilmSnapshot;')(rotatedBoundsMm);
for(const result of [all,bRemoved,...[0,1,2].map(copy=>removeFilmEntry(items,layout,{id:'a',copy}))]){
  const checkedSnapshot=checked({filmItems:result.items,lastFilm:result.layout});
  assert.equal(checkedSnapshot.layout.lengthMm,400,'export remains valid at the exact original film length');
  assert.deepEqual(checkedSnapshot.layout.placements,result.layout.placements);
}

// Controlled controller callbacks reproduce the reported race without a browser,
// account credentials, network writes or a second implementation of the logic.
const editCode=source.slice(source.indexOf('  function removeCurrentFilmEntry('),source.indexOf('  const colorFor='));
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
function harness(){
  let account='one',nestGate=null,runGate=null,runCalls=0,saves=0;
  const mounts=[],rows=items.map(item=>({dataset:{id:item.localId},value:item.quantity,closest:()=>({remove(){}})}));
  const elements={'#filmPreview':{isConnected:true,innerHTML:''},'#filmMetrics':{innerHTML:''},'#filmItems':{innerHTML:''},'#exportFilm':{disabled:false},'#saveFilm':{disabled:false}};
  const app={querySelector:selector=>elements[selector]||null,querySelectorAll:selector=>selector==='.film-item-qty'?rows:[]};
  const factory=new Function('removeFilmEntry','ctx','app','initialItems','initialLayout','owner','mountFilmPreview','filmNestingItems','runNesting','saveFilmDraft',`
    let filmItems=initialItems,lastFilm=initialLayout,filmCalculationGeneration=0,filmPreviewGeneration=0,productionAccountGeneration=0,filmDraftNote='';
    const filmCostPanel={invalidate(){},refresh(){}};
    ${editCode}
    return {draw:()=>drawFilm([]),remove:(id,copy)=>removeCurrentFilmEntry(id,[],copy),state:()=>({items:filmItems,layout:lastFilm}),clear(){filmCalculationGeneration++;filmPreviewGeneration++;lastFilm=null;filmItems=[];},changeSettings(){filmCalculationGeneration++;},accountReset(){productionAccountGeneration++;},replacePage(){app.querySelector('#filmPreview').isConnected=false;}};
  `);
  const api=factory(removeFilmEntry,{publicUrl:x=>x,getCostUI:()=>null},app,clone(items),clone(layout),()=>account,options=>mounts.push(options),async()=>{if(nestGate)await nestGate;return [];},async(_items,settings)=>{runCalls++;if(runGate)await runGate;return {...clone(layout),settings};},()=>saves++);
  api.draw();
  return {api,elements,mounts,get callbacks(){return mounts.at(-1);},get runCalls(){return runCalls;},get saves(){return saves;},gateNesting(promise){nestGate=promise;},gateRun(promise){runGate=promise;},changeAccount(){account='two';}};
}
const direct=harness();
direct.api.remove('a');
assert.equal(direct.runCalls,0,'delete never invokes nesting');assert.equal(direct.saves,1);
assert.equal(direct.api.state().layout.lengthMm,400);assert.equal(direct.elements['#exportFilm'].disabled,false);
assert.deepEqual(direct.api.state().layout.placements,[layout.placements[3]]);
direct.api.remove('b');assert.equal(direct.api.state().layout,null);assert.equal(direct.elements['#exportFilm'].disabled,true);assert.equal(direct.elements['#saveFilm'].disabled,true);assert.equal(direct.runCalls,0);

for(const operation of ['validate','onRepack']){
  for(const change of ['remove','clear','changeSettings','accountReset','replacePage','changeAccount']){
    const fixture=harness(),gate=deferred();fixture.gateNesting(gate.promise);
    const callbacks=fixture.callbacks;
    const pending=operation==='validate'?callbacks.validate(clone(layout.placements),{id:'a',copy:0}):callbacks.onRepack(layout.placements.filter(p=>p.locked));
    if(change==='remove')fixture.api.remove('a');else if(change==='changeAccount')fixture.changeAccount();else fixture.api[change]();
    gate.resolve();assert.equal(await pending,null,operation+' discards stale response after '+change);
    assert.equal(fixture.runCalls,0,'stale operation cannot reach nesting');
  }
  const fixture=harness(),gate=deferred();fixture.gateRun(gate.promise);
  const callbacks=fixture.callbacks;
  const pending=operation==='validate'?callbacks.validate(clone(layout.placements),{id:'a',copy:0}):callbacks.onRepack([]);
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(fixture.runCalls,1);
  fixture.api.remove('a');gate.resolve();assert.equal(await pending,null,'in-flight nesting result cannot revive a deleted piece');
}
const repack=harness();const repacked=await repack.callbacks.onRepack(layout.placements.filter(p=>p.locked));
assert.deepEqual(repacked.settings.baselinePlacements,layout.placements,'explicit Reorganizar receives the current layout baseline');
assert.deepEqual(repacked.settings.lockedPlacements,layout.placements.filter(p=>p.locked));
assert.equal(repack.callbacks.onChange(repacked),true);assert.equal(repack.runCalls,1);
const stale=harness(),oldCallbacks=stale.callbacks;stale.api.remove('a');assert.equal(oldCallbacks.onChange(clone(layout)),false);assert.equal(oldCallbacks.onDelete(layout.placements[3]),false);
assert.equal(mountRealPreview({element:{},layout:null}).getLayout(),null,'null layout never reads filmWidthMm');
assert.ok(!editCode.includes('calculateFilm('),'removal/preview module cannot automatically calculate the film');
assert.ok(source.includes("b.onclick=()=>removeCurrentFilmEntry(b.dataset.id,media)"),'list X uses immediate local removal');
console.log('Film edit: immediate copy/all removal, physical geometry/locks, export snapshots, empty state and 16 stale callback races OK');
