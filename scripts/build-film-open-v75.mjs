// Checked boot fix layered on the existing, tested 2.17.74 build.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
function once(s,a,b){if(s.split(a).length!==2)throw new Error('v75: rever âncora: '+a.slice(0,120));return s.replace(a,b);}
function section(s,start,end,transform){const a=s.indexOf(start),b=s.indexOf(end,a+start.length);if(a<0||b<a)throw new Error('v75: seção ausente '+start);return s.slice(0,a)+transform(s.slice(a,b))+s.slice(b);}
if(!read('index.html').includes('content="2.17.74"'))throw new Error('v75 exige a base 2.17.74.');
let prod=read('production-v217.js');
prod="import {loadFilmOpening,lazyFilmCatalogue,showFilmOpeningFailure} from './film-open-v75.js?v=2.17.75';\n"+prod;
prod=once(prod,"if(!await regenerateFilmDraftPreviews()&&accountGeneration===productionAccountGeneration&&store===filmDraftStore)lastFilm=null;","// Preview failure is not layout failure. Visible previews are prepared on demand.");
prod=once(prod,"if(filmDraftOwner===account&&filmDraftUser===user){if(filmDraftRestoring)await filmDraftRestoring;return;}","if(filmDraftOwner===account&&filmDraftUser===user){if(filmDraftRestoring)await filmDraftRestoring;if(filmDraftStore?.revision!==undefined)return;}");
prod=once(prod,"if(filmDraftOwner!==null){filmItems=[];lastFilm=null;filmSettings=freshFilmSettings();filmMaskCache.clear();}","if(filmDraftOwner!==null&&(filmDraftOwner!==account||filmDraftUser!==user)){filmItems=[];lastFilm=null;filmSettings=freshFilmSettings();filmMaskCache.clear();}");
prod=section(prod,'  async function regenerateFilmDraftPreviews(','  function applyFilmDraft(',s=>{
 s=once(s,'async function regenerateFilmDraftPreviews(progress=null){','async function regenerateFilmDraftPreviews(progress=null,onlyItems=null,previewTargetPx=1600){');
 s=once(s,'items=filmItems;let success=true;','items=onlyItems||filmItems;let success=true;');
 s=once(s,'const targetPx=1600,canvas=','const targetPx=previewTargetPx,canvas=');
 return s;
});
prod=section(prod,'  async function reloadFilmDraft(','  function confirmDiscardFilmDraft(',s=>once(s,'await regenerateFilmDraftPreviews();await renderFilm();','await renderFilm();'));
prod=section(prod,'  function mountFilmTools(','  async function testCustomization(',s=>once(s,'filmMaskCache.clear();await regenerateFilmDraftPreviews();','filmMaskCache.clear();'));
const bootStart='    await restoreFilmDraft();\n    await ctx.assetUrls?.hydrate(filmItems);';
const bootEnd='    if(filmDraftLoaded||filmItems.length){const reconciled=';
const a=prod.indexOf(bootStart),b=prod.indexOf(bootEnd,a);if(a<0||b<a)throw new Error('v75: abertura do editor mudou.');
const boot=`    let media;
    const openingActor=uid(),openingCurrent=()=>renderCurrent()&&uid()===openingActor;
    try{
      const reader=createFilmReader({supabase,ownerId:renderAccount,actorId:openingActor,isCurrent:openingCurrent,timeoutMs:20000});
      media=await loadFilmOpening({isCurrent:openingCurrent,
        restore:async()=>{await restoreFilmDraft();if(filmDraftStore?.revision===undefined)throw new Error(filmDraftWarning||'Não foi possível recuperar o rascunho. Tente novamente.');},
        readMedia:async()=>{const result=await reader.read(signal=>supabase.from('z19p_print_media_profiles').select('*').eq('owner_id',renderAccount).order('nominal_width_cm').abortSignal(signal));return result.data;},
        onStage:message=>{const text=app.querySelector('.film-boot small');if(text)text.textContent=message;}
      });
    }catch(error){showFilmOpeningFailure({app,isCurrent:openingCurrent,error,retry:renderFilm,back:()=>ctx.nav('/')});return false;}
    if(!openingCurrent())return false;
    for(const item of filmItems)ctx.assetUrls?.register?.(item);
    filmCostPanel?.destroy();filmCostPanel=null;
    const profiles=[],readySets=[],assetMap=new Map(),filmCatalogWarnings=[];
    const ensureFilmCatalog=lazyFilmCatalogue(async()=>{
      const [loadedProfiles,loadedSets]=await Promise.all([
        allProductionRows('z19p_asset_print_profiles','*',q=>q.eq('ready_for_print',true),'asset_id'),
        allProductionRows('z19p_customization_sets','*',q=>q.eq('status','ready'))
      ]);
      if(!openingCurrent())throw new DOMException('A página mudou.','AbortError');
      const assetIds=loadedProfiles.map(p=>p.asset_id),setIds=loadedSets.map(s=>s.id);
      const [assets,sources,glyphs,palettes]=await Promise.all([
        productionByIds('z19p_assets','id',assetIds),productionByIds('z19p_customization_sources','set_id',setIds),
        optionalProductionByIds('z19p_customization_glyphs','set_id',setIds).catch(()=>[]),productionByIds('z19p_customization_palettes','set_id',setIds)
      ]);
      const kits=await productionByIds('z19p_team_kits','id',[...new Set(loadedSets.map(s=>s.kit_id))]);
      const teams=await productionByIds('z19p_teams','id',[...new Set(kits.map(k=>k.team_id))]);
      if(!openingCurrent())throw new DOMException('A página mudou.','AbortError');
      const kitMap=new Map(kits.map(k=>[k.id,k])),teamMap=new Map(teams.map(t=>[t.id,t]));
      for(const set of loadedSets){const kit=kitMap.get(set.kit_id),team=teamMap.get(kit?.team_id),ss=sources.filter(s=>s.set_id===set.id);
        set._team=team;set._kit=kit;set._kind=customizationKind(set);set._sources=ss;
        set._source=ss.filter(s=>['ttf','otf'].includes(s.source_type)&&s.is_working_source).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0))[0]||null;
        set._vectorSource=ss.filter(s=>s.source_type==='svg'&&s.is_working_source).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0))[0]||null;
        set._glyphs=glyphs.filter(g=>g.set_id===set.id);set._palette=palettes.filter(p=>p.set_id===set.id);
        set._path=[team?.name,kit?.season,kit?.name,SET_KIND_LABEL[set._kind],customizationName(set)].filter(Boolean).join(' → ');
      }
      profiles.splice(0,profiles.length,...loadedProfiles);readySets.splice(0,readySets.length,...loadedSets);
      for(const asset of assets){assetMap.set(asset.id,asset);ctx.assetUrls?.register?.(asset);}
    },{isCurrent:openingCurrent,onState:message=>{let status=app.querySelector('[data-film-catalog-loading]');if(!status){status=document.createElement('p');status.dataset.filmCatalogLoading='';status.setAttribute('role','status');app.querySelector('.film-hero')?.after(status);}status.textContent=message;status.hidden=!message;}});
`;
prod=prod.slice(0,a)+boot+prod.slice(b);
prod=once(prod,"Sua montagem aparece primeiro; catálogos auxiliares carregam em seguida.","Recuperando as posições salvas. Imagens carregam somente na parte visível do filme.");
prod=once(prod,"const openUnifiedPendingPicker=async()=>{\n      if(!await refreshOrders())return;","const openUnifiedPendingPicker=async()=>{\n      await ensureFilmCatalog();\n      if(!await refreshOrders())return;");
prod=once(prod,"const consumeZero19AssetRequest=async()=>{","const consumeZero19AssetRequest=async()=>{\n      await ensureFilmCatalog();");
prod=once(prod,"const consumeZero19TeamRequest=async()=>{","const consumeZero19TeamRequest=async()=>{\n      await ensureFilmCatalog();");
prod=once(prod,"safe(()=>pickFilmAsset(profiles,assetMap,refreshItems))","safe(async()=>{await ensureFilmCatalog();return pickFilmAsset(profiles,assetMap,refreshItems);})");
prod=once(prod,"safe(()=>pickFilmTeam(readySets,refreshItems))","safe(async()=>{await ensureFilmCatalog();return pickFilmTeam(readySets,refreshItems);})");
prod=once(prod,"safe(()=>openStudioForFilm(readySets,refreshItems))","safe(async()=>{await ensureFilmCatalog();return openStudioForFilm(readySets,refreshItems);})");
prod=once(prod,"id=\"addFilmTeam\" ${readySets.length?'':'disabled'}","id=\"addFilmTeam\"");
prod=once(prod,"void refreshOrders();void refreshFilmJobs(media);","setTimeout(()=>{if(pageCurrent())void refreshFilmJobs(media)},0);");
prod=once(prod,"safe(()=>exportFilm(media,assetMap))","safe(async()=>{const ids=[...new Set(filmItems.filter(i=>i.type==='asset'&&!i.path).map(i=>i.sourceId))];if(ids.length){const reader=createFilmReader({supabase,ownerId:owner(),actorId:uid(),isCurrent:pageCurrent});for(const asset of await reader.rows('z19p_assets',ids))assetMap.set(asset.id,asset);}return exportFilm(media,assetMap);})");
prod=once(prod,"assetUrls:ctx.assetUrls,publicUrl:ctx.publicUrl,isCurrent:current});","assetUrls:ctx.assetUrls,publicUrl:ctx.publicUrl,isCurrent:current,preparePreview:async item=>{if(!current())throw new DOMException('A página mudou.','AbortError');if(!item.previewDataUrl){const ready=await regenerateFilmDraftPreviews(null,[item],420);if(!ready||!current())throw new Error('Não foi possível preparar a prévia desta escrita. Tente novamente.');}return item.previewDataUrl;}});");
write('production-v217.js',prod);
let cloud=read('film-cloud-draft.js');
cloud="import {createFilmReader} from './film-bulk-read.js?v=2.17.75';\n"+cloud;
cloud=once(cloud,"const result=await supabase.from('z19p_film_drafts').select('*').eq('owner_id',account).eq('user_id',userId).maybeSingle();","const reader=createFilmReader({supabase,ownerId:account,actorId:userId,strictAuth:false,timeoutMs:20000,isCurrent:()=>String(owner()||'')===account&&String(user()||'')===userId});const result=await reader.read(signal=>{const query=supabase.from('z19p_film_drafts').select('*').eq('owner_id',account).eq('user_id',userId).maybeSingle();return typeof query.abortSignal==='function'?query.abortSignal(signal):query;});");
write('film-cloud-draft.js',cloud);
write('film-preview-source-v74.js',fs.readFileSync(path.join(root,'film-preview-source-v75.js'),'utf8'));
for(const name of fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n)))write(name,read(name).replace(/\b2\.17\.74\b/g,'2.17.75'));
for(const name of ['production-v217.js','film-cloud-draft.js','film-open-v75.js','film-preview-source-v74.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
execFileSync(process.execPath,[path.join(root,'scripts/verify-film-open-v75.mjs'),dist],{stdio:'inherit'});
console.log('019 2.17.75: editor abre sem reconstruir prévias ou consultar catálogo completo; leitura limitada e recuperação sem apagar rascunho.');
