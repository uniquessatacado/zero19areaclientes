// 2.17.80 on top of the tested 2.17.79 build (15/10, dono: PNG de 35 m+ travava em "Conferindo filme longo
// · 100%" com "Página sem resposta"). A gravação do PNG/TIFF longo devolve a vez ao navegador a cada ~40 ms.
// Não muda pixels, medidas, recorte nem arquivo: só deixa a página responder durante a gravação.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.79"'))throw new Error('v80 exige a base 2.17.79.');
const band=read('film-band-export.js');
if(!band.includes('export async function pauseForBrowser')||(band.match(/await pauseForBrowser\(\)/g)||[]).length<3)throw new Error('v80: pausas do PNG longo ausentes no build.');
for(const name of fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n)))write(name,read(name).replace(/\b2\.17\.79\b/g,'2.17.80'));
if(!read('production-v217.js').includes("film-band-export.js?v=2.17.80")||!read('film-spot-export.js').includes("film-band-export.js?v=2.17.80"))throw new Error('v80: cache do film-band-export.js não foi renovado.');
for(const name of ['production-v217.js','film-band-export.js','film-spot-export.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
console.log('019 2.17.80: PNG/TIFF de filme longo grava sem "Página sem resposta".');
