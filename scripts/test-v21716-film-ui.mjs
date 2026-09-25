import fs from 'node:fs';
import assert from 'node:assert/strict';

const production=fs.readFileSync('production-v217.js','utf8');
const preview=fs.readFileSync('film-preview.js','utf8');
const picker=fs.readFileSync('film-picker.js','utf8');
const app=fs.readFileSync('app.js','utf8');
const tools=fs.readFileSync('scripts/film-v2176-functions.txt','utf8');
const css=fs.readFileSync('production-v217.css','utf8');

assert.match(production,/id="calculateFilm">Atualizar filme/);
assert.match(production,/id="saveFilm" disabled>Salvar filme/);
assert.match(production,/duplicate-film-item/);
assert.match(production,/color-film-vector/);
assert.match(production,/openFilmVectorColorEditor/);
assert.match(production,/applyVectorColorOverrides/);
assert.match(production,/cellMm:mode==='maximum'\?1:2/);
assert.match(production,/if\(item\.halftone\)return null/);
assert.match(production,/allowInternalNesting:item\.halftone\?false:true/);
assert.match(production,/preloadFilmPickerMeta/);
assert.match(production,/transform:\{width:520,height:520,resize:'contain',quality:72\}/);

assert.match(tools,/Conferir nomes/);
assert.match(tools,/data-proof-name/);
assert.match(tools,/data-proof-number/);
assert.match(tools,/data-remove-proof/);
assert.ok(!tools.includes('Corrigir nomes/números e recalcular'));

assert.match(preview,/Ajustar encaixe/);
assert.ok(!preview.includes('X (cm)'));
assert.ok(!preview.includes('Y (cm)'));
assert.ok(!preview.includes('Aplicar posição'));
for(const angle of ['0','90','180','270'])assert.match(preview,new RegExp('data-angle-preset="'+angle+'"'));
assert.match(preview,/Otimizar espaços/);
assert.match(preview,/data-angle\.onchange/);

assert.ok(!picker.includes('<span>Montar camiseta</span>'));
assert.match(picker,/Biblioteca própria ZERO19/);
assert.match(picker,/data-fallback-src/);
assert.match(picker,/fetchpriority/);

assert.ok(!app.includes('Fila: Desenvolver arte'));
assert.ok(!app.includes('Fila: Iniciar produção'));
assert.ok(!app.includes('Fila: Estampar'));
assert.match(app,/return nav\('\/filme'\)/);
assert.match(app,/uploadQueue\.push\(\{file:f,name:'',type:presetType,folderId:''/);
assert.match(app,/Organização obrigatória/);
assert.match(app,/Escolha uma pasta/);
assert.match(app,/Dê um nome claro para cada arquivo antes de salvar/);

assert.match(css,/Montar Filme: interface operacional compacta, mobile-first/);
assert.match(css,/vector-color-modal/);
assert.match(css,/upload-required-bar/);

console.log('v2.17.16 film UI: cleaner workflow, editable proof, alpha packing, vector colors, mandatory upload organization and mobile layout passed.');
