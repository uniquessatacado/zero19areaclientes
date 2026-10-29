// 2.17.87 on top of 2.17.86 (29/10, dono: "na montagem do filme permita eu girar a arte que está no filme apertando
// botão girar e então a arte que está selecionada gira"). A rotação já existia, mas escondida em "Editar arte
// selecionada" (fechado) e só por ângulo. Agora a barra do filme tem "↻ Girar" (também na tela ampliada e no
// celular, e a tecla R): gira a arte selecionada 90° no sentido do relógio. Se girada ela não cabe onde está, vai para
// o lugar livre mais perto (pode ir para o fim do filme). Medidas não mudam; arte travada não gira.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.86"'))throw new Error('v87 exige a base 2.17.86.');
function patch(name,pairs){let source=read(name);for(const [before,after] of pairs){const count=source.split(before).length-1;if(count!==1)throw new Error('v87 '+name+': trecho alterado ou ausente ('+count+'): '+before.slice(0,120));source=source.replace(before,after);}write(name,source);}
patch('film-preview.js',[
  ['<button type="button" class="btn" data-minus aria-label="Diminuir zoom">−</button>',
   '<button type="button" class="btn film-rotate-selected" data-rotate-selected disabled title="Selecione uma arte no filme (tecla R)">↻ Girar</button><button type="button" class="btn" data-minus aria-label="Diminuir zoom">−</button>'],
  ["function selection(){const p=placement(),details=get('.film-selection-details');",
   "function selection(){const p=placement(),details=get('.film-selection-details'),turn=bar.querySelector('[data-rotate-selected]');turn.disabled=!p||busy||!!p.locked;turn.title=!p?'Selecione uma arte no filme (tecla R)':p.locked?'Arte travada: destrave para girar':'Girar a arte selecionada 90° (tecla R)';"],
  ["function setBusy(value){busy=value;",
   "function setBusy(value){busy=value;if(value)bar.querySelector('[data-rotate-selected]').disabled=true;"],
  // Girar procura o lugar livre mais perto (o filme pode crescer no fim) em vez de recusar quando encosta em outra arte.
  ["void attempt(layout.placements.map(q=>key(q)===selected?{...q,...b,rotation:r,sourceWidthMm:d.w,sourceHeightMm:d.h,xMm:Math.max(0,Math.min(q.xMm,Math.floor((layout.filmWidthMm-b.widthMm)/(layout.cellMm||2))*(layout.cellMm||2)))}:{...q}),null,r%90?{allowFreeRotation:true}:{});}",
   "return attempt(layout.placements.map(q=>key(q)===selected?{...q,...b,rotation:r,sourceWidthMm:d.w,sourceHeightMm:d.h,xMm:Math.max(0,Math.min(q.xMm,Math.floor((layout.filmWidthMm-b.widthMm)/(layout.cellMm||2))*(layout.cellMm||2)))}:{...q}),{id:p.id,copy:p.copy},{...(r%90?{allowFreeRotation:true}:{}),growMm:b.heightMm+(layout.gapMm||0)});}\n"+
   " function turnSelected(){const p=placement();if(!p||busy||!active())return;if(p.locked)return message('Arte travada: destrave para girar.',true);const k=selected,current=Number(p.rotation)||0,angles={'90':[0,90],'180':[0,180]}[itemMap.get(p.id)?.rotationPolicy]||[0,90,180,270],r=angles.find(a=>a>current)??angles[0];Promise.resolve(rotate(r)).then(()=>{const now=placement();if(!active()||selected!==k||!now||Number(now.rotation)!==r)return;message('Arte girada para '+r+'°. Medidas preservadas.');nodeMap.get(k)?.scrollIntoView?.({block:'nearest',inline:'nearest'});});}\n"+
   " bar.querySelector('[data-rotate-selected]').onclick=turnSelected;"],
  ["const keyboard=e=>{",
   "const keyboard=e=>{if((e.key==='r'||e.key==='R')&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.defaultPrevented&&!e.repeat&&active()&&placement()&&!e.target?.closest?.('input,textarea,select,[contenteditable]')&&!doc.querySelector('.modal-backdrop:not([hidden])')){e.preventDefault();turnSelected();return;}"],
  ["<span data-help role=\"status\">Deslize dentro do filme. Para editar, toque na arte e abra os controles.</span>",
   "<span data-help role=\"status\">Deslize dentro do filme. Toque numa arte e use ↻ Girar; outros ajustes em Editar arte selecionada.</span>"],
]);
patch('production-v217.js',[
  ["result=await runNesting(items,{...settings,operation:'move',placements,moving,lengthMm:snapshot.lengthMm});",
   "result=await runNesting(items,{...settings,operation:'move',placements,moving,lengthMm:snapshot.lengthMm+Math.max(0,Number(validationOptions.growMm)||0)});"],
]);
let css=read('film-v74.css');
css+='\n/* 2.17.87 · Girar arte selecionada */\nbody .film-page .film-view-toolbar .film-rotate-selected{background:#ede9fe!important;color:#4c1d95!important;border-color:#c4b5fd!important;font-weight:900}\nbody .film-page .film-view-toolbar .film-rotate-selected:disabled{opacity:.55}\n/* barra em 6 colunas: Girar, − e + dividem a última linha */\nbody .film-page .film-view-toolbar :is([data-rotate-selected],[data-minus],[data-plus]){grid-column:span 2}\n';
write('film-v74.css',css);
for(const name of fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n)))write(name,read(name).replace(/\b2\.17\.86\b/g,'2.17.87'));
if(!read('index.html').includes('content="2.17.87"'))throw new Error('v87: versão não foi renovada.');
for(const name of ['production-v217.js','film-preview.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
console.log('019 2.17.87: botão Girar na barra do filme gira a arte selecionada.');
