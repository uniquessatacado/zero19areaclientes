import fs from 'node:fs';
import assert from 'node:assert/strict';

const sync=fs.readFileSync(new URL('../zero19-pdv-sync.js',import.meta.url),'utf8');
const production=fs.readFileSync(new URL('../production-v217.js',import.meta.url),'utf8');
const cost=fs.readFileSync(new URL('../production-cost-ui.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260927193000_zero19_production_clock_v21738.sql',import.meta.url),'utf8');

assert.ok(sync.includes('Tempo estimado por camisa'),'A métrica identifica estimativa e não inventa uma medição real.');
assert.match(sync,/Próximo prazo disponível/);
assert.match(sync,/renderDelivered/);
assert.match(sync,/data-z19-reopen/);
assert.match(sync,/confirmAction/);
assert.doesNotMatch(sync,/\bconfirm\(/);
assert.match(sync,/z19p_set_production_pause/);
assert.match(sync,/openReasonsManager/);
assert.match(sync,/openHolidaysManager/);
assert.match(sync,/Enviar acompanhamento/);
assert.match(production,/Ajustar curva e comparar/);
assert.match(production,/width="720" height="420"/);
assert.match(cost,/getSnapshotAsync/);
assert.match(migration,/baseline_minutes_per_shirt numeric not null default 30/);
assert.match(migration,/extract\(dow from d\)<>0/);
assert.match(migration,/measurement_started_at/);
assert.match(migration,/scope='printer'/);

console.log('v2.17.38 production timing, recovery, pause, cost and curve checks passed');
