import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
const root=process.cwd(),reportDir=await fs.mkdtemp(path.join(os.tmpdir(),'z19-company-admin-'));
const server=http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))throw new Error('Invalid path');const bytes=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(bytes);}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const debugPort=9600+Math.floor(Math.random()*300),profile=await fs.mkdtemp(path.join(os.tmpdir(),'z19-company-admin-edge-'));
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
  await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<800});await send('Page.navigate',{url:origin+'/scripts/company-admin-fixture.html'});
  let ready=false;for(let n=0;n<80&&!ready;n++){ready=await evaluate('Boolean(window.fixtureReady)');if(!ready)await delay(100);}assert.ok(ready,'Admin initialized '+width);
  assert.equal(await evaluate('document.querySelectorAll(".partner-company").length'),1);
  assert.equal(await evaluate('document.querySelectorAll(".partner-order").length'),1,'only active order by default');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'No overflow '+width);
  await evaluate('document.querySelector("[data-copy-partner]").click()');assert.match(await evaluate('partnerAdminFixture.copied[0]'),/empresa\.html#\/fixture-token-not-real$/);
  await evaluate('document.querySelector("[data-filter-partner]").click()');assert.equal(await evaluate('document.querySelectorAll(".partner-order").length'),2,'all company orders');
  await evaluate('document.querySelector("[data-open-partner-order]").click()');assert.equal(await evaluate('partnerAdminFixture.navigated'),'/pedido-empresa/project-pending');
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(reportDir,'partners-'+width+'.png'),Buffer.from(shot.data,'base64'));
  await evaluate('document.querySelector("#newPartnerCompany").click()');
  assert.equal(await evaluate('document.querySelector("#partnerCompanyName").value'),'','new company is not hardcoded');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'No modal overflow');
  await evaluate('document.querySelector("#partnerCompanyName").value="Empresa <script>teste</script>";document.querySelector("#partnerClientName").value="Contato";document.querySelector(".partner-create form").requestSubmit()');
  for(let n=0;n<50&&await evaluate('Boolean(document.querySelector(".partner-create"))');n++)await delay(50);
  assert.equal(await evaluate('document.querySelectorAll(".partner-company").length'),2);
  assert.equal(await evaluate('Boolean(document.querySelector(".partner-company script"))'),false,'company names escaped');
  assert.equal(await evaluate('partnerAdminFixture.calls.filter(c=>c.name==="z19p_company_portal_manage").length'),1,'single creation');
  await evaluate('partnerAdminFixture.failRead=true;partnerAdminFixture.render()');
  for(let n=0;n<50&&!await evaluate('Boolean(document.querySelector("#retryPartners"))');n++)await delay(50);
  assert.equal(await evaluate('Boolean(document.querySelector("#retryPartners"))'),true,'read failure visible');
  assert.equal(await evaluate('document.querySelectorAll(".partner-company").length'),0,'no fake results on network error');
  await evaluate('partnerAdminFixture.failRead=false;partnerAdminFixture.hold=true;void partnerAdminFixture.render()');await delay(50);
  await evaluate('partnerAdminFixture.actor="other-account";document.querySelector("#app").textContent="New account";partnerAdminFixture.release()');await delay(50);
  assert.equal(await evaluate('document.querySelector("#app").textContent'),'New account','late results cannot replace another account');
  results.push({width,passed:true});
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(reportDir,'report.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors,reportDir},null,2));
}finally{socket?.close();child.kill();server.close();}
