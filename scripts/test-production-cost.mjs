import assert from 'node:assert/strict';
import {analyzeRgba,estimateProductionCost,validateProductionCostConfig,PRODUCTION_TIME_REFERENCE} from '../production-cost-core.js';

const close=(actual,expected,message='numeric result')=>assert.ok(Math.abs(actual-expected)<1e-7,`${message}: ${actual} != ${expected}`);
const rgba=(values,mode='CMYW')=>analyzeRgba(new Uint8ClampedArray(values),values.length/4,1,{channelMode:mode});
const white=rgba([255,255,255,255]),black=rgba([0,0,0,255]),transparent=rgba([0,0,0,0]);
assert.deepEqual(white.channels,{C:0,M:0,Y:0,K:0,W:1});assert.equal(white.alphaCoverage,1);
assert.deepEqual(black.channels,{C:1,M:1,Y:1,K:0,W:1});
assert.deepEqual(transparent.channels,{C:0,M:0,Y:0,K:0,W:0});assert.equal(transparent.alphaCoverage,0);
assert.deepEqual(rgba([0,0,0,255],'CMYKW').channels,{C:0,M:0,Y:0,K:1,W:1});
assert.deepEqual(rgba([255,255,255,255],'CMYKW').channels,{C:0,M:0,Y:0,K:0,W:1});
assert.deepEqual(rgba([255,0,0,255]).channels,{C:0,M:1,Y:1,K:0,W:1});
const half=rgba([0,0,0,255,255,255,255,0]);assert.equal(half.alphaCoverage,.5);assert.deepEqual(half.channels,{C:.5,M:.5,Y:.5,K:0,W:.5});
const translucent=rgba([0,0,0,128]);close(translucent.channels.C,128/255);close(translucent.channels.W,128/255);
const gray=rgba([128,128,128,255],'CMYKW');assert.equal(gray.channels.C,0);close(gray.channels.K,127/255);
assert.throws(()=>analyzeRgba(new Uint8Array(4),0,1),/Dimensões/);assert.throws(()=>analyzeRgba(new Uint8Array(3),1,1),/RGBA/);assert.throws(()=>rgba([0,0,0,255],'RGB'),/CMYW/);

function data(){
  const purchases=[
    {id:'f30',name:'Rolo 30 teste',kind:'film',widthCm:30,quantity:100,unit:'m',totalPrice:448},
    {id:'f60',name:'Rolo 60 teste',kind:'film',widthCm:60,quantity:100,unit:'m',totalPrice:700},
    {id:'p',name:'Pó teste',kind:'powder',color:'white',quantity:1000,unit:'g',totalPrice:80},
    ...['C','M','Y','K','W'].map(channel=>({id:channel,name:`Tinta ${channel} teste`,kind:'ink',channel,quantity:1000,unit:'ml',totalPrice:100}))
  ];
  const profile={id:'printer',name:'Impressora fictícia de teste',channelMode:'CMYW',film30PurchaseId:'f30',film60PurchaseId:'f60',powderPurchaseId:'p',inkPurchaseIds:{C:'C',M:'M',Y:'Y',K:'K',W:'W'},calibration:{inkMlPerM2:{C:1,M:1,Y:1,K:1,W:2},powderGPerM2:8,inkWastePercent:0,filmWastePercent:0,leaderCm:0,time60MinPerM:52,time30MinPerM:null,time30Mode:'proportional',setupMinutes:0,curingMinutes:0,laborPerHour:0,kwhPerHour:0,kwhPrice:0,maintenancePerM:0,ripPerM:0}};
  return {layout:{filmWidthMm:580,lengthMm:2000},items:[{localId:'art',widthCm:50,heightCm:50,quantity:4}],profile,purchases,analyses:{art:white}};
}
const row=(result,key)=>result.rows.find(candidate=>candidate.key===key);
let result=estimateProductionCost(data());
assert.equal(result.complete,true);close(result.totals.total,14.84);close(result.breakdown.film,14);close(result.breakdown.ink,.2);close(result.breakdown.powder,.64);
assert.equal(result.film.nominalWidthCm,60);assert.equal(result.film.usableWidthCm,58);close(result.film.areaM2,1.2);close(result.film.usableAreaM2,1.16);close(result.film.wasteAreaM2,.2);close(result.film.wastePercent,100/6);
assert.equal(result.coverage.printedAreaM2,1);assert.equal(result.coverage.totalCopies,4);assert.equal(result.timeEstimate.totalMinutes,104);assert.equal(row(result,'ink-C').cost,0);assert.equal(row(result,'ink-W').quantity,2);assert.equal(row(result,'film').estimated,false);assert.equal(row(result,'powder').estimated,true);assert.equal(result.estimated,true);
assert.ok(result.assumptions.some(text=>text.includes('ICC')));assert.equal(result.profit.grossProfit,null);assert.equal(row(result,'commission'),undefined);assert.equal(row(result,'garments'),undefined);

