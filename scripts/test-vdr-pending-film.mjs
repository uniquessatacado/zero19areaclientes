import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {filmItemFromLibraryAsset} from '../film-picker.js';
import {createAssetUrlResolver} from '../private-asset-urls.js';

const source=fs.readFileSync(new URL('../zero19-pdv-sync.js',import.meta.url),'utf8');
const start=source.indexOf('  async function pendingVdrFilmRows(){'),end=source.indexOf('  async function prepareVendussFilmItem(',start);
assert(start>=0&&end>start,'Released VDR PNG consumer exists');
const production={vdr_bundle_id:'bundle',storage_bucket:'z19p-private',file_path:'owner/private/sold-snapshot.png',width_cm:29.63,height_cm:28,position_label:'Costas'};
const ready={id:'application-png',project_id:'project',personalization_sale_id:'sale-png',stage:'ready_production',asset_id:'source-art',quantity:2,metadata:{details:[{production}]}};
const item=(id,patch)=>({...ready,id,...patch});
const items=[ready,item('awaiting',{stage:'art_received'}),item('finished',{stage:'ready_pickup'}),item('cancelled',{stage:'cancelled'}),item('missing-file',{asset_id:null}),item('unrelated',{metadata:{details:[{production:{storage_bucket:'z19p-private'}}]}})];
const asset={id:'source-art',owner_id:'owner',asset_type:'arte',name:'22 FLAVIO',workspace_id:'library',width:3500,height:3314,processed_path:'owner/private/prepared.png',original_path:'owner/private/original.png',metadata:{storage_bucket:'z19p-private'}};
const summary={project:{id:'project'},workspace:{client_name:'Cliente fixture'}};
let owner='owner',currentStage='ready_production',currentAssetId=ready.asset_id,currentProduction=production;
const reads=[];
const context={
 load:async()=>({items,summaries:[summary]}),accountOwnerId:()=>owner,orderNo:()=>49535,filmItemFromLibraryAsset,
 supabase:{from:table=>({select:fields=>{const filters=[];const query={eq:(key,value)=>{filters.push([key,value]);return query;},single:async()=>{reads.push({table,fields,filters});return table==='z19p_assets'?{data:asset}:{data:{stage:currentStage,asset_id:currentAssetId,metadata:{details:[{production:currentProduction}]}}};}};return query;}})}
};
const api=vm.runInNewContext(source.slice(start,end)+';({pendingVdrFilmRows,prepareVdrFilmItem})',context);
const rows=await api.pendingVdrFilmRows();assert.deepEqual(Array.from(rows,row=>row.id),['application-png']);
const checkoutProduction={...production,vdr_bundle_id:undefined,checkout_application_id:'checkout-art',art_source:'CHECKOUT_CATALOG_ASSET'};
items.push(item('checkout-ready',{metadata:{details:[{production:checkoutProduction}]}}),item('checkout-in-production',{stage:'production',metadata:{details:[{production:checkoutProduction}]}}),item('checkout-cancelled',{stage:'cancelled',metadata:{details:[{production:checkoutProduction}]}}));
assert.deepEqual(Array.from(await api.pendingVdrFilmRows(),row=>row.id),['application-png','checkout-ready'],'Paid checkout central art joins the same protected film selector; production/cancelled do not');
items.splice(-3);
const film=await api.prepareVdrFilmItem(ready.id);
assert.equal(film.type,'asset');assert.equal(film.sourceId,asset.id);assert.equal(film.path,production.file_path);assert.equal(film.storageBucket,'z19p-private');
assert.equal(film.widthCm,29.63);assert.equal(film.heightCm,28);assert.equal(film.quantity,2);
assert.equal(film.zero19WorkItemId,ready.id);assert.equal(film.externalOrderItemRef,'sale-png');assert.equal(film.officialProjectId,'project');
assert(!film.previewDataUrl,'No public/generated substitute replaces the production PNG');
assert.equal(asset.width,3500);assert.equal(asset.height,3314);assert.equal(asset.processed_path,'owner/private/prepared.png');
assert(reads.every(read=>read.filters.some(([key,value])=>key==='owner_id'&&value==='owner')),'Both reads remain owner-scoped');
asset.processed_path='owner/private/editor/new-version.png';asset.metadata.storage_bucket='z19p-assets';
const afterEdit=await api.prepareVdrFilmItem(ready.id);assert.equal(afterEdit.path,'owner/private/sold-snapshot.png','Film retains the sold application snapshot after library editing');assert.equal(afterEdit.storageBucket,'z19p-private','Application bucket overrides a later library metadata change');assert.equal(asset.processed_path,'owner/private/editor/new-version.png','Selection does not mutate the source asset');
let publicCalls=0;
const resolver=createAssetUrlResolver({publicUrl:()=>{publicCalls++;return 'https://fixture.invalid/public';},supabase:{storage:{from:bucket=>{assert.equal(bucket,'z19p-private');return {createSignedUrl:async path=>{assert.equal(path,production.file_path);return {data:{signedUrl:'https://fixture.invalid/private-snapshot'}};}};}}}});
assert.equal(await resolver.sourceUrl(afterEdit),'https://fixture.invalid/private-snapshot');assert.equal(publicCalls,0,'Private application snapshot never uses a public fallback');
const snapshotPath=production.file_path;delete production.file_path;
const legacy=await api.prepareVdrFilmItem(ready.id);assert.equal(legacy.path,asset.processed_path,'Legacy application without snapshot preserves the existing source fallback');
production.file_path=snapshotPath;production.storage_bucket='unexpected-bucket';await assert.rejects(api.prepareVdrFilmItem(ready.id),/armazenamento/);production.storage_bucket='z19p-private';
currentStage='production';await assert.rejects(api.prepareVdrFilmItem(ready.id),/liberação mudou/);
currentStage='ready_production';currentAssetId='another-art';await assert.rejects(api.prepareVdrFilmItem(ready.id),/liberação mudou/);
currentAssetId=ready.asset_id;currentProduction={...production,width_cm:20};await assert.rejects(api.prepareVdrFilmItem(ready.id),/liberação mudou/);
currentProduction=production;context.accountOwnerId=()=>{const value=owner;owner='another-owner';return value;};await assert.rejects(api.prepareVdrFilmItem(ready.id),/liberação mudou/);
await assert.rejects(api.prepareVdrFilmItem('not-existing'),/não está mais aguardando produção/);
console.log('PASS VDR pending PNG: released-only, sold snapshot survives library edits, approved private bucket without public fallback, legacy fallback, per-application measures/links, no source mutation, owner/status/asset/snapshot race guards.');
