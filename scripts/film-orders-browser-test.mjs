import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

// Isolated Edge fallback for unavailable product browser. Never use a real
// profile/session or a live database. The renderer/Worker/controller are real.
const origin=process.env.FILM_QA_ORIGIN||'http://127.0.0.1:8084';
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'z19-order-film-qa-'));
const output=await fs.mkdtemp(path.join(os.tmpdir(),'z19-order-film-results-'));
const port=10400+Math.floor(Math.random()*200),pending=new Map(),errors=[],external=[],reports=[];
const child=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let socket,id=0,run=0,launchError='';child.stderr.on('data',value=>launchError=(launchError+String(value)).slice(-3000));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function send(method,params={}){const key=++id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout '+method))},45000);pending.set(key,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});socket.send(JSON.stringify({id:key,method,params}));});}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
async function wait(expression,label,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await delay(65);}throw Error('Timeout '+label);}
async function click(selector){await evaluate('fixture.click('+JSON.stringify(selector)+')');await delay(40);}
async function input(selector,value,event='input'){await evaluate('fixture.setInput('+[selector,value,event].map(JSON.stringify).join(',')+')');await delay(20);}
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const order=(index,quantity)=>({project_id:uuid(index*10+1),quote_id:uuid(index*10+2),quote_item_id:uuid(index*10+3),asset_id:uuid(index*10+4),workspace_id:uuid(index*10+5),company_name:'Cliente teste '+index,asset_name:'Arte '+index,processed_path:`fixture/logo-${index===1?'a':'b'}.png`,width_cm:index===1?4:3,height_cm:2,remaining_quantity:quantity,allocations:[],rotation_policy:'90',allow_internal_nesting:false,delivery_date:'2026-09-24'});
const rows=[order(1,5),order(2,4)];
const counters=()=>evaluate('({calls:fixture.orders.recordCalls.length,exports:fixture.orders.exportsRecorded.size,allocated:[...fixture.orders.allocations.values()].reduce((n,a)=>n+a.quantity,0),finance:fixture.testState.financeOffers})');
async function fresh(){await send('Page.navigate',{url:origin+'/scripts/film-fixture.html?ordersQA='+(++run)+'#/filme'});await wait('Boolean(window.fixtureReady||window.fixtureError)','film fixture ready');assert.equal(await evaluate('window.fixtureError||null'),null);await wait("document.querySelectorAll('[data-add-order]').length===2",'released orders');}
async function add(index,quantity){const item=rows[index];await input(`[data-order-qty="${item.quote_item_id}"]`,String(quantity));await click(`[data-add-order="${item.quote_item_id}"]`);await wait("Boolean(fixture.snapshot().layout)&&!document.querySelector('#calculateFilm').disabled",'real nesting for order');}
async function open(){await click('#exportFilm');await wait("Boolean(document.querySelector('.film-export-modal'))",'export modal');}
async function generate(format='png'){const selector=format==='png'?'[data-generate-film-export]':'[data-generate-spot-export]';await click(selector);await wait(`document.querySelector(${JSON.stringify(selector)})?.disabled===false`,'file generated',45000);assert.equal(await evaluate("document.querySelector('[data-film-export-error]').textContent"),'');await wait(`Boolean(document.querySelector('[data-download-${format==='png'?'film':'spot'}-export]'))`,'generated file link');}
async function close(){await click('[data-close-film-export]');}
async function capture(name){const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(output,name+'.png'),Buffer.from(result.data,'base64'));}
try{
 let endpoint;for(let tries=0;tries<70;tries++){try{const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(400)})).json();endpoint=pages.find(page=>page.type==='page')?.webSocketDebuggerUrl;if(endpoint)break;}catch{}await delay(100);}if(!endpoint)throw Error('Edge failed: '+launchError);
 socket=new WebSocket(endpoint);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.id){const request=pending.get(data.id);if(request){pending.delete(data.id);data.error?request.reject(Error(data.error.message)):request.resolve(data.result);}return;}if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails.exception?.description||data.params.exceptionDetails.text);if(data.method==='Fetch.requestPaused'){const request=data.params,allowed=request.request.url.startsWith(origin+'/')||/^(blob:|data:|about:)/.test(request.request.url);if(!allowed)external.push(request.request.url);void send(allowed?'Fetch.continueRequest':'Fetch.failRequest',{requestId:request.requestId,...(allowed?{}:{errorReason:'BlockedByClient'})}).catch(()=>{});}});
 await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:'window.__filmFixtureOrders='+JSON.stringify(rows)+';'});
 for(const viewport of [{name:'desktop',width:1280,height:900,mobile:false},{name:'mobile',width:390,height:844,mobile:true}]){
  await send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1});
  await fresh();await add(0,2);await add(1,2);
  assert.deepEqual(await counters(),{calls:0,exports:0,allocated:0,finance:0},'selection/draft/calculation do not enter production');
  await open();await close();assert.equal((await counters()).calls,0,'opening export alone has no effect');
  await open();await generate();assert.deepEqual(await counters(),{calls:1,exports:1,allocated:4,finance:1});
  const first=await evaluate('fixture.orders.recordCalls[0]');assert.deepEqual(first.p_items.map(item=>item.quantity),[2,2]);assert.equal(new Set(first.p_items.map(item=>item.project_id)).size,2,'mixed customers retain independent linkage');
  await close();await wait(`document.querySelector('[data-order-qty="${rows[0].quote_item_id}"]')?.max==='3'`,'remaining includes no duplicate draft subtraction');
  assert.equal(await evaluate(`document.querySelector('[data-order-qty="${rows[1].quote_item_id}"]').max`),'2');
  await open();await generate('tiff');assert.deepEqual(await counters(),{calls:2,exports:1,allocated:4,finance:1},'cross-dialog PNG/TIFF replay no duplicate allocations or finance');assert.deepEqual(await evaluate('fixture.orders.recordCalls[1]'),first);await close();
  await input('.film-item-qty','3','change');await wait('fixture.snapshot().layout?.placements.length===5','one additional copy');await open();await generate();assert.deepEqual(await counters(),{calls:3,exports:2,allocated:5,finance:1},'modified mixed film counts only additional copy without charging previous pieces again');assert.match(await evaluate("document.querySelector('[data-production-result]').textContent"),/custo anterior/);await close();
  await wait(`document.querySelector('[data-order-qty="${rows[0].quote_item_id}"]')?.max==='2'`,'repeated production-updated listener refreshes pending');
  assert.equal((await evaluate('fixture.metrics()')).overflow,false);await capture('linked-orders-'+viewport.name);

  await open();const beforeFailure=await counters();await evaluate('fixture.testState.failImageDecodes=true');await click('[data-generate-film-export]');await wait("!document.querySelector('[data-generate-film-export]').disabled",'failed image decode');assert.match(await evaluate("document.querySelector('[data-film-export-error]').textContent"),/indisponível/);assert.deepEqual(await counters(),beforeFailure,'failed output never records');await evaluate('fixture.testState.failImageDecodes=false');await close();
  await open();await evaluate('fixture.testState.workerDelayMs=500');await click('[data-generate-spot-export]');await click('[data-cancel-spot-export]');await wait("!document.querySelector('[data-generate-spot-export]').disabled",'TIFF cancellation');assert.match(await evaluate("document.querySelector('[data-film-export-error]').textContent"),/cancelado/);assert.deepEqual(await counters(),beforeFailure,'cancelled TIFF never records');await evaluate('fixture.testState.workerDelayMs=0');await close();

  // A known failure and an ambiguous failure both retain the SAME exact key.
  for(const failure of ['before','after']){
   await fresh();await add(0,2);await evaluate('fixture.testState.recordFailure='+JSON.stringify(failure));await open();await generate();
   assert.ok(await evaluate("Boolean(document.querySelector('[data-download-film-export]'))"),'file remains downloadable when queue confirmation fails');assert.equal((await counters()).finance,0);
   const retryPayload=await evaluate('fixture.orders.recordCalls[0]');await click('[data-production-result] button');await wait('fixture.orders.recordCalls.length===2','explicit queue retry');await wait("!document.querySelector('[data-production-result] button')",'retry resolved');
   assert.deepEqual(await evaluate('fixture.orders.recordCalls[1]'),retryPayload);assert.equal((await counters()).allocated,2);assert.equal((await counters()).exports,1);assert.equal((await counters()).finance,failure==='before'?1:0,'replayed recording cannot duplicate manual financial workflow');await close();
  }
  // Account and route changes during an in-flight original-image read must
  // close the export and suppress both RPC and financial UI callbacks.
  for(const event of ['z19:account-changing','hashchange']){
   await fresh();await add(0,1);await open();await evaluate('fixture.testState.holdImageDecodes=true');await click('[data-generate-film-export]');await wait('fixture.testState.imageDecodeWaiting>0','in-flight export image');
   await evaluate(event==='hashchange'?"location.hash='#/clientes'":"window.dispatchEvent(new Event('z19:account-changing'))");await evaluate('fixture.releaseImageDecodes()');await delay(250);
   assert.equal(await evaluate("Boolean(document.querySelector('.film-export-modal'))"),false,event+' dismisses stale export');assert.equal((await counters()).calls,0);assert.equal((await counters()).finance,0);
  }
  for(const event of ['z19:account-changing','hashchange']){
   await fresh();await add(0,1);await open();await evaluate('fixture.testState.recordGate=new Promise(resolve=>fixture.testState.releaseRecord=resolve);void 0');await click('[data-generate-film-export]');await wait('fixture.orders.recordCalls.length===1','generated file recording in flight');
   assert.equal((await counters()).allocated,1,'generated file legitimately records before navigation');
   await evaluate(event==='hashchange'?"location.hash='#/clientes'":"window.dispatchEvent(new Event('z19:account-changing'))");await evaluate('fixture.testState.releaseRecord()');await delay(200);
   assert.equal(await evaluate("Boolean(document.querySelector('.film-export-modal'))"),false);assert.equal((await counters()).calls,1);assert.equal((await counters()).finance,0,'late response cannot open finance on new screen/account');
  }
  reports.push({viewport:viewport.name,checks:['released-order quick add','no allocation before generation','real PNG and TIFF generation','cross-format key replay','mixed/partial delta accounting','remaining quantities exclude already exported local copies','repeated queue refresh listener','image failure and TIFF cancel no write','failed/ambiguous confirmation same-key retry','no finance duplicate','account and route stale guards']});
 }
 assert.deepEqual(errors,[],'uncaught browser exceptions');assert.deepEqual(external,[],'all external network blocked');const report={ok:true,output,reports};await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){console.error(error.stack||String(error));try{await capture('failure');console.error(JSON.stringify({output,errors,external,fixtureError:await evaluate('window.fixtureError||null'),body:await evaluate('document.body.innerText.slice(-2600)'),counters:await counters()},null,2));}catch{}process.exitCode=1;}
finally{try{if(socket?.readyState===1)await send('Browser.close');}catch{}socket?.close();child.kill();}
