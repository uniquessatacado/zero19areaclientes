// 28/10 (dono: "linha invisível no filme de no máximo 38 cm para cortar e pôr no forno de 40 cm… sem atravessar arte").
// Desenha um filme comprido com a linha do forno ligada e confere que as linhas aparecem e nenhuma arte fica em cima delas.
// Uso: node scripts/film-oven-browser-qa.mjs
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const types={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.wasm':'application/wasm','.icc':'application/octet-stream','.ttf':'font/ttf'};
const harness=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/film-preview.css"><link rel="stylesheet" href="/film-v74.css"><link rel="stylesheet" href="/film-production.css"><link rel="stylesheet" href="/qr-theme.css"><link rel="stylesheet" href="/qr-screens.css"></head><body><main class="film-page"><div id="filmPreview"></div></main><script type="module">
import {mountFilmPreview} from '/film-preview.js';import {applyOvenCuts} from '/film-oven-cuts.js';import {rotatedBoundsMm} from '/nesting-core.js';
const art=(c)=>{const k=document.createElement('canvas');k.width=120;k.height=240;const g=k.getContext('2d');g.fillStyle=c;g.fillRect(4,4,112,232);g.fillStyle='#fff';g.font='bold 34px Arial';g.fillText('ARTE',14,130);return k.toDataURL()};
const items=[{localId:'a',sourceId:'asset-a',type:'asset',quantity:8,widthCm:12,heightCm:25,rotationPolicy:'none',label:'Costas',src:art('#e11d48')},{localId:'b',sourceId:'asset-b',type:'asset',quantity:8,widthCm:10,heightCm:9,rotationPolicy:'none',label:'Peito',src:art('#2563eb')}];
const pos=(id,copy,x,y)=>{const it=items.find(i=>i.localId===id);return {id,copy,xMm:x,yMm:y,rotation:0,locked:false,label:it.label,sourceWidthMm:it.widthCm*10,sourceHeightMm:it.heightCm*10,...rotatedBoundsMm(it.widthCm*10,it.heightCm*10,0)}};
const placements=[];for(let r=0;r<4;r++){placements.push(pos('a',r*2,0,r*254),pos('a',r*2+1,124,r*254));for(let k=0;k<2;k++)placements.push(pos('b',r*2+k,250+k*104,r*254+40));}
const raw={filmWidthMm:580,lengthMm:4*254,gapMm:4,cellMm:2,mode:'maximum',freeRotation:false,angleStep:30,efficiency:30,waste:70,placements};
const layout=applyOvenCuts(raw,{bandMm:380,gapMm:4});
mountFilmPreview({element:document.querySelector('#filmPreview'),layout,items,resolveSource:async item=>item.src,isCurrent:()=>true,validate:async p=>({placements:p}),onChange:()=>true,onRepack:()=>{},onDelete:()=>false});
window.fixture={raw,layout};window.fixtureReady=true;
</script></body></html>`;
const server=http.createServer(async(req,res)=>{try{if(req.url.startsWith('/qa-film-oven.html')){res.writeHead(200,{'content-type':'text/html'});res.end(harness);return}const clean=decodeURIComponent(new URL(req.url,'http://x').pathname);const file=clean==='/scripts/film-fixture.html'?path.join(root,'scripts/film-fixture.html'):path.join(dist,clean);if(!file.startsWith(root))throw 0;let body=await fs.readFile(file);if(clean==='/scripts/film-fixture.html')body=Buffer.from(String(body).replaceAll('qa-owner','00000000-0000-4000-8000-0000000000a1').replaceAll('qa-user','00000000-0000-4000-8000-0000000000b2'));res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body)}catch{res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=process.env.QA_BROWSER||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
const port=9800+Math.floor(Math.random()*150),profile=await fs.mkdtemp(path.join(os.tmpdir(),'z19-oven-')),out=process.env.QA_OUT||await fs.mkdtemp(path.join(os.tmpdir(),'z19-oven-out-'));
const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--remote-allow-origins=*','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms)),pending=new Map(),errors=[];let socket,id=0;
const send=(method,params={})=>{const key=++id;return new Promise((resolve,reject)=>{const t=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout '+method))},30000);pending.set(key,{resolve:v=>{clearTimeout(t);resolve(v)},reject:e=>{clearTimeout(t);reject(e)}});socket.send(JSON.stringify({id:key,method,params}))})};
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
const wait=async(expression,label,timeout=20000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await delay(60)}throw Error('Timeout: '+label)};
const click=async selector=>{await evaluate('fixture.click('+JSON.stringify(selector)+')');await delay(50)};
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
    await send('Page.navigate',{url:origin+'/qa-film-oven.html'});await wait('Boolean(window.fixtureReady)','página do filme');
    await wait("document.querySelectorAll('[data-placement]').length===16",'peças',20000);await delay(800);
    const s=await evaluate(`(()=>{const L=fixture.layout,cuts=L.ovenCutsMm||[],lines=[...document.querySelectorAll('.film-oven-cut')];const crossed=cuts.filter(y=>L.placements.some(p=>p.yMm<y-.01&&p.yMm+p.heightMm>y+.01));let prev=0,maxBand=0;for(const y of [...cuts,L.lengthMm]){maxBand=Math.max(maxBand,y-prev);prev=y}const overlap=L.placements.some((a,i)=>L.placements.some((b,j)=>j>i&&a.xMm<b.xMm+b.widthMm-.01&&b.xMm<a.xMm+a.widthMm-.01&&a.yMm<b.yMm+b.heightMm-.01&&b.yMm<a.yMm+a.heightMm-.01));return {cuts,lines:lines.length,crossedLines:lines.filter(n=>n.classList.contains('is-crossed')).length,labels:lines.map(n=>n.textContent),crossed:crossed.length,maxBand,overlap,length:L.lengthMm,rawLength:fixture.raw.lengthMm,ruler:document.querySelector('.film-ruler,[class*=ruler]')?.textContent||'',hscroll:document.documentElement.scrollWidth>innerWidth+1}})()`);
    report.push([vp.name,JSON.stringify(s)]);
    assert.ok(s.cuts.length>=2,vp.name+': filme de ~1 m tem pelo menos 2 linhas de corte');
    assert.equal(s.lines,s.cuts.length,vp.name+': cada corte aparece na tela');
    assert.equal(s.crossed,0,vp.name+': nenhuma arte em cima da linha');
    assert.equal(s.crossedLines,0,vp.name+': nenhuma linha marcada como cruzada');
    assert.ok(s.maxBand<=380.01,vp.name+': cada pedaço até 38 cm ('+s.maxBand+')');
    assert.equal(s.overlap,false,vp.name+': nenhuma arte sobre a outra');
    assert.equal(s.hscroll,false,vp.name+': sem rolagem lateral');
    await evaluate("document.querySelector('.film-oven-cut')?.scrollIntoView({block:'center'})");await delay(300);
    await shot('forno-'+vp.name);
  }
  assert.deepEqual(errors,[],'sem erro no navegador');
  console.log(report.map(r=>r.join(' ')).join('\n'));console.log('PASS Linha do forno · fotos em '+out);
}catch(error){console.error(report.map(r=>r.join(' ')).join('\n'));console.error(error.stack||String(error));console.error('erros:',JSON.stringify(errors).slice(0,2000));try{await shot('falha')}catch{}console.error('fotos: '+out);process.exitCode=1}
finally{try{await send('Browser.close')}catch{}socket?.close();child.kill();server.close()}
