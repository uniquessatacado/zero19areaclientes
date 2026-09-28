import assert from 'node:assert/strict';
import {createSpotTiffHeader,composeCmykSpot} from '../film-tiff-core.js';
import {writeSpotCanvas,exportCanvasWithSpot} from '../film-spot-export.js';
const rgba=new Uint8ClampedArray([12,35,240,128,80,90,100,255]);
const canvas={width:2,height:1,getContext:()=>({getImageData:()=>({data:rgba})})};
const bytes=[];
await writeSpotCanvas({canvas,bounds:{x:0,y:0,width:2,height:1},colorMode:'rgb',converter:{convert:()=>{throw Error('RGB must not call CMYK')}},write:async b=>bytes.push(b)});
const header=bytes[0],view=new DataView(header.buffer),tags=new Map();
for(let i=0;i<view.getUint16(8,true);i++){const offset=10+i*12;tags.set(view.getUint16(offset,true),{count:view.getUint32(offset+4,true),value:view.getUint16(offset+8,true)});}
assert.equal(tags.get(262).value,2);assert.equal(tags.get(277).value,4);assert.equal(tags.get(338).value,2);assert.equal(tags.has(34377),false);
assert.deepEqual([...bytes[1]],[...rgba],'RGB pixels and alpha unchanged');
const identity=Uint8Array.from({length:256},(_,i)=>i),cmyk=new Uint8Array([40,80,120,160,100,110,120,130]);
const noCurve=composeCmykSpot(rgba,cmyk,identity);
assert.deepEqual([...noCurve],[20,40,60,80,127,100,110,120,130,0]);
assert.notDeepEqual(composeCmykSpot(rgba,cmyk),noCurve);
const result=await exportCanvasWithSpot({name:'rgb.tif',geometry:{width:2,height:1},renderCanvas:async()=>canvas,trim:false,colorMode:'rgb',picker:null,workerFactory:()=>{throw Error('RGB must not load ICC worker')}});
assert.equal(result.blob.size,createSpotTiffHeader({width:2,height:1,colorMode:'rgb'}).totalBytes);
assert.throws(()=>createSpotTiffHeader({width:2,height:1,colorMode:'unknown'}));
console.log('TIFF options: RGB tags/alpha/exact bytes/no ICC worker, CMYK identity curve and existing curve passed.');
