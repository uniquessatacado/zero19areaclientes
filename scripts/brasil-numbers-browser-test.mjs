import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
assert(process.argv[2],'Pass the prepared preview.html path.');
const file=await fs.realpath(process.argv[2]);
assert(path.basename(file)==='preview.html'&&file.includes('zero19-brasil-numbers-'),'Only the prepared local package may be opened.');
const packageRoot=path.dirname(file);
const server=createServer(async(request,response)=>{try{const name=decodeURIComponent(new URL(request.url,'http://localhost').pathname).replace(/^\//,'');const target=await fs.realpath(path.resolve(packageRoot,name||'preview.html'));assert(target.startsWith(packageRoot+path.sep));const content=await fs.readFile(target);response.writeHead(200,{'Content-Type':target.endsWith('.svg')?'image/svg+xml':target.endsWith('.png')?'image/png':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'none'; connect-src 'none'; frame-src 'none'"});response.end(content);}catch{response.writeHead(404);response.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const localOrigin='http://127.0.0.1:'+server.address().port;
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'zero19-number-browser-')),shots=await fs.mkdtemp(path.join(os.tmpdir(),'zero19-number-shots-')),port=15100+Math.floor(Math.random()*200);
const browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),pending=new Map(),errors=[],remote=[];let socket,id=0;
function send(method,params={}){const key=++id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout '+method));},30000);pending.set(key,{resolve:value=>{clearTimeout(timer);resolve(value);},reject});socket.send(JSON.stringify({id:key,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
try{
 let url;for(let i=0;i<80;i++){try{url=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(t=>t.type==='page')?.webSocketDebuggerUrl;if(url)break;}catch{}await delay(150);}assert(url,'Isolated browser unavailable.');
 socket=new WebSocket(url);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);else if(m.method==='Network.requestWillBeSent'&&/^https?:/.test(m.params.request.url)&&!m.params.request.url.startsWith(localOrigin+'/'))remote.push(m.params.request.url);});
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 for(const viewport of [{name:'desktop',width:1360,height:960,mobile:false},{name:'mobile',width:320,height:844,mobile:true}]){
  await send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1});await send('Page.navigate',{url:localOrigin+'/preview.html'});
  for(let n=0;n<100;n++){if(await evaluate("document.images.length===10&&[...document.images].every(i=>i.complete&&i.naturalWidth>0)"))break;await delay(100);}
  const result=await evaluate(`(()=>{const images=[...document.images];return {width:innerWidth,scroll:document.documentElement.scrollWidth,images:images.map(img=>{const c=document.createElement('canvas');c.width=120;c.height=280;const g=c.getContext('2d');g.drawImage(img,0,0,120,280);const pixels=g.getImageData(0,0,120,280).data;let ink=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>20)ink++;return {complete:img.complete,natural:img.naturalWidth,fit:getComputedStyle(img).objectFit,ink};})};})()`);
  assert.equal(result.images.length,10);assert(result.scroll<=result.width+1,'Horizontal overflow');assert(result.images.every(i=>i.complete&&i.natural>0&&i.ink>100&&i.fit==='contain'),'Blank or clipped number');
  const capture=await send('Page.captureScreenshot',{format:'png'}),shot=path.join(shots,viewport.name+'.png');await fs.writeFile(shot,Buffer.from(capture.data,'base64'));console.log(JSON.stringify({viewport:viewport.name,status:'PASS',numbers:10,externalRequests:remote.length,screenshot:shot}));
 }
 assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
 console.log('PASS local SVG package: 10 complete coloured numbers, no external dependencies, desktop/mobile320 no overflow. No application or production publication.');
}finally{try{if(socket?.readyState===1)await send('Browser.close');}catch{}socket?.close();browser.kill();server.close();}
