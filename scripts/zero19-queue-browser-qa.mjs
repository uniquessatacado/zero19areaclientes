// 2.17.90 (05/11, dono): fila de produção, Ver próximos pedidos, QR "Subir arte" sem mockup + Jogar no filme e Arte de empresa
// com as mais novas primeiro — no app inteiro do dist, com banco e armazenamento SIMULADOS (o simulador também grava).
// Confere: cartões na ordem da fila do banco (não na ordem antiga por data), PDV · LOJA / SITE, prazo e "O que falta", filtro
// por origem; no filme, a janela Próximos pedidos e "Jogar no filme" abrindo o Aguardando produção já marcado e a arte entrando;
// o QR #/zero19-fila?pedido=N abre o pedido direto, a medida do pedido já vem preenchida, a pasta Artes prontas é criada, ao salvar
// não abre a tela do mockup e aparece "Jogar no filme agora", que coloca a arte no filme ligada ao pedido.
// Uso: node scripts/zero19-queue-browser-qa.mjs [pasta das fotos]   (rode depois do build)
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.resolve(process.env.QA_DIST||path.join(root,'dist'));
const out=path.resolve(process.argv[2]||await fs.mkdtemp(path.join(os.tmpdir(),'z19-queue-')));await fs.mkdir(out,{recursive:true});
const watchdog=setTimeout(()=>{console.log('watchdog');process.exit(2)},420000);watchdog.unref?.();

function png(w,h,[r,g,b]){
  const raw=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++){raw[y*(w*4+1)]=0;for(let x=0;x<w;x++){const o=y*(w*4+1)+1+x*4,inside=x>w*.1&&x<w*.9&&y>h*.1&&y<h*.9;raw[o]=r;raw[o+1]=g;raw[o+2]=b;raw[o+3]=inside?255:0;}}
  const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
  const crc=buf=>{let c=0xffffffff;for(const v of buf)c=table[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0};
  const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([len,td,c])};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
const artPng=png(1200,960,[37,99,235]),uploadFile=path.join(out,'arte-do-cliente.png'),uploadBack=path.join(out,'arte-costas.png');await fs.writeFile(uploadFile,png(1500,1200,[225,29,72]));await fs.writeFile(uploadBack,png(1200,1500,[22,163,74]));

const OWNER='5b0f6a52-6a0e-4a8e-9d3c-1f2a3b4c5d6e',USER=OWNER;
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const now=Date.now(),iso=ms=>new Date(ms).toISOString(),day=86400000;
const key=ms=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
// Pedidos: a ordem antiga (prazo) seria Carla, Bruno, Ana, Davi; a fila do banco é Ana (PDV atrasado), Bruno, Carla, Davi.
const orders=[
  {n:1,number:50001,client:'Ana PDV',origin:'PDV',pickup:true,stage:'awaiting_art',promised:now-2*day,created:now-5*day},
  {n:2,number:50002,client:'Bruno Site',origin:'SITE',pickup:false,stage:'ready_production',promised:now-3*day,created:now-4*day,asset:true},
  {n:3,number:50003,client:'Carla Site',origin:'SITE',pickup:false,stage:'awaiting_font',promised:now-4*day,created:now-3*day},
  {n:4,number:50004,client:'Davi PDV',origin:'PDV',pickup:true,stage:'production',promised:now+day,created:now-2*day},
  {n:5,number:50005,client:'Eva Pronta',origin:'PDV',pickup:true,stage:'ready_pickup',promised:now-day,created:now-6*day},
];
const data={z19p_profiles:[{id:USER,account_owner_id:OWNER,full_name:'Clovis Teste',role:'admin',active:true,email:'equipe@zero19.test'}],
  z19p_workspaces:[],z19p_projects:[],z19p_zero19_work_items:[],z19p_assets:[],z19p_asset_print_profiles:[],z19p_folders:[],z19p_asset_placements:[],personalization_sales:[],
  z19p_print_media_profiles:[{id:uuid(900),owner_id:OWNER,name:'Filme 58 cm',usable_width_cm:58,width_cm:60,active:true,is_default:true,created_at:iso(now)}]};
for(const o of orders){
  const ws=uuid(100+o.n),pr=uuid(200+o.n),ord=uuid(300+o.n),sale=uuid(400+o.n),wi=uuid(500+o.n);o.ws=ws;o.project=pr;o.order=ord;o.sale=sale;o.item=wi;
  data.z19p_workspaces.push({id:ws,owner_id:OWNER,client_name:o.client,company_name:o.client,phone:'1999999000'+o.n,workspace_type:'client',created_at:iso(o.created),updated_at:iso(o.created)});
  data.z19p_projects.push({id:pr,owner_id:OWNER,workspace_id:ws,title:'Pedido '+o.number,sequence_no:1,official_order_ref:ord,official_order_source:'zero19_pdv',official_order_status:'open',official_order_payload:{display_id:o.number},promised_at:iso(o.promised),source_order_created_at:iso(o.created),created_at:iso(o.created),updated_at:iso(o.created)});
  if(o.asset){data.z19p_assets.push({id:uuid(600+o.n),owner_id:OWNER,workspace_id:ws,project_id:pr,folder_id:null,name:'Arte do pedido '+o.number,asset_type:'arte',processed_path:`w/a${o.n}/processed.png`,original_path:`w/a${o.n}/original.png`,width:1200,height:960,metadata:{personalization_sale_id:sale},created_at:iso(now-day)});
    data.z19p_asset_print_profiles.push({id:uuid(700+o.n),owner_id:OWNER,asset_id:uuid(600+o.n),ready_for_print:true,default_width_cm:25,default_height_cm:20,aspect_ratio:1.25,halftone:false,allow_internal_nesting:true,rotation_policy:'free'});}
  data.z19p_zero19_work_items.push({id:wi,owner_id:OWNER,workspace_id:ws,project_id:pr,tenant_id:'t',order_id:ord,personalization_sale_id:sale,kind:o.stage==='awaiting_font'?'NAME_NUMBER':'ART',stage:o.stage,quantity:2,text_value:'Estampa frente',garment_name:'Camiseta',garment_size:'M',requires_art:true,asset_id:o.asset?uuid(600+o.n):null,promised_at:iso(o.promised),metadata:{details:[{production:{width_cm:25,height_cm:20,position_label:'Frente · meio do peito'}}]},created_at:iso(o.created)});
}
// 2.17.91: pedido como o 50704 — 2 posições (peito 9 cm e costas 30 cm), 2 camisas diferentes em cada = 4 aplicações.
const multi={n:6,number:50006,client:'Fabio Duas Posicoes',origin:'PDV',pickup:true,created:now-day,promised:now+2*day};
{const ws=uuid(106),pr=uuid(206),ord=uuid(306);multi.ws=ws;multi.project=pr;multi.order=ord;orders.push({...multi,stage:'awaiting_art'});
  data.z19p_workspaces.push({id:ws,owner_id:OWNER,client_name:multi.client,company_name:multi.client,phone:'19999990006',workspace_type:'client',created_at:iso(multi.created),updated_at:iso(multi.created)});
  data.z19p_projects.push({id:pr,owner_id:OWNER,workspace_id:ws,title:'Pedido 50006',sequence_no:1,official_order_ref:ord,official_order_source:'zero19_pdv',official_order_status:'open',official_order_payload:{display_id:50006},promised_at:iso(multi.promised),source_order_created_at:iso(multi.created),created_at:iso(multi.created),updated_at:iso(multi.created)});
  [['Peito esquerdo',9,3,'Dry fit P'],['Peito esquerdo',9,4,'Poliamida G'],['Costas · em cima',30,3,'Dry fit P'],['Costas · em cima',30,4,'Poliamida G']].forEach(([label,width,qty,garment],k)=>data.z19p_zero19_work_items.push({id:uuid(560+k),owner_id:OWNER,workspace_id:ws,project_id:pr,tenant_id:'t',order_id:ord,personalization_sale_id:uuid(460+k),kind:'NEW_ART',stage:'awaiting_art',quantity:qty,text_value:label,garment_name:garment,requires_art:true,asset_id:null,promised_at:iso(multi.promised),metadata:{details:[{production:{width_cm:width,height_cm:width,position_label:label}}]},created_at:iso(multi.created)}));}
