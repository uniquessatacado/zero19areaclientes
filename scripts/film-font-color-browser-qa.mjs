// 12/11 (dono): "Cor da fonte" no filme — muda a cor de uma palavra/número ou de todos da mesma fonte, com confirmação.
// Base: scripts/film-app-browser-qa.mjs (app inteiro do dist, banco e armazenamento simulados; fonte = Arial do Mac).
// Uso: node scripts/film-font-color-browser-qa.mjs [pasta das fotos]
// (cabeçalho original:) 2.17.89 (03/11, dono): o filme na tela de verdade (app inteiro do dist) com banco e armazenamento SIMULADOS.
// Confere: Arte de empresa abre rápido (catálogo e links preparados ao abrir o filme; links privados 4 por vez),
// adicionar calcula sozinho, Aguardando produção calcula sozinho, a prévia e a análise de transparência usam a imagem
// leve (o PNG de impressão não é baixado só para mostrar), e Delete numa arte do filme não trava a tela.
// Uso: node scripts/film-app-browser-qa.mjs [pasta das fotos]   (rode depois do build; QA_DIST=<pasta> testa outro site)
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.resolve(process.env.QA_DIST||path.join(root,'dist'));
const out=path.resolve(process.argv[2]||await fs.mkdtemp(path.join(os.tmpdir(),'z19-film-app-')));await fs.mkdir(out,{recursive:true});
const watchdog=setTimeout(()=>{console.log('watchdog');process.exit(2)},300000);watchdog.unref?.();

// PNG de verdade (sem bibliotecas): arte colorida com margem transparente.
function png(w,h,[r,g,b]){
  const raw=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++){raw[y*(w*4+1)]=0;for(let x=0;x<w;x++){const o=y*(w*4+1)+1+x*4,inside=x>w*.1&&x<w*.9&&y>h*.1&&y<h*.9;raw[o]=r;raw[o+1]=g;raw[o+2]=b;raw[o+3]=inside?255:0;}}
  const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
  const crc=buf=>{let c=0xffffffff;for(const v of buf)c=crcTable[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0};
  const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c])};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
const colors=[[225,29,72],[37,99,235],[22,163,74],[234,179,8],[147,51,234],[249,115,22]];
const big=colors.map(c=>png(2400,1600,c)),light=colors.map(c=>png(1536,1024,c));
const hits={full:0,light:0,paths:new Set(),fullLog:[]};

const OWNER='5b0f6a52-6a0e-4a8e-9d3c-1f2a3b4c5d6e',USER=OWNER,W1='7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f',P1='8d2e3f4a-5b6c-4d7e-9f0a-1b2c3d4e5f6a';
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const assets=[],profiles=[];
for(let n=1;n<=6;n++){assets.push({id:uuid(n),owner_id:OWNER,workspace_id:W1,project_id:P1,folder_id:null,name:'Arte empresa '+n,asset_type:'arte',processed_path:`w1/a${n}/processed.png`,original_path:`w1/a${n}/original.png`,width:2400,height:1600,metadata:{},created_at:new Date(Date.now()-n*3600e3).toISOString()});profiles.push({id:uuid(100+n),owner_id:OWNER,asset_id:uuid(n),ready_for_print:true,default_width_cm:12,default_height_cm:8,rotation_policy:'none',allow_internal_nesting:true,halftone:false});}
// 200 artes privadas (como as do Estampa Política): o link de cada uma é assinado antes de abrir a Arte de empresa.
// 2.17.90: Arte de empresa mostra as mais novas primeiro; as privadas do site são mais antigas (outubro), como na loja.
for(let n=7;n<=206;n++){assets.push({id:uuid(n),owner_id:OWNER,workspace_id:W1,project_id:P1,folder_id:null,name:'Privada '+n,asset_type:'arte',processed_path:`priv/a${n}/processed.png`,original_path:`priv/a${n}/original.png`,width:2400,height:1600,metadata:{storage_bucket:'z19p-private'},created_at:new Date(Date.now()-(n+720)*3600e3).toISOString()});profiles.push({id:uuid(1000+n),owner_id:OWNER,asset_id:uuid(n),ready_for_print:true,default_width_cm:10,default_height_cm:6.67,rotation_policy:'none',allow_internal_nesting:true,halftone:false});}
const pendingRows=[1,2].map(n=>({kind:'quote',project_id:P1,quote_id:uuid(500+n),quote_item_id:uuid(600+n),asset_id:uuid(n+2),workspace_id:W1,processed_path:`w1/a${n+2}/processed.png`,original_path:`w1/a${n+2}/original.png`,remaining_quantity:3,width_cm:10,height_cm:6.67,company_name:'Oficina Aurora',asset_name:'Pedido arte '+n,label:'Pedido arte '+n,project_title:'Uniformes',allocations:[],rotation_policy:'none',allow_internal_nesting:true}));

