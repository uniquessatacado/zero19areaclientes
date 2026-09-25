import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const sync=fs.readFileSync(new URL('../zero19-pdv-sync.js',import.meta.url),'utf8');
const official=fs.readFileSync(new URL('../official-order-workflow.js',import.meta.url),'utf8');

assert.match(app,/createZero19PdvSync/);
assert.match(app,/\/zero19-fila/);
assert.match(app,/enhanceDashboard/);
assert.match(app,/enhanceWorkspace/);
assert.match(sync,/z19p_zero19_work_items/);
assert.match(sync,/z19p_sync_zero19_recent/);
assert.match(sync,/z19p_zero19_mark_ready/);
assert.match(sync,/z19p_zero19_mark_delivered/);
assert.match(sync,/zero19indaiatuba/);
assert.match(sync,/Transferir para cliente/);
assert.match(official,/z19p_zero19_mark_art_ready/);

console.log('v2.17.24 ZERO19 bridge checks passed');
