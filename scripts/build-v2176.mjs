import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Deterministic, checked pre-build transform. No runtime loaders, remote source,
// eval, compressed JS or modifications to the original source checkout.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const version='2.17.34';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'z19p-v21715-'));
const output=path.join(root,'dist');
const skip=new Set(['.git','.vercel','node_modules','dist','output','tmp','.agents','.codex']);
function copy(a,b){fs.mkdirSync(b,{recursive:true});for(const e of fs.readdirSync(a,{withFileTypes:true})){if(skip.has(e.name)||e.name.startsWith('.env'))continue;const from=path.join(a,e.name),to=path.join(b,e.name);if(e.isDirectory())copy(from,to);else if(e.isFile())fs.copyFileSync(from,to);}}
copy(root,temp);
let production=fs.readFileSync(path.join(temp,'production-v217.js'),'utf8');
function replaceOnce(before,after){const count=production.split(before).length-1;if(count!==1)throw new Error('Pre-build v'+version+': trecho alterado ou ausente ('+count+'): '+before.slice(0,100));production=production.replace(before,after);}
replaceOnce("  async function prepareLetteringLayout(item){","  async function prepareLegacyLetteringLayout(item){");
replaceOnce('>Exportar PNG 300 DPI</button>','>Exportar filme 300 DPI</button>');
replaceOnce("  async function testCustomization(set){",fs.readFileSync(path.join(root,'scripts/film-v2176-functions.txt'),'utf8')+"\n  async function testCustomization(set){");
production="import {refineLetteringLayout} from './lettering-layout-v2176.js?v=2.17.8';\nimport {createSavedFilmDrafts,openSavedFilmDialog,filmNameProof,NAMED_FILM_DRAFT_KIND} from './film-saved-drafts.js?v=2.17.8';\n"+production;
replaceOnce("g.drawImage(image,x+part.xCm,y+part.yCm,part.widthCm,part.heightCm)","if(part.sourceCrop){const c=part.sourceCrop;g.drawImage(image,c.x*image.naturalWidth,c.y*image.naturalHeight,c.width*image.naturalWidth,c.height*image.naturalHeight,x+part.xCm,y+part.yCm,part.widthCm,part.heightCm)}else g.drawImage(image,x+part.xCm,y+part.yCm,part.widthCm,part.heightCm)");
replaceOnce("      name:cleanName,number:cleanNumber,fontSource:set._source||null,fontSources:set._sources||[],","      name:cleanName.normalize('NFC'),number:cleanNumber,letteringMetricsVersion:3,spacingMode:'optical',fontSource:set._source||null,fontSources:set._sources||[],");
replaceOnce("nameHeightCm:Number(set.default_name_height_cm)||5.5","nameHeightCm:Number(set.default_name_height_cm)||5.5");
// The original per-shirt test composer remains functional; new test/application
// items use the same v2 recipe as the batch composer.
replaceOnce("label:set._path||customizationName(set),quantity,halftone:Boolean(set.halftone),allowInternalNesting:false,rotationPolicy:'none'","label:set._path||customizationName(set),quantity,letteringMetricsVersion:3,spacingMode:'optical',halftone:Boolean(set.halftone),allowInternalNesting:false,rotationPolicy:'none'");
replaceOnce("const items=await filmNestingItems();if(!current())return;",`const locks=lastFilm?.placements.filter(p=>p.locked)||[];
      const changedNames=await upgradeCurrentLettering(current);if(!changedNames||!current())return;
      if(changedNames.size){lastFilm=null;filmCostPanel?.invalidate?.();app.querySelector('#exportFilm').disabled=true;app.querySelector('#saveFilm').disabled=true;saveFilmDraft();}
      const previewsPrepared=await regenerateFilmDraftPreviews();if(!current())return;if(!previewsPrepared)throw new Error(filmDraftNote);
      const items=await filmNestingItems();if(!current())return;`);
