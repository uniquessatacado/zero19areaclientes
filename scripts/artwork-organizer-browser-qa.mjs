import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import vm from 'node:vm';
const workflow=(await fs.readFile(new URL('../official-order-workflow.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/,'').replaceAll('export ','');
const queue=await fs.readFile(new URL('../zero19-pdv-sync.js',import.meta.url),'utf8');
const picker=queue.slice(queue.indexOf('  function orderArtworkItems('),queue.indexOf('  async function importSourceArtwork('));
const styles=(await Promise.all(['styles.css','official-order-workflow.css','ui-polish.css','mobile-stability.css'].map(f=>fs.readFile(new URL('../'+f,import.meta.url),'utf8')))).join('\n');
const injected=queue.match(/style\.textContent='([^']*)';/)?.[1];
assert(injected?.includes('.z19-zero19-grid{display:grid'),'production card CSS must be included');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'z19-art-qa-')),output=await fs.mkdtemp(path.join(os.tmpdir(),'z19-art-shots-')),port=13900+Math.floor(Math.random()*200);
const child=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));let socket,id=0;const pending=new Map();
function send(method,params={}){const key=++id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP timeout '+method)),30000);pending.set(key,{resolve:value=>{clearTimeout(timer);resolve(value)},reject});socket.send(JSON.stringify({id:key,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
const fixture=`
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const preview='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="360"><rect width="300" height="360" fill="#ddd"/><text x="40" y="180" fill="#111" font-size="30">ARTE TESTE</text></svg>');
const realMockupPreview=()=>'<div class="manual-real-preview"><img src="'+preview+'" style="max-width:100%;max-height:340px" alt="Prévia de teste"></div>',renderPieceMockup=async()=>{const c=document.createElement('canvas');c.width=50;c.height=60;return c},loadBlankShirtCatalog=async()=>[],colorForCatalog=()=>({id:'black'}),modelForCatalog=()=> 'normal';
${workflow}
const project={id:'order',workspace_id:'workspace',official_order_ref:'49322',official_order_source:'zero19_pdv',official_order_payload:{items:[{id:'front',product_name:'Camisa teste',name:'Peito esquerdo',size:'P'},{id:'back',product_name:'Camisa teste',name:'Costas · meio',size:'P'}]}};
const workspace={id:'workspace',workspace_type:'client'},db={z19p_print_positions:[{id:'p-front',code:'front_chest_left',surface:'front',anchor_x:.65,anchor_y:.3,label:'Peito esquerdo',active:true,owner_id:'owner'},{id:'p-back',code:'back_center',surface:'back',anchor_x:.5,anchor_y:.45,label:'Costas · meio',active:true,owner_id:'owner'}],z19p_assets:[],z19p_asset_print_profiles:[],z19p_asset_placements:[]},rpcCalls=[],errors=[];
const assets=[{id:'front-art',name:'Peito esquerdo',asset_type:'arte',width:600,height:900,workspace_id:'workspace',project_id:'order',owner_id:'owner',metadata:{personalization_sale_id:'front',pdv_position_code:'front_chest_left',requested_width_cm:9,requested_height_cm:13.5}},{id:'back-art',name:'Costas · meio',asset_type:'arte',width:600,height:900,workspace_id:'workspace',project_id:'order',owner_id:'owner',metadata:{personalization_sale_id:'back',pdv_position_code:'back_center',pdv_width_cm:28}}];
db.z19p_assets.push(...assets);db.z19p_asset_print_profiles.push({asset_id:'back-art',owner_id:'owner',default_width_cm:35,default_height_cm:52.5});
function query(table){let mode='select',payload=null,one=false,filters=[],max=Infinity;const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},is(k,v){filters.push(r=>(r[k]??null)===v);return q},order(){return q},limit(n){max=n;return q},maybeSingle(){one=true;return q},single(){one=true;return q},insert(v){mode='insert';payload=v;return q},update(v){mode='update';payload=v;return q},upsert(v){mode='upsert';payload=v;return q},delete(){mode='delete';return q},then(resolve,reject){return (async()=>{await delay(table==='z19p_print_positions'?420:5);let rows=db[table].filter(r=>filters.every(f=>f(r))).slice(0,max);if(mode==='insert'){db[table].push(payload);rows=[payload]}if(mode==='upsert'){const old=db[table].find(r=>r.asset_id===payload.asset_id);if(old)Object.assign(old,payload);else db[table].push(payload);rows=[old||payload]}if(mode==='update')rows.forEach(r=>Object.assign(r,payload));if(mode==='delete')db[table]=db[table].filter(r=>!rows.includes(r));return {data:one?(rows[0]||null):rows,error:null}})().then(resolve,reject)}};return q}
const supabase={from:query,storage:{from:()=>({upload:async()=>({error:null}),remove:async()=>({error:null}),createSignedUrl:async()=>({data:{signedUrl:preview}})})}},api=createOfficialOrderWorkflow({supabase,accountOwnerId:()=> 'owner',userId:()=> 'owner',state:()=>({currentWorkspace:workspace,currentProjects:[project]}),publicUrl:()=>preview,bucket:'test',toast:(message,type)=>{if(type==='err')errors.push(message)}});
supabase.rpc=async(name,args)=>{if(name==='z19p_zero19_mark_art_ready'){const a=db.z19p_assets.find(r=>r.id===args.p_asset_id);if(a.metadata.personalization_sale_id!==args.p_personalization_sale_id)return {error:{message:'Wrong item'}};rpcCalls.push(args)}return {data:{},error:null}};
window.qa={api,assets,workspace,project,db,rpcCalls,errors,done:false};
qa.task=api.offerAfterUpload(assets,{workspace,projects:[project]}).then(()=>qa.done=true).catch(e=>errors.push(e.message));
`;
async function waitFor(expression){for(let n=0;n<100;n++){if(await evaluate(expression))return;await delay(40)}throw Error('Timeout: '+expression)}
try{
 new vm.Script('(async()=>{'+fixture+'})()');
 let url;for(let i=0;i<80;i++){try{url=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(t=>t.type==='page')?.webSocketDebuggerUrl;if(url)break}catch{}await delay(150)}if(!url)throw Error('Browser unavailable');
 socket=new WebSocket(url);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}}});await send('Page.enable');await send('Runtime.enable');
 for(const viewport of [{name:'desktop',width:1280,height:800,mobile:false},{name:'mobile',width:390,height:844,mobile:true}]){
   await send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1});await send('Page.navigate',{url:'about:blank'});await delay(100);
   const frame=await send('Page.getFrameTree');await send('Page.setDocumentContent',{frameId:frame.frameTree.frame.id,html:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+styles+'\n'+injected+'</style><body></body>'});
   await evaluate('(async()=>{'+fixture+'})()');await delay(220);
   assert.equal(await evaluate('qa.done'),false,'slow DB cannot finish the flow before the modal exists');
   await waitFor("!!document.querySelector('[data-width]')");
   const front=await evaluate(`({width:document.querySelector('[data-width]').value,active:document.querySelector('.official-product-card.active').dataset.product,disabled:document.querySelectorAll('[data-product]:disabled').length,overflow:document.querySelector('.official-placement-page').scrollWidth>innerWidth,open:document.querySelectorAll('.official-placement-backdrop').length})`);
   assert.equal(front.width,'9');assert.equal(front.active,'front');assert.equal(front.disabled,1);assert.equal(front.overflow,false);assert.equal(front.open,1);
   await evaluate("document.querySelector('[data-save]').click()");
   await waitFor("document.querySelector('.official-product-card.active')?.dataset.product==='back'");
   assert.equal(await evaluate("document.querySelector('[data-width]').value"),'35','saved physical size survives next organizer');
   assert.equal(await evaluate('qa.done'),false);
   const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(output,viewport.name+'-organizer.png'),Buffer.from(shot.data,'base64'));
   await evaluate("document.querySelector('[data-save]').click()");await waitFor('qa.done');
   const saved=await evaluate('({calls:qa.rpcCalls.map(r=>r.p_personalization_sale_id),placements:qa.db.z19p_asset_placements.map(r=>({ref:r.external_order_item_ref,width:r.width_cm})),errors:qa.errors})');
   assert.deepEqual(saved.calls,['front','back']);assert.deepEqual(saved.placements,[{ref:'front',width:9},{ref:'back',width:35}]);assert.deepEqual(saved.errors,[]);
   await evaluate('qa.api.openPlacementWizard(qa.assets[1],{workspace:qa.workspace,project:qa.project})');
   await evaluate("document.querySelector('[data-save]').click()");await waitFor("!document.querySelector('.official-placement-backdrop')");
   assert.equal(await evaluate('qa.db.z19p_asset_placements.length'),2,'reviewing an art updates its pending placement without duplicating');
   const pickerFixture=`const h=value=>String(value??'').replace(/[&<>"']/g,'_'),orderNo=()=>49322,STAGE_LABELS={art_received:'Arte recebida · organizar',ready_production:'Aguardando produção'},summary={project:{id:'order'},items:[{id:'front-item',source_file_path:'front.png',text_value:'Peito esquerdo',stage:'art_received',metadata:{details:[{production:{position_label:'Peito esquerdo',width_cm:9}}]}},{id:'back-item',source_file_path:'back.png',text_value:'Costas · meio',stage:'ready_production',metadata:{details:[{production:{position_label:'Costas · meio',width_cm:28}}]}}]},supabase={storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'invalid-preview'}})})}},load=async()=>({summaries:[summary]}),importSourceArtwork=async(id)=>{window.picked=id};${picker};void openOrderArtworkPicker(summary);`;
   await evaluate('(async()=>{'+pickerFixture+'})()');
   assert.equal(await evaluate('document.querySelectorAll(".z19-order-art-row").length'),2);
   await evaluate("document.querySelector('[data-organize=back-item]').click()");await waitFor("window.picked==='back-item'");
   assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
   await delay(80);await evaluate("document.querySelector('[data-close]').click()");
   await evaluate(`document.body.innerHTML='<div class="z19-zero19-grid"><article class="z19-zero19-card is-paused"><div>Pedido parado</div><div class="z19-order-pause" style="height:180px">Motivo e tempo parado</div><div class="z19-zero19-meta"><span>Faltam 5h</span></div><div>Itens</div></article><article class="z19-zero19-card"><div>Outro pedido</div><div class="z19-zero19-meta"><span class="z19-deadline-countdown">Faltam 1d 14min</span><span>Entrega 29/09 14h</span></div><div>Itens</div></article></div>'`);
   const pill=await evaluate(`({height:document.querySelector('.z19-deadline-countdown').getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth})`);
   assert(pill.height<38,JSON.stringify(pill));assert.equal(pill.overflow,false);
   const cardShot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(output,viewport.name+'-cards.png'),Buffer.from(cardShot.data,'base64'));
   console.log(JSON.stringify({viewport:viewport.name,front,saved,pill,screenshots:output}));
 }
}finally{try{if(socket?.readyState===1)await send('Browser.close')}catch{}socket?.close();child.kill()}
