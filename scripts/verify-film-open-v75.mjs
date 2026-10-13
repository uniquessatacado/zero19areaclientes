import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const dist=path.resolve(process.argv[2]||'dist');
const mod=n=>import(pathToFileURL(path.join(dist,n)).href);
const {loadFilmOpening,lazyFilmCatalogue}=await mod('film-open-v75.js');
const {createFilmReader}=await mod('film-bulk-read.js');
const {resolveFilmDraftMedia}=await mod('film-draft.js');
const {createFilmPreviewSource}=await mod('film-preview-source-v74.js');
const source=fs.readFileSync(path.join(dist,'production-v217.js'),'utf8');
const ownerId='10000000-0000-4000-8000-000000000001',actorId='10000000-0000-4000-8000-000000000002';
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0');
const media=[{id:id(9999),owner_id:ownerId,usable_width_cm:58,nominal_width_cm:60,name:'Filme 58 cm'}];
const items=Array.from({length:807},(_,i)=>({localId:id(i+1),sourceId:id(i+9000),type:i%2?'asset':'team_customization',widthCm:9,heightCm:9,quantity:1,path:i%2?'sold/'+i+'.png':undefined,rotationPolicy:'none',name:i%2?undefined:'TESTE'}));
const layout={placements:items.map(i=>({id:i.localId,copy:0})),filmWidthMm:580,lengthMm:37467};
let checks=0;const verify=(condition,message)=>{checks++;assert.ok(condition,message);};
let restored=false;const stages=[];
assert.equal((await loadFilmOpening({restore:async()=>{restored=true;},readMedia:async()=>media,onStage:s=>stages.push(s)})),media);
verify(restored&&stages.length===2,'two bounded data stages, no catalogue or preview');
await assert.rejects(loadFilmOpening({restore:async()=>{},readMedia:async()=>{throw Error('offline');}}),/offline/);checks++;
await assert.rejects(loadFilmOpening({restore:async()=>{},readMedia:async()=>[],isCurrent:()=>true}),/perfil/);checks++;
await assert.rejects(loadFilmOpening({restore:async()=>{},readMedia:async()=>media,isCurrent:()=>false}),/página/);checks++;
let runs=0;const lazy=lazyFilmCatalogue(async()=>{runs++;});await Promise.all([lazy(),lazy(),lazy()]);await lazy();verify(runs===1,'one on-demand catalogue, no duplicate load');
let retries=0;const retry=lazyFilmCatalogue(async()=>{if(++retries===1)throw Error('network');});await assert.rejects(retry(),/network/);await retry();verify(retries===2,'catalogue failure can be retried');
// Execute the actual compiled renderFilm through the editor DOM mount.
// Font/image/library dependencies throw; 807 saved items must still open.
const begin=source.indexOf('  async function renderFilm(){'),end=source.indexOf('    if(filmCatalogWarnings.length)',begin);
assert.ok(begin>=0&&end>begin);const prefix=source.slice(begin,end)+'\nreturn {media,profiles,readySets,assetMap};\n}';
let reads=[],selectedIds=[],registrations=0,mounts=0;
const db={auth:{getSession:async()=>({data:{session:{user:{id:actorId},access_token:'test',expires_at:Date.now()/1000+3600}}})},from(table){reads.push(table);const q={select(){return q;},eq(){return q;},order(){return q;},in(key,ids){selectedIds.push(ids);return q;},abortSignal(){return q;},then(resolve,reject){return Promise.resolve({data:table==='z19p_print_media_profiles'?media:[],error:null}).then(resolve,reject);}};return q;}};
const app={_html:'',set innerHTML(value){this._html=value;mounts++;},get innerHTML(){return this._html;},querySelector(sel){if(sel==='.film-boot small')return {textContent:''};return null;}};
const forbidden=()=>{throw Error('Opening must not wait for fonts/images/catalogues');};
const context={app,ctx:{shell:s=>s,bindCommon(){},assetUrls:{register(){registrations++;},hydrate:forbidden},nav(){}},supabase:db,
 owner:()=>ownerId,uid:()=>actorId,state:()=>({}),location:{hash:'#/filme'},filmCalculationGeneration:0,productionAccountGeneration:0,
 detachProductionListener:null,filmCostPanel:null,filmDraftStore:{revision:7},filmDraftWarning:'',filmDraftDirty:false,filmDraftLoaded:true,
 filmItems:items,filmSettings:{mediaId:media[0].id,mode:'maximum',gapMm:3,name:'Saved film'},lastFilm:layout,
 restoreFilmDraft:async()=>{},regenerateFilmDraftPreviews:forbidden,preloadFilmPickerMeta:forbidden,allProductionRows:forbidden,productionByIds:forbidden,optionalProductionByIds:forbidden,
 h:s=>String(s??''),filmItemsHTML:()=>'<article>807 saved items</article>',createFilmReader,loadFilmOpening,lazyFilmCatalogue,showFilmOpeningFailure:()=>{throw Error('unexpected boot error');},resolveFilmDraftMedia,
 DOMException,setTimeout,clearTimeout,console};
