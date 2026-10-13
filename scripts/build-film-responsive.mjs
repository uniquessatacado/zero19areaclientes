// Checked extension of 2.17.72. Tests exercise the FINAL compiled solver.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
function patch(source,before,after){if(source.split(before).length!==2)throw new Error('Âncora da correção responsiva mudou: '+before.slice(0,80));return source.replace(before,after);}
function update(name,fn){const p=path.join(dist,name);fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));}
if(!fs.readFileSync(path.join(dist,'index.html'),'utf8').includes('content="2.17.72"'))throw new Error('Exige base 2.17.72.');
update('nesting-core.js',s=>{
 s="import {preferBatchNesting,nestBatchRectangles,validateRectangularFilm} from './nesting-batch-core.js?v=2.17.73';\n"+s;
 const mark='export function validateFilmPlacements(items,placements,options={}){';
 s=patch(s,mark,mark+"\n  if(preferBatchNesting(items)){const rectangular=validateRectangularFilm(items,placements,options);if(rectangular)return rectangular;}\n");
 s=patch(s,'  const settings={...normalized,lockedPlacements};','  if(preferBatchNesting(items)||options.quickPacking===true){let batch=nestBatchRectangles(items,options);if(batch){if(!lockedPlacements.length){const alternatives=rectangleCandidates(expanded,{...normalized,lockedPlacements},[]);for(const candidate of alternatives.results)if(candidate.lengthMm<batch.lengthMm-EPSILON){const checked=validateRectangularFilm(items,candidate.placements,options);if(checked)batch={...checked,batchOptimized:true};}}return batch;}}\n  const settings={...normalized,lockedPlacements};');
 s=patch(s,"catch(error){if(!winner)throw error;winner={...winner,nestingSearchLimited:true,nestingSearchWarning:error.message};}","catch(error){if(!winner){const fallback=nestBatchRectangles(items,options);if(fallback)return {...fallback,nestingSearchLimited:true,nestingSearchWarning:'Encaixe retangular completo validado; busca por contornos limitada.'};throw error;}winner={...winner,nestingSearchLimited:true,nestingSearchWarning:error.message};}");
 return s;
});
update('production-v217.js',s=>{
 s="import {installFilmPageMobile} from './film-mobile-ui.js?v=2.17.73';\n"+s;
 s=patch(s,"    const page=app.querySelector('.film-page'),pageCurrent=", "    installFilmPageMobile(app.querySelector('.film-page'));\n    const page=app.querySelector('.film-page'),pageCurrent=");
 s=patch(s,'async function filmNestingItems(){return','async function filmNestingItems(){const rectanglesOnly=filmItems.reduce((n,i)=>n+Number(i.quantity||1),0)>=100;return');
 s=patch(s,'mask:await maskForItem(item)','mask:rectanglesOnly?null:await maskForItem(item)');
 s=patch(s,"button.disabled=true;button.textContent='Preparando imagens…';", "button.disabled=true;button.textContent='1/3 · Conferindo artes…';for(const selector of ['#exportFilm','#saveFilm']){const b=app.querySelector(selector);if(b)b.disabled=true;}const calculationMetrics=app.querySelector('#filmMetrics');if(calculationMetrics)calculationMetrics.textContent='1/3 · Conferindo as medidas das artes. Os itens estão preservados.';");
 s=patch(s,"button.textContent='Calculando encaixe…';", "button.textContent='2/3 · Encaixando…';if(calculationMetrics)calculationMetrics.textContent='2/3 · Organizando todas as cópias, sem reduzir o tamanho das estampas.';");
 s=patch(s,"      const previewsReady=await regenerateFilmDraftPreviews();", "      button.textContent='3/3 · Abrindo filme…';if(calculationMetrics)calculationMetrics.textContent='3/3 · Encaixe pronto. Abrindo medidas e visualização.';\n      const previewsReady=await regenerateFilmDraftPreviews();");
 s=patch(s,"<small>Aproveitamento aprox.</small>","<small>${shownLayout.efficiencyBasis==='bounding-box'?'Ocupação dos retângulos':'Aproveitamento aprox.'}</small>");
 s=patch(s,"${shownLayout.mode==='maximum'?'Máximo':'Normal'}</b></span>","${shownLayout.batchOptimized?'Lote rápido':shownLayout.mode==='maximum'?'Máximo':'Normal'}</b></span><span><small>Cópias no filme</small><b>${shownLayout.placements.length}</b></span>${shownLayout.batchOptimized?'<small class=\"film-layout-note\">Todas as cópias encaixadas. Medidas e espaçamento preservados; sem busca pesada dentro dos contornos.</small>':''}");
 return s;
});
update('film-preview.js',s=>{
 s="import {filmViewportScale,attachFilmViewport} from './film-mobile-ui.js?v=2.17.73';\n"+s;
 s=patch(s,"  let selected=null,zoom=1,background='check'", "  element._filmViewport?.destroy?.();\n  let overview=false;\n  let selected=null,zoom=1,background='check'");
 s=patch(s,"element.parentElement.insertAdjacentElement('afterend',inspector);","element.parentElement.insertAdjacentElement('beforebegin',inspector);");
 s=patch(s,"scale=()=>Math.min(1.2,700/layout.filmWidthMm)*zoom;","scale=()=>filmViewportScale(element,layout,zoom,overview);");
 s=patch(s,'min="70" max="400"','min="20" max="400"');
 s=patch(s,'draggable="false" decoding="async"','draggable="false" loading="lazy" decoding="async"');
 s=patch(s,"get('[data-zoom]').oninput=event=>{zoom=Number(event.target.value)/100;render()};","get('[data-zoom]').oninput=event=>{overview=false;zoom=Number(event.target.value)/100;render()};");
 s=patch(s,'  render();return {getLayout:()=>layout,deleteSelected:removeSelected};',`  const viewport=attachFilmViewport({element,inspector,getLayout:()=>layout,render,setView:value=>{zoom=value.zoom;overview=value.overview;get('[data-zoom]').value=String(zoom*100);render();}});
  render();return {getLayout:()=>layout,deleteSelected:removeSelected,destroy:()=>viewport.destroy()};`);
 return s;
});
update('film-mobile.css',s=>s+`
body .film-page .film-inspector{background:#f8fafc;color:#0f172a;border-color:#cbd5e1}
body .film-page .film-inspector :is(label,small,[data-help]){color:#475569}
body .film-page .film-inspector :is(input,select){background:#fff;color:#0f172a;border-color:#cbd5e1}
body .film-page .film-selection-controls{background:#f1f5f9;color:#0f172a;border-color:#cbd5e1}
body .film-page .film-expanded-view .film-export-actions::before{display:none}
body .film-page .film-expanded-view #exportFilm,body .film-page .film-expanded-view #saveFilm{flex:1 1 0!important;min-width:0;min-height:44px!important;padding:8px!important;font-size:13px!important}
`);
update('index.html',s=>patch(s,'</head>','  <link rel="stylesheet" href="/film-mobile.css?v=2.17.73">\n</head>'));
for(const name of fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n)))update(name,s=>s.replace(/\b2\.17\.72\b/g,'2.17.73'));
for(const name of ['nesting-core.js','nesting-batch-core.js','production-v217.js','film-preview.js','film-mobile-ui.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
execFileSync(process.execPath,[path.join(root,'scripts/verify-film-responsive.mjs'),dist],{stdio:'inherit'});
// Re-run existing algorithm regressions against the final compiled code.
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'z19-responsive-'));
for(const name of ['test-nesting-efficiency.mjs','test-free-rotation.mjs','test-nesting-rotated-pairs.mjs']){const source=fs.readFileSync(path.join(root,'scripts',name),'utf8').replace(/(['"])\.\.\/nesting-core\.js\1/g,JSON.stringify(pathToFileURL(path.join(dist,'nesting-core.js')).href));const p=path.join(temp,name);fs.writeFileSync(p,source);execFileSync(process.execPath,[p],{cwd:root,stdio:'inherit'});}
fs.rmSync(temp,{recursive:true,force:true});
console.log('019 2.17.73: encaixe completo de lotes, medidas, validador, prévia responsiva e visualização ampliada verificados.');
