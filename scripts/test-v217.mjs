import assert from 'node:assert/strict';
import {buildSafeSegments,cmToPx,nestItems,placementsOverlap,validateFilmPlacements} from '../nesting-core.js';
import {customizationKind,customizationName,groupTeamHierarchy} from '../production-v217.js';

assert.equal(cmToPx(28),3307);
assert.equal(cmToPx(58),6850);
assert.equal(cmToPx(5.5),650);

const normal=nestItems([
  {id:'a',label:'A',widthMm:100,heightMm:100,quantity:2,rotationPolicy:'none'},
  {id:'b',label:'B',widthMm:50,heightMm:50,quantity:2,rotationPolicy:'none'}
],{filmWidthMm:280,mode:'normal',gapMm:3,cellMm:2});
assert.equal(normal.placements.length,4);
for(let i=0;i<normal.placements.length;i++)for(let j=i+1;j<normal.placements.length;j++)assert.equal(placementsOverlap(normal.placements[i],normal.placements[j]),false);

// Production dimensions must survive the layout grid without stretching, and
// the advertised clearance must be present in both packing modes.
for(const mode of ['normal','maximum']){
  const exact=nestItems([{id:'55-by-34',widthMm:55,heightMm:34,quantity:3}],{filmWidthMm:280,mode,gapMm:3,cellMm:2});
  for(const p of exact.placements){assert.equal(p.widthMm,55);assert.equal(p.heightMm,34);}
  for(let i=0;i<exact.placements.length;i++)for(let j=i+1;j<exact.placements.length;j++)assert.equal(placementsOverlap(exact.placements[i],exact.placements[j],3),false,'o gap físico não pode desaparecer no contorno');
  assert.equal(exact.lengthMm,34,'o comprimento é o limite físico da última arte, sem extensão de célula');
  assert.throws(()=>nestItems([{id:'too-wide',widthMm:300,heightMm:50}],{filmWidthMm:280,mode}),/não cabe/);
  assert.throws(()=>nestItems([{id:'too-tall',widthMm:50,heightMm:101}],{filmWidthMm:280,maxLengthMm:100,mode}),/não cabe/);
  const rotated=nestItems([{id:'turn-to-fit',widthMm:300.5,heightMm:55.25,rotationPolicy:'90'}],{filmWidthMm:280,mode});
  assert.equal(rotated.placements[0].rotation,90);
  assert.equal(rotated.placements[0].widthMm,55.25);
  assert.equal(rotated.placements[0].heightMm,300.5);
}
assert.throws(()=>nestItems([{id:'quantity',widthMm:10,heightMm:10,quantity:1.2}],{filmWidthMm:280}),/quantidade inteira/);
assert.throws(()=>nestItems([{id:'size',widthMm:Infinity,heightMm:10}],{filmWidthMm:280}),/Medida inválida/);
assert.throws(()=>nestItems([{id:'size',widthMm:0,heightMm:10}],{filmWidthMm:280}),/Medida inválida/);

// Sparse strokes in alternating source cells used to vanish under center-point
// sampling, causing two nonempty artworks to occupy the same printed pixels.
const strokes=new Uint8Array(100);for(let y=0;y<10;y++)for(let x=0;x<10;x+=2)strokes[y*10+x]=1;
const thin=nestItems([{id:'strokes',widthMm:10,heightMm:10,quantity:2,mask:{w:10,h:10,data:strokes},allowInternalNesting:true}],{filmWidthMm:10,mode:'maximum',gapMm:0,cellMm:2});
assert.equal(thin.lengthMm,20,'linhas finas devem continuar ocupando área no cálculo');

const ring=new Uint8Array(25).fill(1);for(let y=1;y<4;y++)for(let x=1;x<4;x++)ring[y*5+x]=0;
const maximum=nestItems([
  {id:'ring',widthMm:100,heightMm:100,mask:{w:5,h:5,data:ring},allowInternalNesting:true,quantity:1,rotationPolicy:'none'},
  {id:'inside',widthMm:40,heightMm:40,mask:{w:2,h:2,data:new Uint8Array(4).fill(1)},quantity:1,rotationPolicy:'none'}
],{filmWidthMm:120,mode:'maximum',gapMm:0,cellMm:20});
assert.ok(maximum.lengthMm<=100,'modo maximo deve aproveitar o vazio interno');

const halftone=nestItems([
  {id:'half',widthMm:100,heightMm:100,mask:{w:5,h:5,data:ring},halftone:true,allowInternalNesting:true,quantity:1,rotationPolicy:'none'},
  {id:'outside',widthMm:40,heightMm:40,quantity:1,rotationPolicy:'none'}
],{filmWidthMm:120,mode:'maximum',gapMm:0,cellMm:20});
assert.ok(halftone.lengthMm>100,'halftone nao pode usar microvazios');

