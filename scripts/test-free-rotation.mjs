import assert from 'node:assert/strict';
import {nestItems,validateFilmPlacements,snapFilmPlacement,rotatedBoundsMm,buildSafeSegments} from '../nesting-core.js';

const close=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-7,`${label||'physical measure'}: ${actual} != ${expected}`);
const source={id:'diagonal',widthMm:80,heightMm:12,rotationPolicy:'free',allowInternalNesting:true,mask:{w:8,h:2,data:new Uint8Array(16).fill(1)}};
const settings={filmWidthMm:160,mode:'maximum',cellMm:2,gapMm:2,maxLengthMm:600,freeRotation:true,angleStep:30};

for(const angle of [0,15,30,37.25,45,60,90,105,180,225,270,345,359.5]){
  const bounds=rotatedBoundsMm(80,12,angle),radians=angle*Math.PI/180;
  close(bounds.widthMm,Math.abs(80*Math.cos(radians))+Math.abs(12*Math.sin(radians)),'bbox width');
  close(bounds.heightMm,Math.abs(80*Math.sin(radians))+Math.abs(12*Math.cos(radians)),'bbox height');
  const placement={id:source.id,copy:0,xMm:10,yMm:20,...bounds,rotation:angle,locked:true};
  const validated=validateFilmPlacements([source],[placement],settings),actual=validated.placements[0];
  assert.equal(actual.sourceWidthMm,80);assert.equal(actual.sourceHeightMm,12);assert.equal(actual.rotation,angle);assert.equal(actual.locked,true);
  assert.equal(validated.freeRotation,true);assert.equal(validated.angleStep,30);assert.equal(validated.rotationSearch,'discrete-heuristic');
  close(validated.lengthMm,20+bounds.heightMm);
  const nested=nestItems([source],{...settings,lockedPlacements:[placement]});assert.deepEqual(nested.placements,validated.placements,'Locked manual angle must not quantize to search steps');
}
assert.deepEqual(rotatedBoundsMm(80,12,90),{widthMm:12,heightMm:80});
for(const angle of [-1,360,Infinity,NaN])assert.throws(()=>rotatedBoundsMm(80,12,angle),/ângulo/);
assert.throws(()=>rotatedBoundsMm(0,12,30),/Medidas/);
assert.throws(()=>nestItems([source],{...settings,angleStep:1}),/15° ou 30°/);
assert.throws(()=>nestItems([source],{...settings,freeRotation:'true'}),/ligada ou desligada/);
const angled={id:source.id,copy:0,xMm:0,yMm:0,...rotatedBoundsMm(80,12,30),rotation:30};
assert.throws(()=>validateFilmPlacements([source],[angled],{...settings,freeRotation:false}),/rotação/);
for(const policy of ['none','90','180'])assert.throws(()=>validateFilmPlacements([{...source,rotationPolicy:policy}],[angled],settings),/rotação/,'Global toggle must respect per-art rotation permission');
assert.throws(()=>validateFilmPlacements([source],[{...angled,widthMm:80,heightMm:12}],settings),/medida.*mudou/,'Original size must not be reused as rotated box');
assert.throws(()=>validateFilmPlacements([source],[{...angled,sourceWidthMm:81}],settings),/original.*mudou/);
assert.throws(()=>validateFilmPlacements([source],[{...angled,xMm:110}],settings),/ultrapassa/);
assert.throws(()=>validateFilmPlacements([source],[{...angled,yMm:1}],settings),/grade/);

