// 2.17.92 (06/11, dono): tela "Vetorizar arte" — no app inteiro do dist, com banco e armazenamento SIMULADOS (o simulador grava).
// Confere: item "✨ Vetorizar arte" no menu e botão no Montar filme (abre com "← Voltar para o filme"); enviar a arte (fundo branco
// removido sozinho); medida pela largura com a altura acompanhando; Vetorizar com etapas; SVG sem imagem dentro e com degradê;
// PNG com o tamanho de 28 cm a 300 DPI gravado no arquivo; "Salvar e jogar no filme" cria a pasta Artes prontas, grava a arte, o
// perfil de impressão e os 3 arquivos, e a arte entra no filme; tela de celular sem rolagem lateral.
// Uso: node scripts/zero19-vetor-browser-qa.mjs [pasta das fotos]   (rode depois do build)
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.resolve(process.env.QA_DIST||path.join(root,'dist'));
const out=path.resolve(process.argv[2]||await fs.mkdtemp(path.join(os.tmpdir(),'z19-vetor-')));await fs.mkdir(out,{recursive:true});
const watchdog=setTimeout(()=>{console.log('watchdog');process.exit(2)},process.env.VETOR_QA_ART?1500000:300000);watchdog.unref?.();

const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
const crc=buf=>{let c=0xffffffff;for(const v of buf)c=table[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0};
const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c])};
function encode(w,h,pixel){const raw=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++){raw[y*(w*4+1)]=0;for(let x=0;x<w;x++){const o=y*(w*4+1)+1+x*4,[r,g,b,a]=pixel(x,y);raw[o]=r;raw[o+1]=g;raw[o+2]=b;raw[o+3]=a;}}
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
// Arte de teste: fundo BRANCO (vai ser removido), faixa com degradê azul→amarelo e um círculo vermelho; a arte útil tem 800 × 400 px.
const testArt=encode(1000,600,(x,y)=>{
  const inBar=x>=100&&x<900&&y>=100&&y<500,dx=x-750,dy=y-300,inCircle=dx*dx+dy*dy<110*110;
  if(inCircle)return [220,30,40,255];
  if(inBar){const t=(x-100)/800;return [Math.round(20+t*230),Math.round(70+t*150),Math.round(200-t*170),255];}
  return [255,255,255,255];});
const uploadFile=path.join(out,'logo-degrade.png');await fs.writeFile(uploadFile,testArt);
const artPng=encode(400,200,(x,y)=>[37,99,235,x>20&&x<380&&y>20&&y<180?255:0]);

const OWNER='5b0f6a52-6a0e-4a8e-9d3c-1f2a3b4c5d6e',USER=OWNER,LIB='00000000-0000-4000-8000-000000000150',now=Date.now(),iso=ms=>new Date(ms).toISOString();
const data={z19p_profiles:[{id:USER,account_owner_id:OWNER,full_name:'Clovis Teste',role:'admin',active:true,email:'equipe@zero19.test'}],
  z19p_workspaces:[{id:LIB,owner_id:OWNER,company_name:'Artes',client_name:'Biblioteca interna de artes',workspace_type:'library_artes',created_at:iso(now),updated_at:iso(now)}],
  z19p_projects:[],z19p_zero19_work_items:[],z19p_assets:[],z19p_asset_print_profiles:[],z19p_folders:[],z19p_asset_placements:[],personalization_sales:[],
  z19p_print_media_profiles:[{id:'00000000-0000-4000-8000-000000000900',owner_id:OWNER,name:'Filme 58 cm',usable_width_cm:58,width_cm:60,active:true,is_default:true,created_at:iso(now)}]};

