import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {filmItemFromLibraryAsset} from '../film-picker.js';
const source=readFileSync(new URL('../zero19-pdv-sync.js',import.meta.url),'utf8');
const start=source.indexOf('  async function pendingVendussFilmRows()'),end=source.indexOf('  async function addAssetToFilm(',start);
assert(start>0&&end>start);
const base={id:'work',project_id:'project',stage:'ready_production',asset_id:'asset',quantity:2,personalization_sale_id:'sale',metadata:{details:[{production:{storage_bucket:'venduss-print-artworks',venduss_display_id:49390}}]}};
let items=[base,{...base,id:'held',stage:'awaiting_release'},{...base,id:'cancelled',stage:'cancelled'},{...base,id:'regular',metadata:{}}],stage='ready_production',imports=0;
const data={summaries:[{project:{id:'project',official_order_ref:'49393'},workspace:{id:'workspace'}}]};
const asset={id:'asset',workspace_id:'workspace',asset_type:'arte',processed_path:'prepared.png',name:'Logo'};
const profile={asset_id:'asset',ready_for_print:true,default_width_cm:28,default_height_cm:35,rotation_policy:'180'};
const api=runInNewContext(source.slice(start,end)+';({pendingVendussFilmRows,prepareVendussFilmItem})',{
 load:async()=>({...data,items}),accountOwnerId:()=> 'owner',orderNo:project=>project.official_order_ref,filmItemFromLibraryAsset,
 importVendussOrderAsset:async()=>{imports++;return 'asset';},
 supabase:{from(table){const q={select(){return q;},eq(){return q;},single:async()=>({data:table==='z19p_assets'?asset:table==='z19p_asset_print_profiles'?profile:{stage}})};return q;}}
});
assert.deepEqual(Array.from(await api.pendingVendussFilmRows(),row=>row.id),['work']);
const item=await api.prepareVendussFilmItem('work');
assert.equal(item.zero19WorkItemId,'work');assert.equal(item.officialProjectId,'project');assert.equal(item.officialOrderRef,'49393');assert.equal(item.companyName,'Venduss #49390');assert.equal(item.quantity,2);assert.equal(item.path,'prepared.png');assert.equal(item.widthCm,28);assert.equal(imports,0);
items=[{...base,asset_id:null}];await api.prepareVendussFilmItem('work');assert.equal(imports,1);
stage='cancelled';await assert.rejects(()=>api.prepareVendussFilmItem('work'),/liberação/);
items=[{...base,stage:'awaiting_release'}];await assert.rejects(()=>api.prepareVendussFilmItem('work'),/não está mais/);
console.log('PASS Venduss film: released-only, import/reuse, real order links and cancellation recheck');
