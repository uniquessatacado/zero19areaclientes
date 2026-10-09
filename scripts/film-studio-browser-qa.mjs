// QA visual do Estúdio no filme: catálogo público real, preparação simulada (nada é gravado).
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {createServer} from 'node:http';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','dist');
const key=(await fs.readFile(path.join(root,'app.js'),'utf8')).match(/sb_publishable_[A-Za-z0-9_-]+/)[0];
const harness=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/production-v217.css"></head><body><script type="module">
import {openFilmStudio} from '/film-studio.js';
const catalog=await (await fetch('https://kedggjyerexnzmipaick.supabase.co/rest/v1/rpc/get_political_catalog',{method:'POST',headers:{apikey:'${key}','Content-Type':'application/json'},body:'{"p_admin":false,"p_search":"","p_page":0}'})).json();
window.calls=[];
window.result=openFilmStudio({catalog,sets:[{id:'brasil',_path:'BRASIL 2026 → AMARELA 2026 → Fontes e números'}],defaultSetId:'brasil',
 prepareArt:async request=>{calls.push(['art',request]);await new Promise(r=>setTimeout(r,50));return {label:'art'}},
 makeText:async request=>{calls.push(['text',{text:request.text,heightCm:request.heightCm,color:request.color,quantity:request.quantity,set:request.set.id}]);return {label:'text'}}});
window.ready=true;</script></body></html>`;
const server=createServer(async(req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://x').pathname).replace(/^\//,'');if(!name){res.setHeader('content-type','text/html');return res.end(harness)}
 try{const file=path.resolve(root,name);assert(file.startsWith(root));res.setHeader('content-type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'application/octet-stream');res.end(await fs.readFile(file))}catch{res.statusCode=404;res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'z19-studio-qa-')),shots=process.argv[2]||profile,port=15400+Math.floor(Math.random()*200);
const browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-allow-origins=*','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms)),pending=new Map(),errors=[];let socket,id=0;
const send=(method,params={})=>{const k=++id;return new Promise((resolve,reject)=>{pending.set(k,{resolve,reject});socket.send(JSON.stringify({id:k,method,params}))})};
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
const until=async(expression,label)=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await delay(100)}throw Error('Timeout: '+label)};
try{
 let url;for(let i=0;i<80;i++){try{url=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(t=>t.type==='page')?.webSocketDebuggerUrl;if(url)break}catch{}await delay(150)}
 socket=new WebSocket(url);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description)});
 await send('Page.enable');await send('Runtime.enable');
 for(const viewport of [{name:'desktop',width:1360,height:960,mobile:false},{name:'mobile320',width:320,height:780,mobile:true}]){
  await send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1});await send('Page.navigate',{url:origin+'/'});
  await until("window.ready&&document.querySelector('[data-piece]')",'modal');
  const click=selector=>evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('falta '+${JSON.stringify(selector)});el.click();return true})()`);
  const type=(selector,value)=>evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await click('[data-audience="WOMEN"]');
  assert.equal(await evaluate("document.querySelector('[data-key=artHeight]')"),null,'sem estampa não mostra altura da arte');
  assert.equal(await evaluate("document.querySelector('[data-key=letterHeight]').value"),'5','Feminina: letra 5 cm');
  await click('[data-pick]');await until("document.querySelectorAll('[data-print-picker] [data-print]').length>50",'grade de estampas');
  await click('[data-print-picker] [data-candidate="LULA"]');
  const lula=await evaluate("document.querySelectorAll('[data-print-picker] [data-print]').length");assert(lula>0,'filtro Lula');
  await until("[...document.querySelectorAll('[data-print-picker] img')].slice(0,4).every(i=>i.complete&&i.naturalWidth>0)",'miniaturas');
  const pickerShot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(shots,viewport.name+'-estampas.png'),Buffer.from(pickerShot.data,'base64'));
  const pickerScroll=await evaluate("({w:innerWidth,s:document.documentElement.scrollWidth})");assert(pickerScroll.s<=pickerScroll.w+1,'rolagem horizontal no seletor');
  await click('[data-print-picker] [data-print]');
  assert.equal(await evaluate("document.querySelector('[data-key=artHeight]').value"),'25','Feminina: arte 25 cm');
  await type('[data-key=top]','Deus, pátria e família');await type('[data-key=bottom]','13+9');await click('[data-color="#1565C0"]');await type('[data-key=quantity]','3');
  await click('[data-add-piece]');
  await evaluate(`(()=>{const p=document.querySelectorAll('[data-piece]')[1];p.querySelector('[data-key=top]').value='LULA';p.querySelector('[data-key=top]').dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
  await until("document.querySelector('[data-preview] img')?.complete",'prévia');
  assert.match(await evaluate("document.querySelector('[data-submit]').textContent"),/4 aplicações/);
  const box=await evaluate("({w:innerWidth,s:document.documentElement.scrollWidth,modal:document.querySelector('.film-studio-modal').scrollWidth<=document.querySelector('.film-studio-modal').clientWidth+1})");
  assert(box.s<=box.w+1&&box.modal,'rolagem horizontal no estúdio');
  const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(shots,viewport.name+'-estudio.png'),Buffer.from(shot.data,'base64'));
  await click('[data-submit]');const items=await evaluate('window.result');const calls=await evaluate('window.calls');
  assert.equal(items.length,4);assert.equal(calls[0][0],'art');assert.equal(calls[0][1].heightCm,25);assert.equal(calls[0][1].quantity,3);
  assert.deepEqual(calls.slice(1).map(c=>c[1]),[{text:'Deus, pátria e família',heightCm:5,color:'#1565C0',quantity:3,set:'brasil'},{text:'13+9',heightCm:5,color:'#1565C0',quantity:3,set:'brasil'},{text:'LULA',heightCm:5,color:'#267B3B',quantity:1,set:'brasil'}]);
  assert.equal(await evaluate("document.querySelector('.film-studio-modal')"),null,'fecha ao concluir');
  console.log(JSON.stringify({viewport:viewport.name,status:'PASS',lula,applications:items.length}));
 }
 assert.deepEqual(errors,[]);console.log('PASS estúdio no filme: catálogo real, público, estampa, escritas, cor, quantidade, várias peças, desktop/320 sem rolagem horizontal. Preparação simulada; nada gravado. Capturas: '+shots);
}finally{try{await send('Browser.close')}catch{}socket?.close();browser.kill();server.close()}
