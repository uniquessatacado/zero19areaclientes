// 29/10 (dono: "na montagem do filme permita eu girar a arte que está no filme apertando botão girar e então a arte
// que está selecionada gira"). Seleciona uma arte com o mouse/toque real, aperta "↻ Girar" (e a tecla R) e confere que
// só ela girou, sem mudar a medida, sem ficar em cima de outra arte e com o botão desligado sem seleção e em arte travada.
// Uso: node scripts/film-rotate-browser-qa.mjs (depois do build)
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const types={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.wasm':'application/wasm','.icc':'application/octet-stream','.ttf':'font/ttf'};
const harness=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/film-preview.css"><link rel="stylesheet" href="/film-mobile.css"><link rel="stylesheet" href="/film-v74.css"><link rel="stylesheet" href="/film-production.css"><link rel="stylesheet" href="/qr-theme.css"><link rel="stylesheet" href="/qr-screens.css"></head><body><main class="film-page"><div class="film-canvas-panel"><div id="filmMetrics" class="film-metrics"></div><div class="film-preview-shell"><div id="filmPreview" class="film-preview"></div></div></div></main><script type="module">
import {mountFilmPreview} from '/film-preview.js';import {nestItems,snapFilmPlacement,validateFilmPlacements} from '/nesting-core.js';
const art=(c,w,h)=>{const k=document.createElement('canvas');k.width=w;k.height=h;const g=k.getContext('2d');g.fillStyle=c;g.fillRect(4,4,w-8,h-8);g.fillStyle='#fff';g.font='bold 30px Arial';g.fillText('ARTE',10,h/2+10);return k.toDataURL()};
const items=[{localId:'a',sourceId:'asset-a',type:'asset',quantity:3,widthCm:27,heightCm:12,rotationPolicy:'free',label:'Costas',src:art('#e11d48',270,120)},{localId:'b',sourceId:'asset-b',type:'asset',quantity:8,widthCm:9,heightCm:9,rotationPolicy:'free',label:'Peito',src:art('#2563eb',90,90)},{localId:'c',sourceId:'asset-c',type:'asset',quantity:4,widthCm:30,heightCm:6,rotationPolicy:'free',label:'Nome',src:art('#16a34a',300,60)}];
const nestInputs=()=>items.map(i=>({id:i.localId,widthMm:i.widthCm*10,heightMm:i.heightCm*10,quantity:i.quantity,rotationPolicy:i.rotationPolicy,label:i.label}));
const settings={filmWidthMm:580,mode:'normal',gapMm:4,cellMm:2};
let layout=nestItems(nestInputs(),settings);
// Mesmo caminho do app: mover/girar usa o encaixe 'move' (lugar livre mais perto) com o filme podendo crescer growMm.
const validate=async(placements,moving,extra={})=>moving?snapFilmPlacement(nestInputs(),placements,moving,{...settings,placements,moving,lengthMm:layout.lengthMm+Math.max(0,Number(extra.growMm)||0)}):validateFilmPlacements(nestInputs(),placements,settings);
mountFilmPreview({element:document.querySelector('#filmPreview'),layout,items,resolveSource:async item=>item.src,isCurrent:()=>true,validate,onChange:next=>{layout=next;window.fixture.layout=next;return true},onRepack:()=>{},onDelete:()=>false});
window.fixture={layout,total:items.reduce((n,i)=>n+i.quantity,0)};window.fixtureReady=true;
</script></body></html>`;
const server=http.createServer(async(req,res)=>{try{if(req.url.startsWith('/qa-film-rotate.html')){res.writeHead(200,{'content-type':'text/html'});res.end(harness);return}const clean=decodeURIComponent(new URL(req.url,'http://x').pathname);const file=clean==='/scripts/film-fixture.html'?path.join(root,'scripts/film-fixture.html'):path.join(dist,clean);if(!file.startsWith(root))throw 0;let body=await fs.readFile(file);if(clean==='/scripts/film-fixture.html')body=Buffer.from(String(body).replaceAll('qa-owner','00000000-0000-4000-8000-0000000000a1').replaceAll('qa-user','00000000-0000-4000-8000-0000000000b2'));res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body)}catch{res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=process.env.QA_BROWSER||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
const port=9800+Math.floor(Math.random()*150),profile=await fs.mkdtemp(path.join(os.tmpdir(),'z19-rotate-')),out=process.env.QA_OUT||await fs.mkdtemp(path.join(os.tmpdir(),'z19-rotate-out-'));
const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--remote-allow-origins=*','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms)),pending=new Map(),errors=[];let socket,id=0;
const send=(method,params={})=>{const key=++id;return new Promise((resolve,reject)=>{const t=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout '+method))},30000);pending.set(key,{resolve:v=>{clearTimeout(t);resolve(v)},reject:e=>{clearTimeout(t);reject(e)}});socket.send(JSON.stringify({id:key,method,params}))})};
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
const wait=async(expression,label,timeout=20000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await delay(60)}throw Error('Timeout: '+label)};
const click=async selector=>{await evaluate('document.querySelector('+JSON.stringify(selector)+').click()');await delay(80)};
const input=async(selector,value,event='input')=>{await evaluate('fixture.setInput('+[selector,value,event].map(JSON.stringify).join(',')+')');await delay(40)};
const shot=async name=>{const d=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(out,name+'.png'),Buffer.from(d.data,'base64'))};
const mouseClick=async(x,y)=>{for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});await delay(80)};
const report=[];
try{
  let url;for(let n=0;n<300&&!url;n++){try{url=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(p=>p.type==='page')?.webSocketDebuggerUrl}catch{}await delay(100)}
  socket=new WebSocket(url);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  socket.addEventListener('message',e=>{const p=JSON.parse(e.data);if(p.id){const q=pending.get(p.id);if(q){pending.delete(p.id);p.error?q.reject(Error(p.error.message)):q.resolve(p.result)}return}if(p.method==='Runtime.exceptionThrown')errors.push(p.params.exceptionDetails.exception?.description||p.params.exceptionDetails.text);if(p.method==='Runtime.consoleAPICalled'&&p.params.type==='error')errors.push('console: '+p.params.args.map(a=>a.value||a.description).join(' '))});
  await send('Page.enable');await send('Runtime.enable');
  for(const vp of [{name:'pc',width:1366,height:900,mobile:false},{name:'celular',width:390,height:844,mobile:true}]){
    await send('Emulation.setDeviceMetricsOverride',{width:vp.width,height:vp.height,deviceScaleFactor:1,mobile:vp.mobile});
    await send('Page.navigate',{url:origin+'/qa-film-rotate.html'});await wait('Boolean(window.fixtureReady)','página do filme');
    await wait("document.querySelectorAll('[data-placement]').length===fixture.total",'peças',20000);await delay(800);
    const state=`(()=>{const L=fixture.layout,sel=document.querySelector('.film-placement.selected'),b=document.querySelector('[data-rotate-selected]');let overlap=false;for(let i=0;i<L.placements.length;i++)for(let j=i+1;j<L.placements.length;j++){const p=L.placements[i],q=L.placements[j];if(p.xMm<q.xMm+q.widthMm-.01&&q.xMm<p.xMm+p.widthMm-.01&&p.yMm<q.yMm+q.heightMm-.01&&q.yMm<p.yMm+p.heightMm-.01)overlap=true}const k=sel?.dataset.placement,p=k?L.placements.find(x=>JSON.stringify([x.id,x.copy])===k):null;return {key:k||null,rotation:p?Number(p.rotation||0):null,w:p?.widthMm,h:p?.heightMm,sw:p?.sourceWidthMm,sh:p?.sourceHeightMm,overlap,disabled:b?.disabled,visible:Boolean(b&&b.getClientRects().length),help:document.querySelector('[data-help]')?.textContent||'',count:L.placements.length,hscroll:document.documentElement.scrollWidth>innerWidth+1}})()`;
    let s=await evaluate(state);
    assert.equal(s.visible,true,vp.name+': botão Girar aparece na barra');
    assert.equal(s.disabled,true,vp.name+': sem arte selecionada o Girar fica desligado');
    // Seleciona a arte larga "Costas" (27 × 12) com clique de verdade no meio dela.
    const box=await evaluate(`(()=>{const n=[...document.querySelectorAll('.film-placement')].find(n=>JSON.parse(n.dataset.placement)[0]==='a');n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,key:n.dataset.placement}})()`);
    await delay(200);const box2=await evaluate(`(()=>{const r=document.querySelector('[data-placement=${JSON.stringify(box.key).replace(/"/g,'\\"')}]')?.getBoundingClientRect();return r?{x:r.left+r.width/2,y:r.top+r.height/2}:null})()`)||box;
    if(vp.mobile){for(const type of ['touchStart','touchEnd'])await send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x:box2.x,y:box2.y}]});await delay(150);}else await mouseClick(box2.x,box2.y);
    s=await evaluate(state);
    if(s.key!==box.key){await evaluate(`document.querySelector('[data-placement=${JSON.stringify(box.key).replace(/"/g,'\\"')}]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse',pointerId:9}))`);s=await evaluate(state);report.push([vp.name,'(seleção por evento)'])}
    assert.equal(s.key,box.key,vp.name+': arte selecionada');assert.equal(s.disabled,false,vp.name+': com arte selecionada o Girar liga');assert.equal(s.rotation,0);
    const before=s,others=await evaluate(`JSON.stringify(fixture.layout.placements.filter(p=>JSON.stringify([p.id,p.copy])!==${JSON.stringify(box.key)}).map(p=>[p.id,p.copy,p.rotation||0]))`);
    const turn=async(expected,how)=>{if(how==='tecla'){await send('Input.dispatchKeyEvent',{type:'keyDown',key:'r',code:'KeyR',text:'r',windowsVirtualKeyCode:82});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'r',code:'KeyR',windowsVirtualKeyCode:82});}else{const r=await evaluate(`(()=>{const b=document.querySelector('[data-rotate-selected]');b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);if(vp.mobile){for(const type of ['touchStart','touchEnd'])await send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x:r.x,y:r.y}]});}else await mouseClick(r.x,r.y);}
      await wait(`(()=>{const s=${state};return s.rotation===${expected}&&s.disabled===false})()`,vp.name+' girar para '+expected+' ('+how+')',8000);return evaluate(state)};
    s=await turn(90,'botão');
    assert.equal(s.key,before.key,vp.name+': a mesma arte continua selecionada');
    assert.equal(s.sw,270);assert.equal(s.sh,120);assert.equal(s.w,120,vp.name+': girada fica 12 de largura');assert.equal(s.h,270,vp.name+': girada fica 27 de altura');
    assert.equal(s.overlap,false,vp.name+': girada não fica em cima de outra arte');assert.match(s.help,/girada para 90°/);
    await shot('girar-90-'+vp.name);
    const otherNow=await evaluate(`JSON.stringify(fixture.layout.placements.filter(p=>JSON.stringify([p.id,p.copy])!==${JSON.stringify(box.key)}).map(p=>[p.id,p.copy,p.rotation||0]))`);
    assert.equal(otherNow,others,vp.name+': só a arte selecionada girou');
    s=await turn(180,'tecla');assert.equal(s.w,270);assert.equal(s.h,120);assert.equal(s.overlap,false);
    s=await turn(270,'botão');s=await turn(0,'botão');assert.equal(s.overlap,false,vp.name+': volta a 0° sem sobrepor');
    // Arte travada não gira.
    await evaluate("document.querySelector('.film-selection-details').open=true");await click('[data-lock]');s=await evaluate(state);
    assert.equal(s.disabled,true,vp.name+': arte travada deixa o Girar desligado');
    await click('[data-lock]');s=await evaluate(state);assert.equal(s.disabled,false);
    assert.equal(s.hscroll,false,vp.name+': sem rolagem lateral');
    report.push([vp.name,'ok',JSON.stringify({w:s.w,h:s.h,count:s.count})]);
    await evaluate("document.querySelector('.film-view-toolbar').scrollIntoView({block:'start'})");await delay(200);await shot('barra-'+vp.name);
  }
  assert.deepEqual(errors,[],'sem erro no navegador');
  console.log(report.map(r=>r.join(' ')).join('\n'));console.log('PASS Girar arte · fotos em '+out);
}catch(error){console.error(report.map(r=>r.join(' ')).join('\n'));console.error(error.stack||String(error));console.error('erros:',JSON.stringify(errors).slice(0,2000));try{await shot('falha')}catch{}console.error('fotos: '+out);process.exitCode=1}
finally{try{await send('Browser.close')}catch{}socket?.close();child.kill();server.close()}
