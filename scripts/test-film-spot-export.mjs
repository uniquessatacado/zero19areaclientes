import assert from 'node:assert/strict';
import {preflightSpotExport,spotCanvasGeometry,createSpotWorkerClient,writeSpotCanvas,exportCanvasWithSpot,findSpotAlphaBounds} from '../film-spot-export.js';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const events=[];
class WorkerStub{
  constructor({quiet=false,badLength=false}={}){this.quiet=quiet;this.badLength=badLength;this.terminated=false;this.messages=[];}
  terminate(){this.terminated=true;events.push('terminate');}
  postMessage(message){this.messages.push(message);if(this.quiet)return;queueMicrotask(()=>{if(this.terminated)return;this.onmessage?.({data:message.type==='init'?{type:'ready'}:{type:'converted',id:message.id,buffer:new ArrayBuffer(message.rgba.byteLength/4*5+(this.badLength?1:0))}});});}
}
function canvas(width=2,height=130,{empty=false}={}){
  return {width,height,getContext:()=>({getImageData:(x,y,w,h)=>{events.push('read:'+y);const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<data.length;i+=4)data.set([255,0,0,empty?0:255],i);return {data};}})};
}

const allowed=preflightSpotExport({width:6850,height:17717,streaming:true,deviceMemory:8});
assert.equal(allowed.pixelBytes,6850*17717*5);assert.ok(allowed.totalBytes>606e6);
assert.throws(()=>preflightSpotExport({width:6850,height:17717,streaming:false,deviceMemory:8}),/gravação direta/);
assert.throws(()=>preflightSpotExport({width:6850,height:17717,streaming:true,deviceMemory:2}),/memória/);
assert.throws(()=>preflightSpotExport({width:20,height:32768,streaming:true,deviceMemory:8}),/dimensão/);
const angular={filmWidthMm:580,lengthMm:200,placements:[{id:'a',xMm:100,yMm:30,widthMm:150,heightMm:100,rotation:37.25}]};
assert.equal(spotCanvasGeometry(angular,true).left,0);assert.equal(spotCanvasGeometry(angular,true).top,0);
assert.equal(spotCanvasGeometry(angular,true).width,Math.round(58/2.54*300));
const orthogonal=spotCanvasGeometry({...angular,placements:[{...angular.placements[0],rotation:90}]},true);assert.equal(orthogonal.left,0);assert.equal(orthogonal.top,0);assert.equal(orthogonal.width,Math.round(58/2.54*300));assert.equal(orthogonal.height,Math.round(20/2.54*300));
assert.deepEqual(spotCanvasGeometry(angular,true),spotCanvasGeometry(angular,false),'full/cropped export always render with the same origin and canvas dimensions');

let worker=new WorkerStub(),client=createSpotWorkerClient({workerFactory:()=>worker});
await client.ready();assert.equal((await client.convert(new Uint8ClampedArray(8))).length,10);client.dispose();client.dispose();assert.ok(worker.terminated);
worker=new WorkerStub({quiet:true});client=createSpotWorkerClient({workerFactory:()=>worker,timeoutMs:20});const waiting=client.ready();await assert.rejects(client.ready(),/uma faixa/);await assert.rejects(waiting,/demorou/);assert.ok(worker.terminated);
const cancel=new AbortController();worker=new WorkerStub({quiet:true});client=createSpotWorkerClient({workerFactory:()=>worker,signal:cancel.signal});const init=client.ready();cancel.abort();await assert.rejects(init,{name:'AbortError'});assert.ok(worker.terminated);
worker=new WorkerStub({badLength:true});client=createSpotWorkerClient({workerFactory:()=>worker});await client.ready();await assert.rejects(client.convert(new Uint8ClampedArray(8)),/incompleta/);client.dispose();

events.length=0;let activeWrites=0,maximumWrites=0;
const written=[];
const output=await writeSpotCanvas({canvas:canvas(),bounds:{x:0,y:0,width:2,height:130},converter:{convert:async rgba=>{events.push('convert');return new Uint8Array(rgba.length/4*5);}},write:async bytes=>{activeWrites++;maximumWrites=Math.max(maximumWrites,activeWrites);events.push('write');await delay(1);written.push(bytes);activeWrites--;}});
assert.equal(maximumWrites,1,'writes never queue ahead of disk backpressure');assert.equal(written.length,4,'header plus 64/64/2 rows');assert.equal(written.reduce((sum,x)=>sum+x.length,0),output.bytes);assert.deepEqual(events,['write','read:0','convert','write','read:64','convert','write','read:128','convert','write']);
const writeCancel=new AbortController();events.length=0;await assert.rejects(writeSpotCanvas({canvas:canvas(),bounds:{x:0,y:0,width:2,height:130},converter:{convert:()=>{throw Error('must not convert')}},signal:writeCancel.signal,write:async()=>writeCancel.abort()}),{name:'AbortError'});assert.deepEqual(events,[]);
await assert.rejects(findSpotAlphaBounds(canvas(2,2,{empty:true})),/transparente/);

async function exportFixture({failWrite=false,pickerError=null,cancelPicker=false,fallback=false}={}){
  const source=canvas(),instance=new WorkerStub(),state={closed:0,aborted:0,writes:0};
  const picker=fallback?undefined:async()=>{if(pickerError)throw pickerError;if(cancelPicker)throw new DOMException('cancel','AbortError');return {createWritable:async()=>({write:async()=>{state.writes++;if(failWrite)throw Error('disk full');},close:async()=>state.closed++,abort:async()=>state.aborted++})};};
  const result=exportCanvasWithSpot({name:'fixture.tif',geometry:{width:2,height:130},renderCanvas:async()=>source,trim:false,workerFactory:()=>instance,picker,deviceMemory:8});
  return {result,source,instance,state};
}
let job=await exportFixture();assert.equal((await job.result).saved,true);assert.equal(job.state.closed,1);assert.equal(job.state.aborted,0);assert.ok(job.instance.terminated);assert.equal(job.source.width,1);
job=await exportFixture({failWrite:true});await assert.rejects(job.result,/disk full/);assert.equal(job.state.aborted,1);assert.equal(job.state.closed,0);assert.ok(job.instance.terminated);assert.equal(job.source.height,1);
job=await exportFixture({pickerError:new DOMException('denied','SecurityError')});const blobResult=await job.result;assert.equal(blobResult.saved,false);assert.equal(blobResult.blob.type,'image/tiff');assert.equal(blobResult.blob.size,blobResult.bytes);assert.ok(job.instance.terminated);
job=await exportFixture({cancelPicker:true});await assert.rejects(job.result,{name:'AbortError'});assert.equal(job.state.writes,0);assert.equal(job.source.width,2,'cancelled picker did not render');
console.log('Spot export: full 58x150cm preflight, 37.25deg origin, worker timeout/cancel, sequential disk writes, failure abort and Blob fallback OK');
