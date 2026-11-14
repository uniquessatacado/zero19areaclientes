// 2.17.103 (14/11, dono: "no sistema do cliente que compra só DTF, uma observação na arte que ele adicionar no filme; quando chegar no nosso sistema fica o alerta e não deixa jogar no filme, só com Arte pronta ou trocando pela arte modificada, mantendo medida e quantidade"). Antes, 2.17.102: permita
// alterar o preço do pedido antes de adicionar no filme e atualizar também no pedido dele"). As mudanças estão em dtf-staff.js/.css e
// dtf-portal.js (copiados para o dist pelos builds de antes); aqui confere e renova a versão (cache dos navegadores).
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.102"'))throw new Error('v103 exige a base 2.17.102.');
for(const [file,mark] of [['dtf-staff.js','z19p_dtf_staff_resolve_item'],['dtf-staff.js','pendingNotes'],['dtf-portal.js','film-note'],['dtf-portal.css','dtf-item-note'],['dtf-staff.css','z19dtf-notes']])
  if(!fs.existsSync(path.join(dist,file))||!read(file).includes(mark))throw new Error('v103: '+file+' sem '+mark+' (não foi copiado?).');
const files=fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n));
(function walk(dir){for(const e of fs.readdirSync(path.join(dist,dir),{withFileTypes:true})){const rel=path.join(dir,e.name);if(e.isDirectory())walk(rel);else if(/\.(js|css)$/.test(e.name))files.push(rel);}})('vetor');
for(const name of files)write(name,read(name).replace(/\b2\.17\.102\b/g,'2.17.103'));
if(!read('index.html').includes('content="2.17.103"'))throw new Error('v103: versão não renovada.');
for(const name of ['dtf-staff.js','dtf-portal.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
console.log('019 2.17.103: DTF por metro · observação do cliente por arte trava o filme até Arte pronta ou arte modificada.');