const fake=`
const data=${JSON.stringify(data)},origin=location.origin;
window.qa={rpc:[],writes:[],rows:{}};
const session={access_token:'qa',user:{id:'${USER}',email:'equipe@zero19.test',user_metadata:{full_name:'Clovis Teste'}}};
const match=(r,[k,v,op])=>op==='eq'?(r[k]===undefined||r[k]===v):op==='in'?(r[k]===undefined||v.includes(r[k])):op==='is'?(r[k]===undefined||r[k]===v||(v===null&&r[k]==null)):true;
const uid=()=>crypto.randomUUID();
function builder(table){const filters=[];let single=false,maybe=false,head=false,from=0,to=null,write=null;
 const rows=()=>(data[table]=data[table]||[]).filter(r=>filters.every(f=>match(r,f)));
 const run=()=>{let result;
  if(write?.op==='insert'){const list=(Array.isArray(write.value)?write.value:[write.value]).map(v=>({id:v.id||uid(),created_at:new Date().toISOString(),...v}));data[table].push(...list);window.qa.writes.push(table+':insert');(window.qa.rows[table]=window.qa.rows[table]||[]).push(...list);result=list;}
  else if(write?.op==='upsert'){const keyName=(write.options?.onConflict||'id').split(',')[0];const list=(Array.isArray(write.value)?write.value:[write.value]).map(v=>{const i=data[table].findIndex(r=>r[keyName]===v[keyName]);const row={...(i>=0?data[table][i]:{id:uid()}),...v};if(i>=0)data[table][i]=row;else data[table].push(row);return row});window.qa.writes.push(table+':upsert');(window.qa.rows[table]=window.qa.rows[table]||[]).push(...list);result=list;}
  else if(write?.op==='update'){const list=rows();for(const r of list)Object.assign(r,write.value);window.qa.writes.push(table+':update');result=list;}
  else if(write?.op==='delete'){const list=rows();data[table]=data[table].filter(r=>!list.includes(r));window.qa.writes.push(table+':delete');result=list;}
  else result=rows();
  if(to!==null)result=result.slice(from,to+1);
  return single||maybe?{data:result[0]||null,error:single&&!result[0]?{message:'not found',code:'PGRST116'}:null}:{data:head?null:result,error:null,count:result.length};};
 const q=new Proxy({},{get(_,prop){
  if(prop==='then')return (ok,fail)=>new Promise(r=>setTimeout(r,25)).then(run).then(ok,fail);
  if(prop==='eq')return (k,v)=>{filters.push([k,v,'eq']);return q};
  if(prop==='in')return (k,v)=>{filters.push([k,v,'in']);return q};
  if(prop==='is')return (k,v)=>{filters.push([k,v,'is']);return q};
  if(prop==='range')return (a,b)=>{from=a;to=b;return q};
  if(prop==='limit')return n=>{from=0;to=n-1;return q};
  if(prop==='single')return ()=>{single=true;return q};
  if(prop==='maybeSingle')return ()=>{maybe=true;return q};
  if(prop==='select')return (_s,opts)=>{if(opts&&opts.head)head=true;return q};
  if(prop==='insert')return value=>{write={op:'insert',value};return q};
  if(prop==='upsert')return (value,options)=>{write={op:'upsert',value,options};return q};
  if(prop==='update')return value=>{write={op:'update',value};return q};
  if(prop==='delete')return ()=>{write={op:'delete'};return q};
  return ()=>q;}});return q;}
const chain=new Proxy(function(){},{get:(_,p)=>p==='then'?undefined:chain,apply:()=>chain});
const art=(bucket,p,t)=>origin+'/qa-art/'+bucket+'/'+p+(t?'?w='+t.width:'');
async function rpc(name){await new Promise(r=>setTimeout(r,25));window.qa.rpc.push(name);
 if(name==='zero19_production_order_queue'||name==='z19p_pending_film_items')return {data:[],error:null};
 return {data:/flow|snapshot/.test(name)?{}:name.includes('progress')?{}:null,error:null};}
export function createClient(){return {
 auth:{getSession:async()=>({data:{session},error:null}),getUser:async()=>({data:{user:session.user},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null}),refreshSession:async()=>({data:{session},error:null})},
 from:builder,rpc,
 storage:{from:bucket=>({getPublicUrl:(p,o)=>({data:{publicUrl:art(bucket,p,o&&o.transform)}}),
   createSignedUrl:async(p,_s,o)=>({data:{signedUrl:art(bucket,p,o&&o.transform)+(o&&o.transform?'&':'?')+'token=x'},error:null}),
   createSignedUrls:async paths=>({data:paths.map(p=>({path:p,signedUrl:art(bucket,p)+'?token=x'})),error:null}),
   upload:async p=>{window.qa.uploads=(window.qa.uploads||[]).concat([p]);return {data:{},error:null}},remove:async()=>({data:[],error:null}),download:async()=>({data:null,error:{message:'qa'}})})},
 functions:{invoke:async()=>({data:null,error:null})},channel:()=>chain,removeChannel:()=>{},removeAllChannels:()=>{}};}
export default {createClient};`;

