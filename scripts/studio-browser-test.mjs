import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

// Local fixture only. Authentication, production data and real Supabase clients are never used.
const baseUrl=process.argv[2]||'http://127.0.0.1:8080';
const origin=new URL(baseUrl).origin;
if(!['127.0.0.1','localhost'].includes(new URL(baseUrl).hostname))throw Error('This isolated test only runs against localhost.');
const port=9800+Math.floor(Math.random()*300);
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'z19-studio-cdp-'));
const output=await fs.mkdtemp(path.join(os.tmpdir(),'z19-studio-results-'));
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-allow-origins=*',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const pending=new Map(),runtimeErrors=[],blockedRequests=[],report=[],screenshots=[];
let socket,nextId=1;
function send(method,params={}){const id=nextId++;socket.send(JSON.stringify({id,method,params}));return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout: ${method}`));},20000);pending.set(id,{resolve:value=>{clearTimeout(timeout);resolve(value);},reject:error=>{clearTimeout(timeout);reject(error);}});});}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
async function wait(expression,message='condition',timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await delay(80);}throw Error('Timed out: '+message);}
async function click(selector){await evaluate(`fixture.click(${JSON.stringify(selector)})`);await delay(50);}
async function input(selector,value,type='input'){await evaluate(`fixture.setInput(${JSON.stringify(selector)},${JSON.stringify(value)},${JSON.stringify(type)})`);await delay(35);}
async function screenshot(name){const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const target=path.join(output,`${name}.png`);await fs.writeFile(target,Buffer.from(shot.data,'base64'));screenshots.push(target);}
async function assertLayout(selector,label){await evaluate(`(async()=>{const animations=[];let node=document.querySelector(${JSON.stringify(selector)});while(node&&node!==document.body){animations.push(...node.getAnimations());node=node.parentElement}await Promise.all(animations.map(animation=>animation.finished.catch(()=>{})));})()`);const metrics=await evaluate(`fixture.metrics(${JSON.stringify(selector)})`);assert.equal(metrics.pageOverflow,false,label+': page horizontal overflow');assert.equal(metrics.dialogOverflow,false,label+': dialog horizontal overflow');assert.equal(metrics.offscreen,false,label+': dialog outside viewport');return metrics;}
async function tapCanvas(rx,ry){const point=await evaluate(`(()=>{const r=document.querySelector('.color-canvas-wrap canvas').getBoundingClientRect();return {x:r.left+r.width*${rx},y:r.top+r.height*${ry}}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});await delay(60);}
async function drag(selector,dx,dy){const point=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:point.x+dx,y:point.y+dy});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:point.x+dx,y:point.y+dy});await delay(60);}
async function waitForShirtImage(){await evaluate("(async()=>{const url=getComputedStyle(document.querySelector('.shirt-surface')).backgroundImage.match(/url\\([\"']?(.*?)[\"']?\\)/)?.[1];if(!url)throw Error('Missing shirt background');const image=new Image();image.src=url;await image.decode();return true;})()");}
async function captureCanvasPixel(x,y){return evaluate(`Array.from(document.querySelector('.color-canvas-wrap canvas').getContext('2d').getImageData(${x},${y},1,1).data)`);}

