import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync('app.js','utf8');
const workflow=fs.readFileSync('official-order-workflow.js','utf8');

assert.match(app,/client_upload_without_order_enabled/);
assert.match(app,/clientUploadWithoutOrderEnabled=true/);
assert.match(app,/Permitir subir arte em cliente sem pedido/);
assert.match(app,/clientUploadWithoutOrderToggle/);
assert.match(app,/saveClientUploadWithoutOrderEnabled/);
assert.match(app,/workspaceHasOfficialOrder/);
assert.match(app,/native-mobile/);
assert.match(app,/Abrindo tamanho e posição/);
assert.match(app,/offerAfterUpload\(savedAssets,\{workspace:uploadWorkspace,projects:uploadProjects,allowWithoutOrder:clientUploadWithoutOrderEnabled\}\)/);
assert.ok(!app.includes("setTimeout(async()=>{uploadQueue.forEach(q=>q.preview"),'upload não deve esperar recarregar a página antes do posicionamento');
assert.match(workflow,/allowWithoutOrder=true/);
assert.match(workflow,/Este cliente ainda não possui pedido oficial/);

console.log('v2.17.19 client upload: temporary no-order setting, mobile-safe processing and immediate placement passed.');
