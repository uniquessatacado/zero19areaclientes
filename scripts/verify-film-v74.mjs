import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const dist=process.argv[2];if(!dist)throw new Error('Informe o dist compilado.');
const {nestItems,validateFilmPlacements}=await import(pathToFileURL(path.join(dist,'nesting-core.js')));
let tests=0;const ok=(value,note)=>{assert.ok(value,note);tests++;};
for(const count of [101,386,807]){
 const items=Array.from({length:count},(_,i)=>({id:'case-'+i,widthMm:40+(i%5)*13,heightMm:55+(i%7)*17,rotationPolicy:'free',quantity:1}));
 const settings={filmWidthMm:580,gapMm:3,cellMm:2,mode:'normal',freeRotation:false};
 const normal=nestItems(items,settings),messages=[],checkpoints=[],begin=performance.now();
 const maximum=nestItems(items,{...settings,mode:'maximum',onProgress:x=>messages.push(x),onCheckpoint:x=>checkpoints.push(x)});
 ok(maximum.mode==='maximum','maximum mode retained');ok(maximum.maximumSearchAttempted===true,'actual maximum path executed');ok(maximum.lengthMm<=normal.lengthMm+1e-7,'maximum never worse than normal seed');ok(maximum.placements.length===count,'all copies retained');
 ok(checkpoints.length>0,'complete checkpoint before extra search');ok(messages.length>0,'worker progress events');
 const checked=validateFilmPlacements(items,maximum.placements,{...settings,mode:'maximum'});ok(checked.lengthMm===maximum.lengthMm,'canonical validation');
 console.log(JSON.stringify({case:'FINAL_SOLVER',count,normalLengthMm:normal.lengthMm,maximumLengthMm:maximum.lengthMm,elapsedMs:Math.round(performance.now()-begin),limited:!!maximum.nestingSearchLimited,progressEvents:messages.length}));
}
const data=new Uint8Array(25).fill(1);for(let y=1;y<4;y++)for(let x=1;x<4;x++)data[y*5+x]=0;
const items=[{id:'ring',widthMm:100,heightMm:100,rotationPolicy:'none',mask:{w:5,h:5,data}},{id:'small',widthMm:20,heightMm:20,rotationPolicy:'none',quantity:103}];
const options={filmWidthMm:120,maxLengthMm:5000,gapMm:0,cellMm:10,mode:'maximum',lockedPlacements:[{id:'ring',copy:0,xMm:0,yMm:0,rotation:0,locked:true}]};
const packed=nestItems(items,options);ok(packed.placements.length===104);ok(packed.placements.find(p=>p.id==='ring').locked);ok(packed.placements.some(p=>p.id==='small'&&p.xMm>=20&&p.xMm<80&&p.yMm>=20&&p.yMm<80),'maximum uses a valid transparent interior');validateFilmPlacements(items,packed.placements,options);tests++;
assert.throws(()=>nestItems(items,{...options,lockedPlacements:[{id:'missing',copy:0,xMm:0,yMm:0,rotation:0}]}));tests++;
const production=fs.readFileSync(path.join(dist,'production-v217.js'),'utf8'),preview=fs.readFileSync(path.join(dist,'film-preview.js'),'utf8'),css=fs.readFileSync(path.join(dist,'film-v74.css'),'utf8');
ok(production.includes('createFilmProgress('));ok(production.includes('createFilmPreviewSource('));ok(!production.includes("shownLayout.batchOptimized?'Lote rápido'"));ok(preview.includes('createFilmMedia('));ok(preview.includes('data-details'));ok(preview.includes('deleteSelected:removeSelected'));ok(css.includes('overflow-x:hidden!important'));ok(css.includes('film-inspector-foot>span{flex:0 1 auto!important}'));ok(fs.readFileSync(path.join(dist,'index.html'),'utf8').includes('content="2.17.74"'));
console.log('PASS '+tests+' verificações do solver FINAL, máximo real, transparência, progresso, prévias e integração v74.');
