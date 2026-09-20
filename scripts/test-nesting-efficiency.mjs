import assert from 'node:assert/strict';
import { nestItems, placementsOverlap, rotatedBoundsMm, validateFilmPlacements } from '../nesting-core.js';

const settings={filmWidthMm:580,gapMm:3,cellMm:2,maxLengthMm:10000,mode:'normal'};
function verify(items,layout,options){
  const validated=validateFilmPlacements(items,layout.placements,options);
  assert.equal(validated.lengthMm,layout.lengthMm);
  assert.equal(layout.placements.length,items.reduce((sum,item)=>sum+(item.quantity||1),0));
  for(const placement of layout.placements){
    const item=items.find(entry=>entry.id===placement.id),bounds=rotatedBoundsMm(item.widthMm,item.heightMm,placement.rotation);
    assert.equal(placement.sourceWidthMm,item.widthMm);
    assert.equal(placement.sourceHeightMm,item.heightMm);
    assert.equal(placement.widthMm,bounds.widthMm);
    assert.equal(placement.heightMm,bounds.heightMm);
    if((item.rotationPolicy||'none')==='none')assert.equal(placement.rotation,0);
  }
  return validated;
}

// Regression: the old normal shelf selected 0 degrees first, even when a legal
// quarter turn saves 120 mm of film. No opt-in is invented for policy "none".
const portrait=[{id:'portrait',widthMm:180,heightMm:300,rotationPolicy:'90'}];
const turned=nestItems(portrait,settings);
assert.equal(turned.lengthMm,180);
assert.equal(turned.placements[0].rotation,90);
verify(portrait,turned,settings);
for(const mode of ['normal','maximum'])for(const freeRotation of [false,true]){
  const fixed=[{...portrait[0],rotationPolicy:'none'}],options={...settings,mode,freeRotation};
  const result=nestItems(fixed,options);
  assert.equal(result.lengthMm,300);
  assert.equal(result.placements[0].rotation,0);
}

// A per-art shortest-height rule alone is insufficient: both landscape and
// portrait alternatives must compete in the complete mixed-width plan.
const assorted=[
  {id:'art0',widthMm:214,heightMm:261,rotationPolicy:'90'},
  {id:'art1',widthMm:84,heightMm:236,rotationPolicy:'90'},
  {id:'art2',widthMm:161,heightMm:156,rotationPolicy:'90'},
  {id:'art3',widthMm:266,heightMm:80,rotationPolicy:'90'},
  {id:'art4',widthMm:270,heightMm:132,rotationPolicy:'90'},
  {id:'art5',widthMm:209,heightMm:194,rotationPolicy:'90'},
  {id:'art6',widthMm:53,heightMm:219,rotationPolicy:'90'},
  {id:'art7',widthMm:259,heightMm:166,rotationPolicy:'90'},
];
// Recorded from the previous solver, not recomputed by the implementation tested.
const previous=[
  {id:'art0',copy:0,xMm:0,yMm:0,rotation:90},
  {id:'art7',copy:0,xMm:266,yMm:0,rotation:0},
  {id:'art5',copy:0,xMm:266,yMm:170,rotation:0},
  {id:'art4',copy:0,xMm:0,yMm:218,rotation:90},
  {id:'art2',copy:0,xMm:136,yMm:368,rotation:0},
  {id:'art3',copy:0,xMm:480,yMm:170,rotation:90},
  {id:'art1',copy:0,xMm:302,yMm:368,rotation:0},
  {id:'art6',copy:0,xMm:390,yMm:368,rotation:0},
];
const packedSettings={...settings,mode:'maximum'},previousLayout=validateFilmPlacements(assorted,previous,packedSettings);
assert.equal(previousLayout.lengthMm,604);
const improved=nestItems(assorted,{...packedSettings,baselinePlacements:previous});
assert.ok(improved.lengthMm<=510,`mixed-width regression: ${improved.lengthMm} > 510 mm`);
assert.ok(improved.lengthMm<previousLayout.lengthMm);
verify(assorted,improved,packedSettings);
assert.deepEqual(nestItems(assorted,{...packedSettings,baselinePlacements:previous}),improved,'deterministic multi-start result');
const normal=nestItems(assorted,settings);
assert.ok(improved.lengthMm<=normal.lengthMm);

// A valid manual plan is an incumbent, not a suggestion to discard. An equal
// length candidate must not needlessly move it; a lock mismatch disqualifies it.
const incumbent=[{id:'portrait',copy:0,xMm:200,yMm:0,rotation:90}];
const before=structuredClone(incumbent);
const kept=nestItems(portrait,{...settings,baselinePlacements:incumbent});
assert.equal(kept.lengthMm,180);
assert.equal(kept.placements[0].xMm,200);
assert.deepEqual(incumbent,before,'caller baseline must not be mutated');
const lock={...incumbent[0],xMm:0,locked:true};
const withLock=nestItems(portrait,{...settings,baselinePlacements:incumbent,lockedPlacements:[lock]});
assert.equal(withLock.placements[0].xMm,0);
assert.equal(withLock.placements[0].locked,true);
for(const invalid of [[],[{...incumbent[0],xMm:-2}],[{...incumbent[0],sourceWidthMm:999}],[{...incumbent[0],copy:1}]]){
  const result=nestItems(portrait,{...settings,baselinePlacements:invalid});
  verify(portrait,result,settings);
  assert.equal(result.lengthMm,180,'invalid/stale incumbent cannot constrain a fresh calculation');
}
assert.throws(()=>nestItems(portrait,{...settings,baselinePlacements:incumbent,lockedPlacements:[{...lock,id:'missing'}]}),/não existe mais/,'a fallback cannot hide an invalid lock');
assert.throws(()=>nestItems(portrait,{...settings,baselinePlacements:incumbent,lockedPlacements:[lock,lock]}),/travada mais de uma vez/);