const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.json':'application/json','.woff2':'font/woff2','.ttf':'font/ttf','.wasm':'application/wasm','.icc':'application/octet-stream'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://x');
  if(url.pathname.startsWith('/qa-art/')){res.writeHead(200,{'content-type':'image/png','access-control-allow-origin':'*','cache-control':'no-store'});res.end(artPng);return;}
  const name=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html',file=path.resolve(dist,name);
  if(!file.startsWith(dist)){res.writeHead(403);return res.end()}
  try{const body=await fs.readFile(file);res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(body)}catch{res.writeHead(404);res.end()}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=process.env.QA_BROWSER||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
const port=9300+Math.floor(Math.random()*300),profile=await fs.mkdtemp(path.join(os.tmpdir(),'z19-vetor-prof-'));
const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--remote-allow-origins=*','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms)),pending=new Map(),errors=[],consoleErrors=[],storage=[];let socket,id=0;
const send=(method,params={})=>{const k=++id;return new Promise((resolve,reject)=>{const t=setTimeout(()=>{pending.delete(k);reject(Error('CDP timeout '+method))},60000);pending.set(k,{resolve:v=>{clearTimeout(t);resolve(v)},reject:e=>{clearTimeout(t);reject(e)}});socket.send(JSON.stringify({id:k,method,params}))})};
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
const wait=async(expression,label,timeout=20000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate('!!('+expression+')').catch(()=>false))return;await delay(80)}throw Error('Timeout: '+label+'\n'+(await evaluate('document.body.innerText.slice(0,1500)').catch(()=>'')))};
const shot=async name=>{const d=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(out,name+'.png'),Buffer.from(d.data,'base64'))};
const noSideScroll=async label=>{const w=await evaluate('({doc:document.documentElement.scrollWidth,vw:innerWidth})');assert(w.doc<=w.vw+1,label+': rolagem lateral '+JSON.stringify(w))};
// Downloads: o clique no link do arquivo é capturado na página (nome + bytes), sem depender da pasta de downloads do Chrome.
const captureDownloads=`(()=>{if(window.qaDownloads)return;window.qaDownloads=[];const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download&&this.href.startsWith('blob:')){const name=this.download;window.qaDownloads.push({name,bytes:fetch(this.href).then(r=>r.arrayBuffer()).then(b=>{const u=new Uint8Array(b);let s='';for(let i=0;i<u.length;i+=8192)s+=String.fromCharCode.apply(null,u.subarray(i,i+8192));return btoa(s)})});return}return click.call(this)}})()`;
const takeDownload=async pattern=>{await wait(`(window.qaDownloads||[]).some(d=>${pattern}.test(d.name))`,'download '+pattern,60000);return evaluate(`(async()=>{const d=window.qaDownloads.find(d=>${pattern}.test(d.name));return {name:d.name,base64:await d.bytes}})()`);};
function pngInfo(buffer){const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20);let pos=8,dpi=null;while(pos<buffer.length){const len=buffer.readUInt32BE(pos),type=buffer.toString('ascii',pos+4,pos+8);if(type==='pHYs'){const ppm=buffer.readUInt32BE(pos+8);dpi=Math.round(ppm*0.0254);}if(type==='IDAT')break;pos+=12+len;}return {width,height,dpi,colorType:buffer[25]};}