let input=data();input.analyses=new Map([['art',black]]);result=estimateProductionCost(input);close(result.totals.total,15.14);assert.equal(result.coverage.channelAreasM2.K,0);
input=data();input.profile.channelMode='CMYKW';input.analyses={art:rgba([0,0,0,255],'CMYKW')};result=estimateProductionCost(input);close(result.totals.total,14.94);assert.equal(row(result,'ink-K').quantity,1);assert.equal(row(result,'ink-C').quantity,0);
input=data();input.analyses.art=half;result=estimateProductionCost(input);assert.equal(result.coverage.printedAreaM2,.5);close(result.breakdown.ink,.25);close(result.breakdown.powder,.32);close(result.totals.total,14.57);
input=data();input.analyses.art=transparent;result=estimateProductionCost(input);close(result.totals.total,14);assert.equal(result.coverage.printedAreaM2,0);assert.equal(result.breakdown.ink,0);assert.equal(result.breakdown.powder,0);assert.equal(result.film.wastePercent,100);
input=data();input.items=[];input.analyses={};result=estimateProductionCost(input);assert.equal(result.totals.total,14,'Blank film still consumes full length');

input=data();input.layout={filmWidthMm:280,lengthMm:4000};input.items[0].widthCm=25;input.items[0].heightCm=100;result=estimateProductionCost(input);assert.equal(result.film.nominalWidthCm,30);close(result.film.areaM2,1.2);close(result.breakdown.film,4*4.48);close(result.timeEstimate.printMinutes,52*28/58*4);assert.equal(result.timeEstimate.mode,'proportional-30');assert.ok(result.assumptions.some(text=>text.includes('28/58')));
input.profile.calibration.time30Mode='measured';input.profile.calibration.time30MinPerM=30;result=estimateProductionCost(input);assert.equal(result.timeEstimate.printMinutes,120);assert.equal(result.timeEstimate.mode,'measured-30');assert.equal(result.assumptions.some(text=>text.includes('28/58')),false);
delete input.profile.calibration.time30Mode;result=estimateProductionCost(input);assert.equal(result.timeEstimate.printMinutes,null);assert.equal(result.timeEstimate.complete,false);assert.ok(result.warnings.some(text=>text.includes('explicitamente')));assert.equal(result.complete,true,'Explicit zero hourly costs do not need an unavailable time estimate');
input.profile.calibration.laborPerHour=30;result=estimateProductionCost(input);assert.equal(result.complete,false);assert.equal(result.breakdown.labor,null);

input=data();input.profile.calibration.filmWastePercent=10;input.profile.calibration.leaderCm=20;input.profile.calibration.inkWastePercent=25;result=estimateProductionCost(input);close(result.film.consumedLengthM,2.4);close(result.breakdown.film,16.8);close(result.breakdown.ink,.25);assert.equal(result.timeEstimate.printMinutes,104,'Blank reserve and leader are not assumed to print');
input=data();Object.assign(input.profile.calibration,{setupMinutes:6,curingMinutes:10,laborPerHour:30,kwhPerHour:2,kwhPrice:.8,maintenancePerM:1,ripPerM:2});result=estimateProductionCost(input);assert.equal(result.timeEstimate.totalMinutes,120);assert.equal(result.breakdown.labor,60);assert.equal(result.breakdown.energy,3.2);assert.equal(result.breakdown.maintenance,2);assert.equal(result.breakdown.rip,4);close(result.totals.total,84.04);

input=data();input.purchases.find(p=>p.id==='W').totalPrice=null;result=estimateProductionCost(input);assert.equal(result.complete,false);assert.equal(result.totals.total,null);assert.equal(result.breakdown.ink,null);close(result.totals.known,14.64);assert.equal(row(result,'ink-W').cost,null);assert.ok(result.warnings.some(text=>text.includes('preço total')));
input=data();for(const purchase of input.purchases.filter(p=>['C','M','Y'].includes(p.id)))purchase.totalPrice=null;result=estimateProductionCost(input);assert.equal(result.complete,true,'No CMY cost is needed for white artwork with zero CMY consumption');
input=data();delete input.analyses.art;result=estimateProductionCost(input);assert.equal(result.complete,false);assert.equal(result.coverage.printedAreaM2,null);assert.equal(result.coverage.knownPrintedAreaM2,0);assert.equal(result.coverage.channelAreasM2.C,null);assert.equal(result.breakdown.film,14);assert.equal(result.totals.total,null);assert.equal(result.breakdown.powder,null);
input=data();input.profile.channelMode='CMYKW';result=estimateProductionCost(input);assert.equal(result.complete,false);assert.ok(result.warnings.some(text=>text.includes('Reanalise')));
input=data();input.profile.calibration.inkMlPerM2.W=null;result=estimateProductionCost(input);assert.equal(result.complete,false);assert.equal(row(result,'ink-W').quantity,null);
input=data();delete input.profile.calibration.filmWastePercent;result=estimateProductionCost(input);assert.equal(result.film.consumedLengthM,null);assert.equal(result.breakdown.film,null);
input=data();input.profile.film60PurchaseId='f30';result=estimateProductionCost(input);assert.equal(result.breakdown.film,null);assert.ok(result.warnings.some(text=>text.includes('incompatível')));
input=data();input.profile.inkPurchaseIds.W='C';result=estimateProductionCost(input);assert.equal(row(result,'ink-W').cost,null);
input=data();input.layout.lengthMm=500;input.saleTotal=100;result=estimateProductionCost(input);assert.equal(result.coverage.geometryComplete,false);assert.equal(result.complete,false);assert.equal(result.totals.total,null);assert.equal(result.profit.grossProfit,null);assert.ok(result.warnings.some(text=>text.includes('Recalcule o encaixe')));

