// 28/10 (dono: "quando clica em delete com alguma arte selecionada ele buga… tem que deletar e voltar normal sem bug;
// botão de ver filme onde apertar e mostrar o filme na tela"). Teste com teclado e mouse de verdade (CDP).
// Uso: node scripts/film-delete-browser-qa.mjs  (serve o dist + a fixture do filme numa porta local)
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const types={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.wasm':'application/wasm','.icc':'application/octet-stream','.ttf':'font/ttf'};
const harness=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/film-preview.css"><link rel="stylesheet" href="/film-v74.css"><link rel="stylesheet" href="/film-production.css"><link rel="stylesheet" href="/qr-theme.css"><link rel="stylesheet" href="/qr-screens.css"></head><body><main class="film-page"><section class="film-items-panel"><div id="filmItems"></div></section><div id="filmPreview"></div></main><script type="module">
import {mountFilmPreview} from '/film-preview.js';import {removeFilmEntry} from '/film-edit-core.js';import {rotatedBoundsMm} from '/nesting-core.js';
const art=(c)=>{const k=document.createElement('canvas');k.width=200;k.height=120;const g=k.getContext('2d');g.fillStyle=c;g.fillRect(10,10,180,100);g.fillStyle='#fff';g.font='bold 40px Arial';g.fillText('ARTE',40,75);return k.toDataURL()};
let items=[{localId:'a',sourceId:'asset-a',type:'asset',quantity:4,widthCm:10,heightCm:6,rotationPolicy:'none',label:'Arte A',src:art('#e11d48')},{localId:'b',sourceId:'asset-b',type:'asset',quantity:2,widthCm:12,heightCm:7,rotationPolicy:'none',label:'Arte B',src:art('#2563eb')}];
const pos=(id,copy,x,y)=>{const it=items.find(i=>i.localId===id);return {id,copy,xMm:x,yMm:y,rotation:0,locked:false,label:it.label,sourceWidthMm:it.widthCm*10,sourceHeightMm:it.heightCm*10,...rotatedBoundsMm(it.widthCm*10,it.heightCm*10,0)}};
let layout={filmWidthMm:580,lengthMm:400,gapMm:4,cellMm:2,mode:'maximum',freeRotation:false,angleStep:30,efficiency:30,waste:70,placements:[pos('a',0,0,0),pos('a',1,110,0),pos('a',2,220,0),pos('a',3,330,0),pos('b',0,0,80),pos('b',1,130,80)]};
const list=()=>{document.querySelector('#filmItems').innerHTML=items.map(i=>'<article class="film-item"><b>'+i.label+'</b><input class="film-item-qty" data-id="'+i.localId+'" value="'+i.quantity+'"></article>').join('')};
let generation=0;
function draw(){const g=++generation;let shown=layout;window.__mounts=(window.__mounts||0)+1;mountFilmPreview({element:document.querySelector('#filmPreview'),layout:shown,items,resolveSource:async item=>item.src,isCurrent:()=>g===generation&&layout===shown,validate:async p=>({placements:p}),onChange:next=>{if(g!==generation)return false;layout=next;return true},onRepack:()=>{},onDelete:p=>{if(g!==generation)return false;const r=removeFilmEntry(items,layout,{id:p.id,copy:p.copy});if(!r.changed)return false;items=r.items;layout=r.layout;list();const vp=document.querySelector('#filmPreview')._filmViewport;if(layout?.placements.length){if(vp?.applyRemoval){shown=layout;vp.applyRemoval(layout)}else draw();}return true}});}
list();draw();window.fixture={snapshot:()=>({layout,items})};window.fixtureReady=true;
</script></body></html>`;
const server=http.createServer(async(req,res)=>{try{if(req.url.startsWith('/qa-film-delete.html')){res.writeHead(200,{'content-type':'text/html'});res.end(harness);return}const clean=decodeURIComponent(new URL(req.url,'http://x').pathname);const file=clean==='/scripts/film-fixture.html'?path.join(root,'scripts/film-fixture.html'):path.join(dist,clean);if(!file.startsWith(root))throw 0;let body=await fs.readFile(file);if(clean==='/scripts/film-fixture.html')body=Buffer.from(String(body).replaceAll('qa-owner','00000000-0000-4000-8000-0000000000a1').replaceAll('qa-user','00000000-0000-4000-8000-0000000000b2'));res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body)}catch{res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=process.env.QA_BROWSER||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
const port=9800+Math.floor(Math.random()*150),profile=await fs.mkdtemp(path.join(os.tmpdir(),'z19-del-')),out=process.env.QA_OUT||await fs.mkdtemp(path.join(os.tmpdir(),'z19-del-out-'));
const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--remote-allow-origins=*','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms)),pending=new Map(),errors=[];let socket,id=0;
const send=(method,params={})=>{const key=++id;return new Promise((resolve,reject)=>{const t=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout '+method))},30000);pending.set(key,{resolve:v=>{clearTimeout(t);resolve(v)},reject:e=>{clearTimeout(t);reject(e)}});socket.send(JSON.stringify({id:key,method,params}))})};
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
const wait=async(expression,label,timeout=20000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await delay(60)}throw Error('Timeout: '+label)};
const click=async selector=>{await evaluate('fixture.click('+JSON.stringify(selector)+')');await delay(50)};
const input=async(selector,value,event='input')=>{await evaluate('fixture.setInput('+[selector,value,event].map(JSON.stringify).join(',')+')');await delay(40)};
const shot=async name=>{const d=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(out,name+'.png'),Buffer.from(d.data,'base64'))};
const mouseClick=async(x,y)=>{for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});await delay(80)};
const key=async(name,code)=>{for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key:name,code:name,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code});await delay(120)};
const center=placement=>evaluate(`(()=>{const n=[...document.querySelectorAll('[data-placement]')].find(n=>n.dataset.placement===${JSON.stringify(placement)});if(!n)return null;n.scrollIntoView({block:'center',inline:'center'});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
const state=()=>evaluate(`(()=>{const s=fixture.snapshot();return {count:s.layout?.placements.length||0,keys:(s.layout?.placements||[]).map(p=>JSON.stringify([p.id,p.copy])),selected:document.querySelector('[data-placement].selected')?.dataset.placement||null,busy:!!document.querySelector('.film-preview-busy,[aria-busy=true]'),deleteDisabled:document.querySelector('[data-delete]')?.disabled??null,imgs:[...document.querySelectorAll('.film-placement img')].filter(i=>!(i.complete&&i.naturalWidth)).length,expanded:document.body.classList.contains('film-view-open'),msg:document.querySelector('.film-preview-message,[data-message]')?.textContent||''}})()`);
const report=[];
try{
  let url;for(let n=0;n<80&&!url;n++){try{url=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(p=>p.type==='page')?.webSocketDebuggerUrl}catch{}await delay(100)}
  socket=new WebSocket(url);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  socket.addEventListener('message',e=>{const p=JSON.parse(e.data);if(p.id){const q=pending.get(p.id);if(q){pending.delete(p.id);p.error?q.reject(Error(p.error.message)):q.resolve(p.result)}return}if(p.method==='Runtime.exceptionThrown')errors.push(p.params.exceptionDetails.exception?.description||p.params.exceptionDetails.text);if(p.method==='Runtime.consoleAPICalled'&&p.params.type==='error')errors.push('console: '+p.params.args.map(a=>a.value||a.description).join(' '))});
  await send('Page.enable');await send('Runtime.enable');
  for(const vp of [{name:'pc',width:1366,height:850,mobile:false},{name:'celular',width:390,height:844,mobile:true}]){
    await send('Emulation.setDeviceMetricsOverride',{width:vp.width,height:vp.height,deviceScaleFactor:1,mobile:vp.mobile});
    await send('Page.navigate',{url:origin+'/qa-film-delete.html'});await wait('Boolean(window.fixtureReady)','página do filme');
    await wait("document.querySelectorAll('[data-placement]').length===6",'peças',20000);await delay(800);
    // 1) clicar numa arte e apertar Delete, várias vezes seguidas, com mouse e teclado reais
    for(const [label,keyName,code] of [['Delete','Delete',46],['Backspace','Backspace',8],['Delete','Delete',46]]){
      const before=await state();const target=before.keys[Math.min(1,before.keys.length-1)];const c=await center(target);assert.ok(c,'peça na tela '+target);
      await mouseClick(c.x,c.y);await wait(`document.querySelector('[data-placement].selected')?.dataset.placement===${JSON.stringify(target)}`,'selecionou '+target,5000);
      await evaluate(`window.__keepNode=[...document.querySelectorAll('[data-placement]')].find(n=>n.dataset.placement===${JSON.stringify(before.keys[before.keys.length-1])})`);
      await key(keyName,code);await delay(500);
      assert.equal(await evaluate('window.__mounts'),1,`${vp.name}: ${label} não remonta o filme`);
      assert.equal(await evaluate('window.__keepNode?.isConnected===true'),true,`${vp.name}: as outras artes continuam na tela sem recarregar`);
      const after=await state();report.push([vp.name,label,before.count,'→',after.count,JSON.stringify(after)]);
      assert.equal(after.count,before.count-1,`${vp.name}: ${label} tira 1 peça (${JSON.stringify(after)})`);
      assert.equal(after.deleteDisabled,false,`${vp.name}: o filme não fica travado depois do ${label}`);
    }
    await shot('delete-'+vp.name);
    // 2) a mesma coisa com o filme ampliado
    await evaluate("document.querySelector('[data-expand]').click()");await wait("document.body.classList.contains('film-view-open')",'ampliado');
    {const before=await state();const c=await center(before.keys[0]);await mouseClick(c.x,c.y);await key('Delete',46);await delay(500);const after=await state();report.push([vp.name,'ampliado Delete',before.count,'→',after.count,JSON.stringify(after)]);assert.equal(after.count,before.count-1,'Delete no filme ampliado');assert.equal(after.expanded,true,'continua ampliado depois do Delete');}
    await shot('delete-ampliado-'+vp.name);
    await evaluate("document.querySelector('[data-expand]').click()");
  }
  assert.deepEqual(errors,[],'sem erro no navegador');
  console.log(report.map(r=>r.join(' ')).join('\n'));console.log('PASS Delete no filme · fotos em '+out);
}catch(error){console.error(report.map(r=>r.join(' ')).join('\n'));console.error(error.stack||String(error));console.error('erros:',JSON.stringify(errors).slice(0,2000));try{await shot('falha')}catch{}console.error('fotos: '+out);process.exitCode=1}
finally{try{await send('Browser.close')}catch{}socket?.close();child.kill();server.close()}
