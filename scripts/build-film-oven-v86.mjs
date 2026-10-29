// 2.17.86 on top of 2.17.85 (28/10, dono: "a linha está fazendo sobrar muito espaço no filme; tem que usar a linha
// quando ativa mas não pode perder espaço"). Antes a linha era posta DEPOIS do encaixe, empurrando para baixo a arte
// que cruzava e tudo abaixo (buraco a cada corte). Agora o encaixe já respeita a linha (ovenBandMm em
// nesting-core.js e nesting-batch-core.js, no código-fonte), cada faixa sobe até a de cima e as linhas ficam onde não
// há arte (film-oven-cuts.js). Ligar/desligar a linha encaixa o filme de novo; arrastar não deixa parar em cima da linha.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.85"'))throw new Error('v86 exige a base 2.17.85.');
if(!read('nesting-core.js').includes('function ovenBandRects(')||!read('nesting-batch-core.js').includes('function ovenBandRects(')||!read('film-oven-cuts.js').includes('function compactBands('))throw new Error('v86: encaixe com a linha do forno ausente no dist.');
function patch(name,pairs){let source=read(name);for(const [before,after] of pairs){const count=source.split(before).length-1;if(count!==1)throw new Error('v86 '+name+': trecho alterado ou ausente ('+count+'): '+before.slice(0,120));source=source.replace(before,after);}write(name,source);}
const oven="ovenBandMm:filmSettings.ovenLine?(filmSettings.ovenBandCm||38)*10:0";
patch('production-v217.js',[
  // Atualizar filme e Otimizar espaços: o encaixe já respeita a linha.
  ["lockedPlacements:locks.filter(p=>!changedNames.has(p.id)),baselinePlacements:lastFilm?.placements||[]});",
   "lockedPlacements:locks.filter(p=>!changedNames.has(p.id)),baselinePlacements:lastFilm?.placements||[],"+oven+"});"],
  ["freeRotation:snapshot.freeRotation,angleStep:snapshot.angleStep,lockedPlacements,baselinePlacements:snapshot.placements};",
   "freeRotation:snapshot.freeRotation,angleStep:snapshot.angleStep,lockedPlacements,baselinePlacements:snapshot.placements,"+oven+"};"],
  // Arrastar/girar: não para em cima das linhas da tela; as linhas acompanham (sem subir as faixas).
  ["cellMm:snapshot.cellMm||2,freeRotation:validationOptions.allowFreeRotation===true?true:snapshot.freeRotation,angleStep:snapshot.angleStep};",
   "cellMm:snapshot.cellMm||2,freeRotation:validationOptions.allowFreeRotation===true?true:snapshot.freeRotation,angleStep:snapshot.angleStep,ovenBandMm:snapshot.ovenCutsMm?.length&&!snapshot.ovenCrossed?snapshot.ovenBandMm:0,ovenCutsMm:snapshot.ovenCutsMm||[]};"],
  ["return valid()?result:null;",
   "return valid()?(filmSettings.ovenLine&&snapshot.ovenBandMm?applyOvenCuts(result,{bandMm:snapshot.ovenBandMm,gapMm:snapshot.gapMm,compact:false}):result):null;"],
  // Ligar, desligar ou mudar o tamanho do pedaço encaixa o filme de novo (antes só empurrava as artes).
  ["if(lastFilm?.placements?.length){filmCalculationGeneration++;lastFilm=ovenControl.checked?applyOvenCuts(lastFilm,{bandMm:bandCm*10}):{...lastFilm,ovenCutsMm:[],ovenTooTall:[]};drawFilm(media);ctx.toast(ovenControl.checked?'Linha do forno no filme: nenhuma arte cruza a linha de corte.':'Linha do forno desligada.','ok');}saveFilmDraft();",
   "if(lastFilm?.placements?.length){filmCalculationGeneration++;lastFilm=ovenControl.checked?applyOvenCuts(lastFilm,{bandMm:bandCm*10,compact:false}):{...lastFilm,ovenCutsMm:[],ovenTooTall:[],ovenCrossed:0};drawFilm(media);saveFilmDraft();const recalc=app.querySelector('#calculateFilm');if(recalc&&!recalc.disabled){ctx.toast(ovenControl.checked?'Linha do forno: encaixando de novo em pedaços de até '+bandCm+' cm, sem perder espaço.':'Linha do forno desligada: encaixando de novo.','ok');recalc.click();}}else saveFilmDraft();"],
  ["Deixa uma linha sem nenhuma arte para cortar o filme e pôr no forno de 40 cm. A linha só aparece na tela.",
   "Encaixa em pedaços de até 38 cm com uma linha sem arte entre eles, sem perder filme (só a distância normal entre artes). Para o forno de 40 cm; a linha só aparece na tela."],
]);
patch('film-preview.js',[
  ["(crossed?' · arte em cima da linha: Atualizar filme':'')",
   "(crossed?((layout.ovenTooTall||[]).length&&layout.placements.some(p=>layout.ovenTooTall.includes(p.id)&&p.yMm<y-.01&&p.yMm+p.heightMm>y+.01)?' · arte maior que o pedaço':' · arte em cima da linha: Atualizar filme'):'')"],
]);
for(const name of fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n)))write(name,read(name).replace(/\b2\.17\.85\b/g,'2.17.86'));
if(!read('index.html').includes('content="2.17.86"'))throw new Error('v86: versão não foi renovada.');
for(const name of ['nesting-core.js','nesting-batch-core.js'])if(!read(name).includes("from './film-oven-cuts.js?v=2.17.86'"))throw new Error('v86: '+name+' não importa a linha do forno desta versão.');
for(const name of ['production-v217.js','film-preview.js','film-oven-cuts.js','nesting-core.js','nesting-batch-core.js','nesting-worker.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
// O teste roda no encaixe FINAL do dist (com as camadas de lote e contorno).
execFileSync(process.execPath,['scripts/test-film-oven-cuts.mjs',path.join(dist,'nesting-core.js')],{cwd:root,stdio:'inherit'});
console.log('019 2.17.86: linha do forno sem perder filme (encaixe por pedaços de até 38 cm).');
