import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const htmlFiles = [
  'index.html',
  'demo.html',
  'qualidades.html',
  'portfolio.html',
  'comercial-admin.html',
];
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'z19-static-check-'));
const report = [];

for (const file of htmlFiles) {
  const html = await fs.readFile(path.join(root, file), 'utf8');
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)];
  let index = 0;
  for (const match of scripts) {
    const attrs = match[1] || '';
    const code = match[2] || '';
    if (!code.trim()) continue;
    const isModule = /\btype=["']module["']/i.test(attrs);
    const ext = isModule ? 'mjs' : 'js';
    const tempFile = path.join(tempDir, `${path.basename(file)}-${index++}.${ext}`);
    await fs.writeFile(tempFile, code);
    const checked = spawnSync(process.execPath, ['--check', tempFile], { encoding: 'utf8' });
    if (checked.status !== 0) {
      throw new Error(`${file}: ${checked.stderr || checked.stdout}`);
    }
  }
  report.push({ file, scripts: scripts.length, bytes: html.length });
}

const appCheck = spawnSync(process.execPath, ['--check', path.join(root, 'app.js')], {
  encoding: 'utf8',
});
if (appCheck.status !== 0) throw new Error(appCheck.stderr || appCheck.stdout);

const index = await fs.readFile(path.join(root, 'index.html'), 'utf8');
if (!index.includes('/app.js?v=2.16') || !index.includes('/styles.css?v=2.16')) {
  throw new Error('index.html não aponta para os arquivos estáticos da v2.16.');
}
if (/runtime-bundle|release-v213|raw\.githubusercontent|cdn\.jsdelivr/.test(index)) {
  throw new Error('index.html ainda depende de snapshot remoto.');
}

console.log(JSON.stringify({ ok: true, app: 'app.js', pages: report }, null, 2));
