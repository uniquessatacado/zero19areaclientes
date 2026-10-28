// 2.17.83 on top of 2.17.82 (28/10, dono: "quando eu subo uma imagem em artes e ela tem uma prancheta sobrando está
// distorcendo a imagem… tem que remover a prancheta sobrando sem distorcer, proporcional, até onde tem pixel").
// Causa: a altura era calculada pela imagem COM prancheta e gravada junto da largura; depois do corte a proporção
// muda e largura + altura antigas esticavam a arte no posicionamento e no filme. Agora a medida vale pelo lado
// digitado e o outro sai do PNG já cortado; medidas antigas que não batem com a arte valem pela largura.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.82"'))throw new Error('v83 exige a base 2.17.82.');
if(!read('app.js').includes('Pó quase invisível (alfa < 8 de 255)')||!read('print-art-preparation.js').includes("axis==='height'?0:widthCm")||!read('film-picker.js').includes('medida feita antes de tirar a prancheta'))throw new Error('v83: correção da prancheta ausente no dist.');
for(const name of fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n)))write(name,read(name).replace(/\b2\.17\.82\b/g,'2.17.83'));
if(!read('index.html').includes('content="2.17.83"'))throw new Error('v83: versão não foi renovada.');
for(const name of ['app.js','official-order-workflow.js','print-art-preparation.js','film-picker.js','production-v217.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/test-trim-proportion.mjs'],{cwd:root,stdio:'inherit'});
console.log('019 2.17.83: prancheta cortada até o pixel e medidas sempre proporcionais.');
