import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
if (!html.includes('content="2.17.104"')) throw new Error('O conta-gotas exige a base 2.17.104.');
for (const entry of fs.readdirSync(dist, {recursive:true, withFileTypes:true})) {
  if (!entry.isFile() || !/\.(html|js|css)$/.test(entry.name)) continue;
  const file = path.join(entry.parentPath, entry.name);
  const source = fs.readFileSync(file, 'utf8');
  const updated = source.replace(/\b2\.17\.104\b/g, '2.17.105');
  if (updated !== source) fs.writeFileSync(file, updated);
}
console.log('019 2.17.105 · Conta-gotas na prévia do filme.');
