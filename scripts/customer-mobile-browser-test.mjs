import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
const root=process.cwd(),reportDir=await fs.mkdtemp(path.join(os.tmpdir(),'z19-customer-mobile-'));
const server=http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))throw new Error('Invalid path');const bytes=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(bytes);}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const debugPort=9600+Math.floor(Math.random()*300),profile=await fs.mkdtemp(path.join(os.tmpdir(),'z19-customer-edge-'));
const child=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-allow-origins=*',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));let socket,nextId=0;const pending=new Map(),errors=[];
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++nextId;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout ${method}`));},15000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}});socket.send(JSON.stringify({id,method,params}));});}
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
try{
 let url;for(let n=0;n<80&&!url;n++){try{const pages=await(await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();url=pages.find(p=>p.type==='page')?.webSocketDebuggerUrl;}catch{}if(!url)await delay(100);}assert.ok(url,'Edge debugger available');
 socket=new WebSocket(url);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const item=pending.get(message.id);if(!item)return;pending.delete(message.id);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result);}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);});
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setBlockedURLs',{urls:['https://*']});
 const results=[];
 for(const width of [1280,390,320]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<800});await send('Page.navigate',{url:origin+'/scripts/customer-mobile-fixture.html'});
  let ready=false;for(let n=0;n<80&&!ready;n++){ready=await evaluate('Boolean(window.fixtureReady)');if(!ready)await delay(100);}assert.ok(ready,`Fixture initialized ${width}`);
  assert.equal(await evaluate('document.querySelectorAll("[data-workspace]").length'),2,'mine excludes colleague and foreign');
  assert.equal(await evaluate('document.querySelector("[data-customer-scope=mine]").getAttribute("aria-pressed")'),'true');
  assert.equal(await evaluate('Boolean(document.querySelector(".customer-closed").open)'),false,'historical completed collapsed');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,`No page overflow ${width}`);
  await evaluate('document.querySelector("[data-customer-scope=all]").click()');assert.equal(await evaluate('document.querySelectorAll("[data-workspace]").length'),3,'all same team only');
  await evaluate('document.querySelector("#workspaceSearch").value="equipe";document.querySelector("#workspaceSearch").dispatchEvent(new Event("input"))');assert.equal(await evaluate('document.querySelectorAll("[data-workspace]").length'),1);
  await evaluate('document.querySelector("#workspaceSearch").value="";document.querySelector("#workspaceSearch").dispatchEvent(new Event("input"));document.querySelector(".customer-secondary").open=true');
  if(width<800){assert.ok(await evaluate('parseFloat(getComputedStyle(document.querySelector(".card-status-select")).fontSize)>=16'),'status input prevents focus zoom');}
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(reportDir,`customers-${width}.png`),Buffer.from(shot.data,'base64'));
  await evaluate('customerFixture.openModal()');
  if(width<800){const fieldSizes=await evaluate('Array.from(document.querySelectorAll(".modal input,.modal textarea,.modal select")).map(el=>({font:parseFloat(getComputedStyle(el).fontSize),height:el.getBoundingClientRect().height}))');assert.ok(fieldSizes.every(x=>x.font>=16&&x.height>=44),JSON.stringify(fieldSizes));}
  await evaluate('document.querySelector("#mobileNotes").focus();document.querySelector("#mobileNotes").value="Digitando no orçamento"');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,`No modal overflow ${width}`);
  if(width<800){await send('Emulation.setDeviceMetricsOverride',{width,height:420,deviceScaleFactor:1,mobile:true});await delay(100);const keyboard=await evaluate('({height:innerHeight,bottom:document.querySelector(".modal").getBoundingClientRect().bottom,width:document.documentElement.scrollWidth})');assert.ok(keyboard.bottom<=keyboard.height+1,JSON.stringify(keyboard));assert.ok(keyboard.width<=width+1);await evaluate('document.querySelector(".modal").scrollTop=10000');assert.equal(await evaluate('document.querySelector(".modal-footer").getBoundingClientRect().bottom<=innerHeight'),true,'save action accessible with reduced keyboard viewport');}
  await evaluate('document.querySelector(".modal-backdrop").remove();customerFixture.openPicker()');
  if(width<800){assert.ok(await evaluate('parseFloat(getComputedStyle(document.querySelector(".fp-search input")).fontSize)>=16'),'picker search font');assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'picker no overflow');}
  results.push({width,passed:true});
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(reportDir,'report.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors,reportDir},null,2));
}finally{socket?.close();child.kill();server.close();}