// A slanted empty slot cannot fit this strip at 0/90/180/270 degrees, but can
// accept it at 30 degrees. The wall is locked to exercise actual alpha packing.
const wallData=new Uint8Array(80*80).fill(1),cos=Math.cos(Math.PI/6),sin=Math.sin(Math.PI/6);
for(let y=0;y<80;y++)for(let x=0;x<80;x++){const dx=(x+.5)*2-80,dy=(y+.5)*2-80,u=dx*cos+dy*sin,v=-dx*sin+dy*cos;if(Math.abs(u)<55&&Math.abs(v)<15)wallData[y*80+x]=0;}
const wall={id:'wall',widthMm:160,heightMm:160,rotationPolicy:'none',allowInternalNesting:true,mask:{w:80,h:80,data:wallData}};
const wallLock={id:'wall',copy:0,xMm:0,yMm:0,widthMm:160,heightMm:160,rotation:0,locked:true};
const slotItems=[wall,source],slotOptions={...settings,lockedPlacements:[wallLock]},legacy=nestItems(slotItems,{...slotOptions,freeRotation:false}),optimized=nestItems(slotItems,slotOptions);
assert.ok(optimized.lengthMm<legacy.lengthMm,'Extra angles must produce a genuinely shorter film in the diagonal-slot fixture');
assert.equal(optimized.lengthMm,160);assert.ok(optimized.placements.some(placement=>placement.rotation%90!==0),'Heuristic must actually choose a non-orthogonal orientation');
assert.deepEqual(nestItems(slotItems,slotOptions),optimized,'Discrete search must be deterministic');
assert.deepEqual(validateFilmPlacements(slotItems,optimized.placements,settings).placements,optimized.placements);
assert.equal(optimized.placements[0].sourceWidthMm,160);assert.equal(optimized.placements[1].sourceWidthMm,80);
for(const mode of ['normal','maximum'])assert.throws(()=>validateFilmPlacements([wall,{...source,halftone:true}],optimized.placements,{...settings,mode}),/encosta/,'Halftone reserves the whole rotated box');
assert.throws(()=>validateFilmPlacements(slotItems,optimized.placements,{...settings,mode:'normal'}),/encosta/,'Easy-cut mode cannot exploit rotated transparent corners');
assert.throws(()=>validateFilmPlacements([wall,{...source,allowInternalNesting:false}],optimized.placements,settings),/encosta/);

// Snap a near-miss back into the slanted slot without altering the physical art.
const proposed=optimized.placements.map(placement=>placement.id===source.id?{...placement,xMm:placement.xMm+3.1,yMm:placement.yMm-2.7}:{...placement});
const snapped=snapFilmPlacement(slotItems,proposed,{id:source.id,copy:0},{...settings,lengthMm:160});
const moved=snapped.placements.find(placement=>placement.id===source.id);assert.equal(moved.rotation,optimized.placements.find(placement=>placement.id===source.id).rotation);assert.equal(moved.sourceWidthMm,80);assert.equal(moved.sourceHeightMm,12);assert.equal(moved.xMm%2,0);assert.equal(moved.yMm%2,0);
assert.deepEqual(validateFilmPlacements(slotItems,snapped.placements,settings).placements,snapped.placements);
assert.throws(()=>snapFilmPlacement(slotItems,proposed,{id:source.id,copy:0},{...settings,lengthMm:20}),/filme|cabe/);

const allLocked=optimized.placements.map(placement=>({...placement,locked:true}));
assert.deepEqual(nestItems(slotItems,{...settings,angleStep:15,lockedPlacements:allLocked}).placements,allLocked,'Changing search step must preserve existing locks exactly');
assert.throws(()=>nestItems(slotItems,{...settings,freeRotation:false,lockedPlacements:allLocked}),/rotação/,'Disabling free rotation cannot silently rotate or move an angled lock');

