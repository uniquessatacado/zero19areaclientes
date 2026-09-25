import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync('app.js','utf8');
const styles=fs.readFileSync('styles.css','utf8');

assert.match(app,/library_zero19/);
assert.match(app,/Biblioteca ZERO19/);
assert.match(app,/Artes próprias da marca, separadas dos clientes/);
assert.match(app,/insertAdjacentHTML\('afterbegin'/);
assert.ok(!/\$\('\.open-workspace'\)\.forEach/.test(app),'binder final deve usar $$ para múltiplos cards');
assert.match(app,/\$\$\('\.open-workspace'\)\.forEach/);
assert.match(styles,/Biblioteca ZERO19 destacada no início/);
assert.match(styles,/\.library-launcher \.zero19-library-card\{/);
assert.match(styles,/grid-column:1\/-1/);

console.log('v2.17.18 ZERO19 library: separated from clients, highlighted first card and card bindings passed.');
