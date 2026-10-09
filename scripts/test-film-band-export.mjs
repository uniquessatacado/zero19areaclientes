import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {createBandReader,encodePngRows,exportBandedPng,needsBandedFilm,scanBandAlpha} from '../film-band-export.js';
import {exportCanvasWithSpot} from '../film-spot-export.js';

// Synthetic long film: 3 px wide, 40 000 px tall (above the 32 767 canvas limit).
const width=3,height=40000,pixel=(x,y)=>y<5||y>39990||x===0?[0,0,0,0]:[y%251,(y*7)%253,x*40,255];
let rendered=0,maxRows=0;
const renderBand=async({top,rows})=>{
  rendered++;maxRows=Math.max(maxRows,rows);
  const canvas={width,height:rows,getContext:()=>({getImageData:(x,y,w,n)=>{const data=new Uint8ClampedArray(w*n*4);for(let r=0;r<n;r++)for(let c=0;c<w;c++)data.set(pixel(x+c,top+y+r),(r*w+c)*4);return {data}}})};
  return canvas;
};
assert.equal(needsBandedFilm(width,height),true);
assert.equal(needsBandedFilm(7087,20000),false);
assert.equal(needsBandedFilm(7087,33000),true,'2,8 m de filme agora usa faixas em vez de bloquear');

const bounds=await scanBandAlpha({width,height,renderBand,bandRows:4096});
assert.deepEqual(bounds,{x:1,y:5,width:2,height:39986});
assert.ok(maxRows<=4096,'nunca cria um canvas do tamanho do filme inteiro');

// Reading across a band boundary returns contiguous rows.
const reader=createBandReader({width,height,renderBand,bandRows:64});
const cross=await reader.read(1,60,2,10);reader.dispose();
for(let r=0;r<10;r++)assert.deepEqual([...cross.slice(r*8,r*8+4)],pixel(1,60+r));

const png=await exportBandedPng({width,height,renderBand,dpi:300});
assert.equal(png.width,2);assert.equal(png.height,39986);
const bytes=new Uint8Array(await png.blob.arrayBuffer());
assert.deepEqual([...bytes.slice(0,8)],[137,80,78,71,13,10,26,10]);
let offset=8,idat=[],ihdr=null,phys=null;
while(offset<bytes.length){const view=new DataView(bytes.buffer,offset),length=view.getUint32(0),type=String.fromCharCode(...bytes.slice(offset+4,offset+8)),data=bytes.slice(offset+8,offset+8+length);if(type==='IHDR')ihdr=data;if(type==='pHYs')phys=data;if(type==='IDAT')idat.push(data);offset+=12+length;}
assert.equal(new DataView(ihdr.buffer).getUint32(4),39986);
assert.equal(new DataView(phys.buffer).getUint32(0),Math.round(300/0.0254),'300 DPI gravado no PNG');
const raw=zlib.inflateSync(Buffer.concat(idat)),stride=2*4;
assert.equal(raw.length,39986*(stride+1));
for(const row of [0,1,4095,4096,20000,39985]){
  const line=raw.subarray(row*(stride+1),(row+1)*(stride+1));assert.equal(line[0],1);
  const out=new Uint8Array(stride);for(let i=0;i<stride;i++)out[i]=(line[1+i]+(i>=4?out[i-4]:0))&255;
  assert.deepEqual([...out],[...pixel(1,5+row),...pixel(2,5+row)],'linha '+row+' idêntica após decodificar');
}

// TIFF RGB of the same long film streams rows without a full canvas.
const tiff=await exportCanvasWithSpot({name:'longo.tif',geometry:{width,height,placements:[{}]},trim:true,colorMode:'rgb',renderBand,renderCanvas:async()=>{throw new Error('canvas inteiro não deve ser criado')},picker:undefined});
assert.equal(tiff.height,39986);assert.equal(tiff.width,2);
const tiffBytes=new Uint8Array(await tiff.blob.arrayBuffer()),pixels=tiffBytes.slice(tiffBytes.length-tiff.width*tiff.height*4);
assert.deepEqual([...pixels.slice(0,4)],pixel(1,5));
assert.deepEqual([...pixels.slice(pixels.length-4)],pixel(2,39990));
console.log('film band export: PASS (rendered bands '+rendered+')');
