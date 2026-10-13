// Extend the tested 2.17.73 build; every edit has a unique checked anchor.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
function once(s,a,b){if(s.split(a).length!==2)throw new Error('v74: âncora mudou: '+a.slice(0,100));return s.replace(a,b);}
if(!read('index.html').includes('content="2.17.73"'))throw new Error('v74 exige base 2.17.73.');
let core=read('nesting-core.js');
const batchStart='  if(preferBatchNesting(items)||options.quickPacking===true){',batchEnd='\n  const settings={...normalized,lockedPlacements};';
const start=core.indexOf(batchStart),end=core.indexOf(batchEnd,start);if(start<0||end<start)throw new Error('Roteamento do lote não encontrado.');
let block=core.slice(start,end);block=once(block,'if(batch){','if(batch){');block=once(block,'return batch;','if(mode!==\'maximum\'||options.quickPacking===true)return batch;quickCandidate=batch;');
core=core.slice(0,start)+'  let quickCandidate=null;\n'+block+core.slice(end);
core=once(core,'  const settings={...normalized,lockedPlacements};','  const settings={...normalized,lockedPlacements,onProgress:options.onProgress};\n  if(quickCandidate){settings.maxLength=Math.min(settings.maxLength,Math.ceil(quickCandidate.lengthMm/cell)*cell);options.onCheckpoint?.(quickCandidate);options.onProgress?.({label:"Comparando contornos e rotações",done:0,total:expanded.length});}');
core=once(core,'  let winner=null;','  let winner=quickCandidate;');
core=once(core,'if(respectsLocks){const lockedKeys','if(respectsLocks&&(!winner||baseline.lengthMm<=winner.lengthMm)){const lockedKeys');
core=once(core,'  const solve=searchFreeRotation=>{','  if(winner)options.onCheckpoint?.(winner);\n  const solve=searchFreeRotation=>{');
// Emit measured iteration counts; do not change the search/validation geometry.
core=once(core,'    placements.push(placement);lengthMm=Math.max(lengthMm,placement.yMm+placement.heightMm);','    placements.push(placement);lengthMm=Math.max(lengthMm,placement.yMm+placement.heightMm);\n    if(placements.length%8===0||placements.length===expanded.length)settings.onProgress?.({label:maximum?"Buscando encaixe por contornos":"Comparando alternativa retangular",done:placements.length,total:expanded.length});');
// Reuse the same conservatively rasterized geometry for repeated copies/assets.
core=once(core,'  const bounds=rotatedBoundsMm(item.widthMm,item.heightMm,rotation);let raw;','  const bounds=rotatedBoundsMm(item.widthMm,item.heightMm,rotation);let raw;\n  let cache,key;if(maskBudget){cache=maskBudget.cache??=new Map();const ids=maskBudget.maskIds??=new WeakMap();let id=0;if(maximum&&!item.halftone&&item.allowInternalNesting!==false&&item.mask?.data){if(!ids.has(item.mask))ids.set(item.mask,cache.size+1);id=ids.get(item.mask);}key=JSON.stringify([item.widthMm,item.heightMm,rotation,cell,maximum,id]);if(cache.has(key))return cache.get(key);}');
core=once(core,'  return {raw,rotation,...bounds};','  const result={raw,rotation,...bounds};if(cache)cache.set(key,result);return result;');
const final='  return winner;\n}\n\nexport function placementsOverlap';
core=once(core,final,'  if(winner&&mode===\'maximum\')winner={...winner,maximumSearchAttempted:true,baselineLengthMm:quickCandidate?.lengthMm??null};\n  return winner;\n}\n\nexport function placementsOverlap');
write('nesting-core.js',core);write('nesting-worker.js',fs.readFileSync(path.join(root,'nesting-worker-v74.js'),'utf8'));
write('film-preview.js',once(fs.readFileSync(path.join(root,'film-preview-v74.js'),'utf8'),"bar.querySelector('[data-details]').onclick=()=>panel.classList.toggle('film-view-details');","bar.querySelector('[data-details]').onclick=()=>{if(expanded)panel.classList.toggle('film-view-details');else inspector.scrollIntoView({block:'nearest',behavior:'smooth'});};"));
let prod=read('production-v217.js');
prod="import {createFilmProgress,runFilmWorker,yieldFilmUI} from './film-progress-v74.js';\nimport {createFilmPreviewSource} from './film-preview-source-v74.js';\n"+prod;
prod=once(prod,'  const {supabase,app}=ctx;','  const {supabase,app}=ctx;\n  let filmProgressHook=null,filmCalculationAbort=null;');
let a=prod.indexOf('  function runNesting(items,options){'),b=prod.indexOf('  async function ensureMediaProfiles()',a);if(a<0||b<a)throw new Error('Worker bridge ausente');
prod=prod.slice(0,a)+`  function runNesting(items,options){
    const owned=!filmProgressHook,controller=owned?new AbortController():filmCalculationAbort;
    const generation=productionAccountGeneration,account=owner(),route=location.hash,current=()=>generation===productionAccountGeneration&&account===owner()&&route===location.hash;
    const panel=app.querySelector('.film-canvas-panel'),ui=owned&&panel?createFilmProgress(panel,{onCancel:()=>controller.abort()}):null;
    const progress=filmProgressHook||(data=>ui?.update(data.label,data.done,data.total,data.note));
    return runFilmWorker({url:new URL('./nesting-worker.js?v=2.17.74',import.meta.url),items,options,signal:controller?.signal,isCurrent:current,onProgress:progress,
      fallback:()=>options.operation==='move'?snapFilmPlacement(items,options.placements,options.moving,options):nestItems(items,{...options,onProgress:progress})
    }).then(result=>{ui?.finish(result.nestingSearchLimited?'Melhor encaixe validado mantido; busca adicional limitada.':'Encaixe validado.');return result;}).catch(error=>{ui?.finish(error.message||'Cálculo interrompido.',true);throw error;});
  }

`+prod.slice(b);
a=prod.indexOf('  async function filmNestingItems(');b=prod.indexOf('  async function calculateFilm(',a);if(a<0||b<a)throw new Error('Coleta de máscaras ausente');
prod=prod.slice(0,a)+`  async function filmNestingItems({progress=null,current=()=>true,signal=null}={}){
    const snapshot=filmItems.slice(),maximum=filmSettings.mode==='maximum';
    const inputs=snapshot.map(item=>({id:item.localId,label:item.label,widthMm:item.widthCm*10,heightMm:item.heightCm*10,quantity:item.quantity,halftone:item.halftone,allowInternalNesting:item.halftone?false:item.allowInternalNesting!==false,rotationPolicy:filmSettings.freeRotation?'free':(item.rotationPolicy&&item.rotationPolicy!=='none'?item.rotationPolicy:'free'),mask:null}));
    if(!maximum)return inputs;
    const groups=new Map();snapshot.forEach((item,index)=>{if(item.halftone||item.allowInternalNesting===false||item.type!=='asset'||!item.path)return;const key=(item.storageBucket||'z19p-assets')+':'+item.path;let group=groups.get(key);if(!group){group={item,indexes:[]};groups.set(key,group);}group.indexes.push(index);});
    const jobs=[...groups.values()],deadline=Date.now()+25000;let cursor=0,done=0,missed=0,expired=false;
    const abort=()=>filmMaskCache.clear();signal?.addEventListener('abort',abort,{once:true});
    try{await Promise.all(Array.from({length:Math.min(2,jobs.length)},async()=>{
      for(;;){const index=cursor++;if(index>=jobs.length)return;if(!current()||signal?.aborted)throw new DOMException('Cálculo interrompido.','AbortError');const job=jobs[index];let mask=null;
        if(!expired&&Date.now()<deadline){let timer;try{mask=await Promise.race([maskForItem(job.item),new Promise(resolve=>{timer=setTimeout(()=>{expired=true;filmMaskCache.clear();resolve(null);},Math.max(1,deadline-Date.now()));})]);}catch(error){if(signal?.aborted||!current())throw error;}finally{clearTimeout(timer);}}
        if(!mask)missed++;for(const i of job.indexes){inputs[i].mask=mask;inputs[i].maskUnavailable=!mask;}done++;
        progress?.({label:'2/4 · Analisando transparências',done,total:jobs.length,note:missed?missed+' arquivo(s) com reserva retangular segura':''});if(done%4===0)await yieldFilmUI();
      }
    }));}finally{signal?.removeEventListener('abort',abort);}
    return inputs;
  }
`+prod.slice(b);
// Existing lettering preparation remains exact and becomes observable/cancellable.
function instrumentFunction(source,startMark,endMark,signatureOld,signatureNew,loop,init,total,label){
 const x=source.indexOf(startMark),y=source.indexOf(endMark,x);if(x<0||y<x)throw new Error('Função de preparação mudou: '+startMark);let f=source.slice(x,y);f=once(f,signatureOld,signatureNew);f=once(f,loop,init+loop+`\n      if(progress){progress({label:${JSON.stringify(label)},done:reported++,total:${total}});if(reported%4===1)await yieldFilmUI();}`);return source.slice(0,x)+f+source.slice(y);
}
prod=instrumentFunction(prod,'  async function upgradeCurrentLettering(','  function mountFilmTools(','async function upgradeCurrentLettering(current=()=>true){','async function upgradeCurrentLettering(current=()=>true,progress=null){','for(const item of source){','let reported=0;\n    ','source.length','1/4 · Conferindo medidas');
// Find next function after regeneration without relying on its unrelated name.
a=prod.indexOf('  async function regenerateFilmDraftPreviews(){');b=prod.indexOf('\n  async function ',a+5);if(a<0||b<a)throw new Error('Prévia de fontes ausente');let regen=prod.slice(a,b);regen=once(regen,'async function regenerateFilmDraftPreviews(){','async function regenerateFilmDraftPreviews(progress=null){');regen=once(regen,'for(const item of items){','let reported=0;\n    for(const item of items){\n      if(progress){progress({label:"1/4 · Preparando escritas",done:reported++,total:items.length});if(reported%4===1)await yieldFilmUI();}');prod=prod.slice(0,a)+regen+prod.slice(b);
a=prod.indexOf('  async function calculateFilm(');b=prod.indexOf('  function removeCurrentFilmEntry(',a);let calc=prod.slice(a,b);
const oldMetrics="const calculationMetrics=app.querySelector('#filmMetrics');if(calculationMetrics)calculationMetrics.textContent='1/3 · Conferindo as medidas das artes. Os itens estão preservados.';";
calc=once(calc,oldMetrics,`filmCalculationAbort?.abort();const controller=new AbortController();filmCalculationAbort=controller;
    const progressUI=createFilmProgress(app.querySelector('.film-canvas-panel'),{onCancel:()=>{controller.abort();filmMaskCache.clear();}});
    const localProgress=data=>{if(current()&&!controller.signal.aborted)progressUI.update(data.label,data.done,data.total,data.note);};
    const stepProgress=data=>{if(!current()||controller.signal.aborted)throw new DOMException('Cálculo interrompido. As artes foram preservadas.','AbortError');localProgress(data);};filmProgressHook=localProgress;`);
