import assert from 'node:assert/strict';
import {filmItemFromLibraryAsset} from '../film-picker.js';
import {createVendussArtworkArchive} from '../venduss-artwork-archive.js';

const asset = {id:'art-1',workspace_id:'library',asset_type:'arte',name:'Estampa',processed_path:'prepared.png'};
const profile = {asset_id:asset.id,ready_for_print:true,default_width_cm:28,default_height_cm:35,rotation_policy:'free',allow_internal_nesting:true};
const item = filmItemFromLibraryAsset(asset,profile,{companyName:'Venduss',quantity:3,projectId:'not-an-order'});
assert.equal(item.sourceId,asset.id);
assert.equal(item.quantity,3);
assert.equal(item.widthCm,28);
assert.equal(item.heightCm,35);
assert.equal(item.companyName,'Venduss');
assert.equal(item.path,'prepared.png');
for(const key of ['officialProjectId','officialOrderRef','productionGroupKeys','zero19WorkItemId']) assert.equal(key in item,false,key);
assert.throws(()=>filmItemFromLibraryAsset(asset,{...profile,ready_for_print:false}));
assert.throws(()=>filmItemFromLibraryAsset(asset,{...profile,default_height_cm:0}));

const row={product_id:27,prepared_path:'venduss/new.png',brand_name:'Marca',product_name:'Camisa',width_cm:28,height_cm:35};
async function scenario({existing=null,failProfile=false}={}) {
  const queued=[],uploads=[],deleted=[],errors=[];
  let listener;
  const body={isConnected:true,innerHTML:'',querySelector:()=>null,addEventListener:(event,handler)=>{listener=handler;}};
  globalThis.document={getElementById:()=>body};
  const query={select(){return this;},eq(){return this;},contains(){return this;},order(){return this;},limit(){return this;},maybeSingle:async()=>({data:existing})};
  const supabase={
    rpc:async()=>({data:[row]}),
    storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://example.test/art.png'}}),download:async()=>({data:new Blob(['png'])}),upload:async path=>{uploads.push(path);return {};},remove:async paths=>{deleted.push(...paths);return {};}})},
    from:table=>table==='z19p_assets'?{...query,insert:async()=>({}),delete(){deleted.push('asset');return {eq:async()=>({})};}}:{upsert:async()=>failProfile?{error:new Error('profile failed')}:{}}
  };
  const archive=createVendussArtworkArchive({supabase,app:{},shell:x=>x,bindCommon:()=>{},accountOwnerId:()=> 'owner',sessionUserId:()=> 'user',libraryWorkspace:async()=>({id:'library'}),queueAssetToFilm:request=>queued.push(request),toast:(message,kind)=>{if(kind==='err')errors.push(message);}});
  await archive.render();
  const button={disabled:false,textContent:'Colocar no filme',dataset:{vendussAction:'film',productId:'27'}};
  listener({target:{closest:()=>button}});
  for(let count=0;button.disabled && count<50;count++) await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(button.disabled,false);
  return {queued,uploads,deleted,errors};
}
const reused=await scenario({existing:{id:'existing',metadata:{venduss_prepared_path:row.prepared_path}}});
assert.deepEqual(reused.queued,[{assetId:'existing',quantity:1,companyName:'Venduss'}]);
assert.equal(reused.uploads.length,0);
const fresh=await scenario();
assert.equal(fresh.queued.length,1);
assert.equal(fresh.uploads.length,2);
assert.equal(fresh.errors.length,0);
const replaced=await scenario({existing:{id:'old',metadata:{venduss_prepared_path:'old.png'}}});
assert.equal(replaced.queued.length,1);
assert.notEqual(replaced.queued[0].assetId,'old');
const failed=await scenario({failProfile:true});
assert.equal(failed.queued.length,0);
assert.equal(failed.deleted.length,3);
assert.equal(failed.errors.length,1);
console.log('Venduss film import: new/reused/replaced assets, failure cleanup and unlinked film items passed.');
