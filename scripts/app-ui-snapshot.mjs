// Fotos das telas principais do 019 (app inteiro) com banco SIMULADO no navegador de teste.
// A biblioteca do Supabase é trocada só neste navegador: nada real é lido ou gravado.
// Uso: node scripts/app-ui-snapshot.mjs <pasta> [rotas separadas por vírgula] [larguras]
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] || await fs.mkdtemp(path.join(os.tmpdir(), 'z19-app-')));
const routes = (process.argv[3] || '/,/clientes,/equipe,/ambiente/w1,/zero19-fila,/filme').split(',');
const widths = (process.argv[4] || '1366,390').split(',').map(Number);
await fs.mkdir(output, { recursive: true });
const watchdog = setTimeout(() => { console.log('watchdog'); process.exit(2); }, 600000); watchdog.unref?.();
const now = Date.now(), iso = offset => new Date(now + offset * 3600_000).toISOString();
const data = {
  z19p_profiles: [{ id: 'u1', account_owner_id: 'owner', full_name: 'Clovis Teste', role: 'admin', active: true, email: 'equipe@zero19.test' }, { id: 'u2', account_owner_id: 'owner', full_name: 'Nathali', role: 'member', active: true }],
  z19p_statuses: [
    { id: 's1', owner_id: 'owner', name: 'Aguardando arte', color: '#f59e0b', queue_stage: 'awaiting_art', sort_order: 1, active: true },
    { id: 's2', owner_id: 'owner', name: 'Em produção', color: '#f97316', queue_stage: 'production', sort_order: 2, active: true },
    { id: 's3', owner_id: 'owner', name: 'Pronto', color: '#10b981', queue_stage: 'ready_pickup', sort_order: 3, active: true, is_finalized: true }],
  z19p_workspaces: [
    { id: 'w1', owner_id: 'owner', company_name: 'Oficina Aurora', client_name: 'Ana Souza', phone: '19999990001', workspace_type: 'client', status_id: 's2', created_at: iso(-90), updated_at: iso(-2) },
    { id: 'w2', owner_id: 'owner', company_name: 'Time Brasil FC', client_name: 'Bruno', phone: '19999990002', workspace_type: 'client', status_id: 's1', created_at: iso(-50), updated_at: iso(-5) },
    { id: 'w3', owner_id: 'owner', company_name: 'Biblioteca ZERO19', workspace_type: 'library_zero19', created_at: iso(-500), updated_at: iso(-30) }],
  z19p_projects: [
    { id: 'p1', owner_id: 'owner', workspace_id: 'w1', title: 'Uniformes oficina', status_id: 's2', delivery_date: new Date(now + 2 * 86400000).toISOString().slice(0, 10), started_at: iso(-80), updated_at: iso(-2), sequence_no: 1 },
    { id: 'p2', owner_id: 'owner', workspace_id: 'w2', title: 'Camisas do time', status_id: 's1', delivery_date: new Date(now + 5 * 86400000).toISOString().slice(0, 10), started_at: iso(-40), updated_at: iso(-5), sequence_no: 1 }],
  z19p_folders: [{ id: 'f1', owner_id: 'owner', workspace_id: 'w1', project_id: 'p1', name: 'Artes prontas' }],
  z19p_assets: [{ id: 'a1', owner_id: 'owner', workspace_id: 'w1', project_id: 'p1', folder_id: 'f1', name: 'Logo da oficina', asset_type: 'arte', processed_path: 'x/logo.png', original_path: 'x/logo.png', created_at: iso(-10), metadata: {} }],
};
const fakeSupabase = `
const data=${JSON.stringify(data)};
const session={access_token:'qa',user:{id:'u1',email:'equipe@zero19.test',user_metadata:{full_name:'Clovis Teste'}}};
const pick=(table,filters)=>{let rows=[...(data[table]||[])];for(const [k,v,op] of filters){if(op==='eq')rows=rows.filter(r=>r[k]===undefined||r[k]===v);if(op==='in')rows=rows.filter(r=>r[k]===undefined||v.includes(r[k]));}return rows;};
function builder(table){const filters=[];let single=false,maybe=false,head=false;const q=new Proxy({},{get(_,prop){
 if(prop==='then')return (ok,fail)=>{const rows=pick(table,filters);const value=single||maybe?{data:rows[0]||null,error:single&&!rows[0]?{message:'not found',code:'PGRST116'}:null}:{data:head?null:rows,error:null,count:rows.length};return Promise.resolve(value).then(ok,fail);};
 if(prop==='eq')return (k,v)=>{filters.push([k,v,'eq']);return q};
 if(prop==='in')return (k,v)=>{filters.push([k,v,'in']);return q};
 if(prop==='single')return ()=>{single=true;return q};
 if(prop==='maybeSingle')return ()=>{maybe=true;return q};
 if(prop==='select')return (_s,opts)=>{if(opts&&opts.head)head=true;return q};
 return ()=>q;}});return q;}
const chain=new Proxy(function(){},{get:(_,p)=>p==='then'?undefined:chain,apply:()=>chain});
export function createClient(){return {
 auth:{getSession:async()=>({data:{session},error:null}),getUser:async()=>({data:{user:session.user},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null}),refreshSession:async()=>({data:{session},error:null})},
 from:builder,rpc:async(name)=>({data:/flow|snapshot/.test(name)?{}:null,error:null}),
 storage:{from:()=>({getPublicUrl:p=>({data:{publicUrl:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="#ff6428"/><text x="60" y="70" font-size="28" fill="#fff">019</text></svg>')}}),createSignedUrl:async()=>({data:{signedUrl:''},error:null}),createSignedUrls:async()=>({data:[],error:null}),upload:async()=>({error:null}),list:async()=>({data:[],error:null}),download:async()=>({data:null,error:{message:'qa'}})})},
 functions:{invoke:async()=>({data:null,error:null})},channel:()=>chain,removeChannel:()=>{},removeAllChannels:()=>{}};}
export default {createClient};`;
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const server = http.createServer(async (request, response) => {
  const name = decodeURIComponent(new URL(request.url, 'http://x').pathname).replace(/^\//, '') || 'index.html';
  const file = path.resolve(root, name);
  if (!file.startsWith(root)) { response.writeHead(403); return response.end(); }
  try { const body = await fs.readFile(file); response.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }); response.end(body); }
  catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'z19-app-edge-')), port = 17500 + Math.floor(Math.random() * 400);
