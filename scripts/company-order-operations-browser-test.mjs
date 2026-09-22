import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
// Isolated browser + synthetic RPC fixtures only. Never reads user profiles or a live database.
const root=process.cwd(),output=await fs.mkdtemp(path.join(os.tmpdir(),'z19-company-operations-'));
const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))throw Error('Invalid path');const bytes=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(bytes);}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`,port=13500+Math.floor(Math.random()*400),profile=await fs.mkdtemp(path.join(os.tmpdir(),'z19-company-order-edge-'));
const browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-allow-origins=*',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const pending=new Map(),errors=[],external=[],report=[],delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));let socket,id=0;
function send(method,params={}){return new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(Error('Timeout '+method));},20000);pending.set(key,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});socket.send(JSON.stringify({id:key,method,params}));});}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
async function wait(expression,label){const end=Date.now()+20000;while(Date.now()<end){if(await evaluate(expression))return;await delay(60);}throw Error('Timeout '+label);}
async function click(selector){await evaluate('fixture.click('+JSON.stringify(selector)+')');await delay(60);}
async function fresh(){await send('Page.navigate',{url:origin+'/scripts/company-order-operations-fixture.html?qa='+Date.now()});await wait('Boolean(window.fixtureReady)','fixture');}
async function shot(name){const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(output,name+'.png'),Buffer.from(result.data,'base64'));}
try{
  let endpoint;for(let attempt=0;attempt<80&&!endpoint;attempt++){try{const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(500)})).json();endpoint=pages.find(page=>page.type==='page')?.webSocketDebuggerUrl;}catch{}if(!endpoint)await delay(100);}assert.ok(endpoint,'Edge debugger available');
  socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});socket.addEventListener('message',message=>{const event=JSON.parse(message.data);if(event.id){const task=pending.get(event.id);if(task){pending.delete(event.id);event.error?task.reject(Error(event.error.message)):task.resolve(event.result);}return;}if(event.method==='Runtime.exceptionThrown')errors.push(event.params.exceptionDetails.exception?.description||event.params.exceptionDetails.text);if(event.method==='Fetch.requestPaused'){const request=event.params,allowed=request.request.url.startsWith(origin+'/')||/^(data:|blob:|about:)/.test(request.request.url);if(!allowed)external.push(request.request.url);void send(allowed?'Fetch.continueRequest':'Fetch.failRequest',{requestId:request.requestId,...(allowed?{}:{errorReason:'BlockedByClient'})}).catch(()=>{});}});
  await send('Runtime.enable');await send('Page.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  for(const width of [1280,390,320]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<800});await fresh();
    assert.equal(await evaluate('fixture.records.writes.length'),0);assert.equal(await evaluate("document.querySelectorAll('.partner-order-item').length"),2);
    assert.ok(await evaluate("document.body.textContent.includes('Jean Caui')"));assert.equal(await evaluate("document.body.textContent.includes('SEM ORÇAMENTO')"),false);
    assert.ok(await evaluate("document.querySelector('.partner-order-item h3').textContent.includes('Preto')"));assert.ok(await evaluate("document.querySelector('.partner-order-item small').textContent.includes('20 × 10 cm')"),'requested measures visible before internal readiness');
    assert.deepEqual(await evaluate('fixture.metrics()'),{overflow:false,broken:0});await shot('pending-'+width);
    await evaluate("fixture.input('#partnerOrderStatus',fixture.id(5),'change')");await click('[data-partner-status]');
    await wait("fixture.records.errors.some(row=>row.message.includes('Prepare as medidas'))",'technical gate');assert.equal(await evaluate('fixture.project.status_id'),await evaluate('fixture.id(4)'));
    for(const n of [11,12]){
      const selector=await evaluate('`[data-partner-measure="${fixture.id('+n+')}"]`');await click(selector);await wait("Boolean(document.querySelector('#sizeWidth'))",'real profile modal');
      await evaluate("fixture.input('#sizeWidth','25');document.querySelector('#profileReady').checked=true");assert.equal(await evaluate("document.querySelector('#sizeHeight').value"),'12,5');
      await click('#savePrintProfile');await wait("!document.querySelector('#sizeWidth')",'measure saved');await wait("Boolean(document.querySelector('[data-partner-status]'))",'order refreshed');
    }
    assert.equal(await evaluate('fixture.records.writes.length'),2);assert.ok(await evaluate('fixture.records.writes.every(row=>row.payload.owner_id===fixture.id(1)&&row.payload.project_id===fixture.project.id)'));
    await evaluate("fixture.input('#partnerOrderStatus',fixture.id(5),'change')");await click('[data-partner-status]');await wait('fixture.project.status_id===fixture.id(5)','status updated');
    assert.ok(await evaluate("fixture.records.rpc.filter(row=>row.name==='z19p_transition_project').every(row=>row.args.p_project_id===fixture.project.id)"));
    await click('[data-partner-delivery]');await wait("fixture.project.delivery_date==='2099-10-20'",'delivery saved');
    assert.deepEqual(await evaluate('fixture.metrics()'),{overflow:false,broken:0});await shot('prepared-'+width);
    await evaluate("fixture.input('#partnerOrderStatus',fixture.id(6),'change')");await click('[data-partner-status]');await wait("document.body.textContent.includes('Pedido encerrado')",'order finalized');assert.equal(await evaluate("Boolean(document.querySelector('[data-partner-status]'))"),false);
    report.push({width,checks:['scoped detail','no artificial payment','two independent size lines','real profile modal and proportional measures','technical release gate','exact-project status and delivery','closed order preserved','responsive no overflow or broken image']});
  }
  await fresh();await evaluate('fixture.records.holdPrepare=true');await click('[data-partner-status]');await wait('Boolean(fixture.records.releasePrepare)','prepare pending');await evaluate("location.hash='#/outro-pedido';fixture.records.releasePrepare();void 0");await delay(160);assert.equal(await evaluate("fixture.records.rpc.filter(row=>row.name==='z19p_transition_project').length"),0,'late preparation does not transition status on another route');
  await fresh();await click('[data-partner-measure]');await wait("Boolean(document.querySelector('#sizeWidth'))",'profile guard modal');await evaluate("fixture.input('#sizeWidth','20');fixture.state.session.user.id=fixture.id(99)");await click('#savePrintProfile');assert.equal(await evaluate('fixture.records.writes.length'),0,'profile modal cannot save after account changed');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await fs.writeFile(path.join(output,'report.json'),JSON.stringify({ok:true,report,errors,external},null,2));console.log(JSON.stringify({ok:true,output,report},null,2));
}catch(error){console.error(error.stack||String(error));try{await shot('failure');console.error(JSON.stringify({output,errors,external,body:await evaluate('document.body.innerText.slice(-4000)'),fixtureErrors:await evaluate('window.fixture?.records.errors')},null,2));}catch{}process.exitCode=1;}
finally{try{if(socket?.readyState===1)await send('Browser.close');}catch{}socket?.close();browser.kill();server.close();}
