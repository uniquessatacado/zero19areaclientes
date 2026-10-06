import assert from 'node:assert/strict';
import fs from 'node:fs';
import {hydrateProductionArtworkPreviews,productionArtworkPreviewSource} from '../production-artwork-previews.js';

const row=(id,bucket,path,source='obsolete/source.png')=>({id,owner_id:'owner',asset_id:'asset',stage:'ready_production',quantity:1,source_file_path:source,metadata:{details:[{production:{vdr_bundle_id:'bundle',storage_bucket:bucket,file_path:path,width_cm:29.63,height_cm:28}}]}});
const legacy=row('49535','z19p-assets','owner/22-FLAVIO/prepared.png');
const privateRow=row('new-private','z19p-private','owner/political/prepared.png');
const venduss=row('venduss','venduss-print-artworks','tenant/order/prepared.png');
const unsupported=row('unexpected','unapproved-bucket','owner/prepared.png');
const original=[legacy,{...legacy,id:'49544'},{...legacy,id:'49546'},privateRow,venduss,unsupported];
const before=JSON.stringify(original),calls=[];
const supabase={storage:{from:bucket=>({createSignedUrls:async(paths,expires)=>{
  calls.push({bucket,paths,expires});return {data:paths.map(path=>({path,signedUrl:'https://fixture.invalid/signed/'+bucket+'/'+path}))};
}})}};
const result=await hydrateProductionArtworkPreviews({supabase,items:original});
assert.equal(calls.length,3,'Each approved bucket signs once');
assert.deepEqual(calls.map(call=>call.bucket),['z19p-assets','z19p-private','venduss-print-artworks']);
assert(calls.every(call=>call.expires===600),'Expiring memory-only links');
assert.equal(calls[0].paths.length,1,'Three sold applications reuse one file signature');
assert(result.slice(0,5).every(item=>item._artworkPreview?.includes('/signed/')),'Legacy/private/Venduss previews all resolve');
assert.equal(result[0]._artworkPreview,result[1]._artworkPreview);
assert.equal(JSON.stringify(original),before,'No item, source, measure or status mutation');
assert(!calls.some(call=>call.paths.includes('obsolete/source.png')),'Snapshot wins over stale source_file_path');
assert.equal(result[5],unsupported,'Unknown buckets never become public URLs');
assert.equal(productionArtworkPreviewSource({source_file_path:'owner/source.png',metadata:{details:[{production:{storage_bucket:'z19p-assets'}}]}}).path,'owner/source.png','Historic source-only row still supported');
assert.equal(productionArtworkPreviewSource({metadata:{details:[{production:{storage_bucket:'z19p-private'}}]}}),null);

const shared='owner/same-filename.png';
const collision=await hydrateProductionArtworkPreviews({supabase,items:[row('public','z19p-assets',shared),row('private','z19p-private',shared)]});
assert.notEqual(collision[0]._artworkPreview,collision[1]._artworkPreview,'Same path in different buckets never shares a URL');
const batchCalls=[];
await hydrateProductionArtworkPreviews({items:Array.from({length:130},(_,index)=>row(index,'z19p-private','owner/'+index+'.png')),supabase:{storage:{from:bucket=>({createSignedUrls:async paths=>{batchCalls.push({bucket,size:paths.length});return {data:paths.map(path=>({path,signedUrl:'https://fixture.invalid/'+path}))};}})}}});
assert.deepEqual(batchCalls.map(call=>call.size),[64,64,2],'Bounded signing batches');

const partial=await hydrateProductionArtworkPreviews({items:[legacy,privateRow],supabase:{storage:{from:bucket=>({createSignedUrls:async paths=>bucket==='z19p-private'?{error:new Error('Falha temporária privada')}:{data:paths.map(path=>({path,signedUrl:'https://fixture.invalid/ok'}))}})}}});
assert.equal(partial[0]._artworkPreview,'https://fixture.invalid/ok');assert.equal(partial[1]._artworkPreview,null);assert.match(partial[1]._artworkPreviewError,/temporária/);
const fileFailure=await hydrateProductionArtworkPreviews({items:[privateRow],supabase:{storage:{from:()=>({createSignedUrls:async paths=>({data:[{path:paths[0],error:'Objeto não encontrado'}]})})}}});
assert.equal(fileFailure[0]._artworkPreview,null);assert.equal(fileFailure[0]._artworkPreviewError,'Objeto não encontrado');
let current=true;
await assert.rejects(hydrateProductionArtworkPreviews({items:[legacy],isCurrent:()=>current,supabase:{storage:{from:()=>({createSignedUrls:async()=>{current=false;return {data:[]};}})}}}),/conta mudou/);
let staleCalls=0;
await assert.rejects(hydrateProductionArtworkPreviews({items:[legacy],isCurrent:()=>false,supabase:{storage:{from:()=>{staleCalls++;return {};}}}}),/conta mudou/);assert.equal(staleCalls,0);

const sync=fs.readFileSync(new URL('../zero19-pdv-sync.js',import.meta.url),'utf8');
assert.match(sync,/items=await hydrateProductionArtworkPreviews\(\{supabase,items,isCurrent:previewCurrent\}\)/);
assert.match(sync,/async function refreshArtworkPreview\(workItemId\)/);
assert.match(sync,/select\('id,owner_id,source_file_path,metadata'\)\.eq\('id',workItemId\)\.eq\('owner_id',owner\)/,'Retry remains owner scoped');
const picker=fs.readFileSync(new URL('../production-v217.js',import.meta.url),'utf8');
assert.match(picker,/ctx\.zero19Orders\.refreshArtworkPreview\(entry\.row\.id\)/);
assert.match(picker,/retry\.textContent='Tentar novamente'/);
assert.match(picker,/min-height:44px.*background:#fff;color:#111/);
assert.match(picker,/width:72px;height:72px;max-width:72px;max-height:72px;object-fit:contain/);
console.log('PASS production PNG previews: legacy 22 FLAVIO/private/Venduss, sold snapshot, signed expiring URLs, bucket isolation, dedup/batch64, row-level failure/retry, account race guards, owner scoped reads, untouched status/source/measures.');
