import assert from 'node:assert/strict';
import {QUOTE_SERVICES,createServiceDraft,newServiceItem,changeQuoteService,setQuoteProduct,serviceBreakdown,serializeServiceDraft,validateServiceDraft,quotePreparationSummary,buildQuoteAssetQuery,quoteMoney} from '../quote-service-core.js';
const product={id:'product-1',name:'Camiseta normal',default_unit_price:42.5},asset={id:'reference-old-project',name:'Logo enviada'},uuid=(()=>{let id=0;return()=>`00000000-0000-4000-8000-${String(++id).padStart(12,'0')}`;})();
const fresh=()=>createServiceDraft(null,{workspaceId:'company',projectId:'order',products:[product],uuid});
const draft=fresh();
assert.equal(draft.items[0].unit_price,42.5);assert.equal(draft.items[0].product_id,product.id);
assert.ok(validateServiceDraft(draft).some(message=>message.includes('arte')));
draft.items[0].quantity=10;draft.items[1].quantity=12;draft.items[1].unit_price=2;
const art1=newServiceItem('art',{asset,uuid}),art2=newServiceItem('art',{asset:{id:'reference-2',name:'Costas'},uuid});
art1.quantity=3;art1.unit_price='8,40';art2.quantity=7;art2.unit_price=12.25;draft.items.push(art1,art2);
assert.deepEqual(validateServiceDraft(draft),[]);
assert.deepEqual(serviceBreakdown(draft.items),{product:425,art:110.95,application:24,removal:0,total:559.95});
const payload=serializeServiceDraft(draft);assert.equal(payload.p_quote.schema_version,2);assert.equal(payload.p_quote.project_id,'order');assert.equal(payload.p_expected_updated_at,null);
assert.deepEqual(payload.p_items.map(item=>item.quantity),[10,12,3,7]);assert.equal(payload.p_items[2].reference_asset_id,asset.id);assert.equal(payload.p_items[2].final_asset_id,null,'quote saves before final art');
assert.equal(payload.p_items[1].piece_price,0);assert.equal(payload.p_items[1].prints[0].price,2);assert.equal(payload.p_items[0].prints.length,0);
const legacyCompatibleTotal=payload.p_items.reduce((sum,item)=>sum+(item.piece_price+item.prints.reduce((n,p)=>n+p.price,0))*item.quantity,0);
assert.equal(legacyCompatibleTotal,559.95,'old totals/commissions do not double charge service lines');
draft.items[0].unit_price='39,00';draft.items[0].metadata.price_override=true;assert.equal(product.default_unit_price,42.5,'quote-only override never mutates catalog');assert.equal(serializeServiceDraft(draft).p_items[0].piece_price,39);
setQuoteProduct(draft.items[0],product);assert.equal(draft.items[0].unit_price,42.5);assert.equal(draft.items[0].metadata.price_override,false);
const stableId=art1.id;art1.final_asset_id='final-version';const linked=serializeServiceDraft(draft).p_items.find(item=>item.id===stableId);assert.equal(linked.final_asset_id,'final-version');assert.equal(linked.reference_asset_id,asset.id);assert.equal(linked.prints[0].price,8.4);assert.equal(linked.quantity,3);
assert.equal(quotePreparationSummary(draft).length,2);draft.official_mockup_asset_id='mockup';art2.final_asset_id='final-2';assert.deepEqual(quotePreparationSummary(draft),[]);
for(const service of Object.keys(QUOTE_SERVICES)){
  const serviceDraft=fresh();changeQuoteService(serviceDraft,service,{products:[product],uuid});const art=newServiceItem('art',{asset,uuid});art.unit_price=10;serviceDraft.items.push(art);
  for(const item of serviceDraft.items){if(item.item_kind==='application')item.unit_price=0;if(item.item_kind==='removal'){item.unit_price=0;item.metadata.removal_free=true;}}
  assert.deepEqual(validateServiceDraft(serviceDraft),[],service);const stored=serializeServiceDraft(serviceDraft).p_items;
  assert.equal(stored.some(item=>item.product_id),service==='full_shirt','customer garments never reference stock products');
  if(service==='dtf_only'){assert.equal(stored.length,1);assert.equal(quotePreparationSummary(serviceDraft).length,1);}
  if(service==='refurbishment'){const removal=serviceDraft.items.find(item=>item.item_kind==='removal');removal.metadata.removal_free=false;assert.ok(validateServiceDraft(serviceDraft).some(message=>message.includes('gratuita')));removal.unit_price=5;assert.deepEqual(validateServiceDraft(serviceDraft),[]);}
}
for(const invalid of ['',-1,'abc','1,555',Infinity]){const item=draft.items[0],old=item.unit_price;item.unit_price=invalid;assert.ok(validateServiceDraft(draft).some(message=>message.includes('preço')),`reject ${invalid}`);item.unit_price=old;}
for(const invalid of ['',0,-1,1.5,100001]){draft.items[0].quantity=invalid;assert.ok(validateServiceDraft(draft).some(message=>message.includes('quantidade')));}draft.items[0].quantity=10;
assert.equal(quoteMoney('1.234,56'),1234.56);assert.equal(quoteMoney('0'),0);assert.ok(Number.isNaN(quoteMoney('')));
const existing={...payload.p_quote,id:draft.id,items:payload.p_items,payment_status:'paid',updated_at:'2026-09-21T01:00:00.123Z'};
const restored=createServiceDraft(existing,{uuid});assert.equal(restored.is_new,false);assert.equal(restored.items[2].id,stableId);assert.equal(serializeServiceDraft(restored).p_expected_updated_at,existing.updated_at);
const calls=[];const query=new Proxy({}, {get:(_target,key)=>key==='then'?undefined:(...args)=>{calls.push([key,...args]);return query;}});const supabase={from:table=>{calls.push(['from',table]);return query;}};
buildQuoteAssetQuery(supabase,{ownerId:'owner',workspaceId:'company',projectId:'current',name:'logo_%',page:2});
assert.ok(calls.some(call=>call[0]==='eq'&&call[1]==='owner_id'&&call[2]==='owner'));assert.ok(calls.some(call=>call[0]==='eq'&&call[1]==='workspace_id'&&call[2]==='company'));
assert.ok(!calls.some(call=>call.includes('project_id')||call.includes('ready_for_print')),'all company references including historical unprepared artworks selectable');assert.deepEqual(calls.find(call=>call[0]==='range'),['range',48,72]);
calls.length=0;buildQuoteAssetQuery(supabase,{ownerId:'owner',workspaceId:'company',projectId:'current',type:'mockup'});assert.ok(calls.some(call=>call[1]==='project_id'&&call[2]==='current'),'official mockup belongs to current order');
assert.throws(()=>buildQuoteAssetQuery(supabase,{ownerId:'owner'}),/empresa/);
console.log('quote-services: independent quantities, 4 services, pricing, references, preparation, explicit free removal and tenant-scoped query passed');
