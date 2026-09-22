import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {applyV21712Patch} from './patch-v21712.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'z19p-v21712-source-'));
const skip=new Set(['.git','.vercel','node_modules','dist','output','tmp','.agents','.codex']);
function copy(a,b){fs.mkdirSync(b,{recursive:true});for(const entry of fs.readdirSync(a,{withFileTypes:true})){if(skip.has(entry.name)||entry.name.startsWith('.env'))continue;const from=path.join(a,entry.name),to=path.join(b,entry.name);if(entry.isDirectory())copy(from,to);else if(entry.isFile())fs.copyFileSync(from,to);}}
try{
  copy(root,temp);applyV21712Patch(temp);
  for(const file of ['customization-number-mode.js','customization-number-mode-ui.js','customization-preparer.js','production-v217.js','quote-service-ui.js','lettering-core.js'])execFileSync(process.execPath,['--check',file],{cwd:temp,stdio:'inherit'});
  // Existing release gate runs the full deterministic suite on the compiled graph.
  execFileSync(process.execPath,['scripts/build-v2176.mjs'],{cwd:temp,stdio:'inherit'});
  const source=path.join(temp,'dist'),output=path.join(root,'dist');
  if(fs.existsSync(output)&&fs.lstatSync(output).isSymbolicLink())throw new Error('Diretório de saída inseguro.');
  fs.mkdirSync(output,{recursive:true});
  for(const entry of fs.readdirSync(source,{withFileTypes:true}).sort((a,b)=>Number(a.name==='index.html')-Number(b.name==='index.html'))){const from=path.join(source,entry.name),to=path.join(output,entry.name);if(fs.existsSync(to)&&fs.lstatSync(to).isSymbolicLink())throw new Error('Link inseguro na saída.');if(entry.isDirectory())copy(from,to);else fs.copyFileSync(from,to);}
  for(const name of fs.readdirSync(output)){if(fs.existsSync(path.join(source,name)))continue;fs.rmSync(path.join(output,name),{recursive:true,force:true});}
  console.log('V21712_OUTPUT='+output);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
