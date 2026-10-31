// Kits de camisa (31/10, dono): no Chrome, com o seletor de artes real e banco simulado. Cria o kit, salva, coloca no filme,
// aumenta e diminui, mede o contraste de todo texto e procura rolagem lateral. Uso: node scripts/film-kits-browser-qa.mjs (depois do build)
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const version=(await fs.readFile(path.join(dist,'index.html'),'utf8')).match(/z19-version" content="([^"]+)/)[1];
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
const harness=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${['styles.css','film-picker.css','film-v74.css','qr-theme.css','qr-screens.css'].map(n=>`<link rel="stylesheet" href="/${n}?v=${version}">`).join('')}</head><body><main class="container film-page"><section id="filmItems" style="max-width:640px;margin:12px auto;padding:0 12px"></section></main><script type="module">
import {buildFilmAssetCatalogue,openFilmAssetPicker} from '/film-picker.js?v=2.17.5';
import {addKitToFilm,createFilmKitStore,filmKitBarsHTML,filmKitGroups,openFilmKits,setFilmKitCount} from '/film-kits.js?v=${version}';
const art=(c,t)=>{const k=document.createElement('canvas');k.width=300;k.height=150;const g=k.getContext('2d');g.fillStyle=c;g.fillRect(0,0,300,150);g.fillStyle='#fff';g.font='bold 40px Arial';g.fillText(t,20,90);return k.toDataURL()};
const images={'p/frente.png':art('#e11d48','FRENTE'),'p/costas.png':art('#2563eb','COSTAS'),'p/manga.png':art('#16a34a','MANGA')};
const asset=(id,name)=>({id,name,asset_type:'arte',workspace_id:'w1',processed_path:'p/'+id+'.png',width:1000,height:500});
const profile=(id,w,h)=>({asset_id:id,default_width_cm:w,default_height_cm:h,ready_for_print:true,rotation_policy:'free'});
const source={profiles:[profile('frente',25,12.5),profile('costas',7,3.5),profile('manga',8,4)],assetMap:[asset('frente','Peito Time'),asset('costas','Nuca Time'),asset('manga','Manga Time')],workspaces:[{id:'w1',company_name:'ZERO19',workspace_type:'library'}],projects:[],folders:[]};
let rows=[];const chain=(op,payload)=>{const c={select(){return c},eq(){return c},order(){return c},range(){return run()},single(){return run()},maybeSingle(){return run()}};const run=async()=>{if(op==='insert'){rows.push(payload);return {data:payload,error:null}}if(op==='list')return {data:rows,error:null};return {data:null,error:null}};return c};
const supabase={from:()=>({select:()=>chain('list'),insert:p=>chain('insert',p),update:p=>chain('update',p),delete:()=>chain('delete')})};
const publicUrl=path=>images[path]||'';window.film=[];
const draw=()=>{const box=document.querySelector('#filmItems');box.innerHTML=filmKitBarsHTML(window.film);box.querySelectorAll('[data-kit-step]').forEach(b=>b.onclick=()=>{const g=filmKitGroups(window.film).find(r=>r.groupId===b.dataset.kitGroup);setFilmKitCount(window.film,g.groupId,g.count+Number(b.dataset.kitStep));draw()})};
window.open_=()=>openFilmKits({store:createFilmKitStore({supabase,owner:()=>'o',user:()=>'u'}),catalogue:buildFilmAssetCatalogue(source),previewUrl:publicUrl,publicUrl,pickArts:onPicked=>openFilmAssetPicker({...source,publicUrl,previewUrl:publicUrl,kitMode:true,onAdd:async items=>onPicked(items)}),addKit:async(kit,count,entries)=>{addKitToFilm(window.film,kit,entries,count);draw()}});
window.setValue=(s,v)=>{const f=document.querySelector(s);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(f,v);f.dispatchEvent(new Event('input',{bubbles:true}));f.dispatchEvent(new Event('change',{bubbles:true}))};
window.ready=true;</script></body></html>`;
const server=http.createServer(async(req,res)=>{try{if(req.url.startsWith('/qa.html')){res.writeHead(200,{'content-type':'text/html'});res.end(harness);return}const clean=decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,''),file=path.join(dist,clean),body=await fs.readFile(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(body)}catch{res.writeHead(404);res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=process.env.QA_BROWSER||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port=9960+Math.floor(Math.random()*30),profile=await fs.mkdtemp(path.join(os.tmpdir(),'z19-kits-')),out=process.env.QA_OUT||await fs.mkdtemp(path.join(os.tmpdir(),'z19-kits-out-'));await fs.mkdir(out,{recursive:true});
const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--remote-allow-origins=*','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms)),pending=new Map(),errors=[];let socket,id=0;
const send=(method,params={})=>{const key=++id;return new Promise((resolve,reject)=>{const t=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout '+method))},30000);pending.set(key,{resolve:v=>{clearTimeout(t);resolve(v)},reject});socket.send(JSON.stringify({id:key,method,params}))})};
const evaluate=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
const wait=async(e,label)=>{for(let n=0;n<150;n++){if(await evaluate('!!('+e+')').catch(()=>false))return;await delay(60)}throw Error('Tempo esgotado: '+label+' · '+(await evaluate('document.body.innerText')).slice(0,400))};
const clickText=async(text,scope='document')=>{assert(await evaluate(`(()=>{const b=[...${scope}.querySelectorAll('button')].find(x=>x.textContent.replace(/\\s+/g,' ').trim().includes(${JSON.stringify(text)}));if(!b)return false;b.click();return true})()`),'botão '+text);await delay(120)};
const check=async name=>{await delay(250);const d=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(out,name+'.png'),Buffer.from(d.data,'base64'));
  const over=await evaluate('Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth');if(over>1)errors.push(name+': rolagem lateral '+over);
  const bad=await evaluate(`(()=>{const rgb=c=>{const m=c.match(/[\\d.]+/g)?.map(Number)||[0,0,0,0];return {r:m[0],g:m[1],b:m[2],a:m[3]??1}},lum=({r,g,b})=>{const f=v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4};return .2126*f(r)+.7152*f(g)+.0722*f(b)};const back=el=>{for(let e=el;e;e=e.parentElement){const s=getComputedStyle(e);if(s.backgroundImage!=='none')return null;const c=rgb(s.backgroundColor);if(c.a>=1)return c}return {r:255,g:255,b:255}},out=[];for(const el of document.querySelectorAll('.fk-modal *,.fk-bar *,.fk-bar')){if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))continue;const s=getComputedStyle(el);if(s.display==='none'||s.visibility==='hidden'||!el.getClientRects().length||el.disabled)continue;const b=back(el);if(!b)continue;const x=lum(rgb(s.color)),y=lum(b),ratio=(Math.max(x,y)+.05)/(Math.min(x,y)+.05);if(ratio<4)out.push(el.textContent.trim().slice(0,30)+' '+ratio.toFixed(1)+':1')}return out.slice(0,6)})()`);
  if(bad.length)errors.push(name+': CONTRASTE '+JSON.stringify(bad))};
try{
  let url;for(let n=0;n<100&&!url;n++){try{url=(await (await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(t=>t.type==='page')?.webSocketDebuggerUrl}catch{/* abrindo */}await delay(120)}
  socket=new WebSocket(url);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}}else if(m.method==='Runtime.exceptionThrown')errors.push('ERRO JS: '+(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text).slice(0,240))});
  await send('Page.enable');await send('Runtime.enable');
  for(const [name,width,height] of [['pc',1440,900],['celular390',390,844],['celular320',320,640]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<700});
    await send('Page.navigate',{url:origin+'/qa.html'});await wait('window.ready','abrir');await evaluate('open_();0');await wait('document.querySelector(".fk-new")&&document.querySelector(".fk-empty")','janela de kits');await check(name+'-1-vazio');
    await clickText('Novo kit');await evaluate('setValue("[data-input=name]","Camisa Time Azul");0');await clickText('Escolher artes');await wait('document.querySelector(".film-picker")','seletor');
    assert.match(await evaluate('document.querySelector(".film-picker h2").textContent'),/artes do kit/);
    for(const art of ['frente','costas','manga'])await evaluate(`document.querySelector('[data-card-id="${art}"] [data-action="quick"]').click();0`);await delay(150);
    assert.match(await evaluate('document.querySelector(".film-picker [data-action=submit]").textContent'),/Usar no kit/);await check(name+'-2-seletor');
    await evaluate('document.querySelector(".film-picker [data-action=submit]").click();0');await wait('!document.querySelector(".film-picker")&&document.querySelectorAll(".fk-row").length===3','artes no kit');
    await evaluate('setValue("[data-input=per-kit][data-id=manga]","2");0');await delay(120);await check(name+'-3-kit');
    await clickText('Salvar kit');await wait('document.querySelector(".fk-card")','kit salvo');assert.match(await evaluate('document.querySelector(".fk-card").innerText'),/Camisa Time Azul[\s\S]*3 artes por camisa/);
    await evaluate('document.querySelector("[data-action=plus]").click();0');await delay(100);await evaluate('document.querySelector("[data-action=plus]").click();0');await delay(100);await check(name+'-4-lista');
    await clickText('Colocar no filme');await wait('!document.querySelector(".fk-backdrop")','fechar depois de colocar');
    assert.deepEqual(await evaluate('film.map(i=>i.quantity)'),[3,3,6],'3 kits no filme');await check(name+'-5-filme');
    await evaluate('document.querySelector(".fk-bar [data-kit-step=\\"1\\"]").click();0');await delay(100);assert.deepEqual(await evaluate('film.map(i=>i.quantity)'),[4,4,8],'+ aumenta tudo');
    await evaluate('document.querySelector(".fk-bar [data-kit-step=\\"-1\\"]").click();0');await delay(100);assert.deepEqual(await evaluate('film.map(i=>i.quantity)'),[3,3,6],'− diminui tudo');
    assert.deepEqual(await evaluate('film.map(i=>[i.widthCm,i.heightCm])'),[[25,12.5],[7,3.5],[8,4]],'medidas do kit');
  }
  assert.deepEqual(errors,[],'Sem erro de tela, rolagem lateral nem letra ilegível');
  console.log('PASS kits no Chrome: criar, salvar, colocar, aumentar e diminuir (PC, 390 e 320). Fotos em '+out);
}finally{try{await send('Browser.close')}catch{/* fechando */}socket?.close();child.kill();server.close()}
