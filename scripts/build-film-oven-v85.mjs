// 2.17.85 on top of 2.17.84 (28/10, dono):
// - "Arte de empresa" mais visual: quantidade não volta para 1, botões grandes, total grande, tamanho novo avisado
//   (film-picker.js + qr-screens.css, no código-fonte).
// - Subir arte: pasta pronta para impressão já escolhida, vincular a pedido pendente (número, nome ou WhatsApp) e
//   "Voltar para o filme" (app.js, no código-fonte).
// - Filme: largura usada (cm e px a 300 DPI) e "Linha do forno" (faixas de até 38 cm sem arte cruzando).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.84"'))throw new Error('v85 exige a base 2.17.84.');
if(!fs.existsSync(path.join(dist,'film-oven-cuts.js'))||!read('film-picker.js').includes('typedQuantities')||!read('app.js').includes('function defaultReadyFolderId()'))throw new Error('v85: arquivos-fonte novos ausentes no dist.');
function patch(name,pairs){let source=read(name);for(const [before,after] of pairs){const count=source.split(before).length-1;if(count!==1)throw new Error('v85 '+name+': trecho alterado ou ausente ('+count+'): '+before.slice(0,120));source=source.replace(before,after);}write(name,source);}
const band="(filmSettings.ovenBandCm||38)*10";
patch('production-v217.js',[
  ["'<label class=\"film-free-rotation\"><span><input id=\"filmFreeRotation\" type=\"checkbox\"> Otimizar com rotação livre</span><small>Busca adicional a cada 30° · sem mudar as medidas</small></label>'",
   "'<label class=\"film-free-rotation\"><span><input id=\"filmFreeRotation\" type=\"checkbox\"> Otimizar com rotação livre</span><small>Busca adicional a cada 30° · sem mudar as medidas</small></label><label class=\"film-oven-line\"><span><input id=\"filmOvenLine\" type=\"checkbox\"> ✂ Linha do forno · cortar a cada <input id=\"filmOvenBand\" type=\"number\" min=\"10\" max=\"38\" step=\"1\" value=\"38\" aria-label=\"Tamanho máximo de cada pedaço em cm\"> cm</span><small>Deixa uma linha sem nenhuma arte para cortar o filme e pôr no forno de 40 cm. A linha só aparece na tela.</small></label>'"],
  ["freeControl.checked=Boolean(filmSettings.freeRotation);",
   "freeControl.checked=Boolean(filmSettings.freeRotation);const ovenControl=app.querySelector('#filmOvenLine'),ovenBand=app.querySelector('#filmOvenBand');ovenControl.checked=Boolean(filmSettings.ovenLine);ovenBand.value=String(filmSettings.ovenBandCm||38);"+
   "const ovenApply=()=>{const bandCm=Math.max(10,Math.min(38,Number(String(ovenBand.value).replace(',','.'))||38));ovenBand.value=String(bandCm);filmSettings={...filmSettings,ovenLine:ovenControl.checked,ovenBandCm:bandCm};if(lastFilm?.placements?.length){filmCalculationGeneration++;lastFilm=ovenControl.checked?applyOvenCuts(lastFilm,{bandMm:bandCm*10}):{...lastFilm,ovenCutsMm:[],ovenTooTall:[]};drawFilm(media);ctx.toast(ovenControl.checked?'Linha do forno no filme: nenhuma arte cruza a linha de corte.':'Linha do forno desligada.','ok');}saveFilmDraft();};ovenControl.onchange=ovenApply;ovenBand.onchange=()=>{if(ovenControl.checked)ovenApply();else{filmSettings={...filmSettings,ovenBandCm:Math.max(10,Math.min(38,Number(ovenBand.value)||38))};saveFilmDraft();}};"],
  ["freeControl.closest('.film-free-rotation')])advanced","freeControl.closest('.film-free-rotation'),app.querySelector('.film-oven-line')])advanced"],
  ["result.maskFallbackCount=items.filter(i=>i.maskUnavailable).length;lastFilm=result;",
   "result.maskFallbackCount=items.filter(i=>i.maskUnavailable).length;lastFilm=filmSettings.ovenLine?applyOvenCuts(result,{bandMm:"+band+",gapMm:gap}):result;"],
  ["ui.finish(result.nestingSearchLimited?'Melhor encaixe validado mantido; busca adicional limitada.':'Otimização concluída.');return valid()?result:null;",
   "ui.finish(result.nestingSearchLimited?'Melhor encaixe validado mantido; busca adicional limitada.':'Otimização concluída.');return valid()?(filmSettings.ovenLine?applyOvenCuts(result,{bandMm:"+band+"}):result):null;"],
  ['<span><small>Filme</small><b>${shownLayout.filmWidthMm/10} cm</b></span>',
   '<span><small>Filme</small><b>${shownLayout.filmWidthMm/10} cm</b></span><span class="film-used-width"><small>Largura usada</small><b>${usedFilmWidth(shownLayout).cm.toLocaleString(\'pt-BR\')} cm</b><em>${usedFilmWidth(shownLayout).px.toLocaleString(\'pt-BR\')} de ${usedFilmWidth(shownLayout).filmPx.toLocaleString(\'pt-BR\')} px · 300 DPI</em></span>${shownLayout.ovenCutsMm?.length?`<span class="film-oven-metric"><small>Linha do forno</small><b>${shownLayout.ovenCutsMm.length+1} pedaços</b><em>até ${(shownLayout.ovenBandMm||380)/10} cm cada</em></span>`:\'\'}'],
]);
let production=read('production-v217.js');production="import {applyOvenCuts,usedFilmWidth} from './film-oven-cuts.js?v=2.17.85';\n"+production;write('production-v217.js',production);
patch('film-preview.js',[
  ['ruler.textContent=`${cm(layout.filmWidthMm)} cm × ${cm(layout.lengthMm)} cm · ${layout.placements.length} cópias`;',
   'const usedMm=layout.placements.length?Math.max(...layout.placements.map(p=>p.xMm+p.widthMm)):0;ruler.textContent=`${cm(layout.filmWidthMm)} cm × ${cm(layout.lengthMm)} cm · ${layout.placements.length} cópias · usando ${cm(usedMm)} cm (${Math.round(usedMm/25.4*300).toLocaleString(\'pt-BR\')} px)`;'],
  ["}for(const [k,n] of nodeMap)if(!aliveKeys.has(k)){n.remove();nodeMap.delete(k);}media.sync([...nodeMap.values()]);selection();",
   "}for(const [k,n] of nodeMap)if(!aliveKeys.has(k)){n.remove();nodeMap.delete(k);}"+
   "sheet.querySelectorAll('.film-oven-cut').forEach(n=>n.remove());(layout.ovenCutsMm||[]).forEach((y,i)=>{const crossed=layout.placements.some(p=>p.yMm<y-.01&&p.yMm+p.heightMm>y+.01),line=doc.createElement('div');line.className='film-oven-cut'+(crossed?' is-crossed':'');line.style.top=(y*s)+'px';line.setAttribute('aria-hidden','true');line.innerHTML='<span>✂ Forno · corte '+(i+1)+' · '+cm(y)+' cm'+(crossed?' · arte em cima da linha: Atualizar filme':'')+'</span>';sheet.append(line);});"+
   "media.sync([...nodeMap.values()]);selection();"],
]);
let css=read('film-production.css');
css+='\n/* 2.17.85 · linha do forno e largura usada */\n.film-oven-cut{position:absolute;left:-6px;right:-6px;height:0;border-top:3px dashed #ef4444;z-index:4;pointer-events:none}.film-oven-cut span{position:absolute;right:6px;top:-24px;padding:3px 9px;border-radius:999px;background:#ef4444;color:#fff;font:900 11px/1.4 Arial,sans-serif;white-space:nowrap;box-shadow:0 2px 8px #0005}.film-oven-cut.is-crossed{border-top-color:#f59e0b}.film-oven-cut.is-crossed span{background:#b45309}\n.film-oven-line{display:flex;flex-direction:column;gap:3px;padding:10px 12px;border:2px solid #fecaca;border-radius:14px;background:#fff1f2}.film-oven-line span{display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-weight:900;color:#7f1d1d}.film-oven-line input[type=number]{width:64px;height:36px;border:2px solid #fca5a5;border-radius:10px;text-align:center;font-weight:900;font-size:15px}.film-oven-line small{color:#991b1b}\n.film-used-width b,.film-oven-metric b{color:#0f766e}.film-used-width em,.film-oven-metric em{display:block;font-style:normal;font-size:11px;opacity:.8}\n';
write('film-production.css',css);
for(const name of fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n)))write(name,read(name).replace(/\b2\.17\.84\b/g,'2.17.85'));
if(!read('index.html').includes('content="2.17.85"'))throw new Error('v85: versão não foi renovada.');
for(const name of ['production-v217.js','film-preview.js','film-oven-cuts.js','film-picker.js','app.js','zero19-pdv-sync.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/test-film-oven-cuts.mjs'],{cwd:root,stdio:'inherit'});
console.log('019 2.17.85: Arte de empresa mais visual, subir arte com pasta pronta/pedido/voltar ao filme, largura usada e linha do forno.');
