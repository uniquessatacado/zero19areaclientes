import assert from 'node:assert/strict';
import {createGarmentCloudStore} from '../garment-cloud-store.js';
import {createGarmentDraftStore} from '../garment-draft.js';
import {normalizeGarmentScene} from '../garment-scene.js';
const owner='96d8732c-9576-4af9-9fe7-cdee065c14e6';
const scene=normalizeGarmentScene({title:'Cloud test',layers:[{id:'a',assetId:'a',path:owner+'/art.png',width:20,ratio:2}]});
function fixture(){
 const memory=new Map(),storage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)},rows=[],calls=[];let uid=owner,account=owner,error=null,tick=0,afterWrite=null;
 const ctx={accountOwnerId:()=>account,state:()=>({session:{user:{id:uid}}}),supabase:{from(table){assert.equal(table,'z19p_garment_scenes');let filters=[],mode='read',payload,one=false,start=0,end=999;const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},order(){return q},range(a,b){start=a;end=b;return q},maybeSingle(){one=true;return q},single(){one=true;return q},insert(v){mode='insert';payload=structuredClone(v);return q},update(v){mode='update';payload=structuredClone(v);return q},then(resolve){calls.push(mode);if(error)return resolve({error});let result=rows.filter(r=>filters.every(f=>f(r)));if(mode==='insert'){if(rows.some(r=>r.id===payload.id))return resolve({error:{code:'23505'}});const row={...payload,updated_at:new Date(1700000000000+ ++tick).toISOString()};rows.push(row);result=[row]}if(mode==='update')result.forEach(r=>Object.assign(r,payload,{updated_at:new Date(1700000000000+ ++tick).toISOString()}));if(mode!=='read')afterWrite?.();result=result.slice(start,end+1);resolve({data:structuredClone(one?result[0]||null:result)})}};return q}}};
 return {ctx,storage,memory,rows,calls,store:createGarmentCloudStore(ctx,{storage}),legacy:createGarmentDraftStore({owner,storage}),setError:e=>error=e,setAfterWrite:fn=>afterWrite=fn,change:()=>uid='different-user'};
}
let f=fixture();assert.deepEqual((await f.store.list()).records,[]);let record=await f.store.save(scene);assert.equal(record.storage,'cloud');assert.equal(f.memory.size,0,'new montages do not write browser');assert.equal((await f.store.get(record.id)).title,'Cloud test');
const otherDevice=createGarmentCloudStore(f.ctx,{storage:{getItem:()=>null}});assert.equal((await otherDevice.list()).records.length,1);const second=await otherDevice.save({...scene,title:'Other device'},{record});await assert.rejects(f.store.save({...scene,title:'Stale'},{record}),/outro aparelho/);assert.equal(f.rows[0].scene.title,'Other device');
f=fixture();const old=f.legacy.save(scene),oldRaw=[...f.memory.values()][0];let loaded=await f.store.get('legacy:'+old.id);f.setError({message:'offline'});await assert.rejects(f.store.save(scene,{record:loaded}),/offline/);assert.equal([...f.memory.values()][0],oldRaw);assert.equal((await f.store.list()).cloudAvailable,false);f.setError(null);const migrated=await f.store.save(scene,{record:loaded});assert.equal(migrated.id,old.id);assert.equal(f.legacy.list().length,0);assert.equal((await f.store.list()).records[0].storage,'cloud');
f=fixture();const a=f.legacy.save(scene),b=f.legacy.save({...scene,title:'Keep'});loaded=await f.store.get('legacy:'+a.id);await f.store.save(scene,{record:loaded});assert.equal(f.legacy.list()[0].id,b.id,'unrelated drafts retained');
f=fixture();const legacy=f.legacy.save(scene);loaded=await f.store.get('legacy:'+legacy.id);f.legacy.save({...scene,title:'Concurrent local change'},{id:legacy.id,expectedRevision:1});await assert.rejects(f.store.save(scene,{record:loaded}),/outra aba/);assert.equal(f.rows.length,0);
f=fixture();await f.store.save(scene);f.change();await assert.rejects(f.store.list(),/conta mudou/);await assert.rejects(f.store.save(scene),/conta mudou/);

f=fixture();let cleanupLegacy=f.legacy.save(scene);loaded=await f.store.get('legacy:'+cleanupLegacy.id);
f.setAfterWrite(()=>{f.storage.getItem=()=>{throw Error('storage disabled after commit')}});
const cleanupReadFailure=await f.store.save(scene,{record:loaded});
assert.equal(cleanupReadFailure.storage,'cloud');assert.match(cleanupReadFailure.warning,/confirmada na nuvem/);assert.equal(f.rows.length,1);assert.ok([...f.memory.values()][0].includes(cleanupLegacy.id),'read failure keeps the old browser payload');
f=fixture();cleanupLegacy=f.legacy.save(scene);loaded=await f.store.get('legacy:'+cleanupLegacy.id);
f.setAfterWrite(()=>{f.storage.setItem=()=>{throw Error('cleanup denied')}});
const cleanupWriteFailure=await f.store.save(scene,{record:loaded});
assert.equal(cleanupWriteFailure.storage,'cloud');assert.match(cleanupWriteFailure.warning,/preservada/);assert.equal(f.legacy.list().length,1);
f=fixture();cleanupLegacy=f.legacy.save(scene);loaded=await f.store.get('legacy:'+cleanupLegacy.id);
f.setAfterWrite(()=>f.legacy.save({...scene,title:'Changed while uploading'},{id:cleanupLegacy.id,expectedRevision:1}));
const cleanupConcurrentEdit=await f.store.save(scene,{record:loaded});
assert.equal(cleanupConcurrentEdit.storage,'cloud');assert.match(cleanupConcurrentEdit.warning,/preservada/);assert.equal(f.legacy.list()[0].title,'Changed while uploading');assert.equal(f.rows[0].scene.title,scene.title);

console.log('Garment cloud: cross-device save/read, optimistic conflict, no browser writes, legacy preservation/migration, concurrent local edits and account guard PASS. No remote calls.');