const child = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-allow-origins=*', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms)); let socket, id = 0; const pending = new Map(); const errors = [];
const send = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; const timer = setTimeout(() => reject(Error('CDP timeout ' + method)), 30000); pending.set(key, { resolve: value => { clearTimeout(timer); resolve(value); }, reject }); socket.send(JSON.stringify({ id: key, method, params })); });
const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
try {
  let target; for (let n = 0; n < 100 && !target; n++) { try { target = (await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()).find(tab => tab.type === 'page')?.webSocketDebuggerUrl; } catch { /* start */ } if (!target) await delay(150); }
  socket = new WebSocket(target); await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', async event => {
    const message = JSON.parse(event.data);
    if (message.id) { const call = pending.get(message.id); pending.delete(message.id); message.error ? call?.reject(Error(message.error.message)) : call?.resolve(message.result); return; }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails?.exception?.description?.split('\n')[0] || message.params.exceptionDetails?.text);
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      if (/supabase-js/.test(request.url)) send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from(fakeSupabase).toString('base64') }).catch(() => null);
      else if (/supabase\.co/.test(request.url)) send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from('[]').toString('base64') }).catch(() => null);
      else send('Fetch.continueRequest', { requestId }).catch(() => null);
    }
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*supabase*' }] });
  for (const width of widths) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: Number(process.env.UI_HEIGHT) || (width < 600 ? 1800 : 1100), deviceScaleFactor: 1, mobile: width < 600 });
    for (const route of routes) {
      await send('Page.navigate', { url: origin + '/index.html#' + route });
      for (let n = 0; n < 120; n++) { if (await evaluate("!!document.querySelector('.topbar')&&!document.querySelector('.loading')").catch(() => false)) break; await delay(100); }
      await delay(1800);
      const overflow = await evaluate('document.documentElement.scrollWidth - innerWidth').catch(() => '?');
      const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const file = path.join(output, (route.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'inicio') + '-' + width + '.png');
      await fs.writeFile(file, Buffer.from(image.data, 'base64'));
      console.log(width, route, 'overflow=' + overflow);
    }
  }
  if (errors.length) console.log('ERROS:', [...new Set(errors)].slice(0, 6).join(' | '));
} finally { socket?.close(); child.kill(); server.close(); }
