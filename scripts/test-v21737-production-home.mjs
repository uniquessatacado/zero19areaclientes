import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const sync=fs.readFileSync(new URL('../zero19-pdv-sync.js',import.meta.url),'utf8');
const production=fs.readFileSync(new URL('../production-v217.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');

assert.match(app,/data-nav="\/">Produção/);
assert.match(app,/data-nav="\/clientes">Todos os clientes/);
assert.match(app,/current==='\/clientes'/);
assert.match(app,/zero19Sync\.renderHome\(\)/);
assert.match(app,/setRouteLoading\(true\)/);
assert.match(app,/setRouteLoading\(false\)/);
assert.match(sync,/Clientes sem trabalho aberto ficam fora desta tela/);
assert.match(sync,/STAGE_ORDER\.includes\(row\.stage\)/);
assert.match(sync,/data-production-open-grid/);
assert.match(sync,/\.in\('stage',STAGE_ORDER\)/);
assert.match(sync,/data-production-retry/);
assert.doesNotMatch(sync,/z19p_workspaces'\)\.select\('\*'\)\.eq\('owner_id',owner\)\.order\('created_at'/);
assert.match(sync,/refreshProductionViewAt\(scrollTop\)/);
assert.match(sync,/homeSelected='all',homeQuery=''/);
assert.match(sync,/window\.scrollTo\(0,Math\.max\(0,scrollTop\|\|0\)\)/);
assert.match(production,/optionalProductionByIds\('z19p_customization_glyphs'/);
assert.match(production,/Editor aberto normalmente/);
assert.match(css,/\.production-home\{/);
assert.match(css,/\.mobile-bottom-nav\.with-studio/);
assert.match(css,/--accent:#5f8fda/);

console.log('v2.17.37 production home and resilient film checks passed');