input=data();Object.assign(input,{commissionAmount:5,garmentUnitCost:20,garmentQuantity:2,saleTotal:100});result=estimateProductionCost(input);close(result.totals.total,59.84);close(result.totals.productionTotal,14.84);close(result.profit.grossProfit,40.16);close(result.profit.marginPercent,40.16);close(result.profit.markupPercent,40.16/59.84*100);assert.equal(result.profit.complete,true);assert.equal(row(result,'garments').quantity,2,'Art quantity does not define garment quantity');
input.commissionAmount=null;result=estimateProductionCost(input);assert.equal(result.complete,false);assert.equal(result.profit.grossProfit,null);assert.equal(result.profit.marginPercent,null);assert.equal(result.totals.productionComplete,true);
input=data();input.garmentUnitCost=20;result=estimateProductionCost(input);assert.equal(row(result,'garments').quantity,null);assert.equal(result.complete,false);
input=data();input.saleTotal=0;result=estimateProductionCost(input);close(result.profit.grossProfit,-14.84);assert.equal(result.profit.marginPercent,null);

input=data();input.profile.calibration.time60MinPerM='52';input.profile.calibration.inkMlPerM2.W='2,5';input.purchases.find(p=>p.id==='f60').totalPrice='700,50';result=estimateProductionCost(input);close(result.breakdown.film,14.01);close(result.breakdown.ink,.25);
input=data();input.items[0].id=input.items[0].localId;delete input.items[0].localId;input.items[0].analysis=white;delete input.analyses;assert.equal(estimateProductionCost(input).complete,true);
const state={version:1,activeProfileId:'printer',profiles:[data().profile],purchases:data().purchases};assert.equal(validateProductionCostConfig(state),true);input=data();delete input.profile;delete input.purchases;assert.equal(estimateProductionCost({...input,state}).complete,true);
assert.equal(validateProductionCostConfig({version:1,activeProfileId:null,profiles:[],purchases:[]}),true);
assert.equal(PRODUCTION_TIME_REFERENCE.minutesPerM,52);assert.equal(PRODUCTION_TIME_REFERENCE.usableWidthCm,58);

for(const mutate of [
  input=>input.purchases[0].totalPrice=-1,
  input=>input.purchases[0].quantity=0,
  input=>input.purchases[0].quantity=Infinity,
  input=>input.purchases[2].unit='kg',
  input=>input.purchases[3].unit='l',
  input=>input.purchases[0].widthCm=58,
  input=>input.purchases.push({...input.purchases[0]}),
  input=>input.items[0].quantity=1.5,
  input=>input.items[0].quantity=0,
  input=>input.items[0].widthCm=-20,
  input=>input.items.push({...input.items[0]}),
  input=>input.layout.lengthMm=0,
  input=>input.layout.filmWidthMm=601,
  input=>input.profile.calibration.time60MinPerM=0,
  input=>input.profile.calibration.inkWastePercent=-2,
  input=>input.profile.calibration.time30Mode='automatic',
  input=>input.commissionAmount=-1,
  input=>input.garmentQuantity=2.5,
  input=>input.saleTotal=NaN,
  input=>input.analyses.art={...white,channels:{...white.channels,W:1.1}},
  input=>input.analyses.art={...half,channels:{...half.channels,W:.8}}
]){input=data();mutate(input);assert.throws(()=>estimateProductionCost(input));}
assert.throws(()=>validateProductionCostConfig({...state,activeProfileId:'missing'}),/ativa/);
assert.throws(()=>validateProductionCostConfig({...state,version:2}),/versão/);
assert.throws(()=>validateProductionCostConfig({...state,profiles:[state.profiles[0],state.profiles[0]]}),/duplicada/);
console.log('Production cost: RGBA coverage, CMYW/CMYKW, base-unit pricing, nominal/usable widths, explicit time assumptions, reserves, missing values, partial totals, commissions, garments, margins and validation passed. All numeric purchase values are fictional test fixtures.');
