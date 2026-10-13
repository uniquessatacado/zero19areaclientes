// 2.17.76 on top of the tested 2.17.75 build: film previews load in parallel,
// follow the zoom in resolution, retry by themselves and fall back to the file.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.75"'))throw new Error('v76 exige a base 2.17.75.');
const media=read('film-media-v74.js');
for(const mark of ['makeFilmPreview','probeDirect','resizeQuality','upgrades()','toque aqui para tentar de novo'])if(!media.includes(mark))throw new Error('v76: carregador de prévias sem '+mark);
if(media.includes('timeoutMs=14000'))throw new Error('v76: prazo curto antigo ainda presente.');
for(const name of fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n)))write(name,read(name).replace(/\b2\.17\.75\b/g,'2.17.76'));
for(const name of ['film-media-v74.js','film-preview.js','film-preview-source-v74.js','production-v217.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
execFileSync(process.execPath,[path.join(root,'scripts/verify-film-media-v76.mjs'),dist],{stdio:'inherit',timeout:60000});
console.log('019 2.17.76: prévias do filme em paralelo, nítidas no zoom, com nova tentativa automática.');