// Arte de empresa: duas artes da biblioteca, a mais nova tem de vir primeiro.
const LIB=uuid(150);data.z19p_workspaces.push({id:LIB,owner_id:OWNER,company_name:'Biblioteca ZERO19',workspace_type:'library',created_at:iso(now),updated_at:iso(now)});
for(const [n,name,age] of [[1,'Zebra antiga',30],[2,'Arte nova de hoje',0.1]]){data.z19p_assets.push({id:uuid(800+n),owner_id:OWNER,workspace_id:LIB,project_id:null,folder_id:null,name,asset_type:'arte',processed_path:`lib/a${n}/processed.png`,original_path:`lib/a${n}/original.png`,width:1200,height:960,metadata:{},created_at:iso(now-age*day)});data.z19p_asset_print_profiles.push({id:uuid(850+n),owner_id:OWNER,asset_id:uuid(800+n),ready_for_print:true,default_width_cm:10,default_height_cm:8,aspect_ratio:1.25,halftone:false,allow_internal_nesting:true,rotation_policy:'free'});}
const queue=[
  {o:orders[0],position:1,kind:'PICKUP',due_at:iso(orders[0].promised)},
  {o:orders[1],position:2,kind:'SEND_BY',send_by:key(now),dispatch:key(now),customer_date:key(now+3*day),freight_name:'SEDEX',transport_days:2},
  {o:orders[2],position:3,kind:'SEND_LATE',send_by:key(now),dispatch:key(now),last_post:key(now-2*day),customer_date:key(now),freight_name:'J&T Express',transport_days:5},
  {o:orders[3],position:4,kind:'PICKUP',due_at:iso(orders[3].promised)},
].map(({o,...q})=>({order_id:o.order,number:o.number,origin:o.origin,pdv:o.origin==='PDV',pickup:o.pickup,cutoff_hour:18,today:key(now),held_until:null,manual:null,customer_name:o.client,...q}));