calc=once(calc,'    try{','    try{\n      await yieldFilmUI();');
calc=once(calc,'upgradeCurrentLettering(current)','upgradeCurrentLettering(current,stepProgress)');
calc=calc.replaceAll('regenerateFilmDraftPreviews()','regenerateFilmDraftPreviews(stepProgress)');
calc=once(calc,'const items=await filmNestingItems();','const items=await filmNestingItems({progress:stepProgress,current,signal:controller.signal});');
calc=once(calc,"if(calculationMetrics)calculationMetrics.textContent='2/3 · Organizando todas as cópias, sem reduzir o tamanho das estampas.';","localProgress({label:'3/4 · Buscando o melhor encaixe',note:mode==='maximum'?'Modo Máximo: compara alternativas e contornos disponíveis.':'Modo Normal: encaixe retangular.'});");
calc=once(calc,"if(calculationMetrics)calculationMetrics.textContent='3/3 · Encaixe pronto. Abrindo medidas e visualização.';","localProgress({label:'4/4 · Abrindo visualização',done:0,total:1});");
calc=once(calc,"lastFilm=result;filmDraftNote='';","result.maskFallbackCount=items.filter(i=>i.maskUnavailable).length;lastFilm=result;filmDraftNote='';");
calc=once(calc,"drawFilm(media);app.querySelector('#exportFilm').disabled=false;app.querySelector('#saveFilm').disabled=false;","drawFilm(media);app.querySelector('#exportFilm').disabled=false;app.querySelector('#saveFilm').disabled=false;progressUI.finish(result.nestingSearchLimited?'Todas as cópias preservadas no melhor encaixe validado; busca adicional limitada.':'Todas as cópias encaixadas. As prévias carregam por área, com progresso próprio.');");
calc=once(calc,"if(metrics)metrics.textContent=filmDraftNote;","progressUI.finish(filmDraftNote,true);");
calc=once(calc,'}finally{if(button.isConnected','}finally{if(filmCalculationAbort===controller){filmCalculationAbort=null;filmProgressHook=null;}if(button.isConnected');
prod=prod.slice(0,a)+calc+prod.slice(b);
// Restore honest mode labeling. Bounding-box occupancy is not an ink-area claim.
prod=once(prod,"${shownLayout.batchOptimized?'Lote rápido':shownLayout.mode==='maximum'?'Máximo':'Normal'}","${shownLayout.mode==='maximum'?'Máximo':'Normal'}");
prod=once(prod,"${shownLayout.batchOptimized?'<small class=\"film-layout-note\">Todas as cópias encaixadas. Medidas e espaçamento preservados; sem busca pesada dentro dos contornos.</small>':''}","${shownLayout.mode==='maximum'?'<small class=\"film-layout-note\">Modo Máximo: melhor alternativa completa validada, sem reduzir as estampas.'+(shownLayout.nestingSearchLimited?' Busca adicional limitada; o resultado não é garantia de ótimo global.':'')+(shownLayout.maskFallbackCount?' '+shownLayout.maskFallbackCount+' aplicação(ões) sem máscara disponível foram reservadas pelo retângulo seguro.':'')+'</small>':''}");
prod=once(prod,'    metrics();mountFilmPreview({element:preview,layout:shownLayout,items:filmItems,publicUrl:ctx.publicUrl,isCurrent:current,',`    const previewSource=createFilmPreviewSource({supabase,ownerId:owner(),actorId:uid(),items:filmItems,assetUrls:ctx.assetUrls,publicUrl:ctx.publicUrl,isCurrent:current});
    metrics();mountFilmPreview({element:preview,layout:shownLayout,items:filmItems,publicUrl:ctx.publicUrl,resolveSource:previewSource,isCurrent:current,`);
