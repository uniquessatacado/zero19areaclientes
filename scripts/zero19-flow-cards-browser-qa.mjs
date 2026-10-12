// Cards ZERO19 do 019 no estilo da página do QR (12/10, dono), no Edge real com o CSS do sistema.
// Banco simulado: nenhum pedido real é lido ou alterado. Uso: node scripts/zero19-flow-cards-browser-qa.mjs
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = await fs.mkdtemp(path.join(os.tmpdir(), 'z19-flow-cards-'));
const index = await fs.readFile(path.join(root, 'index.html'), 'utf8');
const links = (index.match(/<link rel="stylesheet" href="[^"]*">/g) || []).join('');
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const harness = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${links}</head><body><div id="app"></div><script type="module">
import {createZero19PdvSync} from '/zero19-pdv-sync.js';
const soon=new Date(Date.now()+86400000).toISOString(),late=new Date(Date.now()-86400000).toISOString();
const item=(id,project,order,stage,text,extra={})=>({id,project_id:project,order_id:order,owner_id:'owner',personalization_sale_id:'s'+id,stage,quantity:1,text_value:text,garment_name:'Camisa Brasil',garment_size:'G',metadata:{details:[{production:{position_label:'Costas'}}]},promised_at:soon,...extra});
const tables={
 z19p_zero19_work_items:[item('1','p1','${A}','production','ANA'),item('2','p1','${A}','production','Arte 22'),item('3','p2','${B}','ready_pickup','DTF 22'),item('4','p3','${C}','awaiting_art','Estampa do cliente',{promised_at:late})],
 z19p_projects:[{id:'p1',workspace_id:'w1',official_order_source:'zero19_pdv',official_order_ref:'${A}',official_order_payload:{display_id:50001}},{id:'p2',workspace_id:'w2',official_order_source:'zero19_pdv',official_order_ref:'${B}',official_order_payload:{display_id:50002}},{id:'p3',workspace_id:'w3',official_order_source:'zero19_pdv',official_order_ref:'${C}',official_order_payload:{display_id:50003}}],
 z19p_workspaces:[{id:'w1',client_name:'Ana Retirada',phone:'19999990001'},{id:'w2',client_name:'Bruno Envio DTF',phone:'19999990002'},{id:'w3',client_name:'Carla Camisa Própria',phone:''}],
 z19p_production_pauses:[],z19p_pause_reasons:[],personalization_sales:[],z19p_assets:[]};
const flows={'${A}':{stage:'PRESSING',pickup:true,paid:false,kind:{kind:'GARMENT'},times:{pressing_at:new Date().toISOString()},by:{pressing:'Clovis'},shipping_method:'Retirada na loja',label:{generated:false}},
 '${B}':{stage:'READY',pickup:false,paid:true,kind:{kind:'ART_ONLY'},times:{ready_at:new Date().toISOString()},by:{},shipping_method:'J&T Express',label:{generated:false,issue:'Complete os dados do destinatario: CEP.'}},
 '${C}':{stage:'ART_PRODUCING',pickup:false,paid:true,kind:{kind:'GARMENT',customer_garment:true},times:{},by:{},shipping_method:'SEDEX',label:{generated:false}}};
window.calls=[];
const builder=table=>{const q={select:()=>q,eq:()=>q,in:()=>q,is:()=>q,order:()=>q,limit:()=>q,then:(ok,fail)=>Promise.resolve({data:table==='z19p_workspaces'&&q._library?[]:tables[table]||[],error:null}).then(ok,fail)};const eq=q.eq;q.eq=(k,v)=>{if(k==='workspace_type')q._library=true;return eq(k,v);};return q;};
const supabase={from:builder,storage:{from:()=>({createSignedUrls:async()=>({data:[]})})},rpc:async(name,args)=>{calls.push(name);return name==='zero19_orders_flow'?{data:flows}:name==='zero19_personalization_ops_snapshot'?{data:{production_items:[],avg_minutes_per_shirt:30,holidays:[]}}:{data:{synced:0}};}};
const sync=createZero19PdvSync({supabase,app:document.getElementById('app'),shell:c=>c,bindCommon:()=>{},accountOwnerId:()=>'owner',nav:()=>{},toast:()=>{},bucket:'x',state:()=>({session:{user:{id:'u'}}})});
try{await sync.renderHome();window.done=true;}catch(error){window.failed=String(error?.stack||error);}
</script></body></html>`;
const server = http.createServer(async (request, response) => {
  const url = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  if (url === '/__qa.html') { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return response.end(harness); }
  const file = path.join(root, url);
  if (!file.startsWith(root)) { response.writeHead(403); return response.end(); }
  try { const body = await fs.readFile(file); response.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream' }); response.end(body); }
  catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'z19-flow-edge-')), port = 16500 + Math.floor(Math.random() * 300);
const child = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-allow-origins=*', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms)); let socket, id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id, timer = setTimeout(() => reject(Error('CDP timeout ' + method)), 20000); pending.set(key, { resolve: value => { clearTimeout(timer); resolve(value); }, reject }); socket.send(JSON.stringify({ id: key, method, params })); });
const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.text); return result.result.value; };
try {
  let target; for (let n = 0; n < 100; n++) { try { target = (await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()).find(tab => tab.type === 'page')?.webSocketDebuggerUrl; if (target) break; } catch { /* starting */ } await delay(200); }
  socket = new WebSocket(target); await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', event => { const response = JSON.parse(event.data), call = pending.get(response.id); if (call) { pending.delete(response.id); response.error ? call.reject(Error(response.error.message)) : call.resolve(response.result); } });
  await send('Page.enable'); await send('Runtime.enable');
  for (const width of [1280, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 500 });
    await send('Page.navigate', { url: base + '/__qa.html' });
    for (let n = 0; n < 200 && !(await evaluate('!!(window.done||window.failed)')); n++) await delay(50);
    assert.equal(await evaluate('window.failed||""'), '', 'Tela renderizou');
    const text = await evaluate('document.body.innerText');
    for (const expected of ['Retirada na loja', 'Não pago · receber antes de entregar', 'QR: Prensando agora', 'Clovis', 'Envio · J&T Express', 'Só arte DTF · não prensar', 'Etiqueta não saiu: Complete os dados do destinatario: CEP.', 'Camisa do cliente', 'Envio · SEDEX', 'Abrir no QR'])
      assert(text.includes(expected), width + ' mostra ' + expected);
    assert(text.toUpperCase().includes('PRONTO PARA ENVIO'), 'Pedido de envio pronto aparece como Pronto para envio');
    assert.equal(await evaluate(`[...document.querySelectorAll('a.z19-qr-open')].map(a=>a.href).filter(h=>h.startsWith('https://venduss.com/producao/pronto/')).length`), 3, 'Abrir no QR leva ao pedido');
    assert(await evaluate(`getComputedStyle(document.querySelector('.z19-zero19-card')).backgroundColor==='rgb(255, 255, 255)'`), 'Card claro no estilo do QR');
    assert(await evaluate(`getComputedStyle(document.querySelector('[data-z19-produced-item]')).backgroundColor==='rgb(209, 250, 229)'`), 'Já está pronta em verde pastel');
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Sem rolagem lateral em ' + width);
    assert(await evaluate('calls.includes("zero19_orders_flow")'), 'Buscou a etapa do QR');
    const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await fs.writeFile(path.join(output, 'cards-' + width + '.png'), Buffer.from(image.data, 'base64'));
  }
  console.log('PASS 019 cards ZERO19 no estilo do QR (1280/390): etapa do QR, envio/retirada, só arte DTF, camisa do cliente, não pago, erro da etiqueta, pronto para envio, Abrir no QR, sem rolagem lateral. Evidência=' + output);
} finally { socket?.close(); child.kill(); server.close(); }