vm.createContext(context);vm.runInContext(prefix,context);
const start=performance.now(),opened=await vm.runInContext('renderFilm()',context),elapsed=performance.now()-start;
verify(opened&&app.innerHTML.includes('id="filmPreview"'),'actual editor mounted');
verify(app.innerHTML.includes('807 saved items'),'existing items available');
verify(reads.length===1&&reads[0]==='z19p_print_media_profiles','only roll-profile read during render');
verify(registrations===807,'private paths registered without downloading');
verify(opened.assetMap.size===0&&opened.readySets.length===0,'catalogue is genuinely lazy');
verify(context.lastFilm===layout&&context.filmItems===items,'saved layout and item array unchanged');
verify(elapsed<2000,'no hidden waits before editor mount');
const r0=source.indexOf('  async function restoreFilmDraft(){'),r1=source.indexOf('  async function reloadFilmDraft(',r0);const restoreSource=source.slice(r0,r1);
verify(!restoreSource.includes('regenerateFilmDraftPreviews('),'cold restore has no preview preparation');
let loads=0;
const draftCtx={owner:()=>ownerId,uid:()=>actorId,productionAccountGeneration:0,filmDraftOwner:null,filmDraftUser:null,filmDraftRestoring:null,filmDraftTimer:null,filmDraftStore:null,filmItems:[],lastFilm:null,filmSettings:{},filmMaskCache:{clear(){}},freshFilmSettings:()=>({}),supabase:db,window:{sessionStorage:{}},clearTimeout,console,
 createCloudFilmDraftStore:()=>({revision:7,load:async()=>{loads++;return {ok:true,data:{items,layout,settings:context.filmSettings}};}}),
 applyFilmDraft(d){draftCtx.filmItems=d.items;draftCtx.lastFilm=d.layout;},regenerateFilmDraftPreviews:forbidden};
vm.createContext(draftCtx);vm.runInContext(restoreSource,draftCtx);await vm.runInContext('restoreFilmDraft()',draftCtx);await vm.runInContext('restoreFilmDraft()',draftCtx);
verify(loads===1&&draftCtx.lastFilm===layout&&draftCtx.filmItems===items,'cold restore preserves 807-item geometry without previews');
reads=[];let prepared=0;
const resolver=createFilmPreviewSource({supabase:db,ownerId,actorId,items,assetUrls:{sourceUrl:async i=>'image:'+i.path},publicUrl:p=>p,isCurrent:()=>true,preparePreview:async()=>{prepared++;return 'data:image/png;base64,test';}});
const text=items.find(i=>i.type==='team_customization'),asset=items.find(i=>i.type==='asset');
assert.equal(await resolver(text),'data:image/png;base64,test');verify(prepared===1&&reads.length===0,'only requested text prepared; no asset metadata query');
const old=structuredClone(asset);assert.equal(await resolver(asset),'image:'+asset.path);verify(reads.length===1&&selectedIds.at(-1).length===1,'one visible asset metadata read, not 807');assert.deepEqual(asset,old);checks++;
const cloud=fs.readFileSync(path.join(dist,'film-cloud-draft.js'),'utf8');verify(cloud.includes('timeoutMs:20000')&&cloud.includes('reader.read(signal=>'),'cloud read has deadline and cancellation');
verify(cloud.includes('if(revision===undefined)')&&cloud.includes("code:'DRAFT_CONFLICT'"),'unknown revision/conflict protections kept');
verify(source.includes('await ensureFilmCatalog();\n      if(!await refreshOrders())'),'pending picker loads dependencies on demand');
verify(!source.includes('void refreshOrders();void refreshFilmJobs(media);'),'no full queue load at mount');
verify(source.includes('regenerateFilmDraftPreviews(null,[item],420)'),'only visible restored text gets lightweight preview');
const calc=source.slice(source.indexOf('  async function calculateFilm('),source.indexOf('  function removeCurrentFilmEntry('));
verify(calc.includes('upgradeCurrentLettering(current,stepProgress)')&&calc.includes('runNesting('),'calculation/physical-size checks untouched');
verify(source.includes('assertCompleteFilmPhrases(items,layout)')&&source.includes('verifyFilmLetteringRevisions'),'export integrity rules kept');
console.log(JSON.stringify({ok:true,checks,actualCompiledEditorItems:807,blockedImageAndCatalogueDependencies:'editor still mounted',mountMs:Math.round(elapsed),realSafariSession:false}));