const report=[];
try{
  let target;for(let n=0;n<100&&!target;n++){try{target=(await (await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(t=>t.type==='page')?.webSocketDebuggerUrl}catch{}if(!target)await delay(150)}
  socket=new WebSocket(target);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);
    if(m.id){const c=pending.get(m.id);pending.delete(m.id);m.error?c?.reject(Error(m.error.message)):c?.resolve(m.result);return}
    if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')consoleErrors.push(m.params.args.map(x=>x.value||x.description||'').join(' ').slice(0,300));
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails?.exception?.description?.split('\n')[0]||m.params.exceptionDetails?.text);
    if(m.method==='Fetch.requestPaused'){const {requestId,request}=m.params;
      if(/supabase-js/.test(request.url))send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'},{name:'Access-Control-Allow-Origin',value:'*'}],body:Buffer.from(fake).toString('base64')}).catch(()=>null);
      else if(/supabase\.co/.test(request.url)){if(/\/storage\/v1\/object\//.test(request.url)&&request.method!=='OPTIONS')storage.push(request.method+' '+decodeURIComponent(request.url.split('/storage/v1/object/')[1]||''));send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'},{name:'Access-Control-Allow-Headers',value:'*'},{name:'Access-Control-Allow-Methods',value:'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS'}],body:Buffer.from('{"Key":"ok"}').toString('base64')}).catch(()=>null);}
      else send('Fetch.continueRequest',{requestId}).catch(()=>null)}});
  await send('Page.enable');await send('Runtime.enable');await send('DOM.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*supabase*'}]});
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});

  // 1) Botão no Montar filme abre a tela com "Voltar para o filme"; item no menu lateral.
  await send('Page.navigate',{url:origin+'/index.html#/filme'});
  await wait('document.querySelector("#openVectorizer")','botão Vetorizar arte no filme',40000);
  assert.match(await evaluate('document.querySelector("#openVectorizer").textContent'),/Vetorizar arte/);
  assert(await evaluate(`!!document.querySelector('[data-nav="/vetorizar"]')`),'item Vetorizar arte no menu lateral');
  report.push('menu: '+await evaluate(`document.querySelector('[data-nav="/vetorizar"]').textContent`));
  await evaluate('document.querySelector("#openVectorizer").click()');
  await wait('location.hash==="#/vetorizar?from=filme"&&document.querySelector("[data-vz-film]")&&document.querySelector("[data-vz-choose]")','tela Vetorizar arte vinda do filme',30000);
  report.push('filme → '+await evaluate('location.hash')+' com "'+await evaluate('document.querySelector("[data-vz-film]").textContent')+'"');
  await noSideScroll('tela vazia PC');await shot('1-vetorizar-vazia');

  // 2) Enviar a arte: fundo branco sai sozinho, caixa da arte = 800 × 400 px.
  await evaluate(captureDownloads);
  const doc=await send('DOM.getDocument',{depth:-1}),input=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'[data-vz-file]'});
  await send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[uploadFile]});
  await wait('document.querySelector("[data-vz-size=largura]")&&/800 × 400 px/.test(document.querySelector(".vz-measure small")?.textContent||"")','arte preparada com a caixa útil',40000);
  const prepared=await evaluate(`({mode:document.querySelector('.vz-check small')?.textContent,removeChecked:document.querySelector('[data-vz-remove]').checked,go:document.querySelector('[data-vz-go]').disabled,summary:document.querySelector('.vz-summary').textContent})`);
  report.push('preparada: '+JSON.stringify(prepared));
  assert(prepared.removeChecked,'Remover fundo começa marcado');assert.match(prepared.mode,/Fundo removido/);assert(prepared.go,'Vetorizar fica travado sem medida');
  // 3) Medida: largura 28 → altura 14 (proporção da arte recortada) e resumo com o PNG 300 DPI.
  await evaluate(`(()=>{const i=document.querySelector('[data-vz-size=largura]');i.value='28';i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await wait(`document.querySelector('[data-vz-size=altura]').value==='14'&&!document.querySelector('[data-vz-go]').disabled`,'altura acompanhando a largura',5000);
  const summary=await evaluate(`document.querySelector('.vz-summary').textContent`);report.push('resumo: '+summary);
  assert.match(summary,/28 × 14 cm.*Fundo transparente.*300 DPI \(3307 × 1654 px\)/);
  await shot('2-medida');
  // 4) Vetorizar: etapas aparecem e o resultado chega.
  await evaluate(`document.querySelector('[data-vz-go]').click()`);
  await wait('document.querySelector(".vz-progress li")','etapas do processamento',10000);
  await wait('document.querySelector(".vz-result")','resultado da vetorização',120000);
  const result=await evaluate(`({kind:document.querySelector('.vz-kind').textContent,stats:document.querySelector('.vz-stats').textContent,files:document.querySelector('.vz-files').textContent})`);
  report.push('resultado: '+JSON.stringify(result));
  assert.match(result.stats,/degradês/);assert.match(result.stats,/sem imagem dentro/);assert.match(result.files,/logo_degrade_28cm\.svg/);
  await noSideScroll('resultado PC');await shot('3-resultado-pc');
  for(const view of ['sobrepor','resultado','original']){await evaluate(`document.querySelector('[data-vz-view="${view}"]').click()`);await delay(150);}
  await evaluate(`document.querySelector('[data-vz-view="lado"]').click()`);
  // 5) SVG: vetor de verdade (sem bitmap, script ou link externo), com degradê, medida em cm.
  await evaluate(`document.querySelector('[data-vz-svg]').click()`);
  const svgFile=await takeDownload('/\\.svg$/'),svg=Buffer.from(svgFile.base64,'base64').toString('utf8');
  await fs.writeFile(path.join(out,svgFile.name),svg);
  assert.equal(svgFile.name,'logo_degrade_28cm.svg');assert(!/<image\b/i.test(svg)&&!/<script\b/i.test(svg)&&!/href="(?!#)/i.test(svg),'SVG sem bitmap/script/link');
  assert(/<(linear|radial)Gradient\b/.test(svg),'SVG com degradê');assert.match(svg,/width="28cm" height="14cm"/);
  report.push('SVG: '+svgFile.name+' · '+Math.round(svg.length/1024)+' KB · '+(svg.match(/<linearGradient\b/g)||[]).length+' lineares, '+(svg.match(/<radialGradient\b/g)||[]).length+' radiais');
  // 6) PNG: 3307 × 1654 px, 300 DPI gravado no arquivo, com transparência.
  await evaluate(`document.querySelector('[data-vz-png]').click()`);
  const pngFile=await takeDownload('/_300dpi\\.png$/'),pngBytes=Buffer.from(pngFile.base64,'base64'),info=pngInfo(pngBytes);
  await fs.writeFile(path.join(out,pngFile.name),pngBytes);report.push('PNG: '+pngFile.name+' '+JSON.stringify(info));
  assert.equal(pngFile.name,'logo_degrade_28cm_300dpi.png');assert.deepEqual([info.width,info.height,info.dpi,info.colorType],[3307,1654,300,6]);
  // 7) Salvar e jogar no filme: pasta Artes prontas, arte, perfil de impressão e 3 arquivos; a arte entra no filme.
  await evaluate(`document.querySelector('#vzName').value='Logo degradê vetor'`);
  await evaluate(`document.querySelector('[data-vz-film-save]').click()`);
  await wait(`location.hash==='#/filme'&&[...document.querySelectorAll('#filmItems article')].some(a=>/Logo degradê vetor/.test(a.textContent))`,'arte vetorizada no filme',60000);
  const saved=await evaluate(`({writes:window.qa.writes,folder:(window.qa.rows.z19p_folders||[])[0],asset:(window.qa.rows.z19p_assets||[])[0],profile:(window.qa.rows.z19p_asset_print_profiles||[])[0]})`);
  report.push('gravou: '+saved.writes.join(', ')+' · arquivos: '+storage.map(s=>s.split('/').pop()).join(', '));
  assert.equal(saved.folder?.name,'Artes prontas');assert.equal(saved.folder?.purpose,'artes_prontas');assert.equal(saved.asset?.folder_id,saved.folder?.id);
  assert.equal(saved.asset?.name,'Logo degradê vetor');assert.equal(saved.asset?.asset_type,'arte');assert.deepEqual([saved.asset?.width,saved.asset?.height,saved.asset?.dpi],[3307,1654,300]);
  assert(saved.asset?.metadata?.vectorized?.svg_path?.endsWith('/vetor.svg'),'caminho do SVG guardado na arte');
  assert.equal(saved.profile?.ready_for_print,true);assert.equal(saved.profile?.default_width_cm,28);assert.equal(saved.profile?.default_height_cm,14);
  for(const name of ['original.png','processed.png','vetor.svg'])assert(storage.some(s=>s.endsWith('/'+name)),'arquivo enviado: '+name);
  await shot('4-no-filme');
  // 8) Celular: tela com resultado sem rolagem lateral.
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await send('Page.navigate',{url:origin+'/index.html#/vetorizar'});
  await wait('document.querySelector("[data-vz-choose]")','tela no celular',30000);
  await evaluate(captureDownloads);
  const doc2=await send('DOM.getDocument',{depth:-1}),input2=await send('DOM.querySelector',{nodeId:doc2.root.nodeId,selector:'[data-vz-file]'});
  await send('DOM.setFileInputFiles',{nodeId:input2.nodeId,files:[uploadFile]});
  await wait('document.querySelector("[data-vz-size=altura]")','arte preparada no celular',40000);
  await evaluate(`(()=>{const i=document.querySelector('[data-vz-size=altura]');i.value='10';i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await wait(`document.querySelector('[data-vz-size=largura]').value==='20'`,'largura acompanhando a altura no celular',5000);
  await evaluate(`document.querySelector('[data-vz-go]').click()`);
  await wait('document.querySelector(".vz-result")','resultado no celular',120000);
  await noSideScroll('resultado celular');await shot('5-celular-resultado');await evaluate(`document.querySelector('.vz-result').scrollIntoView()`);await delay(200);await shot('6-celular-botoes');
  report.push('celular: largura 20 cm pela altura 10 cm, sem rolagem lateral');
  // 9) Opcional: uma arte real (VETOR_QA_ART=<caminho>, ex.: arte de cliente em tmp/, que nunca vai para o Git): mede o tempo da
  // tela inteira (processo separado, resolução de impressão) e confere que o navegador aguenta.
  if(process.env.VETOR_QA_ART){
    await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:origin+'/index.html#/'});await wait('document.querySelector(".app-drawer")||document.querySelector("main")','início',30000);
    await send('Page.navigate',{url:origin+'/index.html#/vetorizar'});
    // A arte do passo do celular não foi salva: a tela guarda o trabalho; "Outra imagem" começa do zero.
    await wait('document.querySelector("[data-vz-choose],[data-vz-new]")','tela para a arte real',30000);
    await evaluate(`document.querySelector('[data-vz-new]')?.click()`);
    await wait('document.querySelector("[data-vz-choose]")','envio limpo para a arte real',10000);
    const doc3=await send('DOM.getDocument',{depth:-1}),input3=await send('DOM.querySelector',{nodeId:doc3.root.nodeId,selector:'[data-vz-file]'});
    await send('DOM.setFileInputFiles',{nodeId:input3.nodeId,files:[path.resolve(process.env.VETOR_QA_ART)]});
    await wait('document.querySelector("[data-vz-size=largura]")','arte real preparada',120000);
    await evaluate(`(()=>{const i=document.querySelector('[data-vz-size=largura]');i.value='28';i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    // Arte grande: a medida aparece enquanto o fundo ainda é preparado; Vetorizar só libera depois.
    await wait(`!document.querySelector('.vz-progress')&&document.querySelector('[data-vz-go]')&&!document.querySelector('[data-vz-go]').disabled`,'Vetorizar liberado (arte real)',180000);
    const started=Date.now();await evaluate(`document.querySelector('[data-vz-go]').click()`);
    await wait('document.querySelector(".vz-progress li")','etapas da arte real',20000);
    await wait('document.querySelector(".vz-result")||document.querySelector(".toast.err,.toast-error")','resultado da arte real',900000);
    const real=await evaluate(`({kind:document.querySelector('.vz-kind')?.textContent||'',stats:document.querySelector('.vz-stats')?.textContent||'',err:document.querySelector('.toast')?.textContent||''})`);
    report.push('arte real: '+Math.round((Date.now()-started)/1000)+' s · '+JSON.stringify(real));assert(real.stats,'arte real sem resultado: '+real.err);
    await shot('7-arte-real');
  }
  const tela=errors.filter(e=>!/ResizeObserver/.test(e));if(tela.length)console.log('ERROS DE TELA:',[...new Set(tela)].slice(0,8).join(' | '));assert(!tela.length,'erro de tela');
  if(consoleErrors.length)report.push('console: '+[...new Set(consoleErrors)].slice(0,4).join(' | '));
  console.log(report.join('\n'));
  console.log('PASS Vetorizar arte: menu e botão do filme, fundo removido, medida pela largura/altura, SVG vetorial com degradê, PNG 28 cm 300 DPI gravado, salvar em Artes prontas e jogar no filme, celular. Fotos: '+out);
}finally{socket?.close();child.kill();server.close()}
