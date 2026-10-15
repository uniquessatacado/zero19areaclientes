// 2.17.78 on top of the tested 2.17.77 build (15/10, dono: "na lateral as miniaturas não estão aparecendo,
// deveriam aparecer rapidamente"). Miniaturas da lista "Artes adicionadas" pedem o link de cada arte
// (inclusive as privadas do site), leves primeiro, guardadas na página. Só visualização.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.77"'))throw new Error('v78 exige a base 2.17.77.');
if(!fs.existsSync(path.join(dist,'film-list-thumbs.js')))throw new Error('v78: film-list-thumbs.js ausente no build.');
const production=read('production-v217.js');
for(const mark of ['createFilmListThumbs','filmListThumbs.markup(item)','filmListThumbs.attach(','thumbPage=page'])if(!production.includes(mark))throw new Error('v78: filme sem '+mark);
for(const name of fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n)))write(name,read(name).replace(/\b2\.17\.77\b/g,'2.17.78'));
for(const name of ['production-v217.js','film-list-thumbs.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
execFileSync(process.execPath,[path.join(root,'scripts/verify-film-list-thumbs-v78.mjs'),dist],{stdio:'inherit',timeout:60000});
console.log('019 2.17.78: miniaturas da lista do filme aparecem rápido, inclusive as artes do site.');