const fake=`
const data=${JSON.stringify(data)},queue=${JSON.stringify(queue)},orders=${JSON.stringify(orders)},origin=location.origin;
window.qa={rpc:[],writes:[]};
const session={access_token:'qa',user:{id:'${USER}',email:'equipe@zero19.test',user_metadata:{full_name:'Clovis Teste'}}};
const match=(r,[k,v,op])=>op==='eq'?(r[k]===undefined||r[k]===v):op==='in'?(r[k]===undefined||v.includes(r[k])):op==='is'?(r[k]===undefined||r[k]===v||(v===null&&r[k]==null)):true;
const uid=()=>crypto.randomUUID();
function builder(table){const filters=[];let single=false,maybe=false,head=false,from=0,to=null,write=null;
 const rows=()=>(data[table]=data[table]||[]).filter(r=>filters.every(f=>match(r,f)));
 const run=()=>{let result;
  if(write?.op==='insert'){const list=(Array.isArray(write.value)?write.value:[write.value]).map(v=>({id:v.id||uid(),created_at:new Date().toISOString(),...v}));data[table].push(...list);window.qa.writes.push(table+':insert');if(table==='z19p_assets')window.qa.assets=(window.qa.assets||[]).concat(list);result=list;}
  else if(write?.op==='upsert'){const keyName=(write.options?.onConflict||'id').split(',')[0];const list=(Array.isArray(write.value)?write.value:[write.value]).map(v=>{const i=data[table].findIndex(r=>r[keyName]===v[keyName]);const row={...(i>=0?data[table][i]:{id:uid()}),...v};if(i>=0)data[table][i]=row;else data[table].push(row);return row});window.qa.writes.push(table+':upsert');result=list;}
  else if(write?.op==='update'){const list=rows();for(const r of list)Object.assign(r,write.value);window.qa.writes.push(table+':update');result=list;}
  else if(write?.op==='delete'){const list=rows();data[table]=data[table].filter(r=>!list.includes(r));result=list;}
  else result=rows();
  if(to!==null)result=result.slice(from,to+1);
  return single||maybe?{data:result[0]||null,error:single&&!result[0]?{message:'not found',code:'PGRST116'}:null}:{data:head?null:result,error:null,count:result.length};};
 const q=new Proxy({},{get(_,prop){
  if(prop==='then')return (ok,fail)=>new Promise(r=>setTimeout(r,25)).then(run).then(ok,fail);
  if(prop==='eq')return (k,v)=>{filters.push([k,v,'eq']);return q};
  if(prop==='in')return (k,v)=>{filters.push([k,v,'in']);return q};
  if(prop==='is')return (k,v)=>{filters.push([k,v,'is']);return q};
  if(prop==='range')return (a,b)=>{from=a;to=b;return q};
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
async function rpc(name,args={}){await new Promise(r=>setTimeout(r,25));window.qa.rpc.push(name);
 if(name==='zero19_production_order_queue')return {data:queue,error:null};
 if(name==='z19p_zero19_order_picker'){const query=String(args.p_query||'');const rows=orders.filter(o=>!query||String(o.number).includes(query)||o.client.toLowerCase().includes(query.toLowerCase())).map(o=>({order_id:o.order,display_id:o.number,customer_name:o.client,whatsapp:'(19) 99999-000'+o.n,personalization_count:1,integrated_stage:o.stage,created_at:new Date(o.created).toISOString()}));return {data:{rows,total:rows.length},error:null};}
 if(name==='z19p_sync_zero19_order'){const o=orders.find(x=>x.order===args.p_order_id);return {data:o?{project_id:o.project,workspace_id:o.ws}:null,error:null};}
 if(name==='z19p_zero19_force_stage'){window.qa.forced=(window.qa.forced||[]).concat([args]);for(const w of data.z19p_zero19_work_items)if(w.project_id===args.p_project_id)w.stage=args.p_stage;return {data:{stage:args.p_stage},error:null};}
 if(name==='z19p_zero19_mark_delivered'){window.qa.delivered=(window.qa.delivered||[]).concat([args]);for(const w of data.z19p_zero19_work_items)if(w.project_id===args.p_project_id)w.stage='delivered';return {data:{stage:'delivered'},error:null};}
 if(name==='z19p_zero19_mark_art_ready'){window.qa.markedAll=(window.qa.markedAll||[]).concat([args]);const item=data.z19p_zero19_work_items.find(w=>w.project_id===args.p_project_id&&w.personalization_sale_id===args.p_personalization_sale_id);if(!item)return {data:null,error:{message:'Item não encontrado'}};item.asset_id=args.p_asset_id;item.stage='ready_production';window.qa.marked=args;return {data:{stage:'ready_production'},error:null};}
 if(name==='z19p_pending_film_items')return {data:[],error:null};
 if(name==='z19p_zero19_undo_printed'){window.qa.undone=(window.qa.undone||[]).concat([args]);for(const w of data.z19p_zero19_work_items)if((args.p_sale_ids||[]).includes(w.personalization_sale_id))w.stage='ready_production';return {data:{items:(args.p_sale_ids||[]).length,placements:0},error:null};}
 if(name==='z19p_mark_selected_order_production'){window.qa.printed=(window.qa.printed||[]).concat([args]);for(const w of data.z19p_zero19_work_items)if((args.p_sale_ids||[]).includes(w.personalization_sale_id))w.stage='production';return {data:{projects:1,placements:0,personalizations:(args.p_sale_ids||[]).length},error:null};}
 return {data:/flow|snapshot/.test(name)?{}:name.includes('progress')?{}:null,error:null};}
export function createClient(){return {
 auth:{getSession:async()=>({data:{session},error:null}),getUser:async()=>({data:{user:session.user},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null}),refreshSession:async()=>({data:{session},error:null})},
 from:builder,rpc,
 storage:{from:bucket=>({getPublicUrl:(p,o)=>({data:{publicUrl:art(bucket,p,o&&o.transform)}}),
   createSignedUrl:async(p,_s,o)=>({data:{signedUrl:art(bucket,p,o&&o.transform)+(o&&o.transform?'&':'?')+'token=x'},error:null}),
   createSignedUrls:async paths=>({data:paths.map(p=>({path:p,signedUrl:art(bucket,p)+'?token=x'})),error:null}),
   upload:async()=>({data:{},error:null}),remove:async()=>({data:[],error:null}),download:async()=>({data:null,error:{message:'qa'}})})},
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
const port=9300+Math.floor(Math.random()*300),profile=await fs.mkdtemp(path.join(os.tmpdir(),'z19-queue-prof-'));
const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--remote-allow-origins=*','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms)),pending=new Map(),errors=[],consoleErrors=[];let socket,id=0;
const send=(method,params={})=>{const k=++id;return new Promise((resolve,reject)=>{const t=setTimeout(()=>{pending.delete(k);reject(Error('CDP timeout '+method))},30000);pending.set(k,{resolve:v=>{clearTimeout(t);resolve(v)},reject:e=>{clearTimeout(t);reject(e)}});socket.send(JSON.stringify({id:k,method,params}))})};
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
const wait=async(expression,label,timeout=20000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate('!!('+expression+')').catch(()=>false))return;await delay(60)}throw Error('Timeout: '+label+'\n'+(await evaluate('document.body.innerText.slice(0,1500)').catch(()=>'')))};
const shot=async name=>{const d=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(out,name+'.png'),Buffer.from(d.data,'base64'))};
const clickText=(text,scope='document')=>evaluate(`(()=>{const b=[...${scope}.querySelectorAll('button,a')].find(b=>b.textContent.replace(/\\s+/g,' ').trim().includes(${JSON.stringify(text)})&&!b.disabled);if(!b)return false;b.click();return true})()`);
const noSideScroll=async label=>{const w=await evaluate('({doc:document.documentElement.scrollWidth,vw:innerWidth})');assert(w.doc<=w.vw+1,label+': rolagem lateral '+JSON.stringify(w))};
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
      else if(/supabase\.co/.test(request.url))send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'},{name:'Access-Control-Allow-Headers',value:'*'},{name:'Access-Control-Allow-Methods',value:'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS'}],body:Buffer.from('{"Key":"ok"}').toString('base64')}).catch(()=>null);
      else send('Fetch.continueRequest',{requestId}).catch(()=>null)}});
  await send('Page.enable');await send('Runtime.enable');await send('DOM.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*supabase*'}]});
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});

  // 1) Tela inicial: ordem da fila, PDV/SITE, prazo, o que falta e filtro de origem.
  await send('Page.navigate',{url:origin+'/index.html#/'});
  await wait('document.querySelectorAll("[data-production-open-grid] .z19q-head").length>=4','cartões com a fila',40000);
  const cards=await evaluate(`[...document.querySelectorAll('[data-production-open-grid] .z19-zero19-card')].map(c=>({name:c.querySelector('h3')?.textContent,pos:c.querySelector('.z19q-pos')?.textContent||'',origin:c.querySelector('.z19q-origin')?.textContent||'',due:c.querySelector('.z19q-due')?.textContent||'',missing:c.querySelector('.z19q-missing')?.textContent||''}))`);
  report.push('cartões: '+cards.map(c=>c.pos+' '+c.name+' ['+c.origin+']').join(' | '));
  assert.deepEqual(cards.slice(0,4).map(c=>c.name),['Ana PDV','Bruno Site','Carla Site','Davi PDV'],'ordem da fila do banco');
  assert.equal(cards.at(-1)?.name,'Eva Pronta','pronto para retirada depois da fila');assert.equal(cards[4]?.name,'Fabio Duas Posicoes','sem posição na fila: depois dos numerados');
  assert.match(cards[0].pos,/Nº 1/);assert.equal(cards[0].origin,'PDV · LOJA');assert.equal(cards[1].origin,'SITE');
  assert.match(cards[0].due,/Atrasado/i,'retirada vencida aparece atrasada');assert.match(cards[1].due,/Enviar até.*Hoje.*18h.*SEDEX.*cliente espera/i,'envio: enviar até + frete + cliente espera');
  assert.match(cards[2].due,/Atrasado · enviar já/i);assert.match(cards[0].missing,/Falta subir arte/);assert.match(cards[1].missing,/falta jogar no filme/);assert.match(cards[2].missing,/Falta escolher fonte/);
  await noSideScroll('tela inicial PC');await evaluate(`document.querySelector('.production-open-section').scrollIntoView()`);await delay(300);await shot('1-fila-pc');
  await evaluate(`document.querySelector('[data-home-origin="site"]').click()`);await delay(200);
  const siteOnly=await evaluate(`[...document.querySelectorAll('[data-production-open-grid] .z19-zero19-card h3')].map(h=>h.textContent)`);
  assert.deepEqual(siteOnly,['Bruno Site','Carla Site'],'filtro Site');report.push('filtro Site: '+siteOnly.join(', '));
  await evaluate(`document.querySelector('[data-home-origin="all"]').click()`);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(500);
  await noSideScroll('tela inicial celular');await evaluate(`document.querySelector('.production-open-section').scrollIntoView()`);await delay(300);await shot('2-fila-celular');await evaluate(`document.querySelector('[data-production-open-grid] .z19-zero19-card:nth-child(2)').scrollIntoView()`);await delay(200);await shot('2b-fila-celular-cartao');
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});

  // 2) Montar filme: Arte de empresa com a mais nova primeiro.
  await send('Page.navigate',{url:origin+'/index.html#/filme'});
  await wait('document.querySelector("#viewNextOrders")','botão Ver próximos pedidos no filme',40000);
  await evaluate('document.querySelector("#addFilmAsset").click()');
  await wait('[...document.querySelectorAll("[role=dialog]")].some(d=>/Escolha as artes do filme/.test(d.textContent))','Arte de empresa',30000);
  const firstArt=await evaluate(`(()=>{const d=[...document.querySelectorAll('[role=dialog]')].find(d=>/Escolha as artes do filme/.test(d.textContent));const names=[...d.querySelectorAll('.fp-art-card')].map(c=>c.textContent);return names})()`);
  const order=['Arte nova de hoje','Arte do pedido 50002','Zebra antiga'].map(name=>firstArt.findIndex(text=>text.includes(name)));
  report.push('Arte de empresa (posição): '+JSON.stringify(order));assert(order[0]===0&&order[0]<order[1]&&order[1]<order[2],'Arte de empresa: mais nova primeiro '+JSON.stringify(order));
  await shot('3-arte-de-empresa');
  await evaluate(`(()=>{const d=[...document.querySelectorAll('[role=dialog]')].find(d=>/Escolha as artes do filme/.test(d.textContent));[...d.querySelectorAll('button')].find(b=>/Fechar|Cancelar|×/.test(b.textContent)||b.getAttribute('aria-label')==='Fechar')?.click()})()`);
  await delay(400);await evaluate(`document.querySelectorAll('[role=dialog]').forEach(d=>{if(/Escolha as artes do filme/.test(d.textContent))d.closest('.fp-root,.modal-backdrop,[data-film-picker]')?.remove()})`);

  // 3) Ver próximos pedidos: fila, o que falta, e Jogar no filme abre o Aguardando produção já marcado.
  await evaluate('document.querySelector("#viewNextOrders").click()');
  await wait('document.querySelectorAll(".z19q-next-row").length>=4','janela Próximos pedidos',20000);
  const next=await evaluate(`[...document.querySelectorAll('.z19q-next-row')].map(r=>({title:r.querySelector('.z19q-next-title')?.textContent,buttons:[...r.querySelectorAll('button,a')].map(b=>b.textContent.trim())}))`);
  report.push('próximos: '+next.map(r=>r.title+' → '+r.buttons.join('/')).join(' | '));
  assert.match(next[0].title,/50001.*Ana PDV/);assert(next[0].buttons.some(b=>/Subir arte/.test(b)),'Ana: Subir arte');
  assert(next[1].buttons.some(b=>/Jogar no filme/.test(b)),'Bruno: Jogar no filme');assert(next[2].buttons.some(b=>/Escolher fonte/.test(b)),'Carla: Escolher fonte');
  await noSideScroll('próximos pedidos');await shot('4-proximos-pedidos');
  await evaluate(`[...document.querySelectorAll('.z19q-next-row')][1].querySelector('[data-next-film]').click()`);
  await wait('document.querySelector(".film-pending-row input:checked")','Aguardando produção com o pedido marcado',20000);
  const checked=await evaluate(`[...document.querySelectorAll('.film-pending-row')].filter(r=>r.querySelector('input:checked')).map(r=>r.textContent.replace(/\\s+/g,' ').slice(0,90))`);
  report.push('Aguardando produção marcado: '+checked.join(' | '));assert(checked.length===1&&/Bruno Site/.test(checked[0]),'só o pedido escolhido marcado');
  await shot('5-aguardando-marcado');
  // 2.17.94 (12/11): busca (nome, WhatsApp, pedido), grupos por pedido, miniatura leve e "Já está pronta" na arte subida sem posição.
  const type=async text=>{await evaluate(`(()=>{const i=document.querySelector('[data-fpu-search]');i.value=${JSON.stringify(text)};i.dispatchEvent(new Event('input',{bubbles:true}))})()`);await delay(150);};
  const visibleRows=()=>evaluate(`[...document.querySelectorAll('.film-pending-row')].filter(r=>r.offsetParent).map(r=>r.textContent.replace(/\\s+/g,' ').slice(0,60))`);
  assert(await evaluate('!!document.querySelector("[data-fpu-search]")'),'barra de busca na janela');
  const heads=await evaluate(`[...document.querySelectorAll('.fpu-group')].map(g=>g.textContent.replace(/\\s+/g,' '))`);report.push('grupos: '+heads.join(' | '));assert(heads.length>=1&&heads.some(h=>/Bruno Site.*arte/.test(h)),'artes agrupadas por pedido: '+heads.join(' | '));
  console.log('miniaturas: '+JSON.stringify(await evaluate(`[...document.querySelectorAll('.film-pending-preview')].map(p=>({html:p.innerHTML.slice(0,160)}))`)));
  await wait(`[...document.querySelectorAll('.film-pending-preview img')].some(i=>/[?&]w=240/.test(i.src)&&!i.dataset.fpuFull)`,'miniatura leve de 240 px',10000);
  assert(!(await evaluate(`[...document.querySelectorAll('.film-pending-preview img')].some(i=>i.src&&!/[?&]w=240/.test(i.src)&&/qa-art/.test(i.src))`)),'nenhuma miniatura baixou o PNG inteiro');
  await type('BRUNO');let found=await visibleRows();report.push('busca "BRUNO": '+found.join(' | '));assert(found.length>=1&&found.every(t=>/Bruno/.test(t)),'busca pelo nome');
  await type('99990002');found=await visibleRows();report.push('busca WhatsApp: '+found.length);assert(found.length>=1&&found.every(t=>/Bruno/.test(t)),'busca pelo WhatsApp');
  await type('(19) 9 9999-0002');assert((await visibleRows()).every(t=>/Bruno/.test(t)),'WhatsApp com máscara');
  await type('ninguém assim');assert.equal((await visibleRows()).length,0);assert(await evaluate('!document.querySelector(".fpu-empty").hidden'),'aviso de nada encontrado');
  await type('bruno');
  assert(await evaluate(`[...document.querySelectorAll('.film-pending-row')].filter(r=>/Bruno/.test(r.textContent)).every(r=>r.querySelector('[data-pending-produced]'))`),'"Já está pronta" na arte subida sem posição (pedido do Natan)');
  assert(await evaluate(`[...document.querySelectorAll('.fpu-order')].some(sec=>/Bruno Site/.test(sec.querySelector('.fpu-group')?.textContent||'')&&sec.querySelector('.film-pending-row'))`),'cabeçalho e artes do pedido no mesmo bloco');
  await noSideScroll('aguardando com busca');await shot('5b-aguardando-busca');
  // Janela baixa (como com 60+ pedidos): nenhum bloco pode ser espremido até sobrar só a faixa do cabeçalho.
  await type('');
  const waitBar=await evaluate(`document.querySelector('.fpu-waiting-bar')?.textContent||''`);report.push('seção sem arte: '+waitBar);assert.match(waitBar,/esperando arte/,'pedidos sem arte numa seção própria');
  assert(await evaluate('document.querySelector(".fpu-waiting").hidden'),'seção sem arte começa fechada quando há arte pronta');
  await evaluate('document.querySelector(".fpu-waiting-bar").click()');await delay(150);
  await evaluate(`document.querySelector('.film-pending-modal').style.maxHeight='380px'`);await delay(200);
  const squeezed=await evaluate(`[...document.querySelectorAll('.fpu-order')].filter(sec=>sec.offsetParent).map(sec=>({h:sec.getBoundingClientRect().height,need:sec.scrollHeight,inner:[...sec.children].reduce((sum,child)=>sum+child.getBoundingClientRect().height,0)})).filter(r=>r.h+2<r.inner)`);
  report.push('blocos espremidos: '+squeezed.length);assert.equal(squeezed.length,0,'bloco espremido: '+JSON.stringify(squeezed));
  await shot('5e-aguardando-janela-baixa');
  await evaluate(`document.querySelector('.film-pending-modal').style.maxHeight=''`);await evaluate('document.querySelector(".fpu-waiting-bar").click()');
  await type('Ana');
  const missing=await evaluate(`[...document.querySelectorAll('.fpu-order')].filter(sec=>sec.offsetParent).map(sec=>({head:sec.querySelector('.fpu-group')?.textContent.replace(/\\s+/g,' '),missing:sec.querySelector('.fpu-missing')?.textContent.replace(/\\s+/g,' ')||'',upload:!!sec.querySelector('[data-fpu-upload]')}))`);
  report.push('pedido sem arte: '+JSON.stringify(missing));assert(missing.some(m=>/Ana PDV/.test(m.head)&&/Falta subir arte/.test(m.missing)&&m.upload),'pedido sem arte aparece com Subir arte');
  await shot('5d-aguardando-sem-arte');
  await type('');
  assert(await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>/Adicionar selecionados ao filme/.test(b.textContent)&&!b.disabled);if(!b)return false;b.click();return true})()`),'adicionar do Aguardando produção');
  await wait(`[...document.querySelectorAll('#filmItems article')].some(a=>/Bruno Site/.test(a.textContent))`,'arte sem posição no filme',30000);
  report.push('arte sem posição entrou no filme pelo Aguardando produção');
  // Botão Buscar pedido: mesma janela com a busca pronta e "Já impresso · tirar da fila".
  await evaluate('document.querySelector("#findFilmOrder").click()');
  await wait('document.querySelector("[data-fpu-search]")','Buscar pedido abre a janela',20000);await delay(200);
  assert(await evaluate('document.activeElement?.matches?.("[data-fpu-search]")'),'busca já com o cursor');
  await evaluate('window.confirm=()=>true');
  const printedName=await evaluate(`(()=>{const b=document.querySelector('[data-fpu-printed]');if(!b)return '';const name=b.closest('.fpu-group').querySelector('strong').textContent;b.click();return name})()`);
  assert(printedName,'botão Já impresso no pedido');
  await wait('(window.qa.printed||[]).length>0','Já impresso chama a função da exportação',10000);
  await wait(`!!document.querySelector('.fpu-printed-tag')`,'cartão marcado como impresso',10000);
  report.push('Já impresso: '+printedName+' → '+JSON.stringify(await evaluate('window.qa.printed[0]')));
  await shot('5c-buscar-pedido-impresso');
  assert(await evaluate(`(()=>{const b=document.querySelector('.fpu-undo');if(!b)return false;b.click();return true})()`),'botão Desfazer depois do Já impresso');
  await wait('(window.qa.undone||[]).length>0','Desfazer chama a função do banco',10000);
  await wait(`!document.querySelector('.fpu-printed-tag')&&!!document.querySelector('[data-fpu-printed]')&&!document.querySelector('[data-fpu-printed]').disabled`,'cartão volta para a fila',10000);
  report.push('Desfazer: '+JSON.stringify(await evaluate('window.qa.undone[0]')));
  await evaluate(`document.querySelectorAll('.film-pending-modal .close').forEach(b=>b.click())`);await delay(300);

  // 4) QR "Subir arte" do cupom: abre o pedido direto, medida do pedido, pasta pronta, sem mockup e Jogar no filme.
  await send('Page.navigate',{url:origin+'/index.html#/zero19-fila?pedido=50001'});
  await wait('document.querySelector(".upload-modal #fileInput")','janela de subir arte aberta direto no pedido',40000);
  const linkText=await evaluate(`document.querySelector('.upload-order-link')?.textContent||''`);
  await wait(`/Vinculada ao pedido #50001/.test(document.querySelector('.upload-order-link')?.textContent||'')`,'posições do pedido carregadas',20000);
  assert.match(await evaluate(`document.querySelector('.upload-order-link').textContent`),/sem mockup/,'aviso do envio sem mockup');
  const {root}=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'.upload-modal #fileInput'});
  await send('DOM.setFileInputFiles',{nodeId,files:[uploadFile]});
  await wait('document.querySelector("#uploadList input[data-k=name]")','arquivo na lista',20000);
  await delay(600);
  const row=await evaluate(`(()=>{const list=document.querySelector('#uploadList');const inputs=[...list.querySelectorAll('input')].map(i=>({k:i.dataset.k||i.dataset.sizeAxis||i.name||i.type,v:i.value}));const folder=list.querySelector('.upload-folder-auto button');return {inputs,folder:folder?'auto':'',folderText:folder?.textContent||'',position:list.querySelector('.upload-position button[aria-pressed=true]')?.textContent||'',ready:!!list.querySelector('[data-ready]')}})()`);
  report.push('linha do envio: '+JSON.stringify(row));
  assert(row.inputs.some(i=>i.v==='25'),'largura do pedido (25 cm) já preenchida');assert(row.folder&&/Artes prontas/.test(row.folderText),'pasta Artes prontas escolhida sozinha');assert(!row.ready,'sem a chave de pronta para impressão');assert.match(row.position,/Frente · meio do peito/,'uma posição só: escolhida sozinha');assert(row.inputs.some(i=>i.k==='name'&&/Pedido #50001 · Frente/.test(i.v)),'nome automático pela posição');
  await evaluate(`(()=>{const i=document.querySelector('#uploadList input[data-k=name]');i.value='Arte da Ana';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await delay(200);await shot('6-subir-arte-qr');
  await wait('!document.querySelector("#processUpload").disabled','botão Processar liberado',10000);
  await evaluate('document.querySelector("#processUpload").click()');
  try{await wait('document.querySelector(".z19-upload-done")','barra Arte salva no pedido',60000);}
  catch(error){console.log('DIAG',JSON.stringify(await evaluate(`({progress:document.querySelector('#progressText')?.textContent||'',toasts:[...document.querySelectorAll('.toast,[role=status],[role=alert]')].map(t=>t.textContent).slice(-6),rpc:window.qa.rpc.slice(-12),writes:window.qa.writes.slice(-12),hash:location.hash,modal:!!document.querySelector('.upload-modal'),placement:!!document.querySelector('.official-placement-backdrop')})`).catch(e=>String(e))));console.log('ERROS',errors.slice(-5).join(' | '),'CONSOLE',consoleErrors.slice(-6).join(' | '));throw error;}
  const bar=await evaluate(`document.querySelector('.z19-upload-done').textContent`);
  report.push('barra: '+bar.replace(/\s+/g,' '));assert.match(bar,/Arte salva no pedido #50001/);assert.match(bar,/Jogar no filme agora/);assert.match(bar,/Posicionar no mockup/);
  assert(!await evaluate('!!document.querySelector(".official-placement-backdrop,.placement-wizard,[data-placement-wizard]")'),'não abriu a tela do mockup');
  const marked=await evaluate('window.qa.marked');assert(marked&&marked.p_project_id,'arte ligada ao pedido (mark_art_ready)');
  const writes=await evaluate('window.qa.writes');report.push('gravou: '+[...new Set(writes)].join(', '));assert(writes.includes('z19p_folders:insert'),'pasta Artes prontas criada');
  await noSideScroll('barra arte salva');await shot('7-arte-salva-barra');
  await evaluate(`document.querySelector('.z19-upload-done [data-quick-film]').click()`);
  await wait(`[...document.querySelectorAll('#filmItems article')].some(a=>/Ana PDV/.test(a.textContent))`,'arte da Ana no filme',40000);
  report.push('Jogar no filme agora: arte da Ana entrou no filme ligada ao pedido');
  await shot('8-filme-com-a-arte');

  // 5) Pedido com 2 posições e 4 camisas (como o 50704): pela página do cliente, vincula sozinho e pergunta onde vai cada arte.
  await send('Page.navigate',{url:origin+'/index.html#/ambiente/'+multi.ws});
  await wait('document.querySelector("#uploadBtn")','página do cliente',30000);
  await evaluate('document.querySelector("#uploadBtn").click()');
  await wait(`/Vinculada ao pedido #50006/.test(document.querySelector('.upload-order-link')?.textContent||'')`,'pedido vinculado sozinho',20000);
  const linked=await evaluate(`document.querySelector('.upload-order-link').textContent`);report.push('vínculo: '+linked.replace(/\s+/g,' '));
  assert.match(linked,/Peito esquerdo \(7 camisas\)/);assert.match(linked,/Costas · em cima \(7 camisas\)/);assert.match(linked,/Não é deste pedido/);
  {const {root}=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'.upload-modal #fileInput'});await send('DOM.setFileInputFiles',{nodeId,files:[uploadFile,uploadBack]});}
  await wait('document.querySelectorAll("#uploadList .upload-position").length===2','pergunta onde vai cada arte',20000);await delay(500);
  assert(await evaluate('document.querySelector("#processUpload").disabled'),'sem escolher a posição não salva');
  await shot('9-duas-posicoes-escolher');
  await evaluate(`document.querySelectorAll('#uploadList .upload-row')[0].querySelector('[data-position][data-key^="Peito"]').click()`);await delay(150);
  await evaluate(`document.querySelectorAll('#uploadList .upload-row')[1].querySelector('[data-position][data-key^="Costas"]').click()`);await delay(300);
  const rows2=await evaluate(`[...document.querySelectorAll('#uploadList .upload-row')].map(r=>({name:r.querySelector('input[data-k=name]').value,width:r.querySelector('input[data-size-axis=width]').value}))`);
  report.push('duas artes: '+JSON.stringify(rows2));
  assert.deepEqual(rows2.map(r=>r.name),['Pedido #50006 · Peito esquerdo','Pedido #50006 · Costas · em cima']);assert.deepEqual(rows2.map(r=>r.width),['9','30']);
  await noSideScroll('duas posições');await shot('10-duas-posicoes-escolhidas');
  await wait('!document.querySelector("#processUpload").disabled','salvar liberado',5000);
  await evaluate('document.querySelector("#processUpload").click()');
  await wait(`/#50006/.test(document.querySelector('.z19-upload-done')?.textContent||'')`,'barra das duas artes',60000);
  const bar2=await evaluate(`document.querySelector('.z19-upload-done').textContent`);report.push('barra: '+bar2.replace(/\s+/g,' '));
  assert.match(bar2,/Peito esquerdo · 7 camisas · Costas · em cima · 7 camisas/);assert(!/Posicionar no mockup/.test(bar2),'arte de várias camisas: sem mockup');
  const markedAll=await evaluate(`window.qa.markedAll.filter(a=>a.p_project_id===${JSON.stringify(multi.project)})`);
  assert.equal(markedAll.length,4,'arte ligada às 4 camisas (2 por posição)');assert.equal(new Set(markedAll.map(a=>a.p_asset_id)).size,2,'uma arte por posição');
  await shot('11-duas-artes-salvas');
  await evaluate(`document.querySelector('.z19-upload-done [data-quick-film]').click()`);
  await wait(`[...document.querySelectorAll('#filmItems article')].filter(a=>/Fabio Duas Posicoes/.test(a.textContent)).length===4`,'as 4 camisas no filme',40000);
  report.push('Jogar no filme: 4 itens do pedido 50006 no filme');

  // 6) Próximos pedidos: Pronto · não entregue e Pronto e entregue.
  await evaluate('document.querySelector("#viewNextOrders").click()');
  await wait('[...document.querySelectorAll(".z19q-next-row")].some(r=>/Davi PDV/.test(r.textContent))','próximos pedidos com Davi',20000);
  const clickRow=(name,attr)=>evaluate(`(()=>{const r=[...document.querySelectorAll('.z19q-next-row')].find(r=>r.textContent.includes(${JSON.stringify(name)}));r.querySelector('['+${JSON.stringify(attr)}+']').click();return true})()`);
  await clickRow('Davi PDV','data-next-ready');
  await wait('[...document.querySelectorAll(".modal")].some(m=>/Pedido #50004 está pronto\?/.test(m.textContent))','confirmação Pronto',10000);await shot('12-confirmar-pronto');
  await clickText('Sim, está pronto');
  await wait('![...document.querySelectorAll(".z19q-next-row")].some(r=>/Davi PDV/.test(r.textContent))&&document.querySelectorAll(".z19q-next-row").length>0','Davi saiu da fila',20000);
  await clickRow('Carla Site','data-next-delivered');
  await wait('[...document.querySelectorAll(".modal")].some(m=>/pronto e já entregue/.test(m.textContent))','confirmação Pronto e entregue',10000);
  await clickText('Sim, pronto e entregue');
  await wait('![...document.querySelectorAll(".z19q-next-row")].some(r=>/Carla Site/.test(r.textContent))','Carla saiu da fila',20000);
  const done=await evaluate('({forced:window.qa.forced.map(a=>a.p_stage),delivered:window.qa.delivered.length})');report.push('pronto: '+JSON.stringify(done));
  assert.deepEqual(done,{forced:['ready_pickup','ready_pickup'],delivered:1});
  await noSideScroll('próximos pedidos com Pronto');await shot('13-proximos-depois-do-pronto');

  // 7) Montar filme → Subir arte na biblioteca: pasta automática, sem a chave de pronta, e Jogar no filme ao terminar.
  await evaluate('document.querySelector("[data-next-close]")?.click()');await delay(300);
  await evaluate('document.querySelector("#quickUploadFilmAsset").click()');
  await wait('document.querySelector(".upload-modal #fileInput")','janela de subir na biblioteca',30000);
  {const {root}=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'.upload-modal #fileInput'});await send('DOM.setFileInputFiles',{nodeId,files:[uploadBack]});}
  await wait('document.querySelector("#uploadList input[data-k=name]")','arquivo na lista da biblioteca',20000);await delay(500);
  const libRow=await evaluate(`(()=>{const l=document.querySelector('#uploadList');return {folder:l.querySelector('.upload-folder-auto button')?.textContent||'',ready:!!l.querySelector('[data-ready]'),position:!!l.querySelector('.upload-position')}})()`);
  report.push('biblioteca: '+JSON.stringify(libRow));assert.match(libRow.folder,/Artes prontas/,'biblioteca: pasta automática');assert(!libRow.ready&&!libRow.position,'biblioteca: sem chave e sem posição');
  await evaluate(`(()=>{const set=(sel,v)=>{const i=document.querySelector(sel);i.value=v;i.dispatchEvent(new Event('input',{bubbles:true}))};set('#uploadList input[data-k=name]','Logo da biblioteca');set('#uploadList input[data-size-axis=width]','12')})()`);
  await wait('!document.querySelector("#processUpload").disabled','salvar na biblioteca',5000);await shot('14-biblioteca-subir');
  await evaluate('document.querySelector("#processUpload").click()');
  await wait('document.querySelector(".z19-back-to-film [data-film-add]")','Jogar no filme depois de subir na biblioteca',60000);await shot('15-biblioteca-jogar-no-filme');
  await evaluate('document.querySelector(".z19-back-to-film [data-film-add]").click()');
  await wait(`[...document.querySelectorAll('#filmItems article')].some(a=>/Logo da biblioteca/.test(a.textContent))`,'arte da biblioteca no filme',40000);
  report.push('Subir arte na biblioteca → Jogar no filme: arte no filme');

  // 8) 2.17.95: cada arte identifica o seu pedido (busca) e a posição do PDV; a 2ª arte usa o atalho do pedido da 1ª.
  const markedBefore=(await evaluate('(window.qa.markedAll||[]).length'))||0;
  await evaluate('document.querySelector("#quickUploadFilmAsset").click()');
  await wait('document.querySelector(".upload-modal #fileInput")','janela de subir arte (por arte)',30000);
  {const {root}=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'.upload-modal #fileInput'});await send('DOM.setFileInputFiles',{nodeId,files:[uploadFile,uploadBack]});}
  await wait('document.querySelectorAll("#uploadList [data-art-order]").length===2','botão Identificar pedido em cada arte',20000);await delay(400);
  await shot('16-envio-identificar');
  await evaluate('document.querySelector("#uploadList [data-art-order=\'0\']").click()');
  await wait('document.querySelector("[data-uao-q]")','janela De qual pedido é esta arte',10000);
  await evaluate(`(()=>{const i=document.querySelector('[data-uao-q]');i.value='50006';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await wait('document.querySelector("[data-uao-row]")','pedido encontrado pela busca',10000);await shot('17-identificar-busca');
  await evaluate('document.querySelector("[data-uao-row]").click()');
  await wait('document.querySelectorAll("[data-uao-pos]").length>=2','posições do PDV do pedido',15000);await shot('18-identificar-posicao');
  const posLabels=await evaluate(`[...document.querySelectorAll('[data-uao-pos] b')].map(b=>b.textContent)`);report.push('posições: '+posLabels.join(' | '));assert(posLabels.some(t=>/Peito/i.test(t))&&posLabels.some(t=>/Costas/i.test(t)),'posições do PDV');
  await evaluate(`[...document.querySelectorAll('[data-uao-pos]')].find(b=>/Peito/i.test(b.textContent)).click()`);
  await wait(`/Pedido #50006/.test(document.querySelector('#uploadList .upload-row')?.textContent||'')`,'1ª arte ligada ao pedido 50006',10000);
  await evaluate('document.querySelector("#uploadList [data-art-order=\'1\']").click()');
  await wait('document.querySelector("[data-uao-short]")','atalho do pedido da outra arte',10000);
  const shortcut=await evaluate('document.querySelector("[data-uao-short]").textContent');report.push('atalho: '+shortcut);assert.match(shortcut,/50006/);
  await shot('19-identificar-atalho');
  await evaluate('document.querySelector("[data-uao-short]").click()');
  await wait('document.querySelectorAll("[data-uao-pos]").length>=2','posições pelo atalho',10000);
  assert(await evaluate(`[...document.querySelectorAll('[data-uao-pos]')].some(b=>/Peito/i.test(b.textContent)&&/Outra arte deste envio/.test(b.textContent))`),'posição já usada pela outra arte marcada');
  await evaluate(`[...document.querySelectorAll('[data-uao-pos]')].find(b=>/Costas/i.test(b.textContent)).click()`);
  await wait(`[...document.querySelectorAll('#uploadList .upload-row')].every(r=>/Pedido #50006/.test(r.textContent))`,'2ª arte ligada',10000);
  const names=await evaluate(`[...document.querySelectorAll('#uploadList input[data-k=name]')].map(i=>i.value)`);report.push('nomes: '+names.join(' | '));assert(names[0].includes('Peito')&&names[1].includes('Costas'),'nome pela posição de cada arte');
  await noSideScroll('envio com pedido em cada arte');await shot('20-envio-identificado');
  await wait('!document.querySelector("#processUpload").disabled','salvar envio identificado',5000);
  await evaluate('document.querySelector("#processUpload").click()');
  await wait('document.querySelector(".z19-upload-done")','artes salvas nos pedidos',60000);
  const markedNow=await evaluate('(window.qa.markedAll||[]).slice('+markedBefore+')');report.push('ligadas: '+markedNow.length+' camisas');assert(markedNow.length===4&&markedNow.every(m=>m.p_project_id===multi.project),'cada arte ligada às camisas da sua posição no pedido 50006');
  const savedWs=await evaluate(`(window.qa.assets||[]).slice(-2).map(a=>a.workspace_id)`);report.push('cliente das artes: '+savedWs.join(','));
  assert(savedWs.length===2&&savedWs.every(id=>id===multi.ws),'arte salva no cliente do pedido (não na biblioteca)');
  report.push('envio por arte: 2 artes, 2 posições, pedido 50006');
  const tela=errors.filter(e=>!/ResizeObserver/.test(e));if(tela.length)console.log('ERROS DE TELA:',[...new Set(tela)].slice(0,8).join(' | '));assert(!tela.length,'erro de tela');
  console.log(report.join('\n'));
  console.log('PASS fila de produção, Ver próximos pedidos (com Pronto e Pronto e entregue), QR Subir arte sem mockup, arte por posição em todas as camisas (pedido de 2 posições), pasta automática, Jogar no filme e Arte de empresa nova primeiro. Fotos: '+out);
}finally{socket?.close();child.kill();server.close()}