const safeSegments=buildSafeSegments([
  {yMm:0,heightMm:70},
  {yMm:80,heightMm:60},
  {yMm:150,heightMm:30}
],180,100);
assert.deepEqual(safeSegments,[{start:0,end:80},{start:80,end:180}]);
for(const segment of safeSegments)for(const placement of [{yMm:0,heightMm:70},{yMm:80,heightMm:60},{yMm:150,heightMm:30}]){
  assert.ok(!(placement.yMm<segment.end&&placement.yMm+placement.heightMm>segment.end),'corte nao pode atravessar item');
}

// Interlocking vertical spans must be treated as one block; stepping back to the
// start of only the first crossing item would slice a previous item in half.
const interlocking=[{yMm:0,heightMm:80},{yMm:70,heightMm:70},{yMm:130,heightMm:70}];
const interlockingSegments=buildSafeSegments(interlocking,200,100);
assert.deepEqual(interlockingSegments,[{start:0,end:200}]);
for(const segment of interlockingSegments)for(const placement of interlocking)assert.ok(!(placement.yMm<segment.end&&placement.yMm+placement.heightMm>segment.end));
assert.throws(()=>buildSafeSegments([{yMm:0,heightMm:101}],100,50),/ultrapassa/);

const varied=[{id:'large',widthMm:123.3,heightMm:68.7,quantity:2},{id:'small',widthMm:44.2,heightMm:27.1,quantity:5},{id:'medium',widthMm:75.9,heightMm:90.3,quantity:3,rotationPolicy:'90'}];
const easy=nestItems(varied,{filmWidthMm:280,mode:'normal',gapMm:3});
const packed=nestItems(varied,{filmWidthMm:280,mode:'maximum',gapMm:3});
assert.ok(packed.lengthMm<=easy.lengthMm,'máximo nunca pode gastar mais que o layout normal calculado');
assert.deepEqual(nestItems(varied,{filmWidthMm:280,mode:'maximum',gapMm:3}),packed,'o mesmo job deve gerar posições estáveis');
for(const layout of [easy,packed])for(const [i,p] of layout.placements.entries()){
  assert.ok(p.xMm>=0&&p.yMm>=0&&p.xMm+p.widthMm<=280+1e-7);
  for(const other of layout.placements.slice(i+1))assert.equal(placementsOverlap(p,other,3),false);
}

// Locked positions are identified by item+copy, not by display order. Repacking
// must preserve exactly those coordinates and place the other copies safely.
const lockItems=[{id:'lockable',widthMm:55,heightMm:34,quantity:3,rotationPolicy:'free'},{id:'other',widthMm:22,heightMm:18,quantity:2}];
const lockedCopy={id:'lockable',copy:1,xMm:70,yMm:40,widthMm:34,heightMm:55,rotation:90,locked:true};
const unchangedLock=structuredClone(lockedCopy);
for(const mode of ['normal','maximum']){
  const options={filmWidthMm:140,mode,gapMm:3,cellMm:2,maxLengthMm:500,lockedPlacements:[lockedCopy]};
  const layout=nestItems(lockItems,options),kept=layout.placements.find(p=>p.id==='lockable'&&p.copy===1);
  assert.deepEqual({...kept,label:undefined},{...lockedCopy,sourceWidthMm:55,sourceHeightMm:34,label:undefined},'reotimizar mantém tamanho, rotação e posição travados');
  assert.equal(layout.placements.length,5);
  assert.equal(layout.placements.filter(p=>p.locked).length,1,'trava vale apenas para uma cópia');
  const verified=validateFilmPlacements(lockItems,layout.placements,options);
  assert.equal(verified.lengthMm,layout.lengthMm);
  assert.equal(verified.placements.find(p=>p.id==='lockable'&&p.copy===1).locked,true);
  assert.deepEqual(nestItems(lockItems,options),layout,'reotimizar com trava é estável');
  for(const [index,p] of layout.placements.entries())for(const other of layout.placements.slice(index+1))assert.equal(placementsOverlap(p,other,3),false,'travas preservam o gap');
}
assert.deepEqual(lockedCopy,unchangedLock,'o core não altera a trava fornecida');

