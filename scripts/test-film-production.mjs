import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {filmExportIdentity, linkedFilmQuantities, pendingQuantity, filmItemFromOrder, createFilmProduction} from '../film-production.js';

const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const clone=value=>structuredClone(value);
const digest=bytes=>webcrypto.subtle.digest('SHA-256',bytes);
const row={project_id:uuid(1),quote_id:uuid(2),quote_item_id:uuid(3),asset_id:uuid(4),workspace_id:uuid(5),company_name:'Empresa de teste',asset_name:'Arte final',label:'Referência',processed_path:'final.png',original_path:'original.png',width_cm:'10',height_cm:'6',remaining_quantity:8,allocations:[],halftone:true,rotation_policy:'180',allow_internal_nesting:false};
const item={...filmItemFromOrder(row,3),localId:uuid(6)};
const layout={filmWidthMm:580,lengthMm:60,placements:[0,1,2].map(copy=>({id:item.localId,copy,xMm:copy*105,yMm:0,widthMm:100,heightMm:60,rotation:0}))};
const identity=await filmExportIdentity([item],layout,{digest});
assert.match(identity.fingerprint,/^[a-f0-9]{64}$/);
assert.match(identity.exportId,/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
assert.equal(item.path,'final.png');assert.equal(item.widthCm,10);assert.equal(item.quantity,3);
assert.equal(item.halftone,true);assert.equal(item.allowInternalNesting,false);assert.equal(item.rotationPolicy,'180');
assert.deepEqual(item.orderLink,{projectId:row.project_id,quoteId:row.quote_id,quoteItemId:row.quote_item_id});
assert.equal(filmItemFromOrder({...row,processed_path:null}).path,'original.png');
assert.equal(filmItemFromOrder(row).quantity,8);
for(const field of ['project_id','quote_id','quote_item_id','asset_id','workspace_id'])assert.throws(()=>filmItemFromOrder({...row,[field]:'invalid'}),/identificação/);
for(const quantity of [0,-1,1.2,9,NaN,Infinity])assert.throws(()=>filmItemFromOrder(row,quantity),/Quantidade/);
for(const field of ['width_cm','height_cm'])for(const value of [0,-1,'bad',NaN,Infinity])assert.throws(()=>filmItemFromOrder({...row,[field]:value},1),/Quantidade/);
assert.throws(()=>filmItemFromOrder({...row,processed_path:null,original_path:null},1),/arquivo final/);

const printableKeys=['path','sourceId','widthCm','heightCm','quantity'];
for(const key of printableKeys){const changed=clone(item);changed[key]=typeof changed[key]==='number'?changed[key]+1:changed[key]+'x';assert.notEqual((await filmExportIdentity([changed],layout,{digest})).exportId,identity.exportId,key+' changes artifact');}
for(const key of ['xMm','yMm','widthMm','heightMm','rotation']){const changed=clone(layout);changed.placements[0][key]++;assert.notEqual((await filmExportIdentity([item],changed,{digest})).exportId,identity.exportId,key+' changes geometry');}
assert.deepEqual(await filmExportIdentity([{...item,label:'Nome apresentado diferente',previewDataUrl:'data:preview',mask:{width:1}}],{...layout,placements:[...layout.placements].reverse(),format:'TIFF',trim:true},{digest}),identity,'presentation, format, trim and placement ordering do not create another accounting key');
const second={...item,localId:uuid(7),sourceId:uuid(8),orderLink:{projectId:uuid(9),quoteId:uuid(10),quoteItemId:uuid(11)}};
const mixed={...layout,placements:[...layout.placements,{...layout.placements[0],id:second.localId,copy:0,xMm:320}]};
assert.deepEqual(await filmExportIdentity([item,second],mixed,{digest}),await filmExportIdentity([second,item],{...mixed,placements:[...mixed.placements].reverse()},{digest}));
const team={...item,type:'team_customization',name:'JOÃO',palette:[{role:'name',color_hex:'#ffffff'}]};
const teamIdentity=await filmExportIdentity([team],layout,{digest});
assert.deepEqual(await filmExportIdentity([{...team,previewDataUrl:'data:regen',previewUrl:'url',mask:{},_mask:{}}],layout,{digest}),teamIdentity);
assert.notEqual((await filmExportIdentity([{...team,name:'JOAO'}],layout,{digest})).exportId,teamIdentity.exportId,'lettering recipe text remains significant');

assert.deepEqual(linkedFilmQuantities([item,second,{...item,localId:uuid(12),orderLink:null}],mixed),[
 {film_item_id:item.localId,quote_item_id:row.quote_item_id,project_id:row.project_id,asset_id:row.asset_id,quantity:3,width_cm:10,height_cm:6},
 {film_item_id:second.localId,quote_item_id:second.orderLink.quoteItemId,project_id:second.orderLink.projectId,asset_id:second.sourceId,quantity:1,width_cm:10,height_cm:6}
]);
assert.equal(linkedFilmQuantities([{...item,quantity:99}],layout)[0].quantity,3,'only copies actually present in exported layout count');
assert.throws(()=>linkedFilmQuantities([item],{...layout,placements:[]}),/Vínculo/);
for(const bad of [{...item,localId:'bad'},{...item,sourceId:'bad'},{...item,orderLink:{...item.orderLink,quoteItemId:'bad'}},{...item,orderLink:{...item.orderLink,projectId:'bad'}}])assert.throws(()=>linkedFilmQuantities([bad],{...layout,placements:[{...layout.placements[0],id:bad.localId}]}),/Vínculo/);

assert.equal(pendingQuantity(row,[item]),5);
assert.equal(pendingQuantity({...row,remaining_quantity:5,allocations:[{film_item_id:item.localId,quantity:3}]},[item]),5,'already exported local copies are not subtracted twice');
assert.equal(pendingQuantity({...row,remaining_quantity:5,allocations:[{film_item_id:item.localId,quantity:1}]},[item]),3,'only additional copies in draft reduce remaining');
assert.equal(pendingQuantity({...row,remaining_quantity:5,allocations:[{film_item_id:item.localId,quantity:8}]},[item]),5,'shrinking a previously exported row does not undo allocations');
assert.equal(pendingQuantity(row,[{...item,quantity:20}]),0);
assert.equal(pendingQuantity(row,[second]),8,'different quote items do not compete');
assert.equal(pendingQuantity(row,[item,{...item,localId:uuid(12),quantity:2}]),3,'multiple local entries for same quote sum their draft copies');

let current=true,reply={data:[],error:null};const calls=[];
const api=createFilmProduction({supabase:{rpc:async(name,args)=>{calls.push({name,args:clone(args)});return typeof reply==='function'?reply():clone(reply)}},isCurrent:()=>current});
assert.deepEqual(await api.pending(),[]);assert.equal(calls.at(-1).name,'z19p_pending_film_items');
for(const data of [null,{},'bad']){reply={data,error:null};await assert.rejects(()=>api.pending(),/formato inválido/);}
reply={error:{message:'sem conexão'}};await assert.rejects(()=>api.pending(),/sem conexão/);
reply={data:[row]};current=false;assert.equal(await api.pending(),null);current=true;
const unlinkedCount=calls.length;
assert.equal((await api.record([{...item,orderLink:null}],layout,identity)).unlinked,true);assert.equal(calls.length,unlinkedCount,'manual free film never writes order allocations');
current=false;await assert.rejects(()=>api.record([item],layout,identity),/Conta alterada/);assert.equal(calls.length,unlinkedCount);current=true;
const success={export_id:identity.exportId,replayed:false,added_quantity:3,has_previous_items:false};reply={data:success};assert.deepEqual(await api.record([item],layout,identity),success);
assert.deepEqual(calls.at(-1),{name:'z19p_record_film_export',args:{p_export_id:identity.exportId,p_fingerprint:identity.fingerprint,p_items:linkedFilmQuantities([item],layout)}});
for(const data of [null,[],{}, {...success,export_id:uuid(99)}, {...success,replayed:'false'}, {...success,added_quantity:-1}, {...success,added_quantity:1.5}, {...success,added_quantity:'3'}, {...success,has_previous_items:undefined}, {...success,has_previous_items:'false'}]){reply={data};await assert.rejects(()=>api.record([item],layout,identity),/confirmação da fila/);}
reply={data:{...success,replayed:true,added_quantity:0}};assert.equal((await api.record([item],layout,identity)).added_quantity,0,'successful replay accepted without another quantity');
reply={error:{message:'resposta perdida'}};await assert.rejects(()=>api.record([item],layout,identity),/Arquivo gerado.*resposta perdida/);
const failedPayload=clone(calls.at(-1));reply={data:{...success,replayed:true,added_quantity:0}};await api.record([item],layout,identity);assert.deepEqual(calls.at(-1),failedPayload,'retry preserves exact idempotency key and payload');
reply=async()=>{current=false;return {data:success}};await assert.rejects(()=>api.record([item],layout,identity),/Conta alterada durante a confirmação/);
console.log('film-production: stable cross-format identity, order validation, partial/mixed quantities, remaining allocations, RPC response/retry/account guards passed');
