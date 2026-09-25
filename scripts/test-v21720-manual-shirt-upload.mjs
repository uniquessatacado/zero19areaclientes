import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync('app.js','utf8');
const queue=fs.readFileSync('queue-core.js','utf8');
const workflow=fs.readFileSync('official-order-workflow.js','utf8');
const css=fs.readFileSync('official-order-workflow.css','utf8');

const finalProcessStart=app.lastIndexOf('const _baseProcessQueue=processQueue;');
const finalProcessEnd=app.indexOf('\nconst VIDEO_MAX_BYTES',finalProcessStart);
const finalProcess=app.slice(finalProcessStart,finalProcessEnd);
assert.ok(finalProcessStart>=0);
assert.match(finalProcess,/onStage:text=>stage/);
assert.match(finalProcess,/offerAfterUpload\(savedAssets,\{workspace:uploadWorkspace,projects:uploadProjects,allowWithoutOrder:clientUploadWithoutOrderEnabled\}\)/);
assert.match(finalProcess,/workspace_type==='client'/);
assert.match(app,/const nativeResize=touchDevice;/);
assert.ok(!app.includes('native-large'),'desktop Ultra 6000 deve usar Pica, não canvas nativo');
assert.match(app,/native-mobile/);
assert.match(app,/A geração do PNG demorou demais/);
assert.match(app,/clientUploadWithoutOrderEnabled/);

assert.ok(!queue.includes("service_type,source_kind,company_order_id"),'queue não deve pedir colunas inexistentes');
assert.match(queue,/official_order_ref,official_order_source,official_order_status/);

assert.match(workflow,/z19p_manual_garments/);
assert.match(workflow,/chooseManualGroup/);
assert.match(workflow,/buildManualGroup/);
assert.match(workflow,/manual_garment_id/);
assert.match(workflow,/CAMISETA SEM PEDIDO/);
assert.match(workflow,/Quais peças recebem esta estampa/);
assert.match(workflow,/manualGroup=await chooseManualGroup/);
assert.match(css,/camiseta manual para cliente sem pedido oficial/);
assert.match(css,/manual-garment-backdrop/);
assert.match(css,/manual-stepper/);

console.log('v2.17.20+ upload hotfix: active queue fixed, no-order shirt groups and processing timeout passed.');
