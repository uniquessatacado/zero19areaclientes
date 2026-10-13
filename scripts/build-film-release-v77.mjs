// 2.17.77 on top of the tested 2.17.76 build (13/10, dono: PNG de 40 m gerado e as
// estampas continuaram em Aguardando produção). A fila sai pedido por pedido, com
// nova tentativa automática; o que faltar fica guardado com aviso e "Tirar da fila agora".
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.76"'))throw new Error('v77 exige a base 2.17.76.');
if(!fs.existsSync(path.join(dist,'film-release-store.js')))throw new Error('v77: film-release-store.js ausente no build.');
const production=read('production-v217.js'),workflow=read('official-order-workflow.js');
for(const mark of ['releaseExportedFilm','Tirar da fila agora','releaseWithoutFile','filmReleaseStore.put(releaseEntry)'])if(!production.includes(mark))throw new Error('v77: produção sem '+mark);
for(const mark of ['markProductionGroup','transientProductionError','result.failed.push'])if(!workflow.includes(mark))throw new Error('v77: fila sem '+mark);
for(const name of fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n)))write(name,read(name).replace(/\b2\.17\.76\b/g,'2.17.77'));
for(const name of ['production-v217.js','official-order-workflow.js','film-release-store.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
console.log('019 2.17.77: filme gerado sai da fila pedido por pedido; o que faltar fica guardado com aviso.');
