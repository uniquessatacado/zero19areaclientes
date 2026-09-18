import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {isGalleryPath,parseGallery,PRESENTATION_BASE} from '../garment-presentation.js';

// Real renderer/viewer, synthetic artwork and mocked publication. No external
// requests, authenticated session, production records or real Storage writes.
const origin='http://127.0.0.1:8080',port=11300+Math.floor(Math.random()*200);
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'z19-viewer-qa-'));
const artifacts=await fs.mkdtemp(path.join(os.tmpdir(),'z19-presentation-results-'));
const browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
const pending=new Map(),errors=[],external=[],writes=[],results=[],images=new Map();
const base='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/presentations/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/';
const valid=base+'gallery.json',sides=['front','back','left','right'];
const title='Cliente <img src=x onerror=alert(1)> & peças';
let socket,id=0,preload=null,gallery,brokenImage=null;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function send(method,params={}){const key=++id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout '+method))},25000);pending.set(key,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});socket.send(JSON.stringify({id:key,method,params}))})}
async function evaluate(expression){const response=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);return response.result.value}
async function wait(expression,label,timeout=16000){const until=Date.now()+timeout;while(Date.now()<until){if(await evaluate(expression))return;await delay(50)}throw Error('Timeout '+label)}
async function screenshot(name){const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(artifacts,name+'.png'),Buffer.from(shot.data,'base64'))}
async function open({presentation=valid,payload=gallery,text,status=200,contentLength=null,streamOversize=false}={}){
  if(preload)await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:preload});
  const config=JSON.stringify({text:text??JSON.stringify(payload),status,contentLength,streamOversize});
  ({identifier:preload}=await send('Page.addScriptToEvaluateOnNewDocument',{source:
    'window.qa={calls:[],violations:[],storageReads:0};'+
    'addEventListener("securitypolicyviolation",event=>qa.violations.push(event.violatedDirective));'+
    'const previousGetItem=Storage.prototype.getItem;Storage.prototype.getItem=function(){qa.storageReads++;return previousGetItem.apply(this,arguments)};'+
    'const config='+config+',nativeFetch=window.fetch;window.fetch=async(url,options)=>{if(String(url).startsWith('+JSON.stringify(PRESENTATION_BASE)+')){qa.calls.push({url:String(url),options});return new Response(config.streamOversize?"x".repeat(16385):config.text,{status:config.status,headers:{"content-type":"application/json",...(config.contentLength===null?{}:{"content-length":String(config.contentLength)})}})}return nativeFetch(url,options)};'
  }));
  await send('Page.navigate',{url:origin+'/mockup-viewer.html?path='+encodeURIComponent(presentation)});
  await wait('Boolean(window.qa)&&(Boolean(document.querySelector(".customer-gallery"))||Boolean(document.querySelector("#status p")&&!document.querySelector("#status p").textContent.includes("Carregando")))','viewer resolves');
}
function fixtureErrorExpected(){return evaluate('document.querySelector("#status p")?.textContent||""')}
try{
  let url;for(let attempt=0;attempt<70;attempt++){try{const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(350)})).json();url=pages.find(page=>page.type==='page')?.webSocketDebuggerUrl;if(url)break}catch{}await delay(100)}if(!url)throw Error('Isolated Edge failed to start');
  socket=new WebSocket(url);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);if(message.id){const call=pending.get(message.id);if(call){pending.delete(message.id);message.error?call.reject(Error(message.error.message)):call.resolve(message.result)}return}
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
    if(message.method==='Fetch.requestPaused'){
      const request=message.params,art=images.get(request.request.url);
      if(art){send('Fetch.fulfillRequest',{requestId:request.requestId,responseCode:request.request.url===brokenImage?404:200,responseHeaders:[{name:'Content-Type',value:'image/jpeg'},{name:'Access-Control-Allow-Origin',value:'*'}],body:request.request.url===brokenImage?'':art}).catch(()=>{});return}
      const allowed=request.request.url.startsWith(origin+'/')||/^(data:|blob:|about:)/.test(request.request.url);if(!allowed)external.push(request.request.url);if(!['GET','HEAD'].includes(request.request.method))writes.push(request.request.url);
      send(allowed?'Fetch.continueRequest':'Fetch.failRequest',{requestId:request.requestId,...(allowed?{}:{errorReason:'BlockedByClient'})}).catch(()=>{});
    }
  });
  await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  await send('Page.navigate',{url:origin+'/scripts/presentation-fixture.html'});
  await wait('window.qaFixture?.ready','four real 1600px images/PDF',45000);
  const fixture=await evaluate('qaFixture');assert.equal(fixture.error,undefined);
  assert.deepEqual(fixture.views.map(v=>v.side),sides);
  assert.ok(fixture.views.every(v=>v.width===1600&&v.height>800&&v.dataUrl.startsWith('data:image/jpeg;base64,')));
  assert.equal(fixture.uploads.length,5);assert.ok(fixture.uploads.every(u=>u.bucket==='z19p-presentations'&&u.options.upsert===false));
  assert.equal(fixture.uploads.at(-1).type,'application/json');
  const manifest=fixture.uploads.at(-1).json;
  assert.deepEqual(Object.keys(manifest).sort(),['color','kind','model','title','version','views']);
  assert.equal(manifest.views.length,4);assert.ok(!JSON.stringify(manifest).includes('cost'));
  fixture.views.forEach(view=>images.set(PRESENTATION_BASE+base+view.side+'.jpg',view.dataUrl.split(',')[1]));
  gallery={version:1,kind:'z19p-garment-gallery',title,model:'normal',color:'black',views:fixture.views.map(view=>({side:view.side,path:base+view.side+'.jpg',width:view.width,height:view.height})).reverse()};
  assert.equal(isGalleryPath(valid),true);
  assert.deepEqual(parseGallery(gallery,valid).views.map(v=>v.side),sides);
  const pdfPath=path.join(artifacts,'presentation-four-views.pdf');
  await fs.writeFile(pdfPath,Buffer.from(fixture.pdf,'base64'));
  const inspection=spawnSync('python',['scripts/inspect-presentation-pdf.py',pdfPath],{cwd:process.cwd(),encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(inspection.status,0,inspection.stderr||inspection.stdout);
  const pdfReport=JSON.parse(inspection.stdout);results.push({pdf:pdfReport,publishedJSONOnly:true});

  for(const viewport of [{name:'desktop',width:1280,height:900,mobile:false},{name:'mobile',width:390,height:844,mobile:true}]){
    await send('Emulation.setDeviceMetricsOverride',{width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:viewport.mobile});await open();
    assert.equal(await evaluate('document.querySelector("h1").textContent'),title);
    assert.equal(await evaluate('document.querySelector("h1").children.length'),0,'Untrusted title stays text');
    assert.equal(await evaluate('document.querySelectorAll("figure img").length'),4);
    assert.equal(await evaluate('document.querySelectorAll("button,a,input,iframe,[role=tab]").length'),0,'Customer only scrolls, no tabs or downloads');
    const positions=await evaluate('[...document.querySelectorAll("figure")].map(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}})');
    for(let i=1;i<positions.length;i++)assert.ok(positions[i].top>=positions[i-1].bottom,'All views stack vertically');
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth+1'),false);
    assert.ok(await evaluate('document.documentElement.scrollHeight>innerHeight*2'));
    for(let i=0;i<4;i++){
      await evaluate('document.querySelectorAll("figure")['+i+'].scrollIntoView({block:"start"})');
      await wait('document.querySelectorAll("figure img")['+i+'].complete&&document.querySelectorAll("figure img")['+i+'].naturalWidth===1600','view loads '+i);
      if(i===0||i===3)await screenshot('gallery-'+viewport.name+'-'+sides[i]);
    }
    const request=await evaluate('qa.calls[0]');assert.equal(request.options.credentials,'omit');assert.equal(request.options.referrerPolicy,'no-referrer');assert.equal(await evaluate('qa.storageReads'),0,'Public viewer never reads stored session');
    results.push({viewport:viewport.name,views:4,stacked:true,noTabs:true,overflow:false,titleSafe:true,noSessionRead:true});
  }
  await evaluate('(()=>{const script=document.createElement("script");script.textContent="window.inlineExecuted=true";document.body.append(script);const foreign=document.createElement("script");foreign.src="https://blocked.invalid/injected.js";document.body.append(foreign);return fetch("https://blocked.invalid/probe").then(()=>false,()=>true)})()').then(result=>assert.equal(result,true));
  await wait('qa.violations.length>=3','CSP probes');
  assert.equal(await evaluate('Boolean(window.inlineExecuted)'),false);
  assert.ok((await evaluate('qa.violations')).some(v=>v.startsWith('script-src')));
  results.push({CSP:true,inlineScriptBlocked:true,externalScriptBlocked:true,externalConnectBlocked:true});
  for(const invalid of ['',valid+'/../other.json','../../secret','https://blocked.invalid/gallery.json',valid.replace('gallery.json','apresentacao.html'),base+'gallery.json?x=1',base+'..%2Fgallery.json']){
    await open({presentation:invalid});assert.equal(await evaluate('qa.calls.length'),0);assert.match(await fixtureErrorExpected(),/inválido/);
  }
  results.push({invalidPathCases:7,neverFetched:true});
  const invalidGalleries=[
    {...gallery,version:2},
    {...gallery,views:[gallery.views[0],gallery.views[0]]},
    {...gallery,views:gallery.views.map((v,i)=>i? v:{...v,path:'https://blocked.invalid/art.jpg'})},
    {...gallery,views:gallery.views.map((v,i)=>i? v:{...v,path:base+'../front.jpg'})},
    {...gallery,views:gallery.views.map((v,i)=>i? v:{...v,path:'cccccccc-cccc-cccc-cccc-cccccccccccc/presentations/dddddddd-dddd-dddd-dddd-dddddddddddd/'+v.side+'.jpg'})},
    {...gallery,views:gallery.views.map((v,i)=>i? v:{...v,path:'javascript:alert(1)'})},
    {...gallery,views:gallery.views.map((v,i)=>i? v:{...v,width:500000})},
    {...gallery,views:[]}
  ];
  for(const payload of invalidGalleries){await open({payload});assert.match(await fixtureErrorExpected(),/inválida/);assert.equal(await evaluate('document.querySelectorAll("figure").length'),0)}
  await open({text:'<!doctype html><script>alert(1)</script>'});assert.equal(await evaluate('Boolean(document.querySelector(".customer-gallery"))'),false);
  await open({status:404});assert.match(await fixtureErrorExpected(),/não está disponível/);
  await open({contentLength:16385});assert.match(await fixtureErrorExpected(),/tamanho excedido/);
  await open({streamOversize:true});assert.match(await fixtureErrorExpected(),/tamanho excedido/);
  brokenImage=PRESENTATION_BASE+base+'front.jpg';await open();await wait('document.querySelector("figure p")','broken image fallback');assert.match(await evaluate('document.querySelector("figure p").textContent'),/Não foi possível carregar/);
  results.push({maliciousManifestCases:8,storedHTMLRejected:true,notFound:true,headerByteLimit:true,streamByteLimit:true,imageErrorFallback:true});
  assert.deepEqual(external,[],'No unmocked external request');assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  const report={ok:true,artifacts,results,externalRequests:0,remoteWrites:0,unhandledErrors:0};
  await fs.writeFile(path.join(artifacts,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){console.error(error.stack||String(error));console.error(JSON.stringify({artifacts,external,writes,errors},null,2));process.exitCode=1}
finally{try{if(socket?.readyState===1)await send('Browser.close')}catch{}socket?.close();browser.kill()}
