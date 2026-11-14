// 2.17.97 on top of 2.17.96 (13/11, dono): área do cliente "DTF por metro".
// "crie um acesso para clientes onde o cliente pode adicionar artes tipo em um filme deles, mas simplificado; no 019 eu cadastro
// o cliente, ele sobe a arte e adiciona no filme e pode enviar para produção na ZERO19; no meu Montar filme mostra que um
// cliente mandou o filme; eu adiciono as artes dele no meu filme e posso mexer; preço do metro 58 × 100 e 28 × 100".
// (1) Página do cliente: dtf.html (/dtf), dtf-portal.js/css, dtf-tips.js (balões de ajuda), dtf-pricing.js, dtf-upload.js
//     (corte da sobra + 300 DPI, PNG grande e PDF), dtf-nest.js (o mesmo encaixe do Montar filme).
// (2) Montar filme: botão "🎞 Pedidos DTF metro" com contador e aviso de pedido novo; "Pôr no meu filme" coloca cada arte do
//     pedido como item próprio do filme (medida e quantidade do cliente, editável).
// (3) Menu lateral: "🎞 Clientes DTF metro" (cadastro, preços, cobrança, link de acesso). Só na conta da ZERO19.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.96"'))throw new Error('v97 exige a base 2.17.96.');
const files97=['dtf.html','dtf-portal.js','dtf-portal.css','dtf-staff.js','dtf-staff.css','dtf-tips.js','dtf-pricing.js','dtf-upload.js','dtf-nest.js'];
for(const name of files97)if(!fs.existsSync(path.join(dist,name)))throw new Error('v97: '+name+' não foi copiado para o dist.');
function patch(name,pairs){let source=read(name);for(const [before,after,times=1] of pairs){const count=source.split(before).length-1;if(count!==times)throw new Error('v97 '+name+': trecho alterado ou ausente ('+count+'×): '+before.slice(0,90));source=source.split(before).join(after);}write(name,source);}

patch('production-v217.js',[
  ["import {addKitToFilm,createFilmKitStore,filmKitBarsHTML,filmKitGroups,openFilmKits,setFilmKitCount} from './film-kits.js?v=2.17.96';",
   "import {addKitToFilm,createFilmKitStore,filmKitBarsHTML,filmKitGroups,openFilmKits,setFilmKitCount} from './film-kits.js?v=2.17.96';\nimport {installDtfStaff,dtfFilmButtonHTML,bindDtfFilm} from './dtf-staff.js?v=2.17.96';"],
  ["  const uid=()=>state().session?.user?.id;\n",
   "  const uid=()=>state().session?.user?.id;\n  installDtfStaff({supabase,toast:(m,k)=>ctx.toast(m,k),nav:p=>ctx.nav(p),owner});\n"],
  ['id="openFilmKits">🧩 Kits de camisa</button>','id="openFilmKits">🧩 Kits de camisa</button>${dtfFilmButtonHTML()}'],
  ["app.querySelector('#openFilmKits').onclick=()=>safe(()=>openKitsForFilm(profiles,assetMap,refreshItems));",
   "app.querySelector('#openFilmKits').onclick=()=>safe(()=>openKitsForFilm(profiles,assetMap,refreshItems));bindDtfFilm(async items=>{if(!pageCurrent())return;filmItems.push(...items);await refreshItems();});"],
]);
patch('app.js',[
  ["import { createProductionModule } from './production-v217.js?v=2.17.96';",
   "import { createProductionModule } from './production-v217.js?v=2.17.96';\nimport { dtfMenuButtonHTML } from './dtf-staff.js?v=2.17.96';"],
  ['<button class="${active(\'/vetorizar\')}" data-nav="/vetorizar">✨ Vetorizar arte</button>',
   '<button class="${active(\'/vetorizar\')}" data-nav="/vetorizar">✨ Vetorizar arte</button>${dtfMenuButtonHTML()}'],
]);

// /dtf abre a área do cliente (o link que a equipe manda).
const vercelPath=path.join(root,'vercel.json'),vercel=JSON.parse(fs.readFileSync(vercelPath,'utf8'));
if(!(vercel.rewrites||[]).some(r=>r.source==='/dtf'))throw new Error('v97: vercel.json sem o atalho /dtf → /dtf.html.');

const files=fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n));
(function walk(dir){for(const e of fs.readdirSync(path.join(dist,dir),{withFileTypes:true})){const rel=path.join(dir,e.name);if(e.isDirectory())walk(rel);else if(/\.(js|css)$/.test(e.name))files.push(rel);}})('vetor');
for(const name of files)write(name,read(name).replace(/\b2\.17\.96\b/g,'2.17.97'));
if(!read('index.html').includes('content="2.17.97"'))throw new Error('v97: versão não foi renovada.');
for(const name of ['dtf-portal.js','dtf-upload.js','dtf-staff.js','dtf.html'])if(!read(name).includes('?v=2.17.97'))throw new Error('v97: versão dos módulos do DTF não foi renovada em '+name+'.');
for(const name of ['app.js','production-v217.js',...files97.filter(n=>n.endsWith('.js'))])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/test-dtf-meter.mjs'],{cwd:root,stdio:'inherit'});
console.log('019 2.17.97: DTF por metro (área do cliente em /dtf, Pedidos DTF metro no Montar filme e Clientes DTF metro no menu).');