// Source ink points from independently transformed sample cells may never lie
// inside ink of another placement. This catches unsafe rotated-mask sampling.
function inkPoints(item,placement){
  const mask=item.mask||{w:1,h:1,data:[1]},angle=placement.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),points=[];
  for(let y=0;y<mask.h;y++)for(let x=0;x<mask.w;x++)if(mask.data[y*mask.w+x])for(const fy of [.05,.5,.95])for(const fx of [.05,.5,.95]){
    const sx=(x+fx)/mask.w*item.widthMm-item.widthMm/2,sy=(y+fy)/mask.h*item.heightMm-item.heightMm/2;
    points.push([placement.xMm+placement.widthMm/2+sx*c-sy*s,placement.yMm+placement.heightMm/2+sx*s+sy*c]);
  }
  return points;
}
function containsInk(item,placement,point){
  const dx=point[0]-placement.xMm-placement.widthMm/2,dy=point[1]-placement.yMm-placement.heightMm/2,angle=placement.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),x=dx*c+dy*s+item.widthMm/2,y=-dx*s+dy*c+item.heightMm/2;
  if(x<=1e-8||y<=1e-8||x>=item.widthMm-1e-8||y>=item.heightMm-1e-8)return false;
  if(!item.mask)return true;const mx=Math.floor(x/item.widthMm*item.mask.w),my=Math.floor(y/item.heightMm*item.mask.h);return Boolean(item.mask.data[my*item.mask.w+mx]);
}
for(const placement of optimized.placements){const item=slotItems.find(candidate=>candidate.id===placement.id);for(const point of inkPoints(item,placement))for(const other of optimized.placements)if(other!==placement)assert.equal(containsInk(slotItems.find(candidate=>candidate.id===other.id),other,point),false,'Independent transformed ink sample overlaps');}

// Oppositely slanted one-cell strokes must not disappear after transformation.
for(const angle of [15,30,45,75,105,165,225,315]){
  const thin={id:'stroke',widthMm:41.3,heightMm:37.7,quantity:2,rotationPolicy:'free',allowInternalNesting:true,mask:{w:11,h:11,data:new Uint8Array(121).map((_,i)=>i%11===Math.floor(i/11)?1:0)}};
  const bounds=rotatedBoundsMm(thin.widthMm,thin.heightMm,angle),position={id:'stroke',xMm:0,yMm:0,...bounds,rotation:angle};
  assert.throws(()=>validateFilmPlacements([thin],[{...position,copy:0},{...position,copy:1}],settings),/encosta/,'Coincident thin diagonals must collide at every angle');
}

// Safe segmentation uses the full transformed vertical span, never source height.
const segments=buildSafeSegments(optimized.placements,optimized.lengthMm,70);assert.deepEqual(segments,[{start:0,end:160}]);
for(const segment of segments)for(const placement of optimized.placements)assert.ok(!(placement.yMm<segment.end-1e-7&&placement.yMm+placement.heightMm>segment.end+1e-7),'No segment may cut through a rotated art');

// Broad deterministic regression: enabling extra rotations cannot worsen the
// validated orthogonal baseline, or change any source dimensions.
for(const mode of ['normal','maximum'])for(const angleStep of [15,30]){
  const items=[{id:'rect',widthMm:61.3,heightMm:27.7,quantity:3,rotationPolicy:'free'},{id:'stripe',widthMm:84.9,heightMm:14.2,quantity:2,rotationPolicy:'90'},{id:'fixed',widthMm:23.2,heightMm:46.3,quantity:2,rotationPolicy:'none'}];
  const options={...settings,filmWidthMm:140,mode,angleStep},baseline=nestItems(items,{...options,freeRotation:false}),free=nestItems(items,options);
  assert.ok(free.lengthMm<=baseline.lengthMm+1e-7);assert.equal(free.freeRotation,true);assert.equal(free.angleStep,angleStep);
  validateFilmPlacements(items,free.placements,options);
  for(const placement of free.placements){const original=items.find(item=>item.id===placement.id);assert.equal(placement.sourceWidthMm,original.widthMm);assert.equal(placement.sourceHeightMm,original.heightMm);assert.deepEqual(rotatedBoundsMm(original.widthMm,original.heightMm,placement.rotation),{widthMm:placement.widthMm,heightMm:placement.heightMm});if(original.rotationPolicy==='none')assert.equal(placement.rotation,0);if(original.rotationPolicy==='90')assert.ok([0,90].includes(placement.rotation));}
}
console.log(JSON.stringify({ok:true,legacyLengthMm:legacy.lengthMm,optimizedLengthMm:optimized.lengthMm,chosenAngle:optimized.placements.find(placement=>placement.id===source.id).rotation,checks:['exact original dimensions','rotated physical bounds','15/30 degree search','per-art permissions','arbitrary locked angles','diagonal alpha slot','halftone whole box','snap preserving angle','independent transformed ink samples','thin strokes','safe segments','baseline never worse']},null,2));