replaceOnce("lockedPlacements:lastFilm?.placements.filter(p=>p.locked)||[]","lockedPlacements:locks.filter(p=>!changedNames.has(p.id))");
replaceOnce("      drawFilm(media);app.querySelector('#exportFilm').disabled=false;app.querySelector('#saveFilm').disabled=false;",`      for(const item of filmItems){const control=app.querySelector('.film-item-qty[data-id="'+item.localId+'"]'),line=control?.closest('article')?.querySelector('small');if(line)line.textContent=item.widthCm.toFixed(2)+' × '+item.heightCm.toFixed(2)+' cm'+(item.name?' · corpo letra '+Number(item.nameHeightCm).toLocaleString('pt-BR')+' cm':'')+(item.number?' · corpo número '+Number(item.numberHeightCm).toLocaleString('pt-BR')+' cm':'');}
      drawFilm(media);app.querySelector('#exportFilm').disabled=false;app.querySelector('#saveFilm').disabled=false;`);
replaceOnce("    void refreshOrders();void refreshFilmJobs(media);if(pendingZero19TeamRequest)void safe(()=>consumeZero19TeamRequest());if(pendingZero19AssetRequest)void safe(()=>consumeZero19AssetRequest());filmDraftBanner();if(filmDraftDirty)saveFilmDraft();return true;","    mountFilmTools(media);void refreshOrders();void refreshFilmJobs(media);if(pendingZero19TeamRequest)void safe(()=>consumeZero19TeamRequest());if(pendingZero19AssetRequest)void safe(()=>consumeZero19AssetRequest());filmDraftBanner();if(filmDraftDirty)saveFilmDraft();return true;");
// Cache-bust the whole entry graph, including modules generated by the older
// lettering transform. All processing remains local; no runtime source rewrite.
production=production.replaceAll('2.17.5',version).replaceAll('2.17.8',version);
fs.writeFileSync(path.join(temp,'production-v217.js'),production);
for(const name of ['app.js','index.html'])fs.writeFileSync(path.join(temp,name),fs.readFileSync(path.join(temp,name),'utf8').replaceAll('2.17.5',version).replaceAll('2.17.8',version));
// Refresh relative asset references throughout the local graph (including worker
// imports), not only entry modules. Never rewrite external URLs/vendor versions.
for(const name of fs.readdirSync(temp).filter(name=>/\.(js|html)$/.test(name))){
  const file=path.join(temp,name),source=fs.readFileSync(file,'utf8');
  fs.writeFileSync(file,source.replace(/((?:\.\.?\/|\/)[^\s'"`<>]+\.(?:js|css)\?v=)2\.17\.\d+/g,'$1'+version));
}
production=fs.readFileSync(path.join(temp,'production-v217.js'),'utf8');
const readme=path.join(temp,'README.md');fs.writeFileSync(readme,fs.readFileSync(readme,'utf8')+'\nBuild estático v'+version+': exclusão sem reorganizar, encaixe com comparação de rotação, prévias reutilizadas e TIFF CMYK + Spot local. Primeira impressão deve ser conferida no RIP.\n');
for(const name of ['app.js','production-v217.js','lettering-layout-v2176.js','film-saved-drafts.js','film-preview.js','customization-preparer.js','nesting-core.js','film-edit-core.js','film-tiff-core.js','film-cmyk-converter.js','film-spot-export.js','film-spot-worker.js','network-read.js','asset-preview.js','asset-studio-actions.js','art-studio.js','official-order-workflow.js','storage-upload.js','manual-shirt-catalog.js','zero19-pdv-sync.js'])execFileSync(process.execPath,['--check',name],{cwd:temp,stdio:'inherit'});
// Every deterministic Node test belongs in the release gate. The optional
// private-image comparison is run locally, never copied into the public build.
for(const name of ['validate-static.mjs',...fs.readdirSync(path.join(temp,'scripts')).filter(name=>/^test-.*\.mjs$/.test(name)&&name!=='test-spot-reference.mjs').sort()])execFileSync(process.execPath,['scripts/'+name],{cwd:temp,stdio:'inherit'});
if(!production.includes("segments=[{start:0,end:layout.lengthMm}]"))throw new Error('Regressão: PNG único ausente.');
if(!production.includes("previewQualityVersion=3")||!production.includes("previewTargetPx=1600"))throw new Error('Regressão: prévia de alta qualidade ausente.');
const filmPreview=fs.readFileSync(path.join(temp,'film-preview.js'),'utf8');
if(!filmPreview.includes("data-delete")||!filmPreview.includes("event.key==='Delete'")||!filmPreview.includes('max="400"'))throw new Error('Regressão: exclusão/zoom do filme ausente.');
const spotExport=fs.readFileSync(path.join(temp,'film-spot-export.js'),'utf8');
if(!spotExport.includes("streaming?950:700"))throw new Error('Regressão: orçamento direto-em-disco de 4 GB não foi atualizado.');
const appSource=fs.readFileSync(path.join(temp,'app.js'),'utf8'),studioActions=fs.readFileSync(path.join(temp,'asset-studio-actions.js'),'utf8'),artStudio=fs.readFileSync(path.join(temp,'art-studio.js'),'utf8');
if(!appSource.includes('garment_studio_enabled')||!appSource.includes('Nome do cliente *')||!appSource.includes('Pedidos do cliente'))throw new Error('Regressão: simplificação de clientes v2.17.15 ausente.');
if(!studioActions.includes('garmentEnabled=handlers.garmentEnabled!==false'))throw new Error('Regressão: chave Montar camiseta/3D não está aplicada às ações.');
if(!artStudio.includes('data-size="43" data-back-only')||!artStudio.includes('ctx.isGarmentStudioEnabled?.()'))throw new Error('Regressão: provador v2.17.15 incompleto.');
const filmTools=fs.readFileSync(path.join(root,'scripts/film-v2176-functions.txt'),'utf8');
if(!filmTools.includes('data-clear-film'))throw new Error('Regressão: botão Limpar filme ausente.');
const officialWorkflow=fs.readFileSync(path.join(temp,'official-order-workflow.js'),'utf8');
if(!officialWorkflow.includes('z19p_asset_placements')||!officialWorkflow.includes('openPendingProductionPicker')||!appSource.includes('Pendente de pedido oficial'))throw new Error('Regressão: fluxo de pedido oficial v2.17.17 ausente.');
if(!fs.readFileSync(path.join(temp,'index.html'),'utf8').includes('z19-version" content="'+version+'"'))throw new Error('Versão de saída inválida.');
if(path.resolve(output)!==path.resolve(root,'dist')||path.dirname(output)!==root||fs.existsSync(output)&&fs.lstatSync(output).isSymbolicLink())throw new Error('Diretório de saída inseguro.');
// Keep the directory itself: Windows can hold it as the localhost server cwd.
// Replace generated children only, never the workspace or a resolved symlink.
fs.mkdirSync(output,{recursive:true});
const neverPublish=new Set(['scripts','supabase','.github','versions']);
const publicEntries=fs.readdirSync(temp,{withFileTypes:true}).filter(e=>!neverPublish.has(e.name)&&!e.name.startsWith('.')&&!e.name.endsWith('.md')&&!['vercel.json','package.json'].includes(e.name));
for(const e of publicEntries.sort((a,b)=>Number(a.name==='index.html')-Number(b.name==='index.html'))){const a=path.join(temp,e.name),b=path.join(output,e.name);if(fs.existsSync(b)&&fs.lstatSync(b).isSymbolicLink())throw new Error('Link inseguro na saída: '+e.name);if(e.isDirectory())copy(a,b);else fs.copyFileSync(a,b);}
const names=new Set(publicEntries.map(e=>e.name));for(const entry of fs.readdirSync(output)){if(names.has(entry))continue;const stale=path.resolve(output,entry);if(path.dirname(stale)!==output)throw new Error('Saída inválida.');fs.rmSync(stale,{recursive:true,force:true});}
const hashes={};for(const name of ['app.js','index.html','production-v217.js','lettering-layout-v2176.js','film-saved-drafts.js'])hashes[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(output,name))).digest('hex');
console.log('V21713_VALIDATION_DIR='+temp);
console.log('V21713_OUTPUT_HASHES='+JSON.stringify(hashes));
