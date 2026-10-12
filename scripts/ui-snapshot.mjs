// Fotos das telas do 019 com dados simulados (nada real é lido ou gravado).
// Uso: node scripts/ui-snapshot.mjs <página relativa ao dist> <pasta de saída> [larguras separadas por vírgula] [espera-js]
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', process.env.UI_ROOT || 'dist');
const page = process.argv[2] || 'scripts/film-fixture.html';
const output = path.resolve(process.argv[3] || await fs.mkdtemp(path.join(os.tmpdir(), 'z19-ui-')));
const widths = (process.argv[4] || '1366,390').split(',').map(Number);
const ready = process.argv[5] || "document.querySelector('#app')?.children.length";
await fs.mkdir(output, { recursive: true });
const watchdog = setTimeout(() => { console.log('watchdog: tempo esgotado'); process.exit(2); }, Number(process.env.UI_TIMEOUT) || 150000); watchdog.unref?.();
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf' };
const server = http.createServer(async (request, response) => {
  const name = decodeURIComponent(new URL(request.url, 'http://x').pathname).replace(/^\//, '') || 'index.html';
  const repo = path.resolve(root, '..'), file = path.resolve(root, name), fallback = path.resolve(repo, name);
  if (!file.startsWith(root) || !fallback.startsWith(repo)) { response.writeHead(403); return response.end(); }
  try { const body = await fs.readFile(file).catch(() => fs.readFile(fallback)); response.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }); response.end(body); }
  catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'z19-ui-edge-')), port = 17000 + Math.floor(Math.random() * 400);
const child = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-allow-origins=*', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms)); let socket, id = 0; const pending = new Map(); const errors = [];
const send = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; const timer = setTimeout(() => reject(Error('CDP timeout ' + method)), 30000); pending.set(key, { resolve: value => { clearTimeout(timer); resolve(value); }, reject }); socket.send(JSON.stringify({ id: key, method, params })); });
const evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
try {
  let target; for (let n = 0; n < 100 && !target; n++) { try { target = (await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()).find(tab => tab.type === 'page')?.webSocketDebuggerUrl; } catch { /* start */ } if (!target) await delay(150); }
  socket = new WebSocket(target); await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  socket.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.id) { const call = pending.get(message.id); pending.delete(message.id); message.error ? call?.reject(Error(message.error.message)) : call?.resolve(message.result); } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text); });
  await send('Page.enable'); await send('Runtime.enable');
  for (const width of widths) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: Number(process.env.UI_HEIGHT) || (width < 600 ? 2200 : 1500), deviceScaleFactor: 1, mobile: width < 600 });
    await send('Page.navigate', { url: origin + '/' + page });
    for (let n = 0; n < 200; n++) { if (await evaluate('!!(' + ready + ')').catch(() => false)) break; await delay(100); }
    const stage = await evaluate("[window.fixtureStage, window.fixtureError, !!window.fixtureReady].join(' | ')").catch(() => ''); if (/[a-z]/i.test(stage)) console.log('fixture:', stage);
    await delay(900);
    if (process.env.UI_THEME) { await evaluate("(()=>{for(const href of ['/qr-theme.css','/qr-screens.css']){if(![...document.styleSheets].some(sheet=>String(sheet.href||'').includes(href))){const link=document.createElement('link');link.rel='stylesheet';link.href=href;document.head.appendChild(link)}}})()"); await delay(600); }
    if (process.env.UI_ACTIONS) { const result = await evaluate(await fs.readFile(process.env.UI_ACTIONS, 'utf8')).catch(error => 'ERRO ' + error.message); if (result) console.log('acoes:', result); await delay(700); }
    if (process.env.UI_DUMP) console.log(await evaluate(await fs.readFile(process.env.UI_DUMP, 'utf8')));
    const overflow = await evaluate('document.documentElement.scrollWidth - innerWidth');
    const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(output, (process.env.UI_NAME || path.basename(page).replace(/\W+/g, '-')) + '-' + width + '.png');
    await fs.writeFile(file, Buffer.from(image.data, 'base64'));
    console.log(width, 'overflow=' + overflow, file);
  }
  if (errors.length) console.log('ERROS:', errors.slice(0, 5).join(' | '));
} finally { socket?.close(); child.kill(); server.close(); }
