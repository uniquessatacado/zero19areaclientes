import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

const source=await fs.readFile(new URL('../zero19-pdv-sync.js',import.meta.url),'utf8');
const manager=source.slice(source.indexOf('  async function openReasonsManager('),source.indexOf('  async function openHolidaysManager('));
const card=source.slice(source.indexOf('  function card(summary)'),source.indexOf('  async function enhanceDashboard('));
const clocks=source.slice(source.indexOf('  function updateDeadlineCountdowns('),source.indexOf('  function ensureCountdownTimer('));
const port=12400+Math.floor(Math.random()*250),profile=await fs.mkdtemp(path.join(os.tmpdir(),'z19-pause-qa-'));
const browser=spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));let socket,seq=0;const pending=new Map();
function send(method,params={}){const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CDP timeout '+method)),15000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject});socket.send(JSON.stringify({id,method,params}))})}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value}
async function until(expression){for(let i=0;i<60;i++){if(await evaluate(expression))return;await wait(30)}throw Error('Timed out: '+expression)}
try{
  let url;for(let i=0;i<70;i++){try{url=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(row=>row.type==='page')?.webSocketDebuggerUrl;if(url)break}catch{}await wait(100)}
  if(!url)throw Error('Headless Edge did not start');
  socket=new WebSocket(url);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
  socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const callback=pending.get(message.id);if(callback){pending.delete(message.id);message.error?callback.reject(Error(message.error.message)):callback.resolve(message.result)}}});
  await send('Runtime.enable');
  await evaluate(`(async()=>{window.spec={rows:[{id:'one',name:'Aguardando chegar camisa',active:true,sort_order:10}],messages:[],zeroAffected:false};
    window.h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    window.accountOwnerId=()=> 'owner';window.toast=(message,tone)=>spec.messages.push({message,tone});window.invalidate=()=>{};window.productionViewActive=()=>false;window.confirmAction=async()=>true;
    window.supabase={from(){let operation='read',value,filters=[];const query={select(){return query},eq(key,target){filters.push([key,target]);return query},order(){return query},update(next){operation='update';value=next;return query},insert(next){operation='insert';value=next;return query},then(resolve,reject){return Promise.resolve({data:spec.rows.map(row=>({...row})),error:null}).then(resolve,reject)},async single(){if(spec.zeroAffected)return {data:null,error:{code:'PGRST116',message:'Nenhuma alteração confirmada.'}};let row;if(operation==='insert'){row={id:'new-'+spec.rows.length,active:true,...value};spec.rows.push(row)}else {const id=filters.find(pair=>pair[0]==='id')?.[1];row=spec.rows.find(row=>row.id===id);if(row)Object.assign(row,value)}return {data:row?{...row}:null,error:null}}};return query}};
    ${manager}
    window.showReasons=openReasonsManager;
    await showReasons();})()`);
  assert.equal(await evaluate("document.querySelector('[data-edit-reason]').textContent"),'Editar');
  await evaluate("document.querySelector('[data-reason-input]').value='Cor da estampa diferente';document.querySelector('[data-reason-form]').dispatchEvent(new Event('submit',{cancelable:true}))");
  await until("spec.rows.some(row=>row.name==='Cor da estampa diferente')");
  await evaluate("document.querySelector('[data-edit-reason=one]').click();document.querySelector('[data-reason-input]').value='Aguardando camisa do fornecedor';document.querySelector('[data-reason-form]').dispatchEvent(new Event('submit',{cancelable:true}))");
  await until("spec.rows[0].name==='Aguardando camisa do fornecedor'");
  await evaluate("document.querySelector('[data-delete-reason=one]').click()");await until("spec.rows[0].active===false");
  assert.equal(await evaluate("document.querySelector('[data-edit-reason=one]')===null"),true);
  await evaluate("document.querySelector('[data-reason-input]').value='Aguardando camisa do fornecedor';document.querySelector('[data-reason-form]').dispatchEvent(new Event('submit',{cancelable:true}))");
  await until("spec.rows[0].active===true");assert.equal(await evaluate('spec.rows.length'),2,'Recreating a removed reason reactivates its identity/history.');
  await evaluate("spec.zeroAffected=true;document.querySelector('[data-reason-input]').value='Motivo sem permissão';document.querySelector('[data-reason-form]').dispatchEvent(new Event('submit',{cancelable:true}))");
  await until("document.querySelector('[data-reason-error]').hidden===false");
  assert.equal(await evaluate("spec.rows.some(row=>row.name==='Motivo sem permissão')"),false);
  await evaluate(`window.digits=value=>String(value||'').replace(/\D/g,'');window.orderNo=()=>49370;window.dt=()=> '28/09 15:30';window.itemLine=()=>'<div>1 camisa</div>';window.STAGE_LABELS={awaiting_art:'Subir arte',art_received:'Organizar arte',awaiting_halftone:'Halftone',awaiting_font:'Fonte',ready_production:'Fila',production:'Produção',ready_pickup:'Pronto'};${card}
    window.renderCard=card;window.summary={project:{id:'order',official_order_payload:{display_id:49370}},workspace:{id:'customer',client_name:'Teste',phone:''},stage:'awaiting_art',qty:1,items:[{id:'item',quantity:1}],promised:'2026-10-10T15:00:00Z'};`);
  for(const stage of ['awaiting_art','art_received','awaiting_halftone','awaiting_font','ready_production','production'])assert.equal(await evaluate(`document.body.innerHTML=renderCard({...summary,stage:${JSON.stringify(stage)}});document.querySelector('[data-z19-pause]').textContent`),'Parar pedido');
  await evaluate(`document.body.innerHTML=renderCard({...summary,pause:{scope:'order',reason:'Aguardando chegar camisa',started_at:new Date(Date.now()-(2*1440+3*60+4)*60000).toISOString()}});window.countdownLabel=()=>({label:'Faltam 2d',tone:'normal'});${clocks}updateDeadlineCountdowns();`);
  assert.equal(await evaluate("Boolean(document.querySelector('.is-paused'))"),true);
  assert.match(await evaluate("document.querySelector('.z19-order-pause').textContent"),/Pedido parado · Aguardando chegar camisaParado há 2d 03h 04min/);
  assert.equal(await evaluate("document.querySelector('[data-z19-pause]').textContent"),'Retomar pedido');
  assert.equal(await evaluate("document.querySelector('[data-z19-force-ready]').disabled"),true);
  console.log('Pause reason create/edit/delete/reactivate, zero-row failure, all-stage pause actions and live elapsed UI passed in headless Edge.');
}finally{try{if(socket?.readyState===1)await send('Browser.close')}catch{}socket?.close();browser.kill()}
