import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Deterministic, checked pre-build transform. No runtime loaders, remote source,
// eval, compressed JS or modifications to the original source checkout.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'z19p-v2178-'));
const output=path.join(root,'dist');
const skip=new Set(['.git','.vercel','node_modules','dist','output','tmp','.agents','.codex']);
function copy(a,b){fs.mkdirSync(b,{recursive:true});for(const e of fs.readdirSync(a,{withFileTypes:true})){if(skip.has(e.name)||e.name.startsWith('.env'))continue;const from=path.join(a,e.name),to=path.join(b,e.name);if(e.isDirectory())copy(from,to);else if(e.isFile())fs.copyFileSync(from,to);}}
copy(root,temp);
let production=fs.readFileSync(path.join(temp,'production-v217.js'),'utf8');
function replaceOnce(before,after){const count=production.split(before).length-1;if(count!==1)throw new Error('Pre-build v2.17.8: trecho alterado ou ausente ('+count+'): '+before.slice(0,100));production=production.replace(before,after);}
replaceOnce("  async function prepareLetteringLayout(item){","  async function prepareLegacyLetteringLayout(item){");
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
replaceOnce("    filmDraftBanner();if(filmDraftDirty)saveFilmDraft();return true;","    mountFilmTools(media);filmDraftBanner();if(filmDraftDirty)saveFilmDraft();return true;");
replaceOnce("supabase.from('z19p_print_jobs').select('*').order('updated_at',{ascending:false}).limit(12)","supabase.from('z19p_print_jobs').select('*').or('settings_snapshot->>kind.is.null,settings_snapshot->>kind.neq.named_film_draft_v1').order('updated_at',{ascending:false}).limit(12)");
// No checkboxes, conversion curves or TIFF/Spot exporter added in this release.
production=production.replaceAll('2.17.5','2.17.8');
fs.writeFileSync(path.join(temp,'production-v217.js'),production);
for(const name of ['app.js','index.html'])fs.writeFileSync(path.join(temp,name),fs.readFileSync(path.join(temp,name),'utf8').replaceAll('2.17.5','2.17.8'));
const readme=path.join(temp,'README.md');fs.writeFileSync(readme,fs.readFileSync(readme,'utf8')+'\nBuild estático v2.17.8: editor do filme com limpeza rápida, Delete/Backspace e prévia nítida; correções 2.17.7 preservadas. TIFF/Spot permanece pendente.\n');
for(const name of ['app.js','production-v217.js','lettering-layout-v2176.js','film-saved-drafts.js','film-preview.js','customization-preparer.js'])execFileSync(process.execPath,['--check',name],{cwd:temp,stdio:'inherit'});
for(const name of ['validate-static.mjs','test-lettering.mjs','test-free-rotation.mjs','test-film-jobs.mjs','test-film-draft.mjs','test-film-cloud-draft.mjs','test-queues.mjs','test-v2176.mjs'])if(fs.existsSync(path.join(temp,'scripts',name)))execFileSync(process.execPath,['scripts/'+name],{cwd:temp,stdio:'inherit'});
if(!production.includes("segments=[{start:0,end:layout.lengthMm}]"))throw new Error('Regressão: PNG único ausente.');
if(!production.includes("previewQualityVersion=3")||!production.includes("previewTargetPx=1600"))throw new Error('Regressão: prévia de alta qualidade ausente.');
const filmPreview=fs.readFileSync(path.join(temp,'film-preview.js'),'utf8');
if(!filmPreview.includes("data-delete")||!filmPreview.includes("event.key==='Delete'")||!filmPreview.includes('max="400"'))throw new Error('Regressão: exclusão/zoom do filme ausente.');
const filmTools=fs.readFileSync(path.join(root,'scripts/film-v2176-functions.txt'),'utf8');
if(!filmTools.includes('data-clear-film'))throw new Error('Regressão: botão Limpar filme ausente.');
if(!fs.readFileSync(path.join(temp,'index.html'),'utf8').includes('z19-version" content="2.17.8"'))throw new Error('Versão de saída inválida.');
fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(output,{recursive:true});
const neverPublish=new Set(['scripts','supabase','.github','versions']);
for(const e of fs.readdirSync(temp,{withFileTypes:true})){if(neverPublish.has(e.name)||e.name.startsWith('.')||e.name.endsWith('.md')||e.name==='vercel.json'||e.name==='package.json')continue;const a=path.join(temp,e.name),b=path.join(output,e.name);if(e.isDirectory())copy(a,b);else fs.copyFileSync(a,b);}
const hashes={};for(const name of ['app.js','index.html','production-v217.js','lettering-layout-v2176.js','film-saved-drafts.js'])hashes[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(output,name))).digest('hex');
console.log('V2178_VALIDATION_DIR='+temp);
console.log('V2178_OUTPUT_HASHES='+JSON.stringify(hashes));
