import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),profile=await fs.mkdtemp(path.join(os.tmpdir(),'z19-tiff-options-')),output=await fs.mkdtemp(path.join(os.tmpdir(),'z19-tiff-shots-'));
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.wasm':'application/wasm','.icc':'application/octet-stream','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+pathname),ext=path.extname(file);if(!file.startsWith(root+path.sep)||!types[ext]||pathname.includes('/.')||(pathname.startsWith('/scripts/')&&pathname!='/scripts/film-fixture.html'))throw Error('blocked');res.setHeader('Content-Type',types[ext]);res.end(await fs.readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,port=14900+Math.floor(Math.random()*100);
const child=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));let socket,id=0;const pending=new Map();
function send(method,params={}){const key=++id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP timeout '+method)),30000);pending.set(key,{resolve:value=>{clearTimeout(timer);resolve(value)},reject});socket.send(JSON.stringify({id:key,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function wait(expression){for(let n=0;n<300;n++){if(await evaluate(expression))return;await delay(50)}throw Error('Timeout '+expression+' '+await evaluate('window.fixtureError||document.querySelector("[data-film-export-error]")?.textContent||""'));}
async function click(selector){await evaluate('fixture.click('+JSON.stringify(selector)+')');}
try{
 let url;for(let n=0;n<80;n++){try{url=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(t=>t.type==='page')?.webSocketDebuggerUrl;if(url)break}catch{}await delay(100)}
 if(!url)throw Error('Browser unavailable');socket=new WebSocket(url);await new Promise(r=>socket.addEventListener('open',r,{once:true}));socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}}else if(m.method==='Fetch.requestPaused'){const r=m.params,allow=r.request.url.startsWith(origin+'/')||/^(blob:|data:|about:)/.test(r.request.url);void send(allow?'Fetch.continueRequest':'Fetch.failRequest',{requestId:r.requestId,...(allow?{}:{errorReason:'BlockedByClient'})});}});
 await send('Page.enable');await send('Runtime.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:'window.garmentStudioEnabled=false;'});await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
 for(const viewport of [{name:'desktop',width:1280,height:900,mobile:false},{name:'mobile',width:390,height:844,mobile:true}]){
  await send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1});await send('Page.navigate',{url:origin+'/scripts/film-fixture.html'});await wait('window.fixtureReady||window.fixtureError');assert.equal(await evaluate('window.fixtureError||null'),null);
  await click('#addFilmAsset');await wait('!!document.querySelector(".film-picker")');await click('[data-action=company][data-company=company-a]');await click('[data-action=quick][data-id=asset-a]');await click('[data-action=submit]');await wait('fixture.snapshot().items.length===1');await click('#calculateFilm');await wait('!!fixture.snapshot().layout');await click('#exportFilm');await wait('!!document.querySelector("[data-tiff-color]")');
  const reports=[];
  for(const [mode,curve] of [['rgb',false],['cmyk',false],['cmyk',true]]){
   await evaluate(`fixture.setInput('[data-tiff-color]',${JSON.stringify(mode)},'change');document.querySelector('[data-tiff-curve]').checked=${curve};document.querySelector('[data-tiff-curve]').dispatchEvent(new Event('change'))`);
   assert.equal(await evaluate('document.querySelector("[data-tiff-curve]").disabled'),mode==='rgb');
   assert.equal(await evaluate('document.querySelector(".curve-launcher").hidden'),mode==='rgb'||!curve);
   assert.equal(await evaluate('document.querySelector(".film-export-modal").scrollWidth>document.querySelector(".film-export-modal").clientWidth'),false);
   const before=await evaluate('fixture.testState.spotWorkers');await click('[data-generate-spot-export]');await wait('!document.querySelector("[data-generate-spot-export]").disabled');assert.equal(await evaluate('document.querySelector("[data-film-export-error]").textContent'),'');
   const info=await evaluate(`(async()=>{const link=document.querySelector('[data-download-spot-export]'),bytes=new Uint8Array(await(await fetch(link.href)).arrayBuffer()),v=new DataView(bytes.buffer),tags={};for(let i=0;i<v.getUint16(8,true);i++){const p=10+i*12;tags[v.getUint16(p,true)]=v.getUint16(p+8,true)}return {name:link.download,photo:tags[262],channels:tags[277],extra:tags[338],bytes:bytes.length,workers:fixture.testState.spotWorkers}})()`);
   assert.equal(info.photo,mode==='rgb'?2:5);assert.equal(info.channels,mode==='rgb'?4:5);assert.equal(info.extra,mode==='rgb'?2:0);assert.equal(info.workers-before,mode==='rgb'?0:1);reports.push(info);
  }
  const screenshot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(output,viewport.name+'.png'),Buffer.from(screenshot.data,'base64'));
  assert.equal(await evaluate('fixture.testState.financeOffers'),1,'formats do not duplicate export financial callback');
  console.log(JSON.stringify({viewport:viewport.name,reports,screenshots:output}));
 }
}finally{try{if(socket?.readyState===1)await send('Browser.close')}catch{}socket?.close();child.kill();server.close();}
