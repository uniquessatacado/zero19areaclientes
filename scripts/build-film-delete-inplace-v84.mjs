// 2.17.84 on top of 2.17.83 (28/10, dono: "quando clica em delete com alguma arte selecionada ele buga, não pode
// bugar; tem que deletar e voltar normal sem bug; botão de ver filme onde apertar e mostrar o filme na tela").
// Causa: cada Delete desmontava e montava o filme de novo e TODAS as prévias voltavam a carregar do zero (pisca,
// some tudo e trava em filme grande). Agora o Delete tira só a peça no mesmo filme: as outras artes, o zoom, a
// rolagem e a tela ampliada ficam como estavam. Botão "Ver filme" ao lado de "Atualizar filme" abre o filme na tela.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.83"'))throw new Error('v84 exige a base 2.17.83.');
function patch(name,pairs){
  let source=read(name);
  for(const [before,after] of pairs){const count=source.split(before).length-1;if(count!==1)throw new Error('v84 '+name+': trecho alterado ou ausente ('+count+'): '+before.slice(0,120));source=source.replace(before,after);}
  write(name,source);
}
patch('film-preview.js',[
  [" const api={destroy,getLayout:()=>layout,deleteSelected:removeSelected};",
   " // Delete no mesmo filme: troca só o encaixe e mantém prévias carregadas, zoom, rolagem e tela ampliada.\n"+
   " const applyRemoval=next=>{if(!active()||!next?.placements)return false;layout=next;selected=null;render();markList(false);return true};\n"+
   " const api={destroy,getLayout:()=>layout,deleteSelected:removeSelected,applyRemoval,show:()=>{full(true);shell.focus?.();}};"],
]);
patch('production-v217.js',[
  ["  function removeCurrentFilmEntry(id,media,copy){","  function removeCurrentFilmEntry(id,media,copy,inPlace){"],
  ["    if(lastFilm?.placements.length)drawFilm(media);",
   "    const viewport=app.querySelector('#filmPreview')?._filmViewport;\n    if(lastFilm?.placements.length){if(inPlace&&viewport?.applyRemoval){inPlace(lastFilm);if(!viewport.applyRemoval(lastFilm))drawFilm(media);}else drawFilm(media);}"],
  ["      onDelete:placement=>{if(!current())return false;return removeCurrentFilmEntry(placement.id,media,placement.copy)},",
   "      onDelete:placement=>{if(!current())return false;return removeCurrentFilmEntry(placement.id,media,placement.copy,next=>{shownLayout=next;metrics();})},"],
  ['<button class="btn primary film-action film-action-update" id="calculateFilm">Atualizar filme</button>',
   '<button class="btn primary film-action film-action-update" id="calculateFilm">Atualizar filme</button><button class="btn film-action film-action-view" id="viewFilm" type="button">👁 Ver filme</button>'],
]);
// "Ver filme": abre o filme ampliado na tela; sem filme calculado, leva até a área do filme e avisa.
let production=read('production-v217.js');
production+=`
if(typeof document!=='undefined'&&!globalThis.__z19ViewFilmBound){globalThis.__z19ViewFilmBound=true;document.addEventListener('click',event=>{
  const button=event.target?.closest?.('#viewFilm');if(!button)return;event.preventDefault();
  const preview=document.querySelector('#filmPreview'),viewport=preview?._filmViewport;
  if(viewport?.show){viewport.show();return;}
  preview?.scrollIntoView({behavior:'smooth',block:'center'});
  const note=preview?.querySelector('.empty');if(note){note.textContent='Ainda não tem filme para ver: adicione as artes e toque em Atualizar filme.';note.style.outline='3px solid #ff6428';setTimeout(()=>{note.style.outline=''},1600);}
});}
`;
write('production-v217.js',production);
let css=read('film-production.css');
css+='\n/* 2.17.84 · Ver filme */\n.film-action-view{background:#e0f2fe!important;color:#0c4a6e!important;border-color:#7dd3fc!important;font-weight:900}\n';
write('film-production.css',css);
for(const name of fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n)))write(name,read(name).replace(/\b2\.17\.83\b/g,'2.17.84'));
if(!read('index.html').includes('content="2.17.84"'))throw new Error('v84: versão não foi renovada.');
for(const name of ['production-v217.js','film-preview.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
console.log('019 2.17.84: Delete tira só a peça (sem recarregar o filme) e botão Ver filme.');
