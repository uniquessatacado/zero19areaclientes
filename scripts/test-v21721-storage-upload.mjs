import assert from 'node:assert/strict';
import {createReliableStorageUploader} from '../storage-upload.js';

const MB=1024*1024;
const auth={getSession:async()=>({data:{session:{access_token:'token-test'}},error:null})};

class FakeXHR{
  static requests=[];
  static failNextStandard=false;
  constructor(){this.headers={};this.upload={};this.responseHeaders={};this.status=0;this.responseText='';FakeXHR.requests.push(this)}
  open(method,url){this.method=method;this.url=url}
  setRequestHeader(name,value){this.headers[name.toLowerCase()]=String(value)}
  getResponseHeader(name){return this.responseHeaders[String(name).toLowerCase()]??null}
  send(body){
    this.body=body;
    queueMicrotask(()=>{
      const total=Number(body?.size||0);
      this.upload?.onprogress?.({lengthComputable:true,loaded:Math.floor(total/2),total});
      this.upload?.onprogress?.({lengthComputable:true,loaded:total,total});
      if(this.method==='POST'&&FakeXHR.failNextStandard){FakeXHR.failNextStandard=false;this.onerror?.();return}
      if(this.method==='PATCH'){
        const start=Number(this.headers['upload-offset']||0);this.status=204;this.responseHeaders['upload-offset']=String(start+total);
      }else{this.status=200;this.responseText='{}'}
      this.onload?.();
    });
  }
}

const fetchCalls=[];
const fakeFetch=async(url,init={})=>{
  fetchCalls.push({url:String(url),method:init.method||'GET',headers:init.headers||{}});
  if((init.method||'GET')==='POST'&&String(url).includes('/upload/resumable')){
    return new Response('',{status:201,headers:{location:'https://proj.storage.supabase.co/storage/v1/upload/resumable/abc','upload-offset':'0'}});
  }
  if((init.method||'GET')==='HEAD'){
    return new Response('',{status:200,headers:{'upload-offset':'0'}});
  }
  throw new Error('fetch inesperado '+(init.method||'GET')+' '+url);
};

const uploader=createReliableStorageUploader({
  supabase:{auth},
  projectUrl:'https://proj.supabase.co',
  publishableKey:'sb_publishable_test',
  bucket:'z19p-assets',
  fetchImpl:fakeFetch,
  xhrFactory:()=>new FakeXHR(),
  standardTimeoutMs:1000,tusCreateTimeoutMs:1000,tusChunkTimeoutMs:1000,
});

FakeXHR.requests.length=0;fetchCalls.length=0;
let progress=[];
await uploader.upload('owner/work/small.png',new Blob([new Uint8Array(2*MB)],{type:'image/png'}),{contentType:'image/png',onProgress:p=>progress.push(p.percent)});
assert.equal(FakeXHR.requests.length,1);
assert.equal(FakeXHR.requests[0].method,'POST');
assert.match(FakeXHR.requests[0].url,/\/storage\/v1\/object\/z19p-assets\/owner\/work\/small\.png$/);
assert.equal(fetchCalls.length,0);
assert.equal(progress.at(-1),100);

FakeXHR.requests.length=0;fetchCalls.length=0;progress=[];
await uploader.upload('owner/work/large-fast.png',new Blob([new Uint8Array(20*MB)],{type:'image/png'}),{contentType:'image/png',onProgress:p=>progress.push(p.percent)});
assert.equal(FakeXHR.requests.length,1);
assert.equal(FakeXHR.requests[0].method,'POST');
assert.equal(fetchCalls.length,0);
assert.equal(progress.at(-1),100);

FakeXHR.requests.length=0;fetchCalls.length=0;progress=[];FakeXHR.failNextStandard=true;
await uploader.upload('owner/work/large-fallback.png',new Blob([new Uint8Array(20*MB)],{type:'image/png'}),{contentType:'image/png',onProgress:p=>progress.push(p.percent)});
assert.equal(fetchCalls[0].method,'POST');
assert.equal(fetchCalls[0].url,'https://proj.storage.supabase.co/storage/v1/upload/resumable');
const patches=FakeXHR.requests.filter(r=>r.method==='PATCH');
assert.equal(patches.length,4);
assert.deepEqual(patches.map(r=>r.body.size),[6*MB,6*MB,6*MB,2*MB]);
assert.equal(patches[0].headers['tus-resumable'],'1.0.0');
assert.equal(patches[0].headers['upload-offset'],'0');
assert.equal(patches[3].headers['upload-offset'],String(18*MB));
assert.equal(progress.at(-1),100);
assert.ok(progress.some(v=>v>0&&v<100));

console.log('v2.17.22 storage upload: fast direct 20MB upload with resumable fallback passed.');