try{
  let url;
  for(let n=0;n<70;n++){try{const pages=await (await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(350)})).json();url=pages.find(page=>page.type==='page')?.webSocketDebuggerUrl;if(url)break;}catch{}await delay(100);}
  if(!url)throw Error('Edge DevTools did not start.');
  socket=new WebSocket(url);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',message=>{const event=JSON.parse(message.data);if(event.id){const request=pending.get(event.id);if(request){pending.delete(event.id);event.error?request.reject(Error(event.error.message)):request.resolve(event.result);}return;}
    if(event.method==='Runtime.exceptionThrown')runtimeErrors.push(event.params.exceptionDetails.exception?.description||event.params.exceptionDetails.text);
    if(event.method==='Fetch.requestPaused'){const request=event.params;const allowed=request.request.url.startsWith(origin+'/')||/^(data:|blob:|about:)/.test(request.request.url);if(!allowed)blockedRequests.push(request.request.url);send(allowed?'Fetch.continueRequest':'Fetch.failRequest',{requestId:request.requestId,...(allowed?{}:{errorReason:'BlockedByClient'})}).catch(()=>{});}
  });
  await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  for(const viewport of [{name:'desktop',width:1200,height:900,mobile:false},{name:'mobile',width:390,height:844,mobile:true}]){
    await send('Emulation.setDeviceMetricsOverride',{width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:viewport.mobile});
    await send('Page.navigate',{url:new URL('/scripts/studio-fixture.html',baseUrl).href});
    await wait('Boolean(window.fixtureReady||window.fixtureError)','isolated fixture ready');
    const fixtureError=await evaluate('window.fixtureError||null');if(fixtureError)throw Error(fixtureError);
    await evaluate('fixture.prepareCardTest(true)');assert.equal(await evaluate("document.querySelectorAll('#fixture-asset-cards [data-asset=\"asset-one\"] .asset-studio-actions button').length"),3,'Ready art exposes tools even when the print profiles request fails');assert.equal(await evaluate("document.querySelectorAll('#fixture-asset-cards [data-asset=\"asset-draft\"] .asset-studio-actions button').length"),3,'Editing and garment composition do not require print readiness');assert.equal(await evaluate("document.querySelectorAll('#fixture-asset-cards [data-asset=\"photo-only\"] .asset-studio-actions button').length"),0,'A flat mockup photo is not offered as editable artwork');await evaluate('fixture.prepareCardTest();fixture.prepareCardTest()');await wait("document.querySelectorAll('#fixture-asset-cards .define-size').length===3",'Print measure actions load');assert.equal(await evaluate("document.querySelectorAll('#fixture-asset-cards .asset-studio-actions').length"),3,'Repeated enhancement is idempotent');await click('#fixture-asset-cards [data-asset="asset-one"] [data-action="montar"]');await wait("Boolean(document.querySelector('.garment-composer #garmentAddArt'))",'Ready card opens actual garment composer');await assertLayout('.garment-composer','card garment '+viewport.name);await click('.garment-composer .studio-close');await wait("!document.querySelector('.garment-composer')",'Card garment closes');await evaluate('fixture.closeCardTest()');
    await evaluate("fixture.prepareCardTest(false,['asset-two'])");assert.equal(await evaluate("document.querySelectorAll('#fixture-asset-cards [data-asset]').length"),1,'Filtering replaces the visible cards');assert.equal(await evaluate("document.querySelectorAll('#fixture-asset-cards .asset-studio-actions button').length"),3,'Filtered cards regain their real studio tools');assert.equal(await evaluate("document.querySelectorAll('#fixture-asset-cards .define-size').length"),1,'Filtered cards preserve their print measure action');await evaluate('fixture.closeCardTest()');
    await evaluate("document.querySelector('#start-picker').focus();fixture.openPicker()");
    await wait("[...document.querySelectorAll('.fp-image img')].every(i=>i.complete&&i.naturalWidth)",'picker previews');
    assert.equal(await evaluate("document.querySelectorAll('.fp-art-card').length"),2,'Draft must stay out of picker');
    await click('[data-action="company"][data-company="company-one"]');
    await click('[data-action="quick"][data-id="asset-one"]');
    await click('[data-action="company"][data-company="company-two"]');
    await click('[data-action="quick"][data-id="asset-two"]');
    assert.equal(await evaluate('fixture.picker.selected.size'),2,'Multi-company selections must persist');
    await click('[data-action="company"][data-company="company-one"]');
    await click('[data-action="size"][data-id="asset-one"]');
    await input('[data-size-form="asset-one"] [name="width"]','30,5');
    assert.equal(await evaluate("document.querySelector('[data-size-form=\"asset-one\"] [name=\"height\"]').value"),'15,25','Comma input and locked ratio');
    await evaluate("document.querySelector('[data-size-form=\"asset-one\"]').requestSubmit()");
    await click('[data-action="toggle-tray"]');
    await input('[data-input="quantity"][data-id="asset-one"]','3','change');
    await evaluate("fixture.picker.refreshAsset({...fixture.assets[0],name:'Logo atualizado · teste'},{...fixture.profiles[0],default_width_cm:22,default_height_cm:11});fixture.picker.refreshAsset(fixture.assets[1],{...fixture.profiles[1],default_width_cm:12,default_height_cm:6})");
    assert.equal(await evaluate("fixture.picker.selected.get('asset-one').widthCm"),30.5,'Job override survives source refresh');
    assert.equal(await evaluate("fixture.picker.selected.get('asset-two').widthCm"),12,'Default selection follows newly saved size');
    const studioLabels=await evaluate("[...document.querySelector('[data-card-id=\"asset-one\"] .fp-studio-actions').querySelectorAll('button')].map(button=>button.textContent.trim())");assert.deepEqual(studioLabels,['Montar camiseta','Ver na camisa','Editar arte'],'Studio actions have visible, distinct labels');
    const writesBeforeComposer=await evaluate("fixture.operations.filter(operation=>operation.mode&&operation.mode!=='select').length");
    await click('[data-action="garment"][data-id="asset-one"]');await wait("Boolean(document.querySelector('.garment-composer #garmentAddArt'))",'picker opens real multi-art garment composer');assert.equal(await evaluate("Boolean(document.querySelector('#shirtArtWidth'))"),false,'Montar camiseta must not open only the one-art measurement dialog');await assertLayout('.garment-composer','garment access '+viewport.name);await screenshot(`picker-garment-${viewport.name}`);await click('.garment-composer .studio-close');await wait("!document.querySelector('.garment-composer')",'composer closes back into picker');assert.equal(await evaluate('fixture.picker.selected.size'),2,'Opening garment composer preserves multi-company selection');assert.equal(await evaluate("fixture.picker.selected.get('asset-one').widthCm"),30.5,'Opening garment composer preserves job size override');assert.equal(await evaluate("fixture.operations.filter(operation=>operation.mode&&operation.mode!=='select').length"),writesBeforeComposer,'Opening and closing composer does not persist changes');
    const pickerLayout=await assertLayout('.film-picker','picker '+viewport.name);
    await screenshot(`picker-${viewport.name}`);
    await click('[data-action="submit"]');
    await wait("!document.querySelector('.film-picker-backdrop')",'picker submit closes');
    const added=await evaluate('fixture.additions[0]');assert.equal(added.length,2);assert.equal(added.find(a=>a.sourceId==='asset-one').quantity,3);assert.equal(added.find(a=>a.sourceId==='asset-one').widthCm,30.5);assert.equal(added.find(a=>a.sourceId==='asset-one').heightCm,15.25);assert.equal(added.find(a=>a.sourceId==='asset-one').sizeOverride,true);
    await evaluate("document.querySelector('#start-picker').focus();fixture.openPicker()");await click('[data-action="quick"][data-id="asset-one"]');await click('[data-action="close"]');
    assert.equal(await evaluate('fixture.additions.length'),1,'Cancel must not add');assert.equal(await evaluate('document.activeElement.id'),'start-picker','Closing restores keyboard focus');

    await evaluate("fixture.openMockup('asset-one')");await wait("Boolean(document.querySelector('#shirtArtWidth'))",'mockup loads');
    await input('#shirtArtWidth','21,5');assert.equal(await evaluate("document.querySelector('#shirtArtHeight').value"),'10,75');
    await click('[data-side="back"]');await click('[data-color="white"]');await input('#shirtBodyWidth','60');
    const scale=await evaluate("(()=>{const stage=document.querySelector('.shirt-stage'),art=document.querySelector('.shirt-art');return art.getBoundingClientRect().width/stage.getBoundingClientRect().width;})()");
    assert.ok(Math.abs(scale-(21.5/60*.59))<.003,'Artwork must match physical shirt scale');
    await drag('.shirt-art',12,8);
    await drag('.shirt-resize',10,0);
    assert.ok(await evaluate("Number(document.querySelector('#shirtArtWidth').value.replace(',','.'))>21.5"),'Pointer resize must change physical size');
    await input('#shirtArtWidth','21,5');
    await evaluate("document.querySelector('.shirt-art').focus();document.querySelector('.shirt-art').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
    await click('[data-side="left"]');await input('#shirtArtWidth','9');await click('[data-color="black"]');await click('#centerShirtArt');await drag('.shirt-art',5,3);
    assert.equal(await evaluate("document.querySelector('#shirtBodyWidth').value"),'18','Sleeve has its own physical surface width');
    const sleeveScale=await evaluate("document.querySelector('.shirt-art').getBoundingClientRect().width/document.querySelector('.shirt-stage').getBoundingClientRect().width");assert.ok(Math.abs(sleeveScale-(9/18*.23))<.003,'Sleeve art scale is proportional to sleeve width');
    await waitForShirtImage();await assertLayout('.art-studio','left sleeve '+viewport.name);await screenshot(`sleeve-left-${viewport.name}`);
    await click('[data-side="right"]');await click('[data-color="white"]');await click('#centerShirtArt');await waitForShirtImage();await screenshot(`sleeve-right-${viewport.name}`);
    await click('[data-side="back"]');await input('#shirtArtWidth','21,5');assert.equal(await evaluate("document.querySelector('#shirtBodyWidth').value"),'60','Returning to torso restores its physical dimensions');await waitForShirtImage();
    const mockupLayout=await assertLayout('.art-studio','mockup '+viewport.name);
    await screenshot(`mockup-${viewport.name}`);
    await click('#saveShirtSize');await wait("!document.querySelector('.art-studio-backdrop')",'mockup save');
    const savedSize=await evaluate("fixture.profiles.find(p=>p.asset_id==='asset-one')");assert.equal(savedSize.default_width_cm,21.5);assert.equal(savedSize.default_height_cm,10.75);assert.equal(savedSize.ready_for_print,true);
    const placement=await evaluate('fixture.assets[0].metadata.shirt_placement');assert.equal(placement.side,'back');assert.equal(placement.color,'white');assert.equal(placement.shirt_width_cm,60);assert.ok(placement.x_cm>27,'Keyboard placement movement saved');assert.equal(placement.sleeve_width_cm,18);assert.ok(placement.positions.left&&placement.positions.right,'Sleeve placements saved independently');

    await evaluate("fixture.openEditor('asset-one')");await wait("Boolean(document.querySelector('.color-canvas-wrap canvas'))",'editor loads');
    await input('#colorTolerance','0');await input('#colorFeather','0');
    await tapCanvas(.04,.04);assert.equal(await evaluate("document.querySelector('.color-sample b').textContent"),'#000000','Eyedropper samples original pixel');
    await click('#eraseColor');assert.equal((await captureCanvasPixel(2,2))[3],0,'Erased pixels become transparent');assert.equal((await captureCanvasPixel(60,40))[3],255,'Other colors remain opaque');
    await click('#undoColor');assert.equal((await captureCanvasPixel(2,2))[3],255,'Undo restores black');await click('#redoColor');assert.equal((await captureCanvasPixel(2,2))[3],0,'Redo restores transparency');
    await input('#editorBackground','black','change');
    const editorLayout=await assertLayout('.art-studio','editor '+viewport.name);
    await screenshot(`editor-${viewport.name}`);
    await click('#saveArtCopy');await wait("!document.querySelector('.art-studio-backdrop')",'editor copy save',20000);
    const copy=await evaluate("fixture.assets.find(a=>!['asset-one','asset-two','asset-draft'].includes(a.id))");assert.ok(copy,'Duplicate row must be created');assert.ok(copy.name.includes('editada'));assert.equal(copy.metadata.manual_color_edit.source_asset_id,'asset-one');
    const pixels=await evaluate(`fixture.uploadedPixel(${JSON.stringify(copy.processed_path)},2,2)`);assert.equal(pixels.width,240);assert.equal(pixels.height,120);assert.equal(pixels.pixel[3],0,'Worker full-resolution output has transparency');assert.equal((await evaluate(`fixture.uploadedPixel(${JSON.stringify(copy.processed_path)},60,40)`)).pixel[3],255,'Worker preserves remaining colors');
    assert.equal(await evaluate('fixture.assets[0].processed_path'),'fixture/original-one.png','Duplicate leaves source unchanged');assert.ok(await evaluate('fixture.testState.workerCount>0&&fixture.testState.workerMessages>0'),'Real worker must process save');assert.equal(await evaluate(`fixture.profiles.find(p=>p.asset_id===${JSON.stringify(copy.id)}).default_width_cm`),21.5,'Duplicate carries physical size');
    await evaluate("fixture.openEditor('asset-two')");await wait("Boolean(document.querySelector('.color-canvas-wrap canvas'))",'second editor');await input('#colorTolerance','0');await input('#colorFeather','0');await tapCanvas(.04,.04);await click('#eraseColor');await click('#saveArtUpdate');await wait("!document.querySelector('.art-studio-backdrop')",'update existing save',20000);
    const updated=await evaluate("fixture.assets.find(a=>a.id==='asset-two')");assert.notEqual(updated.processed_path,'fixture/original-two.png');assert.equal(updated.original_path,'fixture/original-two.png');assert.ok(updated.metadata.revision_paths.includes('fixture/original-two.png'),'Update retains prior source');
    // A failed optimistic update must remove only its newly uploaded revision and retain the source.
    const uploadCount=await evaluate('fixture.uploads.size');
    await evaluate("fixture.openEditor('asset-one')");await wait("Boolean(document.querySelector('.color-canvas-wrap canvas'))",'conflict editor');await input('#colorTolerance','0');await input('#colorFeather','0');await tapCanvas(.04,.04);await click('#eraseColor');
    await evaluate("fixture.testState.failNext={table:'z19p_assets',mode:'update',error:{code:'PGRST116',message:'simulated concurrent update'}}");
    await click('#saveArtUpdate');await wait("Boolean(document.querySelector('.studio-message.error'))",'optimistic conflict response');
    assert.equal(await evaluate('fixture.uploads.size'),uploadCount,'Failed update cleans only uploaded revision');assert.equal(await evaluate('fixture.assets[0].processed_path'),'fixture/original-one.png','Conflict preserves current source');assert.ok(await evaluate("document.querySelector('.studio-message').textContent.includes('outra tela')"));await click('.studio-close');

    // Nested studio save must update the open picker without losing its selection.
    await evaluate('fixture.openPicker()');await click('[data-action="quick"][data-id="asset-one"]');await click('[data-action="mockup"][data-id="asset-one"]');await wait("Boolean(document.querySelector('#shirtArtWidth'))",'nested mockup');await input('#shirtArtWidth','24');await click('#saveShirtSize');await wait("!document.querySelector('.art-studio-backdrop')",'nested save');
    assert.equal(await evaluate("fixture.picker.selected.get('asset-one').widthCm"),24,'Nested save refreshes pending picker item');
    await click('[data-action="mockup"][data-id="asset-one"]');await wait("Boolean(document.querySelector('#shirtReady'))",'nested readiness');await evaluate("document.querySelector('#shirtReady').checked=false");await click('#saveShirtSize');await wait("!document.querySelector('.art-studio-backdrop')",'nested readiness save');
    assert.equal(await evaluate("fixture.picker.selected.has('asset-one')"),false,'Removing readiness removes item from selection');assert.equal(await evaluate("Boolean(document.querySelector('[data-card-id=\"asset-one\"]'))"),false,'Unready asset disappears from catalogue');await click('[data-action="close"]');
    // Account changes must abort an in-flight real Worker before uploading any revision.
    await evaluate("fixture.openEditor('asset-one')");await wait("Boolean(document.querySelector('.color-canvas-wrap canvas'))",'account-change editor');await input('#colorTolerance','0');await input('#colorFeather','0');await tapCanvas(.04,.04);await click('#eraseColor');const beforeAbort=await evaluate("({uploads:fixture.uploads.size,messages:fixture.testState.workerMessages,terminated:fixture.testState.workerTerminated})");await evaluate('fixture.testState.holdWorkerMessages=true');await click('#saveArtUpdate');await wait('fixture.testState.workerMessages>'+beforeAbort.messages,'Worker waits before account change');await evaluate("window.dispatchEvent(new Event('z19:account-changing'))");await wait("!document.querySelector('.art-studio-backdrop')",'Account change forcibly closes busy editor');await delay(150);assert.equal(await evaluate('fixture.uploads.size'),beforeAbort.uploads,'No image uploaded after the account change');assert.ok(await evaluate('fixture.testState.workerTerminated>'+beforeAbort.terminated),'Pending image Worker is terminated');await evaluate('fixture.testState.holdWorkerMessages=false');
    report.push({viewport:viewport.name,pickerLayout,mockupLayout,editorLayout,selectedItems:added.length,workerCount:await evaluate('fixture.testState.workerCount'),storageUploads:await evaluate('fixture.uploads.size'),writes:await evaluate("fixture.operations.filter(o=>['insert','update','upsert'].includes(o.mode)).length"),checks:['ready and unready cards expose real studio tools','profile error does not hide tools','no tools for flat mockup photograph','idempotent card enhancement','picker explicit garment/mockup/editor labels','garment composer opens from cards and picker without writes','multi-company selection','size override','refresh selected asset','cancel without writes','focus restore','physical scale','pointer move/resize','side/color/placement','left/right sleeve scale and positions','save dimensions','sample color','erase/undo/redo','real worker','duplicate','update preserving original','optimistic conflict cleanup','nested save refresh','readiness removal','account change aborts busy editor and Worker before upload']});
  }
  assert.deepEqual(blockedRequests,[],'Fixture attempted an external request');assert.deepEqual(runtimeErrors,[],'Uncaught browser exceptions');
  console.log(JSON.stringify({ok:true,output,screenshots,report},null,2));
}catch(error){console.error(error.stack||String(error));try{await screenshot('failure');console.error(JSON.stringify({ok:false,output,screenshots,runtimeErrors,blockedRequests,body:await evaluate('document.body.innerText.slice(-2500)')},null,2));}catch{}process.exitCode=1;}
finally{try{if(socket?.readyState===1)await send('Browser.close');}catch{}try{socket?.close();}catch{}browser.kill();}
