import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

async function readChunks(dir,pattern){
  const files=(await fs.readdir(dir)).filter(x=>pattern.test(x)).sort();
  if(!files.length) throw new Error(`${dir} vazio`);
  return (await Promise.all(files.map(async f=>(await fs.readFile(`${dir}/${f}`,'utf8')).trim()))).join('');
}

const runtimeB64=await readChunks('runtime-bundle',/^bundle\.\d+\.txt$/);
const payload=JSON.parse(gunzipSync(Buffer.from(runtimeB64,'base64')).toString('utf8'));
if(!payload?.js?.includes("const APP_VERSION = '2.12'")) throw new Error('bundle não corresponde à v2.12');
if(!payload?.css?.includes('.app-version-badge')) throw new Error('CSS da v2.12 incompleto');
await fs.writeFile('app.js', payload.js.endsWith('\n')?payload.js:payload.js+'\n');
await fs.writeFile('styles.css', payload.css.endsWith('\n')?payload.css:payload.css+'\n');

const releaseB64=await readChunks('release-v212',/^release\.\d+\.txt$/);
const release=JSON.parse(gunzipSync(Buffer.from(releaseB64,'base64')).toString('utf8'));
for(const [name,content] of Object.entries(release.files||{})) await fs.writeFile(name,String(content));
if(!String(release.files?.['qualidades.html']||'').includes('Demonstrações de Qualidade')) throw new Error('qualidades.html ausente na release');
if(!String(release.files?.['comercial-admin.html']||'').includes('v2.12')) throw new Error('admin comercial não corresponde à v2.12');
if(!String(release.files?.['PROJECT_MEMORY.md']||'').includes('v2.12')) throw new Error('PROJECT_MEMORY sem v2.12');
console.log(`v2.12 reconstruída: ${payload.js.length} bytes JS, ${payload.css.length} bytes CSS e ${Object.keys(release.files||{}).length} arquivos de release`);
