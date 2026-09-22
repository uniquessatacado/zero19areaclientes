import assert from 'node:assert/strict';
import {artworkPhysicalSize,setArtworkPngDpi,ARTWORK_RULER_HINT} from '../company-artwork.js';
assert.deepEqual(artworkPhysicalSize('25,5',300,600),{widthCm:25.5,heightCm:51});
for(const value of ['',null,0,-1,'abc',101,Infinity])assert.throws(()=>artworkPhysicalSize(value,100,200));
assert.throws(()=>artworkPhysicalSize(50,1,100));
assert.match(ARTWORK_RULER_HINT,/régua sobre a camisa/);
const base=new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64')],{type:'image/png'});
function chunks(bytes){const result=[],view=new DataView(bytes.buffer);for(let i=8;i+12<=bytes.length;){const length=view.getUint32(i),type=String.fromCharCode(...bytes.subarray(i+4,i+8));result.push({type,data:bytes.slice(i+8,i+8+length),raw:bytes.slice(i,i+12+length)});i+=12+length;}return result;}
const original=chunks(new Uint8Array(await base.arrayBuffer()));
const output=new Uint8Array(await (await setArtworkPngDpi(base)).arrayBuffer()),result=chunks(output),phys=result.filter(c=>c.type==='pHYs');
assert.equal(phys.length,1);assert.equal(new DataView(phys[0].data.buffer).getUint32(0),11811);assert.equal(new DataView(phys[0].data.buffer).getUint32(4),11811);assert.equal(phys[0].data[8],1);
assert.deepEqual(result.filter(c=>c.type!=='pHYs'),original,'pixel data and other PNG chunks unchanged');
const repeated=chunks(new Uint8Array(await(await setArtworkPngDpi(new Blob([output]))).arrayBuffer()));assert.equal(repeated.filter(c=>c.type==='pHYs').length,1,'replace DPI instead of duplicate metadata');
await assert.rejects(()=>setArtworkPngDpi(new Blob(['not-png'])));
console.log('Company artwork: proportional cm, invalid dimensions, exact 300 DPI, unchanged pixel payload and idempotent metadata passed.');