const simpleItems=[{id:'one',widthMm:10,heightMm:10,quantity:2,rotationPolicy:'180'}];
const separated=[{id:'one',copy:0,xMm:0,yMm:0,widthMm:10,heightMm:10,rotation:180,locked:true},{id:'one',copy:1,xMm:14,yMm:0,widthMm:10,heightMm:10,rotation:0}];
for(const mode of ['normal','maximum']){
  const options={filmWidthMm:40,mode,gapMm:3,cellMm:2,maxLengthMm:100};
  assert.equal(validateFilmPlacements(simpleItems,separated,options).lengthMm,10,'rotação 180 também pode ser validada no normal');
  assert.throws(()=>validateFilmPlacements(simpleItems,[separated[0],{...separated[1],xMm:12}],options),/encosta|distância/,'validação não pode perder a folga na grade');
  assert.throws(()=>validateFilmPlacements(simpleItems,[separated[0],{...separated[1],xMm:15}],options),/grade/,'posições devem seguir o snap');
  assert.throws(()=>validateFilmPlacements(simpleItems,[separated[0],{...separated[1],xMm:32}],options),/ultrapassa/);
  assert.throws(()=>validateFilmPlacements(simpleItems,[separated[0],{...separated[1],xMm:-2}],options),/Posição inválida/);
  assert.throws(()=>validateFilmPlacements(simpleItems,[separated[0],{...separated[1],widthMm:12}],options),/medida.*mudou/);
  assert.throws(()=>validateFilmPlacements(simpleItems,[separated[0],{...separated[1],rotation:90}],options),/rotação/);
  assert.throws(()=>validateFilmPlacements(simpleItems,[separated[0],separated[0]],options),/mesma cópia/);
  assert.throws(()=>validateFilmPlacements(simpleItems,[separated[0]],options),/quantidade de cópias/);
  assert.throws(()=>nestItems(simpleItems,{...options,lockedPlacements:[{...separated[0],id:'removed'}]}),/não existe mais/);
  assert.throws(()=>nestItems(simpleItems,{...options,lockedPlacements:[{...separated[0],copy:2}]}),/não existe mais/);
  assert.throws(()=>nestItems(simpleItems,{...options,lockedPlacements:[separated[0],separated[0]]}),/travada mais de uma vez/);
  assert.throws(()=>nestItems(simpleItems,{...options,lockedPlacements:[separated[0],{...separated[1],xMm:8}]}),/colide/);
}

// Internal nesting is allowed only with compatible alpha masks, and halftone
// or easy-cut mode must conservatively reject those same overlapping boxes.
const interlockItems=[{id:'ring-locked',widthMm:100,heightMm:100,mask:{w:5,h:5,data:ring},allowInternalNesting:true},{id:'inside-locked',widthMm:40,heightMm:40}];
const interlockPlacements=[{id:'ring-locked',copy:0,xMm:0,yMm:0,widthMm:100,heightMm:100,rotation:0,locked:true},{id:'inside-locked',copy:0,xMm:20,yMm:20,widthMm:40,heightMm:40,rotation:0,locked:true}];
const maskOptions={filmWidthMm:120,mode:'maximum',gapMm:0,cellMm:20,maxLengthMm:200};
assert.equal(validateFilmPlacements(interlockItems,interlockPlacements,maskOptions).lengthMm,100);
assert.equal(nestItems(interlockItems,{...maskOptions,lockedPlacements:interlockPlacements}).lengthMm,100);
assert.throws(()=>validateFilmPlacements(interlockItems,interlockPlacements,{...maskOptions,mode:'normal'}),/encosta/);
assert.throws(()=>validateFilmPlacements([{...interlockItems[0],halftone:true},interlockItems[1]],interlockPlacements,maskOptions),/encosta/);
assert.throws(()=>validateFilmPlacements(interlockItems,interlockPlacements,{...maskOptions,gapMm:1}),/encosta/,'folga conservadora também vale para os vazios internos');
assert.equal(nestItems(interlockItems,{...maskOptions,lockedPlacements:[interlockPlacements[0]]}).lengthMm,100,'máximo continua encaixando no vazio de uma arte travada');
const freeItem=[{id:'rotate-free',widthMm:55,heightMm:34,rotationPolicy:'free'}];
const freePlacement=[{id:'rotate-free',copy:0,xMm:0,yMm:0,widthMm:34,heightMm:55,rotation:270,locked:true}];
assert.equal(validateFilmPlacements(freeItem,freePlacement,{filmWidthMm:40}).placements[0].rotation,270);
assert.equal(nestItems(freeItem,{filmWidthMm:40,lockedPlacements:freePlacement}).placements[0].rotation,270);
assert.throws(()=>nestItems([],{filmWidthMm:40,lockedPlacements:freePlacement}),/não existem mais/);

const newTeamHierarchy=groupTeamHierarchy([{id:'team-1',name:'Time visível'}],[],[]);
assert.equal(newTeamHierarchy.length,1,'time novo deve aparecer mesmo sem camisa');
assert.equal(newTeamHierarchy[0].team.name,'Time visível');
assert.deepEqual(newTeamHierarchy[0].kits,[]);
const fullHierarchy=groupTeamHierarchy([{id:'team-1',name:'Time'}],[{id:'kit-1',team_id:'team-1',name:'Camisa'}],[{id:'set-1',kit_id:'kit-1',name:'Conjunto'}]);
assert.equal(fullHierarchy[0].kits[0].sets[0].name,'Conjunto');
assert.equal(customizationKind({name:'Oficial'}),'lettering','cadastro antigo continua como fontes e números');
assert.equal(customizationKind({name:'[ALL_SPONSOR] Principal'}),'sponsors');
assert.equal(customizationKind({name:'[ARTE_ESPECIAL] Campeão'}),'special');
assert.equal(customizationName({name:'[ALL_SPONSOR] Principal'}),'Principal');

console.log('v2.17 pure tests: ok');
