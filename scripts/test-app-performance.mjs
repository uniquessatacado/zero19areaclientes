import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {assetPreviewPath} from '../asset-preview.js';

const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const begin=source.indexOf('ensureDefaults = async function(){');
const end=source.indexOf('async function loadProjects()',begin);
assert.ok(begin>=0&&end>begin);
const helpers=source.slice(begin,end);
const libraryRows=['library_artes','library_mockups','library_videos'].map((workspace_type,index)=>({id:String(index),workspace_type,owner_id:'owner'}));
function fixture({libraries=libraryRows,failTable=null,count=1,pause}={}){
  const calls=[],sandbox={console,Promise,currentProfile:{id:'user'},session:{user:{id:'user'}},accountContextEpoch:0,libraryWorkspaces:{},DEFAULT_STATUSES:[{name:'Em atendimento'}],DEFAULT_PRODUCTS:['Camiseta'],DEFAULT_FOLDER_TEMPLATES:[{name:'Artes prontas',purpose:'artes_prontas'}],norm:value=>value.toLowerCase(),accountOwnerId:()=>sandbox.session?.user?.id==='user'?'owner':'other',loadTeamContext:async()=>true,ensureDefaults:null,ensureLibraries:null};
  sandbox.supabase={from(table){const filters={},query={select(){return query},eq(key,value){filters[key]=value;return query},in(key,value){filters[key]=value;return query},insert(rows){calls.push({kind:'write',table,rows});return Promise.resolve({data:null,error:null})},then(resolve,reject){calls.push({kind:'read',table,filters:{...filters}});return Promise.resolve(pause?.(table)).then(()=>({data:table==='z19p_workspaces'?libraries:null,count,error:table===failTable?{message:'offline'}:null})).then(resolve,reject)}};return query}};
  vm.createContext(sandbox);vm.runInContext(helpers,sandbox);return {sandbox,calls};
}
{
  const {sandbox,calls}=fixture();await sandbox.ensureDefaults();
  assert.equal(calls.filter(x=>x.kind==='read').length,5,'four parallel counts + one library read');
  assert.equal(calls.filter(x=>x.table==='z19p_workspaces').length,1,'no redundant library reload when complete');
  assert.equal(calls.filter(x=>x.kind==='write').length,0,'opening an initialized page never writes');
  assert.deepEqual(Object.keys(sandbox.libraryWorkspaces),['library_artes','library_mockups','library_videos']);
}
{
  const {sandbox,calls}=fixture({libraries:libraryRows.slice(0,2)});await sandbox.ensureLibraries();
  assert.equal(calls.filter(x=>x.kind==='read').length,2,'new library still requires authoritative reload');
  assert.equal(calls.filter(x=>x.kind==='write').length,1);
  assert.equal(calls.find(x=>x.kind==='write').rows[0].workspace_type,'library_videos');
}
{
  const {sandbox,calls}=fixture({failTable:'z19p_statuses',count:null});
  await assert.rejects(sandbox.ensureDefaults(),error=>error.message==='offline');
  assert.equal(calls.filter(x=>x.kind==='write').length,0,'failed reads are never treated as empty tables');
}
{
  let release;const blocked=new Promise(resolve=>release=resolve);
  const {sandbox,calls}=fixture({libraries:[],pause:()=>blocked});
  const pending=sandbox.ensureDefaults();await Promise.resolve();await Promise.resolve();
  assert.equal(calls.filter(x=>x.kind==='read').length,5,'all independent reads start before first response');
  sandbox.session={user:{id:'other'}};sandbox.accountContextEpoch++;release();await pending;
  assert.equal(calls.filter(x=>x.kind==='write').length,0,'account change blocks stale setup writes');
  assert.equal(Object.keys(sandbox.libraryWorkspaces).length,0,'account change blocks stale library cache');
}
{
  const {sandbox,calls}=fixture({count:0});await sandbox.ensureDefaults();
  assert.equal(calls.filter(x=>x.kind==='write').length,3,'new account retains all defaults');
  const folders=calls.filter(x=>x.kind==='write'&&x.table==='z19p_folder_templates');
  assert.equal(folders.length,1,'new folder set does not duplicate ready-art template');
}
assert.equal(assetPreviewPath({thumbnail_path:'thumb',processed_path:'processed',original_path:'original'}),'thumb');
assert.equal(assetPreviewPath({metadata:{thumbnail_path:'metadata-thumb'},processed_path:'processed',original_path:'original'}),'metadata-thumb');
assert.equal(assetPreviewPath({thumbnail_path:'thumb',metadata:{thumbnail_path:'metadata-thumb'},processed_path:'processed'}),'thumb');
assert.equal(assetPreviewPath({processed_path:'processed',original_path:'original'}),'processed');
assert.equal(assetPreviewPath({original_path:'original'}),'original');
assert.equal(assetPreviewPath(null),'');
assert.match(source,/function downloadAsset\(a\).*const path=a\.processed_path\|\|a\.original_path/,'download still uses full-resolution source');
assert.match(source,/loading="lazy" decoding="async" src="\$\{publicUrl\(assetPreviewPath\(a\)\)\}/);
assert.match(source,/global: \{ fetch: createResilientReadFetch\(\{origin:SUPABASE_URL\}\) \}/);
console.log('PASS page performance: 5 parallel setup reads (previously 6 across 4 rounds), no redundant library fetch, no error/stale-account writes, preview-only thumbnails, originals preserved. Simulated queries only.');
