// 28/10 (dono: "em arte de empresa deixe mais visual, está muito confuso; às vezes coloco quantidade mais de 1 e volta
// para 1; botões de adicionar no filme muito pequenos; onde mostra quantas artes serão adicionadas também pequeno;
// quando aperto para trocar tamanho não sei se adicionou"). Janela "Arte de empresa" no Chrome de verdade, com artes
// simuladas (nada vai ao banco). Uso: node scripts/film-picker-browser-qa.mjs
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const index=await fs.readFile(path.join(dist,'index.html'),'utf8'),css=[...index.matchAll(/href="(\/[^"]+\.css[^"]*)"/g)].map(m=>m[1]);
const harness=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css.map(h=>`<link rel="stylesheet" href="${h}">`).join('')}</head><body><main id="app"></main><script type="module">
import {openFilmAssetPicker} from '/film-picker.js';
const art=(c,t,w=300,h=200)=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><rect x="8" y="8" width="'+(w-16)+'" height="'+(h-16)+'" rx="18" fill="'+c+'"/><text x="50%" y="58%" text-anchor="middle" font-family="Arial" font-weight="900" font-size="42" fill="#fff">'+t+'</text></svg>');
const workspaces=[{id:'w1',company_name:'ZERO19',workspace_type:'library'},{id:'w2',company_name:'Academia Força Total',client_name:'Marcos',workspace_type:'client'},{id:'w3',company_name:'Escola Sol Nascente',client_name:'Diretoria',workspace_type:'client'}];
const list=[['a1','w1','Logo ZERO19 peito','#ea580c','Z19',10,6],['a2','w1','Brasil 2026 costas','#16a34a','BR',28,20],['a3','w2','Força Total frente','#2563eb','FT',25,14],['a4','w2','Força Total manga','#7c3aed','FT',8,5],['a5','w3','Sol Nascente uniforme','#db2777','SOL',20,20],['a6','w3','Formatura 2026','#0891b2','2026',30,12]];
const assets=list.map(([id,w,name,c,t,wc,hc])=>({id,workspace_id:w,name,asset_type:'arte',processed_path:art(c,t,wc*20,hc*20),width:wc*20,height:hc*20}));
const profiles=list.map(([id,,,,,wc,hc])=>({asset_id:id,default_width_cm:wc,default_height_cm:hc,ready_for_print:true,halftone:id==='a4'}));
window.added=null;
window.open=()=>{window.picker=openFilmAssetPicker({profiles,assetMap:new Map(assets.map(a=>[a.id,a])),workspaces,publicUrl:p=>p,onAdd:async items=>{window.added=items}})};
window.open();window.ready=true;
</script></body></html>`;
const types={'.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
const server=http.createServer(async(req,res)=>{try{const clean=decodeURIComponent(new URL(req.url,'http://x').pathname);if(clean==='/qa-picker.html'){res.writeHead(200,{'content-type':'text/html'});res.end(harness);return}const file=path.join(dist,clean);if(!file.startsWith(dist))throw 0;const body=await fs.readFile(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(body)}catch{if(!res.headersSent)res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=process.env.QA_BROWSER||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
const port=9600+Math.floor(Math.random()*150),profile=await fs.mkdtemp(path.join(os.tmpdir(),'z19-fp-')),out=process.env.QA_OUT||await fs.mkdtemp(path.join(os.tmpdir(),'z19-fp-out-'));
const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--remote-allow-origins=*','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms)),pending=new Map(),errors=[];let socket,id=0;
const send=(method,params={})=>{const key=++id;return new Promise((resolve,reject)=>{const t=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout '+method))},30000);pending.set(key,{resolve:v=>{clearTimeout(t);resolve(v)},reject:e=>{clearTimeout(t);reject(e)}});socket.send(JSON.stringify({id:key,method,params}))})};
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
const wait=async(expression,label,timeout=15000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await delay(60)}throw Error('Timeout: '+label)};
const shot=async name=>{const d=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(out,name+'.png'),Buffer.from(d.data,'base64'))};
const box=selector=>evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)return null;n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}})()`);
const clickAt=async selector=>{const b=await box(selector);assert.ok(b,'na tela: '+selector);for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x:b.x,y:b.y,button:'left',clickCount:1});await delay(150);return b};
const typeInto=async(selector,text)=>{await clickAt(selector);await evaluate(`(()=>{const i=document.querySelector(${JSON.stringify(selector)});i.select?.()})()`);for(const ch of text)await send('Input.dispatchKeyEvent',{type:'char',text:ch});await delay(150)};
const card=id=>`[data-card-id="${id}"]`;
try{
  let url;for(let n=0;n<300&&!url;n++){try{url=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(p=>p.type==='page')?.webSocketDebuggerUrl}catch{}await delay(100)}
  socket=new WebSocket(url);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  socket.addEventListener('message',e=>{const p=JSON.parse(e.data);if(p.id){const q=pending.get(p.id);if(q){pending.delete(p.id);p.error?q.reject(Error(p.error.message)):q.resolve(p.result)}return}if(p.method==='Runtime.exceptionThrown')errors.push(p.params.exceptionDetails.exception?.description||p.params.exceptionDetails.text)});
  await send('Page.enable');await send('Runtime.enable');
  for(const vp of [{name:'pc',width:1440,height:900,mobile:false},{name:'notebook',width:1280,height:720,mobile:false},{name:'celular',width:390,height:844,mobile:true}]){
    await send('Emulation.setDeviceMetricsOverride',{width:vp.width,height:vp.height,deviceScaleFactor:1,mobile:vp.mobile});
    await send('Page.navigate',{url:origin+'/qa-picker.html'});await wait('window.ready&&document.querySelector(".film-picker")','janela');await delay(600);
    await shot(`picker-${vp.name}-1-abriu`);
    // quantidade digitada ANTES de adicionar não volta para 1
    await typeInto(`${card('a3')} [data-input="quantity"]`,'3');
    await clickAt(`${card('a3')} [data-action="quick"],${card('a3')} [data-action="toggle"].fp-button`);
    assert.equal(await evaluate("window.picker.selected.get('a3')?.quantity"),3,`${vp.name}: quantidade 3 continua 3 ao adicionar`);
    // mudar a quantidade de uma arte já adicionada
    await typeInto(`${card('a3')} [data-input="quantity"]`,'5');await clickAt(`${card('a1')} .fp-art-copy h4`);
    assert.equal(await evaluate("window.picker.selected.get('a3')?.quantity"),5,`${vp.name}: trocar para 5 vale`);
    // trocar tamanho: avisa que ficou e a arte entra na seleção com esse tamanho
    await clickAt(`${card('a1')} [data-action="size"]`);await typeInto(`[data-size-form="a1"] [name="width"]`,'12');await clickAt(`[data-size-form="a1"] button[type="submit"]`);
    const a1=await evaluate("window.picker.selected.get('a1')");assert.ok(a1&&Math.abs(a1.widthCm-12)<.01,`${vp.name}: tamanho novo na seleção (${JSON.stringify(a1)})`);
    await shot(`picker-${vp.name}-2-selecao`);
    const summary=await evaluate("document.querySelector('.fp-selection-summary')?.innerText||''");assert.match(summary.replace(/\s+/g,' '),/2 artes/i,`${vp.name}: resumo mostra 2 artes (${summary})`);assert.match(summary.replace(/\s+/g,' '),/6 impress/i,`${vp.name}: resumo mostra 6 impressões (${summary})`);
    const over=await evaluate("JSON.stringify({page:document.documentElement.scrollWidth>innerWidth+1,picker:document.querySelector('.film-picker').scrollWidth>document.querySelector('.film-picker').clientWidth+1,cards:[...document.querySelectorAll('.fp-art-card')].filter(n=>n.scrollWidth>n.clientWidth+1).length,outside:[...document.querySelectorAll('.film-picker *')].filter(n=>{const r=n.getBoundingClientRect();return r.width&&r.right>innerWidth+1&&!n.closest('.fp-status')&&!(()=>{for(let a=n.parentElement;a;a=a.parentElement){const x=getComputedStyle(a).overflowX;if(x==='auto'||x==='scroll')return true}return false})()}).slice(0,3).map(n=>n.className+' '+Math.round(n.getBoundingClientRect().right))})");const o=JSON.parse(over);assert.ok(!o.page&&!o.picker&&!o.cards&&!o.outside.length,`${vp.name}: sem rolagem lateral ${over}`);
    await clickAt('[data-action="submit"]');await wait('window.added','adicionou');
    const added=await evaluate('window.added.map(i=>[i.sourceId,i.quantity,i.widthCm])');assert.deepEqual(added.sort(),[['a1',1,12],['a3',5,25]].sort(),`${vp.name}: o filme recebe quantidade e tamanho certos`);
  }
  assert.deepEqual(errors,[],'sem erro no navegador');console.log('PASS Arte de empresa · fotos em '+out);
}catch(error){console.error(error.stack||String(error));console.error('erros:',JSON.stringify(errors).slice(0,1500));try{await shot('falha')}catch{}console.error('fotos: '+out);process.exitCode=1}
finally{try{await send('Browser.close')}catch{}socket?.close();child.kill();server.close()}