// Decimal physical dimensions/gap retain exact source sizes and safe grid spacing.
const decimals=[
  {id:'wide',widthMm:187.65,heightMm:350,quantity:3,rotationPolicy:'90'},
  {id:'thin',widthMm:41.3,heightMm:117.7,quantity:5,rotationPolicy:'90'},
  {id:'fixed',widthMm:55,heightMm:34,quantity:4,rotationPolicy:'none'},
];
for(const mode of ['normal','maximum']){
  const options={...settings,mode,gapMm:3.1},result=nestItems(decimals,options);
  verify(decimals,result,options);
  for(let i=0;i<result.placements.length;i++)for(let j=i+1;j<result.placements.length;j++)assert.equal(placementsOverlap(result.placements[i],result.placements[j],3.1),false);
}

// Keep mask-aware interlocking and halftone reservations distinct. A rectangular
// candidate may be less efficient here, but can never displace a better alpha plan.
const ringData=new Uint8Array(25).fill(1);
for(let y=1;y<4;y++)for(let x=1;x<4;x++)ringData[y*5+x]=0;
const masked=[{id:'ring',widthMm:100,heightMm:100,mask:{w:5,h:5,data:ringData},allowInternalNesting:true,rotationPolicy:'none'},{id:'inside',widthMm:40,heightMm:40,rotationPolicy:'90'}];
const maskedOptions={filmWidthMm:120,maxLengthMm:600,gapMm:0,cellMm:20,mode:'maximum'},ringLock={id:'ring',copy:0,xMm:0,yMm:0,rotation:0,locked:true};
const maskLayout=nestItems(masked,{...maskedOptions,lockedPlacements:[ringLock]});
assert.equal(maskLayout.lengthMm,100);
verify(masked,maskLayout,maskedOptions);
const halftoneItems=[{...masked[0],halftone:true},masked[1]],halftone=nestItems(halftoneItems,{...maskedOptions,baselinePlacements:maskLayout.placements,lockedPlacements:[ringLock]});
assert.ok(halftone.lengthMm>100);
verify(halftoneItems,halftone,maskedOptions);
assert.equal(placementsOverlap(halftone.placements[0],halftone.placements[1]),false);

// Arbitrary-angle locks preserve their geometry, including when the selected
// rectangular alternative uses only quarter turns for the remaining free items.
const lockedItems=[{id:'angled',widthMm:73.3,heightMm:19.7,rotationPolicy:'free'},{id:'other',widthMm:140,heightMm:63,quantity:4,rotationPolicy:'90'}];
const angledLock={id:'angled',copy:0,xMm:16,yMm:18,rotation:37.25,locked:true};
const angleSettings={...settings,mode:'maximum',freeRotation:true,lockedPlacements:[angledLock]};
const angled=nestItems(lockedItems,angleSettings);
verify(lockedItems,angled,angleSettings);
const exactLock=angled.placements.find(p=>p.id==='angled');
assert.equal(exactLock.xMm,16);assert.equal(exactLock.yMm,18);assert.equal(exactLock.rotation,37.25);assert.equal(exactLock.locked,true);
assert.throws(()=>nestItems(lockedItems,{...angleSettings,freeRotation:false}),/rotação/);

// Production-sized 101-copy mix: deterministic work budget, not a wall-clock
// cutoff, keeps outputs repeatable and avoids the old unbounded contour scan.
const hundred=Array.from({length:101},(_,i)=>({id:`art-${String(i).padStart(3,'0')}`,widthMm:40+(i*37)%180,heightMm:45+(i*53)%220,rotationPolicy:'90'}));
const timing=[];
for(const mode of ['normal','maximum']){
  const options={...settings,mode},start=performance.now(),result=nestItems(hundred,options),elapsedMs=performance.now()-start;
  assert.ok(elapsedMs<10000,`101-item ${mode} exceeded the 10s regression ceiling: ${elapsedMs} ms`);
  assert.ok(result.lengthMm<=3868,`101-item ${mode} film grew beyond the improved candidate`);
  verify(hundred,result,options);
  assert.deepEqual(nestItems(hundred,options),result);
  const noWorse=nestItems(hundred,{...options,baselinePlacements:result.placements});
  assert.ok(noWorse.lengthMm<=result.lengthMm);
  timing.push({mode,previousLengthMm:mode==='normal'?5592:3951,lengthMm:result.lengthMm,elapsedMs:Math.round(elapsedMs)});
}
console.log(JSON.stringify({ok:true,portrait:{beforeMm:300,afterMm:turned.lengthMm},mixed:{beforeMm:604,afterMm:improved.lengthMm},hundred:timing,checks:['rotation permissions','candidate orders','validated incumbent never worse','locks','exact physical sizes','clearance','halftone','alpha interlocking','arbitrary angles','determinism','bounded 101-item search']},null,2));
