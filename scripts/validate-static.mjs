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
  'mockup-viewer.html',
  'mockup-3d.html',
  'empresa.html',
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

const javascriptFiles = ['app.js','asset-studio-actions.js','studio-home.js','studio-art-picker.js','studio-art-preview.js','garment-cloud-store.js','garment-draft.js','garment-3d.js','garment-share.js','garment-presentation.js','mockup-3d.js','film-cloud-draft.js','production-finance.js','production-finance-core.js','production-v217.js','nesting-core.js','nesting-worker.js','queue-core.js','lettering-core.js','film-picker.js','film-preview.js','film-export-core.js','art-studio.js','art-color-core.js','art-color-worker.js','font-cmap.js','project-history.js','customization-preparer.js','garment-scene.js','garment-composer.js','mockup-viewer.js','production-cost-core.js','production-cost-analysis.js','production-cost-worker.js','production-cost-ui.js','cost-store.js','route-viewport.js','film-draft.js','project-advisor.js','project-advisor-ui.js','rip-calibration.js'];
javascriptFiles.push('company-artwork.js','company-portal.js','company-portal-core.js','company-portal-admin.js','company-order-operations.js');
for (const file of javascriptFiles) {
  const checked = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  if (checked.status !== 0) throw new Error(`${file}: ${checked.stderr || checked.stdout}`);
  const content=await fs.readFile(path.join(root,file),'utf8');
  for(const match of content.matchAll(/(?:from\s*|import\s*\()(['"])(\.\.?\/[^'"]+)\1/g)){
    await fs.access(path.resolve(root,path.dirname(file),match[2].split('?')[0])).catch(()=>{throw new Error(`Import local ausente: ${file} → ${match[2]}`)});
  }
}

const index = await fs.readFile(path.join(root, 'index.html'), 'utf8');
const appSource = await fs.readFile(path.join(root, 'app.js'), 'utf8');
const productionSource = await fs.readFile(path.join(root, 'production-v217.js'), 'utf8');
if (!index.includes('/app.js?v=2.17') || !index.includes('/styles.css?v=2.17') || !index.includes('/production-v217.css?v=2.17')) {
  throw new Error('index.html não aponta para todos os arquivos estáticos da v2.17.');
}
if (/runtime-bundle|release-v213|raw\.githubusercontent|cdn\.jsdelivr/.test(index)) {
  throw new Error('index.html ainda depende de snapshot remoto.');
}
for (const required of ['Arte pronta para impressão','readyForPrint','folderInReadyTree']) {
  if (!appSource.includes(required)) throw new Error(`Upload sem requisito de arte pronta: ${required}`);
}
for (const required of ['Fontes e números','All Sponsor','Arte especial']) {
  if (!productionSource.includes(required)) throw new Error(`Camisa sem personalização: ${required}`);
}

const migrationFiles = (await fs.readdir(path.join(root,'supabase','migrations'))).filter(file=>file.endsWith('.sql'));
const migration = migrationFiles.find(file=>file.includes('v217_production_projects_dtf'));
const privateMigration = migrationFiles.find(file=>file.includes('v217_private_customization_sources'));
const publicScopeMigration = migrationFiles.find(file=>file.includes('v217_public_active_project_scope'));
const integrityMigration = migrationFiles.find(file=>file.includes('v217_transition_integrity'));
if (!migration) throw new Error('Migration v2.17 não encontrada.');
if (!privateMigration) throw new Error('Migration v2.17 do bucket privado não encontrada.');
if (!publicScopeMigration) throw new Error('Migration v2.17 do projeto público ativo não encontrada.');
if (!integrityMigration) throw new Error('Migration v2.17 de integridade operacional não encontrada.');
const sql = await fs.readFile(path.join(root,'supabase','migrations',migration),'utf8');
const privateSql = await fs.readFile(path.join(root,'supabase','migrations',privateMigration),'utf8');
for (const required of ['queue_stage','is_finalized','delivery_date','z19p_asset_print_profiles','z19p_print_jobs','z19p_transition_project']) {
  if (!sql.includes(required)) throw new Error(`Migration v2.17 sem requisito: ${required}`);
}
if (!/enable row level security/i.test(sql) || !/grant select,insert,update,delete/i.test(sql)) throw new Error('Migration v2.17 sem RLS/grants explícitos.');
for (const required of ["'z19p-private'",'public=false','z19p_private_select','z19p_private_insert','z19p_private_update','z19p_private_delete']) {
  if (!privateSql.includes(required)) throw new Error(`Migration privada v2.17 sem requisito: ${required}`);
}

console.log(JSON.stringify({ ok: true, app: javascriptFiles, migrations: [migration,privateMigration,publicScopeMigration,integrityMigration], pages: report }, null, 2));
