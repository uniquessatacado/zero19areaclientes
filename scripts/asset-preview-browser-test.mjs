import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdtemp} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
const allowed=new Map([['/scripts/asset-preview-fixture.html','text/html'],['/asset-preview.js','text/javascript'],['/film-picker.js','text/javascript'],['/film-preview.js','text/javascript'],['/nesting-core.js','text/javascript']]);
const server=createServer(async(req,res)=>{try{const file=new URL(req.url,'http://localhost').pathname;if(!allowed.has(file)){res.writeHead(404);res.end();return}const bytes=await readFile(new URL('..'+file,import.meta.url));res.writeHead(200,{'Content-Type':allowed.get(file)});res.end(bytes)}catch{res.writeHead(500);res.end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,port=10400+Math.floor(Math.random()*200);
const profile=await mkdtemp(path.join(os.tmpdir(),'z19-image-performance-'));
const child=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),pending=new Map(),errors=[];let socket,id=0;
function send(method,params={}){return new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout '+method))},12000);pending.set(key,{resolve:value=>{clearTimeout(timer);resolve(value)},reject});socket.send(JSON.stringify({id:key,method,params}))})}
try{
  let url;for(let i=0;i<80;i++){try{url=(await(await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(300)})).json()).find(p=>p.type==='page')?.webSocketDebuggerUrl;if(url)break}catch{}await delay(100)}assert.ok(url,'Edge launched');
  socket=new WebSocket(url);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject});
  socket.onmessage=event=>{const data=JSON.parse(event.data);if(data.id){const request=pending.get(data.id);if(request){pending.delete(data.id);data.error?request.reject(Error(data.error.message)):request.resolve(data.result)}}else if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails.exception?.description||data.params.exceptionDetails.text)};
  await send('Runtime.enable');await send('Page.enable');await send('Page.navigate',{url:origin+'/scripts/asset-preview-fixture.html'});
  let result;for(let i=0;i<100;i++){result=(await send('Runtime.evaluate',{expression:'window.previewQA||null',returnByValue:true})).result.value;if(result||errors.length)break;await delay(50)}
  assert.deepEqual(errors,[]);assert.equal(result?.ok,true);console.log(JSON.stringify(result));
}finally{try{if(socket?.readyState===1)await send('Browser.close')}catch{}socket?.close();child.kill();await new Promise(resolve=>server.close(resolve))}
