// Read-only inventory. Dynamic RPC names and argument/type compatibility still
// need separate integration tests; this detects missing literal entrypoints.
import fs from 'node:fs';
import path from 'node:path';
const roots=process.argv.slice(2);
const calls=new Map();
function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
 if(['node_modules','.git','dist','output','tmp','.vercel','supabase','scripts','versions'].includes(entry.name))continue;
 const file=path.join(dir,entry.name);if(entry.isDirectory()){scan(file);continue;}
 if(!/\.(?:js|jsx|ts|tsx)$/.test(entry.name))continue;
 const source=fs.readFileSync(file,'utf8');
 for(const match of source.matchAll(/\.rpc\(\s*['"]([A-Za-z0-9_]+)['"]/g)){
  if(!calls.has(match[1]))calls.set(match[1],[]);calls.get(match[1]).push(file);
 }
}}
for(const root of roots)scan(root);
console.log(JSON.stringify([...calls].map(([name,files])=>({name,files})).sort((a,b)=>a.name.localeCompare(b.name))));
