import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

// Isolated local-only fixture; no existing browser profile, auth, DB or uploads.
const baseUrl=process.argv[2]||'http://127.0.0.1:8080',origin=new URL(baseUrl).origin;
if(!['127.0.0.1','localhost'].includes(new URL(baseUrl).hostname))throw Error('This isolated test only runs against localhost.');
const port=10200+Math.floor(Math.random()*300),profile=await fs.mkdtemp(path.join(os.tmpdir(),'z19-cost-cdp-'));
const browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-allow-origins=*',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),pending=new Map(),errors=[],blocked=[],writes=[];let socket,id=0;
function send(method,params={}){const requestId=++id;socket.send(JSON.stringify({id:requestId,method,params}));return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{pending.delete(requestId);reject(Error(`CDP timeout: ${method}`));},20000);pending.set(requestId,{resolve:value=>{clearTimeout(timeout);resolve(value);},reject:error=>{clearTimeout(timeout);reject(error);}});});}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
try{
  let url;for(let attempt=0;attempt<70;attempt++){try{const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(350)})).json();url=pages.find(page=>page.type==='page')?.webSocketDebuggerUrl;if(url)break;}catch{}await delay(100);}
  if(!url)throw Error('Edge DevTools did not start.');socket=new WebSocket(url);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',message=>{const event=JSON.parse(message.data);if(event.id){const request=pending.get(event.id);if(request){pending.delete(event.id);event.error?request.reject(Error(event.error.message)):request.resolve(event.result);}return;}
    if(event.method==='Runtime.exceptionThrown')errors.push(event.params.exceptionDetails.exception?.description||event.params.exceptionDetails.text);
    if(event.method==='Fetch.requestPaused'){const request=event.params,allowed=request.request.url.startsWith(origin+'/')||/^(data:|blob:|about:)/.test(request.request.url);if(!allowed)blocked.push(request.request.url);if(!['GET','HEAD'].includes(request.request.method))writes.push({method:request.request.method,url:request.request.url});send(allowed?'Fetch.continueRequest':'Fetch.failRequest',{requestId:request.requestId,...(allowed?{}:{errorReason:'BlockedByClient'})}).catch(()=>{});}
  });
  await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});await send('Page.navigate',{url:new URL('/scripts/production-cost-fixture.html',baseUrl).href});
  let result;for(let attempt=0;attempt<150;attempt++){result=await evaluate('window.costTestResult||null');if(result)break;await delay(100);}
  assert.ok(result,'Image analysis fixture timed out');assert.equal(result.ok,true,result.error);assert.deepEqual(errors,[],'Uncaught exceptions');assert.deepEqual(blocked,[],'External network requests');assert.deepEqual(writes,[],'Image analysis must not upload or write data');
  console.log(JSON.stringify({...result,externalRequests:blocked.length,writeRequests:writes.length},null,2));
}catch(error){console.error(error.stack||String(error));try{console.error(await evaluate('document.body.innerText'));}catch{}process.exitCode=1;}
finally{try{if(socket?.readyState===1)await send('Browser.close');}catch{}try{socket?.close();}catch{}browser.kill();}
