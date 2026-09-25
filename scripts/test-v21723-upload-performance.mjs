import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync('app.js','utf8');
const storage=fs.readFileSync('storage-upload.js','utf8');

assert.match(app,/const nativeResize=touchDevice;/);
assert.ok(!app.includes('touchDevice||targetMax>=6000'),'Ultra 6000 desktop não pode forçar canvas nativo');
assert.match(app,/pica\.resize\(source,out,\{quality:3,alpha:true,unsharpAmount:50/);
assert.match(app,/Promise\.all\(\[\s*storageUploader\.upload\(originalPath/);
assert.match(app,/storageUploader\.upload\(processedPath/);
assert.match(app,/Original \$\{originalPercent\}% · PNG final \$\{processedPercent\}% · Total \$\{totalPercent\}%/);
assert.match(storage,/return await standardUpload/);
assert.match(storage,/return resumableUpload/);

console.log('v2.17.23 performance: desktop Ultra 6000 uses Pica and uploads run in parallel with TUS fallback.');
