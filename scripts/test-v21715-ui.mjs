import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync('app.js','utf8');
const actions=fs.readFileSync('asset-studio-actions.js','utf8');
const studio=fs.readFileSync('art-studio.js','utf8');
const production=fs.readFileSync('production-v217.js','utf8');
const css=fs.readFileSync('art-studio.css','utf8');
const styles=fs.readFileSync('styles.css','utf8');

assert.match(app,/Nome do cliente \*/);
assert.match(app,/Nome da empresa <small>\(opcional\)<\/small>/);
assert.match(app,/WhatsApp \*/);
assert.match(app,/Responsável \*/);
assert.match(app,/garment_studio_enabled/);
assert.match(app,/Pedidos do cliente/);
assert.match(app,/Nenhum pedido sincronizado ainda/);
assert.match(app,/dashboardClientListsHTML = function/);
assert.match(app,/openSettingsModal = async function/);
const lastBind=app.lastIndexOf('bindWorkspaceCards = function(){');
const lastBindEnd=app.indexOf('};',lastBind)+2;
assert.ok(lastBind>=0&&!app.slice(lastBind,lastBindEnd).includes('card-status-select'),'implementação final dos cards não pode permitir status manual');
const finalWorkspaceModalStart=app.lastIndexOf('openWorkspaceModal = function(existing=null){');
const finalWorkspaceModalEnd=app.indexOf('\n};',finalWorkspaceModalStart)+3;
const finalWorkspaceModal=app.slice(finalWorkspaceModalStart,finalWorkspaceModalEnd);
assert.ok(finalWorkspaceModalStart>=0&&!finalWorkspaceModal.includes('createDefaultFoldersForWorkspace'),'novo fluxo não deve recriar pastas por padrão');

assert.match(actions,/garmentEnabled=handlers\.garmentEnabled!==false/);
assert.match(production,/garmentEnabled:ctx\.isGarmentStudioEnabled\?\.\(\)===true/);
assert.ok(!production.includes("onGarment:ctx.isGarmentStudioEnabled?.()===true"),'seletor do filme não deve mostrar Montar camiseta');
assert.match(production,/onMockup:typeof ctx\.openArtMockup==='function'/);
assert.match(actions,/artwork&&typeof handlers\.openMockup==='function'&&\['mockup','Ver tamanho na camisa'/);

assert.match(studio,/data-size="43" data-back-only hidden/);
assert.match(studio,/backOnly\.hidden=state\.side!=='back'/);
assert.match(studio,/ctx\.isGarmentStudioEnabled\?\.\(\)/);
assert.match(css,/\.shirt-resize\{[^}]*bottom:-18px[^}]*right:-18px[^}]*width:16px[^}]*background:#151519e8/);
assert.match(styles,/v2\.17\.15 — fluxo de clientes simplificado/);

console.log('v2.17.15 UI: cadastro limpo, workspace simples, feature flag, provador e 43cm costas OK');
