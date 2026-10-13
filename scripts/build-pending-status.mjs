// Extend the existing deterministic build; never rewrite source at runtime.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist'),version='2.17.71';
execFileSync(process.execPath,['--test',path.join(root,'scripts/test-film-pending-status.mjs')],{stdio:'inherit'});
const target=path.join(dist,'production-v217.js');
let source=fs.readFileSync(target,'utf8');
const before='bindPendingProducedActions({entries,modal,isCurrent:pageCurrent';
if(source.split(before).length!==2)throw new Error('Integração da fila mudou: revisar o ponto de conexão antes de publicar.');
source=source.replace(before,'bindPendingProducedActions({supabase,ownerId:owner(),entries,modal,isCurrent:pageCurrent');
fs.writeFileSync(target,source);
const index=fs.readFileSync(path.join(dist,'index.html'),'utf8');
if(!index.includes('content="2.17.70"'))throw new Error('Versão-base mudou: revisar a extensão da compilação.');
for(const name of fs.readdirSync(dist).filter(name=>/\.(js|html|css)$/.test(name))){
  const file=path.join(dist,name),text=fs.readFileSync(file,'utf8');
  fs.writeFileSync(file,text.replace(/\b2\.17\.70\b/g,version));
}
for(const name of ['production-v217.js','film-pending-produced.js','film-pending-status.js'])execFileSync(process.execPath,['--check',path.join(dist,name)],{stdio:'inherit'});
console.log('019 '+version+': fila aberta revalidada sem criar impressão ou alterar pedidos.');