const fontA={id:uuid(801),set_id:uuid(811),source_type:'ttf',storage_path:'fonts/a.ttf',original_name:'Brasil 2026.ttf',is_working_source:true};
const fontB={id:uuid(802),set_id:uuid(812),source_type:'ttf',storage_path:'fonts/b.ttf',original_name:'Palmeiras.ttf',is_working_source:true};
const word=(n,font,name,number,set)=>({localId:'f'+n,type:'team_customization',customizationKind:'lettering',sourceId:set,name,number,nameHeightCm:5.5,numberHeightCm:20,gapCm:1.5,nameTrackingCm:.15,digitSpacingCm:.2,quantity:1,widthCm:Math.max(8,(name.length||number.length)*4),heightCm:number&&!name?20:5.5,fontSource:font,fontSources:[font],glyphs:[],palette:[{role:'name',color_hex:'#16A34A'}],label:'Fonte · '+(name||number),rotationPolicy:'none',pieceType:number&&!name?'digit':'name'});
const draftItems=[word(1,fontA,'CLOVIS','',uuid(811)),word(2,fontA,'','10',uuid(811)),word(3,fontA,'BRUNA','',uuid(811)),word(4,fontB,'JOAO','',uuid(812))];
const data={
  z19p_film_drafts:[{owner_id:OWNER,user_id:USER,revision:1,updated_at:new Date().toISOString(),data:{version:1,ownerId:OWNER,items:draftItems,settings:{mediaId:uuid(900),mode:'maximum',gapMm:3,name:'Teste cor'},layout:null}}],
  z19p_profiles:[{id:USER,account_owner_id:OWNER,full_name:'Clovis Teste',role:'admin',active:true,email:'equipe@zero19.test'}],
  z19p_workspaces:[{id:W1,owner_id:OWNER,company_name:'Oficina Aurora',client_name:'Ana',workspace_type:'client',created_at:new Date().toISOString(),updated_at:new Date().toISOString()}],
  z19p_projects:[{id:P1,owner_id:OWNER,workspace_id:W1,title:'Uniformes',sequence_no:1,updated_at:new Date().toISOString()}],
  z19p_folders:[],z19p_assets:assets,z19p_asset_print_profiles:profiles,
  z19p_print_media_profiles:[{id:uuid(900),owner_id:OWNER,name:'Filme 58 cm',usable_width_cm:58,width_cm:60,active:true,is_default:true,created_at:new Date().toISOString()}],
};
const fake=`
const data=${JSON.stringify(data)},pendingRows=${JSON.stringify(pendingRows)},origin=location.origin;
window.qaSign={calls:0,inFlight:0,maxInFlight:0};
const session={access_token:'qa',user:{id:'${USER}',email:'equipe@zero19.test',user_metadata:{full_name:'Clovis Teste'}}};
const pick=(table,filters)=>{let rows=[...(data[table]||[])];for(const [k,v,op] of filters){if(op==='eq')rows=rows.filter(r=>r[k]===undefined||r[k]===v);if(op==='in')rows=rows.filter(r=>r[k]===undefined||v.includes(r[k]));}return rows;};
function builder(table){const filters=[];let single=false,maybe=false,head=false,from=0,to=null;const q=new Proxy({},{get(_,prop){
 if(prop==='then')return (ok,fail)=>{let rows=pick(table,filters);if(to!==null)rows=rows.slice(from,to+1);const value=single||maybe?{data:rows[0]||null,error:single&&!rows[0]?{message:'not found',code:'PGRST116'}:null}:{data:head?null:rows,error:null,count:pick(table,filters).length};return new Promise(r=>setTimeout(r,40)).then(()=>value).then(ok,fail);};
 if(prop==='eq')return (k,v)=>{filters.push([k,v,'eq']);return q};
 if(prop==='in')return (k,v)=>{filters.push([k,v,'in']);return q};
 if(prop==='range')return (a,b)=>{from=a;to=b;return q};
 if(prop==='single')return ()=>{single=true;return q};
 if(prop==='maybeSingle')return ()=>{maybe=true;return q};
 if(prop==='select')return (_s,opts)=>{if(opts&&opts.head)head=true;return q};
 return ()=>q;}});return q;}
const chain=new Proxy(function(){},{get:(_,p)=>p==='then'?undefined:chain,apply:()=>chain});
const art=(bucket,p,t)=>origin+'/qa-art/'+bucket+'/'+p+(t?'?w='+t.width:'');
export function createClient(){return {
 auth:{getSession:async()=>({data:{session},error:null}),getUser:async()=>({data:{user:session.user},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null}),refreshSession:async()=>({data:{session},error:null})},
 from:builder,
 rpc:async(name)=>{await new Promise(r=>setTimeout(r,40));if(name==='z19p_pending_film_items')return {data:pendingRows,error:null};return {data:/flow|snapshot/.test(name)?{}:name.includes('progress')?{}:null,error:null}},
 storage:{from:bucket=>({getPublicUrl:(p,o)=>({data:{publicUrl:art(bucket,p,o&&o.transform)}}),
   createSignedUrl:async(p,_s,o)=>{await new Promise(r=>setTimeout(r,60));return {data:{signedUrl:art(bucket,p,o&&o.transform)+(o&&o.transform?'&':'?')+'token=x'},error:null}},
   createSignedUrls:async paths=>{const s=window.qaSign;s.calls++;s.inFlight++;s.maxInFlight=Math.max(s.maxInFlight,s.inFlight);await new Promise(r=>setTimeout(r,350));s.inFlight--;return {data:paths.map(p=>({path:p,signedUrl:art(bucket,p)+'?token=x'})),error:null}},
   upload:async()=>({data:{},error:null}),remove:async()=>({data:[],error:null}),download:async()=>({data:null,error:{message:'qa'}})})},
 functions:{invoke:async()=>({data:null,error:null})},channel:()=>chain,removeChannel:()=>{},removeAllChannels:()=>{}};}
export default {createClient};`;

