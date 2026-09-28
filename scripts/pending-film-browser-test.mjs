import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const source=await fs.readFile(new URL('../production-v217.js',import.meta.url),'utf8');
const start=source.indexOf('    const openUnifiedPendingPicker=async()=>{'),end=source.indexOf('\n    ctx.bindCommon();',start);
assert(start>0&&end>start);
const css=(await Promise.all(['styles.css','production-v217.css','ui-polish.css','mobile-stability.css'].map(file=>fs.readFile(new URL('../'+file,import.meta.url),'utf8')))).join('\n');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'z19-picker-qa-')),output=await fs.mkdtemp(path.join(os.tmpdir(),'z19-picker-shots-')),port=13500+Math.floor(Math.random()*300);
const child=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));let socket,id=0;const pending=new Map();
function send(method,params={}){const key=++id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP timeout '+method)),30000);pending.set(key,{resolve:value=>{clearTimeout(timer);resolve(value)},reject});socket.send(JSON.stringify({id:key,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
const svg='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="5000"><rect width="4000" height="5000" fill="red"/></svg>');
const fixture=`const h=value=>String(value??'').replace(/[&<>"']/g,'_'),pageCurrent=()=>true,refreshOrders=async()=>true,filmItems=[],orderRows=[],officialPendingRows=[],fontOrderRows=[1,2].map(i=>({id:'font'+i,project:{id:'project'+i,official_order_ref:'4900'+i},workspace:{client_name:'Cliente '+i},quantity:1,set:{},metadata:{details:[{production:{top_text:'Nome '+i,number:'7'}}]}})),vendussPendingRows=[{id:'venduss',quantity:1,text_value:'Logo',_artworkPreview:${JSON.stringify(svg)},summary:{project:{official_order_ref:'49393'}},metadata:{details:[{production:{venduss_display_id:49390,position_label:'Costas'}}]}}];const ctx={zero19Orders:{orderProgress:async()=>new Map([['project1',{total:3,label:'1/3 concluídas · 33%',detail:'1/3 prontas para produzir · 0 em produção · 1 com pendências'}]])},toast:message=>{throw Error(message)}},customizationDefaults=()=>({}),makeFilmLetteringPiece=async()=>({previewDataUrl:${JSON.stringify(svg)}});${source.slice(start,end)};await openUnifiedPendingPicker();`;
try{
 let url;for(let i=0;i<80;i++){try{url=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(t=>t.type==='page')?.webSocketDebuggerUrl;if(url)break;}catch{}await delay(150);}if(!url)throw Error('Browser unavailable');
 socket=new WebSocket(url);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}});await send('Page.enable');await send('Runtime.enable');
 for(const viewport of [{name:'desktop',width:1280,height:800,mobile:false},{name:'mobile',width:390,height:844,mobile:true}]){for(const alreadyAdded of [false,true]){
   await send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1});
   await send('Page.navigate',{url:'about:blank'});await delay(150);
   const frame=await send('Page.getFrameTree');await send('Page.setDocumentContent',{frameId:frame.frameTree.frame.id,html:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body></body>'});
   await evaluate('(async()=>{'+(alreadyAdded?fixture.replace('filmItems=[]',"filmItems=[{zero19WorkItemId:'font1'},{zero19WorkItemId:'font2'}]"):fixture)+'})()');await delay(250);
   const result=await evaluate(`(()=>{const modal=document.querySelector('.film-pending-modal');return {rows:document.querySelectorAll('.film-pending-row').length,width:innerWidth,scroll:document.documentElement.scrollWidth,modalWidth:modal.getBoundingClientRect().width,images:[...modal.querySelectorAll('img')].map(img=>({width:img.getBoundingClientRect().width,height:img.getBoundingClientRect().height})),count:modal.querySelector('[data-selected-count]').textContent,buttonVisible:modal.querySelector('[data-add-pending]').getBoundingClientRect().bottom<=innerHeight};})()`);
   assert.equal(result.rows,3);assert.equal(result.images.length,3);assert(result.images.every(img=>img.width<=84&&img.height<=84));assert(result.scroll<=result.width+1);assert(result.modalWidth<=result.width);assert(result.buttonVisible);assert.match(result.count,alreadyAdded?/1 item.*2 já neste filme/:/3 item/);
   const selection=await evaluate(`({disabled:document.querySelectorAll('[data-entry]:disabled').length,checked:document.querySelectorAll('[data-entry]:checked').length,marked:[...document.querySelectorAll('.film-pending-copy')].filter(node=>node.textContent.includes('Já adicionado neste filme')).length})`);
   assert.equal(selection.disabled,alreadyAdded?2:0);assert.equal(selection.checked,alreadyAdded?1:3);assert.equal(selection.marked,alreadyAdded?2:0);
   assert.match(await evaluate("document.querySelector('.film-pending-modal').textContent"),/1\/3 concluídas · 33%/);
   const shot=await send('Page.captureScreenshot',{format:'png'}),file=path.join(output,viewport.name+(alreadyAdded?'-already-added':'')+'.png');await fs.writeFile(file,Buffer.from(shot.data,'base64'));console.log(JSON.stringify({viewport:viewport.name,alreadyAdded,...result,...selection,screenshot:file}));
 }}
}finally{try{if(socket?.readyState===1)await send('Browser.close');}catch{}socket?.close();child.kill();}
