import fs from 'node:fs';
import assert from 'node:assert/strict';
import {workspaceOfficialOrderState,officialOrderItems,GARMENT_MODELS,GARMENT_COLORS} from '../official-order-workflow.js';

const app=fs.readFileSync('app.js','utf8');
const production=fs.readFileSync('production-v217.js','utf8');
const workflow=fs.readFileSync('official-order-workflow.js','utf8');
const css=fs.readFileSync('official-order-workflow.css','utf8');

assert.equal(workspaceOfficialOrderState([{workspace_id:'w',official_order_ref:null}], 'w').hasOfficialOrder,false);
assert.equal(workspaceOfficialOrderState([{workspace_id:'w',official_order_ref:'019-123'}], 'w').count,1);
const products=officialOrderItems({official_order_payload:{items:[{id:'1',product_name:'Oversized',size:'G',color:'Preta',quantity:2}]}});
assert.equal(products.length,1);assert.equal(products[0].size,'G');assert.equal(products[0].quantity,2);
assert.ok(GARMENT_MODELS.babylook&&GARMENT_MODELS.kids&&GARMENT_MODELS.oversized&&GARMENT_MODELS.normal);
assert.ok(GARMENT_COLORS.some(c=>c.id==='black')&&GARMENT_COLORS.some(c=>c.id==='offwhite'));

assert.match(app,/Pendente de pedido oficial/);
assert.match(app,/quick-upload-workspace/);
assert.match(app,/Posições de estampa/);
assert.match(app,/officialOrders\.offerAfterUpload/);
assert.match(app,/official_order_ref/);
assert.ok(!app.includes('Fila: Desenvolver arte')&&!app.includes('Fila: Iniciar produção')&&!app.includes('Fila: Estampar'));

assert.match(production,/id="addOfficialPending">◷ Aguardando produção/);
assert.match(production,/id="filmName"/);
assert.match(production,/suggestedFilmName/);
assert.match(production,/filmExportBase/);
assert.match(production,/selectedOfficialProjects/);
assert.match(production,/markProduction/);
assert.ok(!production.includes('Preservar a largura inteira do filme'));
assert.match(production,/trim=true/);

assert.match(workflow,/z19p_print_positions/);
assert.match(workflow,/z19p_asset_placements/);
assert.match(workflow,/openPlacementWizard/);
assert.match(workflow,/openPendingProductionPicker/);
assert.match(workflow,/Baby Look feminina/);
assert.match(workflow,/Infantil/);
assert.match(css,/official-placement-page/);
assert.match(css,/official-production-page/);

console.log('v2.17.17 official order workflow: client alert, upload placement, configurable positions, pending production and export status passed.');
