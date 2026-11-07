// Copia o motor do vetorizador (bancada em ../zero19-vetorizador, com os testes e o relatório da Etapa 1) para vetor/engine do 019.
// O 019 publica o que está no Git: rode isto depois de mexer no motor lá, rode a bancada (npm run etapa1) e então faça o build.
// Uso: node scripts/sync-vetor-engine.mjs [pasta do motor]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const from=path.resolve(process.argv[2]||path.join(root,'..','zero19-vetorizador','src','engine')),to=path.join(root,'vetor','engine');
if(!fs.existsSync(path.join(from,'index.js')))throw new Error('Motor não encontrado em '+from);
fs.mkdirSync(to,{recursive:true});
const names=fs.readdirSync(from).filter(n=>n.endsWith('.js')).sort();
for(const old of fs.readdirSync(to))if(old.endsWith('.js')&&!names.includes(old))fs.rmSync(path.join(to,old));
for(const name of names)fs.copyFileSync(path.join(from,name),path.join(to,name));
console.log('Motor copiado ('+names.length+' arquivos): '+names.join(', '));
