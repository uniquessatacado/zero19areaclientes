import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const baseUrl = process.argv[2] || 'http://127.0.0.1:8080';
const port = 9300 + Math.floor(Math.random() * 500);
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'z19-edge-cdp-'));
const child = spawn(edge, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--remote-allow-origins=*',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { windowsHide: true, stdio: 'ignore' });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
let nextId = 1;
const pending = new Map();
const events = [];
const runtimeErrors = [];

async function waitForDebugger() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await response.json();
      const page = pages.find((item) => item.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await delay(100);
  }
  throw new Error('Edge DevTools não iniciou.');
}

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP sem resposta: ${method}`));},10000);
    pending.set(id, { resolve:(value)=>{clearTimeout(timer);resolve(value);}, reject:(error)=>{clearTimeout(timer);reject(error);} });
  });
}

function waitForEvent(method, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Tempo excedido: ${method}`)), timeout);
    const check = () => {
      const index = events.findIndex((event) => event.method === method);
      if (index >= 0) {
        clearTimeout(timer);
        resolve(events.splice(index, 1)[0].params);
      } else setTimeout(check, 25);
    };
    check();
  });
}

try {
  const wsUrl = await waitForDebugger();
  socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (message) => {
    const payload = JSON.parse(message.data);
    if (payload.id) {
      const item = pending.get(payload.id);
      if (!item) return;
      pending.delete(payload.id);
      if (payload.error) item.reject(new Error(payload.error.message));
      else item.resolve(payload.result);
    } else {events.push(payload);if(payload.method==='Runtime.exceptionThrown')runtimeErrors.push(payload.params.exceptionDetails.exception?.description||payload.params.exceptionDetails.text);}
  });
  socket.addEventListener('close',()=>{for(const item of pending.values())item.reject(new Error('Conexão CDP encerrada.'));pending.clear();});
  await send('Page.enable');
  await send('Runtime.enable');
  // Optional official short-lived Vercel share URL, never a real app session.
  const bootstrapUrl=process.env.BROWSER_QA_BOOTSTRAP_URL;
  if(bootstrapUrl){
    if(new URL(bootstrapUrl).origin!==new URL(baseUrl).origin)throw new Error('Bootstrap de QA deve pertencer ao deployment testado.');
    await send('Page.navigate',{url:bootstrapUrl});
    await delay(2500);
  }

  const pages = [
    ['home', '/', {width: 1280, height: 800, mobile: false}],
    ['home-mobile', '/', {width: 390, height: 844, mobile: true}],
    ['qualidades', '/qualidades.html', {width: 390, height: 844, mobile: true}],
    ['portfolio', '/portfolio.html', {width: 390, height: 844, mobile: true}],
    ['comercial', '/comercial-admin.html?tab=commissions', {width: 390, height: 844, mobile: true}],
    ['demo', '/demo.html', {width: 390, height: 844, mobile: true}],
  ];
  const report = [];
  const screenshots = [];
  for (const [name, pathname, viewport] of pages) {
    events.length = 0;
    await send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.mobile ? 3 : 1,
      mobile: viewport.mobile,
    });
    await send('Page.navigate', { url: new URL(pathname, baseUrl).href });
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const state = await send('Runtime.evaluate', {
        expression: 'document.readyState',
        returnByValue: true,
      });
      if (state.result.value === 'complete') break;
      await delay(100);
    }
    if (name.startsWith('home')) {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const body = await send('Runtime.evaluate', {
          expression: 'document.body.innerText',
          returnByValue: true,
        });
        if (!String(body.result.value || '').includes('Carregando sistema')) break;
        await delay(250);
      }
    } else await delay(2500);
    const result = await send('Runtime.evaluate', {
      expression: `JSON.stringify({
        url: location.href,
        title: document.title,
        readyState: document.readyState,
        text: document.body.innerText.replace(/\\s+/g,' ').trim().slice(0,500),
        visibleButtons: [...document.querySelectorAll('button')].filter(b => b.getClientRects().length).map(b => b.innerText.trim()).filter(Boolean),
        visibleLinks: [...document.querySelectorAll('a')].filter(a => a.getClientRects().length).map(a => ({text:a.innerText.trim(),href:a.getAttribute('href')})),
        brokenImages: [...document.images].filter(i => i.complete && !i.naturalWidth).map(i => i.getAttribute('src')),
        viewport: {width: innerWidth, height: innerHeight},
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      })`,
      returnByValue: true,
    });
    report.push({ name, ...JSON.parse(result.result.value) });
    if (name === 'home' || name === 'home-mobile' || name === 'qualidades') {
      const shot = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      });
      const screenshotPath = path.join(os.tmpdir(), `z19-${name}-smoke.png`);
      await fs.writeFile(screenshotPath, Buffer.from(shot.data, 'base64'));
      screenshots.push(screenshotPath);
    }
  }
  const expectedOrigin=new URL(baseUrl).origin;
  const failures=report.filter(page=>{
    let actualOrigin='';try{actualOrigin=new URL(page.url).origin}catch{}
    return page.url.startsWith('chrome-error:')||actualOrigin!==expectedOrigin||page.readyState!=='complete'||page.brokenImages.length>0||page.horizontalOverflow||!page.text||page.text.includes('Carregando sistema')||(page.name.startsWith('home')&&!page.text.includes('Entrar'));
  });
  console.log(JSON.stringify({ ok: failures.length===0&&runtimeErrors.length===0, screenshots, failures:failures.map(page=>page.name), runtimeErrors, report }, null, 2));
  if(failures.length)throw new Error(`Smoke test falhou em: ${failures.map(page=>page.name).join(', ')}`);
  if(runtimeErrors.length)throw new Error('Erros JavaScript durante o smoke: '+runtimeErrors.join('; '));
} finally {
  try { socket?.close(); } catch {}
  child.kill();
}
