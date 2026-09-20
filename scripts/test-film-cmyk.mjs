import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {createCmykConverter,loadCmykConverter,CMYK_ASSETS,CMYK_CONVERSION_FLAGS,CMYK_ENGINE_VERSION} from '../film-cmyk-converter.js';

const root=new URL('../',import.meta.url);
const assets={};
for(const [name,spec] of Object.entries(CMYK_ASSETS)){
  const bytes=await readFile(new URL(spec.path,root));
  assert.equal(bytes.length,spec.bytes,name+' length');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),spec.sha256,name+' SHA256');
  assets[name]=bytes;
}
assert.equal(CMYK_ENGINE_VERSION,2160);
assert.equal(CMYK_CONVERSION_FLAGS,8448,'BPC + NOOPTIMIZE are mandatory');
const vendorSource=await readFile(new URL('vendor/lcms-wasm/1.0.5/lcms.js',root),'utf8');
assert.equal(createHash('sha256').update(vendorSource).digest('hex'),'1a5c8f81186211856ba7c5d6841e35fe3fa901b857a247f72318e1652c5e1cec');
assert.ok(!/\beval\s*\(|\bnew\s+Function\s*\(/.test(vendorSource),'no executable source loaders');

// Expected bytes independently captured with Pillow 12.2.0 / LCMS 2.18,
// the original ICC files, relative intent and flags 8448. Not a RGB formula.
const rgb=Uint8Array.from([
  0,0,0, 255,255,255, 255,0,0, 0,255,0, 0,0,255,
  0,255,255, 255,0,255, 255,255,0, 128,128,128, 40,40,41,
  143,24,28, 4,187,1, 8,63,227, 128,200,50, 250,223,155, 2,2,2,
]);
const expected=Uint8Array.from([
  171,144,142,255, 0,0,0,0, 0,221,253,0, 144,0,225,0, 255,201,0,0,
  97,0,42,0, 107,164,0,0, 0,27,235,0, 96,70,69,82, 170,143,137,174,
  48,244,245,81, 163,1,255,0, 253,189,0,0, 123,2,241,0, 6,35,117,0, 171,144,142,246,
]);
const options={sourceProfileBytes:assets.source,destinationProfileBytes:assets.destination,wasmBinary:assets.wasm};
const converter=await createCmykConverter(options);
try{
  const original=rgb.slice();
  const converted=converter.convertRGB(rgb);
  assert.deepEqual(converted,expected);
  assert.deepEqual(rgb,original,'source image remains unchanged');
  converted.fill(255);
  assert.deepEqual(converter.convertRGB(rgb),expected,'results are independent copies');
  for(let offset=0;offset<rgb.length;offset+=3){
    assert.deepEqual(converter.convertRGB(rgb.subarray(offset,offset+3)),expected.subarray(offset/3*4,offset/3*4+4),'subarray byte offsets preserved');
  }
  assert.deepEqual(converter.convertRGB(new Uint8ClampedArray(rgb)),expected);
  assert.throws(()=>converter.convertRGB(new Uint8Array()),/Faixa RGB inválida/);
  assert.throws(()=>converter.convertRGB(new Uint8Array(4)),/três canais/);
  assert.throws(()=>converter.convertRGB(new Uint16Array(3)),/8 bits/);
  assert.throws(()=>converter.convertRGB(new Uint8Array((4*1024*1024+1)*3)),/muito grande/);
}finally{converter.close();}
converter.close();
assert.throws(()=>converter.convertRGB(rgb),/encerrado/);
await assert.rejects(createCmykConverter({...options,sourceProfileBytes:new Uint8Array(128)}),/ICC incompatível/);
await assert.rejects(createCmykConverter({...options,destinationProfileBytes:assets.source}),/ICC incompatível/);
await assert.rejects(createCmykConverter({...options,sourceProfileBytes:undefined}),/8 bits/);

// Exercise the same browser loader with local verified bytes, no network calls.
const originalFetch=globalThis.fetch,originalCrypto=globalThis.crypto;
if(!globalThis.crypto?.subtle)globalThis.crypto=webcrypto;
const calls=[];
let corruption=null;
globalThis.fetch=async(url,options)=>{
  assert.equal(options.credentials,'same-origin');
  assert.equal(options.redirect,'error','redirects cannot fetch another host');
  const key=Object.keys(CMYK_ASSETS).find(name=>new URL(CMYK_ASSETS[name].path,root).href===url.href);
  assert.ok(key,'only pinned, same-module-origin resources may load');
  calls.push(key);
  const bytes=Uint8Array.from(assets[key]);
  if(corruption==='length'&&key==='source')return {ok:true,arrayBuffer:async()=>bytes.slice(1).buffer};
  if(corruption==='hash'&&key==='source')bytes[100]^=1;
  if(corruption==='http'&&key==='source')return {ok:false,status:404};
  return {ok:true,arrayBuffer:async()=>bytes.buffer};
};
try{
  const loaded=await loadCmykConverter();
  try{assert.deepEqual(loaded.convertRGB(rgb),expected);}finally{loaded.close();}
  assert.deepEqual(calls.sort(),['destination','source','wasm']);
  corruption='length';await assert.rejects(loadCmykConverter(),/incompleto/);
  corruption='hash';await assert.rejects(loadCmykConverter(),/Integridade/);
  corruption='http';await assert.rejects(loadCmykConverter(),/404/);
}finally{
  globalThis.fetch=originalFetch;
  if(originalCrypto===undefined)delete globalThis.crypto;else if(globalThis.crypto!==originalCrypto)globalThis.crypto=originalCrypto;
}
console.log('CMYK: vendored ICC/WASM hashes, flags, 16 independent reference colors, strips, cleanup and loader failures OK');