const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.json':'application/json','.woff2':'font/woff2','.ttf':'font/ttf','.wasm':'application/wasm','.icc':'application/octet-stream'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://x');
  if(url.pathname.includes('/fonts/')){res.writeHead(200,{'content-type':'font/ttf','access-control-allow-origin':'*'});res.end(await fs.readFile(url.pathname.includes('/b.ttf')?'/System/Library/Fonts/Supplemental/Courier New.ttf':'/System/Library/Fonts/Supplemental/Arial.ttf'));return;}
  if(url.pathname.startsWith('/qa-art/')){const m=url.pathname.match(/a(\d+)\//),n=m?Number(m[1]):1,isLight=url.searchParams.has('w');isLight?hits.light++:(hits.full++,hits.fullLog.push(url.pathname+' ← '+(req.headers['sec-fetch-dest']||'')+' '+(req.headers.accept||'').slice(0,20)));hits.paths.add(url.pathname+(isLight?'?leve':''));
    await new Promise(r=>setTimeout(r,isLight?30:400));res.writeHead(200,{'content-type':'image/png','access-control-allow-origin':'*','cache-control':'no-store'});res.end((isLight?light:big)[n%colors.length]);return;}
  const name=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html',file=path.resolve(dist,name);
  if(!file.startsWith(dist)){res.writeHead(403);return res.end()}
  try{const body=await fs.readFile(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(body)}catch{res.writeHead(404);res.end()}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=process.env.QA_BROWSER||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
const port=9600+Math.floor(Math.random()*300),profile=await fs.mkdtemp(path.join(os.tmpdir(),'z19-film-app-prof-'));
const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--remote-allow-origins=*','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms)),pending=new Map(),errors=[];let socket,id=0;
const send=(method,params={})=>{const key=++id;return new Promise((resolve,reject)=>{const t=setTimeout(()=>{pending.delete(key);reject(Error('CDP timeout '+method))},30000);pending.set(key,{resolve:v=>{clearTimeout(t);resolve(v)},reject:e=>{clearTimeout(t);reject(e)}});socket.send(JSON.stringify({id:key,method,params}))})};
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
const wait=async(expression,label,timeout=20000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate('!!('+expression+')').catch(()=>false))return Date.now();await delay(50)}throw Error('Timeout: '+label+'\n'+(await evaluate('document.body.innerText.slice(0,1200)').catch(()=>'')))};
const shot=async name=>{const d=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(out,name+'.png'),Buffer.from(d.data,'base64'))};
const mouseClick=async(x,y)=>{await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});await delay(120)};
const key=async(name,code)=>{for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key:name,code:name,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code});await delay(150)};
const clickText=(text,scope='document')=>evaluate(`(()=>{const b=[...${scope}.querySelectorAll('button')].find(b=>b.textContent.replace(/\\s+/g,' ').trim().includes(${JSON.stringify(text)})&&!b.disabled);if(!b)return false;b.click();return true})()`);
const placementsCount=()=>evaluate('document.querySelectorAll("#filmPreview [data-placement]").length');
const center=nth=>evaluate(`(()=>{const n=document.querySelectorAll('#filmPreview [data-placement]')[${nth}];if(!n)return null;n.scrollIntoView({block:'center',inline:'center'});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,key:n.dataset.placement}})()`);
const report=[];
try{
  let target;for(let n=0;n<100&&!target;n++){try{target=(await (await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(t=>t.type==='page')?.webSocketDebuggerUrl}catch{}if(!target)await delay(150)}
  socket=new WebSocket(target);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);
    if(m.id){const c=pending.get(m.id);pending.delete(m.id);m.error?c?.reject(Error(m.error.message)):c?.resolve(m.result);return}
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails?.exception?.description?.split('\n')[0]||m.params.exceptionDetails?.text);
    if(m.method==='Fetch.requestPaused'){const {requestId,request}=m.params;
      if(/supabase-js/.test(request.url))send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'},{name:'Access-Control-Allow-Origin',value:'*'}],body:Buffer.from(fake).toString('base64')}).catch(()=>null);
      else if(/supabase\.co/.test(request.url))send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'}],body:Buffer.from('[]').toString('base64')}).catch(()=>null);
      else send('Fetch.continueRequest',{requestId}).catch(()=>null)}});
  await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*supabase*'}]});
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:2,mobile:false});
  await send('Page.navigate',{url:origin+'/index.html#/filme'});
  await wait('document.querySelector("#addFilmAsset")','página do filme',30000);
  const fails=[];const check=(c,m)=>{if(!c)assert.fail(m);return true};
  await wait('document.querySelector("[data-film-font-colors]")','botão Cor das fontes',30000);
  await evaluate('document.querySelector("#calculateFilm")?.click()');
  await wait('document.querySelectorAll("#filmPreview [data-placement] img").length>=4&&[...document.querySelectorAll("#filmPreview [data-placement] img")].every(i=>i.complete&&i.naturalWidth>0)','filme com as 4 escritas',60000);
  const layoutBefore=await evaluate('JSON.stringify([...document.querySelectorAll("#filmPreview [data-placement]")].map(n=>n.style.cssText))');
  await shot('1-filme');
  const btnCount=await evaluate('document.querySelectorAll(".color-film-font").length');check(btnCount===4,'4 botões Cor da fonte: '+btnCount);
  // Pixel color of a film preview for item key
  const colorOf=k=>evaluate(`(async()=>{const n=[...document.querySelectorAll('#filmPreview [data-placement]')].find(n=>n.dataset.placement.startsWith('["${k}"'));let img=null;for(let t=0;t<200;t++){const m=[...document.querySelectorAll('#filmPreview [data-placement]')].find(n=>n.dataset.placement.startsWith('["${k}"'));img=m&&m.querySelector('img');if(img&&img.complete&&img.naturalWidth>0)break;await new Promise(r=>setTimeout(r,50));}if(!img||!img.naturalWidth)return null;const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const g=c.getContext('2d');g.drawImage(img,0,0);const d=g.getImageData(0,0,c.width,c.height).data;let best=null;for(let i=0;i<d.length;i+=4){if(d[i+3]>250){best=[d[i],d[i+1],d[i+2]];break;}}return best})()`);
  const keys=await evaluate('[...document.querySelectorAll("#filmPreview [data-placement]")].map(n=>n.dataset.placement)');report.push('placements: '+keys.join(','));
  report.push('cor antes CLOVIS '+JSON.stringify(await colorOf('f1'))+' JOAO '+JSON.stringify(await colorOf('f4')));
  // 1) Só esta (BRUNA)
  await evaluate('[...document.querySelectorAll(".color-film-font")].find(b=>b.dataset.id==="f3").click()');
  await wait('document.querySelector("[aria-label=\'Cor da fonte no filme\']")','janela');
  await shot('2-janela-so-esta');await evaluate('document.querySelector(".color-film-font").scrollIntoView({block:"center"})');
  await evaluate(`(()=>{const i=document.querySelector('[data-font-color]');i.value='#dc2626';i.dispatchEvent(new Event('input'))})()`);
  await evaluate('document.querySelector("[data-font-ask]").click()');await wait('document.querySelector("[data-font-apply]")','confirmação');
  const confirmText=await evaluate('document.querySelector("[role=alert]")?.textContent');report.push('confirmação: '+confirmText);check(/1 item/.test(confirmText),'confirma 1 item');
  await shot('3-confirmar');
  await evaluate('document.querySelector("[data-font-apply]").click()');
  await wait('!document.querySelector("[aria-label=\'Cor da fonte no filme\']")','janela fechou');
  await wait('document.querySelectorAll("#filmPreview [data-placement] img").length>=4&&[...document.querySelectorAll("#filmPreview [data-placement] img")].every(i=>i.complete&&i.naturalWidth>0)','filme redesenhado',30000);
  await delay(500);
  const bruna=await colorOf('f3'),clovis=await colorOf('f1');report.push('depois só esta: BRUNA '+JSON.stringify(bruna)+' CLOVIS '+JSON.stringify(clovis));
  check(bruna&&bruna[0]>200&&bruna[1]<80,'BRUNA ficou vermelha');check(clovis&&clovis[1]>120&&clovis[0]<80,'CLOVIS continua verde');
  // 2) Todas da fonte Brasil 2026 pelo botão geral
  await evaluate('document.querySelector("[data-film-font-colors]").click()');
  await wait('document.querySelector("[data-font-group]")','escolher fonte');
  const groups=await evaluate('[...document.querySelectorAll("[data-font-group]")].map(b=>b.textContent)');report.push('fontes: '+groups.join(' | '));check(groups.length===2,'2 fontes');
  await evaluate(`[...document.querySelectorAll('[data-font-group]')].find(b=>/Brasil 2026/.test(b.textContent)).click()`);
  await evaluate(`(()=>{const i=document.querySelector('[data-font-color]');i.value='#1d4ed8';i.dispatchEvent(new Event('input'))})()`);
  await evaluate('document.querySelector("[data-font-ask]").click()');await wait('document.querySelector("[data-font-apply]")','confirmação todas');
  const t2=await evaluate('document.querySelector("[role=alert]")?.textContent');report.push('confirmação: '+t2);check(/3 itens/.test(t2),'confirma 3 itens');
  await shot('4-confirmar-todas');
  await evaluate('document.querySelector("[data-font-apply]").click()');
  await wait('!document.querySelector("[aria-label=\'Cor da fonte no filme\']")','janela fechou 2');
  await wait('document.querySelectorAll("#filmPreview [data-placement] img").length>=4&&[...document.querySelectorAll("#filmPreview [data-placement] img")].every(i=>i.complete&&i.naturalWidth>0)','filme redesenhado 2',30000);await delay(500);
  const after={c:await colorOf('f1'),n:await colorOf('f2'),b:await colorOf('f3'),j:await colorOf('f4')};report.push('depois todas: '+JSON.stringify(after));
  for(const k of ['c','n','b'])check(after[k]&&after[k][2]>180&&after[k][0]<80,'azul em '+k);
  check(after.j&&after.j[1]>120&&after.j[2]<120,'Palmeiras (outra fonte) continua verde');
  const layoutAfter=await evaluate('JSON.stringify([...document.querySelectorAll("#filmPreview [data-placement]")].map(n=>n.style.cssText))');check(layoutAfter===layoutBefore,'encaixe não mudou');
  await evaluate('document.querySelector(".color-film-font").scrollIntoView({block:"start"})');await delay(300);await shot('5-depois');
  // TAMANHO: só o 10 → números 30 cm; depois todas da Brasil 2026 → letras 8 cm. JOAO (outra fonte) não muda.
  const sizes=()=>evaluate(`[...document.querySelectorAll('.film-item b')].map(b=>b.textContent+' '+b.parentElement.querySelector('small')?.textContent).join(' | ')`);
  report.push('antes: '+await sizes());
  await evaluate('[...document.querySelectorAll(".size-film-font")].find(b=>b.dataset.id==="f2").click()');
  await wait('document.querySelector("[aria-label=\'Tamanho da fonte no filme\']")','janela tamanho');
  check(!await evaluate('!!document.querySelector("[data-size-name]")'),'número sozinho não mostra campo de letras');
  await evaluate(`(()=>{const i=document.querySelector('[data-size-number]');i.value='30';i.dispatchEvent(new Event('input'))})()`);
  await evaluate('document.querySelector("[data-font-ask]").click()');await wait('document.querySelector("[data-font-apply]")','confirmação tamanho');
  report.push('confirmação: '+await evaluate('document.querySelector("[role=alert]:not([data-size-error])")?.textContent'));
  await shot('6-tamanho-so-este');
  await evaluate('document.querySelector("[data-font-apply]").click()');
  await wait('!document.querySelector("[aria-label=\'Tamanho da fonte no filme\']")','janela tamanho fechou',30000);await wait('document.body.innerText.includes("Tamanho mudado em 1 escrita")','aviso tamanho 1',30000);await delay(800);
  await wait('document.querySelectorAll("#filmPreview [data-placement] img").length>=4&&[...document.querySelectorAll("#filmPreview [data-placement] img")].every(i=>i.complete&&i.naturalWidth>0)','filme recalculado',60000);
  const s1=await sizes();report.push('depois 10→30: '+s1);check(/Fonte · 10 [\d.]+ × 30\.00 cm/.test(s1),'10 com 30 cm de altura');
  await evaluate('document.querySelector("[data-film-font-sizes]").click()');
  await wait('document.querySelector("[data-font-group]")','escolher fonte (tamanho)');
  await evaluate(`[...document.querySelectorAll('[data-font-group]')].find(b=>/Brasil 2026/.test(b.textContent)).click()`);
  await evaluate(`(()=>{const i=document.querySelector('[data-size-name]');i.value='8';i.dispatchEvent(new Event('input'))})()`);
  await shot('7-tamanho-todas');
  await evaluate('document.querySelector("[data-font-ask]").click()');await wait('document.querySelector("[data-font-apply]")','confirmação tamanho todas');
  report.push('confirmação: '+await evaluate('document.querySelector("[role=alert]:not([data-size-error])")?.textContent'));
  await evaluate('document.querySelector("[data-font-apply]").click()');
  await wait('!document.querySelector("[aria-label=\'Tamanho da fonte no filme\']")','janela tamanho fechou 2',30000);await wait('document.body.innerText.includes("Tamanho mudado em 2 escritas")','aviso tamanho 2',30000);await delay(800);
  await wait('document.querySelectorAll("#filmPreview [data-placement] img").length>=4&&[...document.querySelectorAll("#filmPreview [data-placement] img")].every(i=>i.complete&&i.naturalWidth>0)','filme recalculado 2',60000);
  report.push('toasts: '+await evaluate(`[...document.querySelectorAll('.toast,[class*=toast]')].map(t=>t.textContent).join(' | ')`));const s2=await sizes();report.push('depois letras→8: '+s2);
  check(/BRUNA [^|]*corpo letra 8 cm/.test(s2)&&/CLOVIS [^|]*corpo letra 8 cm/.test(s2),'CLOVIS e BRUNA com corpo 8');check(/JOAO [^|]*corpo letra 5,5 cm/.test(s2),'JOAO continua 5,5');check(/Fonte · 10 [\d.]+ × 30\.00 cm/.test(s2),'10 continua 30');
  const blue=await colorOf('f3');check(blue&&blue[2]>180,'cor azul mantida depois do tamanho');
  await shot('8-depois-tamanho');
  check(!errors.length,'erros na página: '+errors.join(' | '));
  console.log('PASS cor da fonte no filme\n'+report.join('\n'));
}catch(error){console.log('FALHOU',error.message);console.log(report.join('\n'));if(errors.length)console.log('erros:',errors.join(' | '));process.exitCode=1}
finally{try{socket?.close()}catch{}child.kill();server.close();clearTimeout(watchdog)}
