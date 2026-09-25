import fs from 'node:fs';
import assert from 'node:assert/strict';
import {isBlankShirtCategory,modelForCatalog,colorForCatalog} from '../manual-shirt-catalog.js';

assert.equal(isBlankShirtCategory('Camiseta fio 30.1 penteada'),true);
assert.equal(isBlankShirtCategory('Dry fit grão de arroz'),true);
assert.equal(isBlankShirtCategory('CAMISA DE TIME QUALIDADE NACIONAL'),false);
assert.equal(modelForCatalog('oversized suedine 2026','Camisa Oversized Suedine'),'oversized');
assert.equal(modelForCatalog('Camiseta fio 30.1 penteada','Camiseta'),'normal');
assert.equal(colorForCatalog('PRETA','#000000').id,'black');
assert.equal(colorForCatalog('OFFWHITE','#F5F5F0').id,'offwhite');

const app=fs.readFileSync('app.js','utf8');
const workflow=fs.readFileSync('official-order-workflow.js','utf8');
const production=fs.readFileSync('production-v217.js','utf8');
const css=fs.readFileSync('official-order-workflow.css','utf8');
const storage=fs.readFileSync('storage-upload.js','utf8');

assert.match(app,/Etapa \$\{step\}\/2/);
assert.match(app,/Total \$\{totalPercent\}%/);
assert.match(app,/uploadFile:\(path,blob,options\)=>storageUploader\.upload/);
assert.match(storage,/return await standardUpload/);
assert.match(storage,/fallback:'tus'/);

assert.match(workflow,/loadBlankShirtCatalog/);
assert.match(workflow,/z19p_manual_garment_groups/);
assert.match(workflow,/manual_garment_group_id/);
assert.match(workflow,/renderPieceMockup/);
assert.match(workflow,/realMockupPreview/);
assert.match(workflow,/Adicionar grupo inteiro/);
assert.match(workflow,/Artes prontas para o filme/);
assert.match(workflow,/production_state:'pending'/);
assert.match(workflow,/surface==='front'\|\|surface==='back'\)return true/);
assert.ok(!workflow.includes("filter(r=>r.asset&&r.project?.official_order_ref)"),'fila não pode esconder grupos manuais');

assert.match(production,/data-production-group/);
assert.match(production,/selectedProductionGroups/);
assert.match(css,/real-shirt-photo/);
assert.match(css,/manual-group-pieces/);
assert.match(css,/pending-quantity/);

console.log('v2.17.22: Vendus catalog, real mockups, shirt groups, production queue and total upload progress passed.');
