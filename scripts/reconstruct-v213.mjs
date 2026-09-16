import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

async function decode(dir, prefix) {
  const names = (await fs.readdir(dir)).filter(n => n.startsWith(prefix + '.') && n.endsWith('.txt')).sort();
  if (!names.length) throw new Error(`Nenhuma parte encontrada em ${dir}`);
  const base64 = (await Promise.all(names.map(async n => (await fs.readFile(`${dir}/${n}`, 'utf8')).trim()))).join('');
  return JSON.parse(gunzipSync(Buffer.from(base64, 'base64')).toString('utf8'));
}

const runtime = await decode('runtime-v213', 'bundle');
if (runtime.version !== '2.13') throw new Error('Runtime não é v2.13');
await fs.writeFile('app.js', runtime.js + '\n');
await fs.writeFile('styles.css', runtime.css + '\n');

const release = await decode('release-v213', 'release');
if (release.version !== '2.13') throw new Error('Release não é v2.13');
for (const [name, content] of Object.entries(release.files || {})) {
  await fs.writeFile(name, String(content) + '\n');
}
console.log('v2.13 reconstruída: app.js, styles.css e páginas comerciais.');