prod=once(prod,'const items=await filmNestingItems();if(!valid())return null;const result=await runNesting(items,settings);return valid()?result:null;',`const controller=new AbortController(),ui=createFilmProgress(app.querySelector('.film-canvas-panel'),{onCancel:()=>{controller.abort();filmMaskCache.clear();}}),progress=data=>{if(valid())ui.update(data.label,data.done,data.total,data.note);};
        try{const items=await filmNestingItems({progress,current:valid,signal:controller.signal});if(!valid())return null;const result=await runFilmWorker({url:new URL('./nesting-worker.js?v=2.17.74',import.meta.url),items,options:settings,signal:controller.signal,isCurrent:valid,onProgress:progress,fallback:()=>nestItems(items,settings)});ui.finish(result.nestingSearchLimited?'Melhor encaixe validado mantido; busca adicional limitada.':'Otimização concluída.');return valid()?result:null;}catch(error){ui.finish(error.message||'Otimização interrompida.',true);throw error;}`);
write('production-v217.js',prod);
let urls=read('private-asset-urls.js');urls=once(urls,'  function clear(){','  function invalidatePath(path){signed.delete(path);}\n  function clear(){');urls=once(urls,'return {register,pathUrl,resolvePath,hydrate,sourceUrl,clear,','return {register,pathUrl,resolvePath,hydrate,sourceUrl,clear,invalidatePath,');write('private-asset-urls.js',urls);
write('index.html',once(read('index.html'),'</head>','  <link rel="stylesheet" href="/film-v74.css?v=2.17.74">\n</head>'));
for(const name of fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n))){let s=read(name).replace(/\b2\.17\.73\b/g,'2.17.74');s=s.replace(/((?:\.\.?\/|\/)[^\s'"`<>]+\.(?:js|css)\?v=)2\.17\.\d+/g,'$1'+'2.17.74');s=s.replace(/(['"])(\.\/(?:film-(?:progress|media|preview-source)-v74|nesting-core|film-bulk-read)\.js)\1/g,'$1$2?v=2.17.74$1');write(name,s);}
// New relative modules without a query also refer only to this static release.
for(const name of ['film-progress-v74.js','film-media-v74.js','film-preview-source-v74.js','film-preview.js','production-v217.js','nesting-core.js','nesting-worker.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'z19-v74-tests-'));
try{for(const name of ['test-nesting-efficiency.mjs','test-free-rotation.mjs','test-nesting-rotated-pairs.mjs']){let s=fs.readFileSync(path.join(root,'scripts',name),'utf8').replace(/(['"])\.\.\/nesting-core\.js\1/g,JSON.stringify(pathToFileURL(path.join(dist,'nesting-core.js')).href));const f=path.join(temp,name);fs.writeFileSync(f,s);execFileSync(process.execPath,[f],{cwd:root,stdio:'inherit',timeout:90000});}}finally{fs.rmSync(temp,{recursive:true,force:true});}
execFileSync(process.execPath,[path.join(root,'scripts/verify-film-v74.mjs'),dist],{stdio:'inherit',timeout:90000});
console.log('019 2.17.74: máximo efetivo com candidato seguro, progresso por etapa, prévias sob demanda e viewport contido.');
