// 2.17.93 on top of 2.17.92 (06/11, dono: "dá para ver que às vezes fica manchado algumas cores; permita clicar num elemento e
// trocar a cor dele para uma cor sólida ou degradê começando de uma cor e terminando em outra, e o degradê faz sozinho").
// Tudo dentro de vetor/: tocar numa parte do vetor (ou "Juntar parecidas" para pegar a mancha inteira), cor sólida, degradê
// (direção automática pelo claro/escuro da arte original, ou ↓ → ↘ ↗) ou redondo, conta-gotas, prévia na hora, Aplicar
// (o motor redesenha o SVG: recolor), Desfazer e Voltar ao original. Esta camada confere e renova a versão (raiz e vetor/).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.92"'))throw new Error('v93 exige a base 2.17.92.');
for(const [file,needle] of [['vetor/page.js','const colorEdit = (() => {'],['vetor/page.js','data-vz-apply'],['vetor/worker.js',"type === 'recolor'"],['vetor/engine/index.js','export function recolor(']])if(!read(file).includes(needle))throw new Error('v93: falta '+needle+' em '+file);
const files=[...fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n))];
(function walk(dir){for(const e of fs.readdirSync(path.join(dist,dir),{withFileTypes:true})){const rel=path.join(dir,e.name);if(e.isDirectory())walk(rel);else if(/\.(js|css)$/.test(e.name))files.push(rel);}})('vetor');
for(const name of files)write(name,read(name).replace(/\b2\.17\.92\b/g,'2.17.93'));
if(!read('index.html').includes('content="2.17.93"'))throw new Error('v93: versão não foi renovada.');
for(const name of ['app.js','production-v217.js','vetor/page.js','vetor/worker.js',...fs.readdirSync(path.join(dist,'vetor/engine')).filter(n=>n.endsWith('.js')).map(n=>'vetor/engine/'+n)])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
console.log('019 2.17.93: Vetorizar arte · trocar a cor de uma parte (sólida, degradê automático ou redondo), juntar parecidas, conta-gotas, desfazer.');
