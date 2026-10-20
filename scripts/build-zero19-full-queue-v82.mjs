// 2.17.82 on top of the tested 2.17.81 build (20/10, dono: "os números que o cliente escolhe no estúdio
// não estão indo para o filme… pedido com 5 números 22 e nenhum foi para o filme").
// Causa: a fila ZERO19 passou de 1000 itens (827 prontos/retirada + produção) e o Supabase entrega no
// máximo 1000 linhas por consulta; os pedidos mais novos (prazo mais longe) ficavam fora do filme, dos
// cards e da contagem. zero19-pdv-sync.js agora lê a fila em páginas e divide listas grandes de IDs.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=n=>fs.readFileSync(path.join(dist,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(dist,n),s);
if(!read('index.html').includes('content="2.17.81"'))throw new Error('v82 exige a base 2.17.81.');
const sync=read('zero19-pdv-sync.js');
if(!sync.includes('async function readAllRows(build){')||!sync.includes("readAllRows(withCount=>supabase.from('z19p_zero19_work_items')"))throw new Error('v82: leitura da fila em páginas ausente no build.');
for(const name of fs.readdirSync(dist).filter(n=>/\.(js|html|css)$/.test(n)))write(name,read(name).replace(/\b2\.17\.81\b/g,'2.17.82'));
if(!read('app.js').includes('zero19-pdv-sync.js?v=2.17.82')||!read('index.html').includes('content="2.17.82"'))throw new Error('v82: cache do zero19-pdv-sync.js não foi renovado.');
for(const name of ['zero19-pdv-sync.js','app.js','production-v217.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/test-zero19-full-queue.mjs'],{cwd:root,stdio:'inherit'});
console.log('019 2.17.82: fila ZERO19 inteira (mais de 1000 itens), pedidos novos voltam ao filme e aos cards.');
