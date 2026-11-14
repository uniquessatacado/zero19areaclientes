// 2.17.99 on top of 2.17.98 (14/11, dono): Montar filme organizado (barra nova: configuração, principais sempre à vista, categorias; Arte de
// empresa → Biblioteca de artes, Personalização → Fontes de time) e "Estampas do site · halftone" (baixar PNG em alta e trocar pela versão
// halftone; vale para os pedidos novos e para os que esperam). Arte de empresa no celular (film-picker-mobile.css).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.98"'))throw new Error('v99 exige a base 2.17.98.');
const files99=['film-toolbar.js','film-toolbar.css','film-site-prints.js','film-site-prints.css','film-picker-mobile.css'];
for(const name of files99)if(!fs.existsSync(path.join(dist,name)))throw new Error('v99: '+name+' não foi copiado para o dist.');
function patch(name,pairs){let source=read(name);for(const [before,after,times=1] of pairs){const count=source.split(before).length-1;if(count!==times)throw new Error('v99 '+name+': trecho alterado ou ausente ('+count+'×): '+before.slice(0,90));source=source.split(before).join(after);}write(name,source);}
patch('production-v217.js',[
  ["import {installDtfStaff,dtfFilmButtonHTML,bindDtfFilm} from './dtf-staff.js?v=2.17.98';",
   "import {installDtfStaff,dtfFilmButtonHTML,bindDtfFilm} from './dtf-staff.js?v=2.17.98';\nimport {installFilmToolbar} from './film-toolbar.js?v=2.17.98';\nimport {openSitePrints} from './film-site-prints.js?v=2.17.98';\ninstallFilmToolbar();"],
  ['<button class="btn film-action film-action-art" id="openVectorizer" type="button">✨ Vetorizar arte</button>',
   '<button class="btn film-action film-action-art" id="openVectorizer" type="button">✨ Vetorizar arte</button><button class="btn film-action" id="openSitePrints" type="button">🖨 Estampas do site · halftone</button>'],
  ["app.querySelector('#openFilmKits').onclick=()=>safe(()=>openKitsForFilm(profiles,assetMap,refreshItems));",
   "app.querySelector('#openFilmKits').onclick=()=>safe(()=>openKitsForFilm(profiles,assetMap,refreshItems));app.querySelector('#openSitePrints')?.addEventListener('click',()=>openSitePrints({supabase,toast:(m,k)=>ctx.toast(m,k),owner:()=>String(owner()||'')}));"],
]);
// Arte de empresa no celular: o CSS novo vem depois do film-picker.css.
patch('index.html',[['<link rel="stylesheet" href="/film-picker.css?v=2.17.98">','<link rel="stylesheet" href="/film-picker.css?v=2.17.98">\n  <link rel="stylesheet" href="/film-picker-mobile.css?v=2.17.98">']]);
const files=fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n));
(function walk(dir){for(const e of fs.readdirSync(path.join(dist,dir),{withFileTypes:true})){const rel=path.join(dir,e.name);if(e.isDirectory())walk(rel);else if(/\.(js|css)$/.test(e.name))files.push(rel);}})('vetor');
for(const name of files)write(name,read(name).replace(/\b2\.17\.98\b/g,'2.17.99'));
if(!read('index.html').includes('content="2.17.99"'))throw new Error('v99: versão não foi renovada.');
for(const name of ['production-v217.js','film-toolbar.js','film-site-prints.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
console.log('019 2.17.99: Montar filme organizado (barra nova), Estampas do site · halftone e Biblioteca de artes no celular.');
