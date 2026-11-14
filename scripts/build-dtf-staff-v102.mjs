// 2.17.102 (14/11, dono: "pelo Montar filme acessar as áreas dos clientes que compram por metro e baixar as imagens em PNG; permita
// alterar o preço do pedido antes de adicionar no filme e atualizar também no pedido dele"). As mudanças estão em dtf-staff.js/.css e
// dtf-portal.js (copiados para o dist pelos builds de antes); aqui confere e renova a versão (cache dos navegadores).
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.101"'))throw new Error('v102 exige a base 2.17.101.');
for(const [file,mark] of [['dtf-staff.js','z19p_dtf_staff_set_price'],['dtf-staff.js','openClientArts'],['dtf-portal.js','Valor combinado com a ZERO19'],['dtf-staff.css','z19dtf-artgrid']])
  if(!fs.existsSync(path.join(dist,file))||!read(file).includes(mark))throw new Error('v102: '+file+' sem '+mark+' (não foi copiado?).');
const files=fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n));
(function walk(dir){for(const e of fs.readdirSync(path.join(dist,dir),{withFileTypes:true})){const rel=path.join(dir,e.name);if(e.isDirectory())walk(rel);else if(/\.(js|css)$/.test(e.name))files.push(rel);}})('vetor');
for(const name of files)write(name,read(name).replace(/\b2\.17\.101\b/g,'2.17.102'));
if(!read('index.html').includes('content="2.17.102"'))throw new Error('v102: versão não renovada.');
for(const name of ['dtf-staff.js','dtf-portal.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
console.log('019 2.17.102: DTF por metro · baixar PNG, mudar o preço do pedido e artes do cliente pela equipe.');
