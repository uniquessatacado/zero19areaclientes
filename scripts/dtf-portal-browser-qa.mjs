// Teste da área do cliente DTF por metro (13/11) no navegador, com o banco e o servidor de VERDADE (Supabase da ZERO19):
// cadastra um cliente de teste (e-mail qa.dtf.*@example.com, WhatsApp 00000000000), abre o link de acesso, cria a senha,
// sobe 3 artes (PNG 300 DPI com sobra transparente, PNG sem DPI e PDF), cria pasta, monta o filme (quantidade, largura,
// girar, adicionar, arte que não cabe), envia (pedido no PDV), a equipe põe "em produção", "Montar de novo", cancela,
// sai e entra de novo; celular e computador, sem rolagem lateral nem erro de tela. No fim apaga TUDO do teste
// (arquivos, filmes, pedidos, cliente do PDV, login).
// Uso: node scripts/dtf-portal-browser-qa.mjs [pasta das fotos]   (rode depois do build)
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), dist = path.join(root, 'dist');
const out = path.resolve(process.argv[2] || await fs.mkdtemp(path.join(os.tmpdir(), 'z19-dtf-'))); await fs.mkdir(out, { recursive: true });
const STAFF = '96d8732c-9576-4af9-9fe7-cdee065c14e6', email = 'qa.dtf.' + Date.now() + '@example.com', password = 'Teste-' + Math.random().toString(36).slice(2, 10);
const sql = text => {
  const file = path.join(out, 'q.sql'); fsSync.writeFileSync(file, text);
  const raw = execFileSync('supabase', ['db', 'query', '--linked', '--project-ref', 'kedggjyerexnzmipaick', '-f', file, '-o', 'json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const json = JSON.parse(raw.slice(raw.indexOf('{'))); return json.rows || [];
};
const asStaff = body => sql("select set_config('request.jwt.claims','{\"sub\":\"" + STAFF + "\",\"role\":\"authenticated\"}',true);\nselect set_config('role','authenticated',true);\n" + body);
const cleanup = () => sql(`do $$ declare c record; begin
  for c in select * from public.z19p_dtf_clients where email like 'qa.dtf.%@example.com' loop
    delete from public.order_items where order_id in (select order_id from public.z19p_dtf_films where client_id = c.id and order_id is not null);
    delete from public.tenant_activity_logs where metadata->>'order_id' in (select order_id::text from public.z19p_dtf_films where client_id = c.id and order_id is not null);
    delete from public.orders where id in (select order_id from public.z19p_dtf_films where client_id = c.id and order_id is not null);
    delete from public.tenant_activity_logs where metadata->>'customer_id' = c.customer_id::text;
    delete from public.customers where id = c.customer_id and observacao like 'Cliente DTF por metro%';
    delete from public.z19p_dtf_clients where id = c.id;
    if c.user_id is not null then delete from auth.users where id = c.user_id; end if;
  end loop; end $$;
  select (select count(*) from public.z19p_dtf_clients where email like 'qa.dtf.%@example.com') as left_clients`);

// ── arquivos de teste ──
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const v of buf) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(type), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
function png(name, W, H, box, color, ppm) {
  const rb = W * 4, raw = Buffer.alloc((rb + 1) * H);
  for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) { const o = y * (rb + 1) + 1 + x * 4; raw[o] = color[0]; raw[o + 1] = (color[1] + x) & 255; raw[o + 2] = color[2]; raw[o + 3] = 255; }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
  if (ppm) { const p = Buffer.alloc(9); p.writeUInt32BE(ppm, 0); p.writeUInt32BE(ppm, 4); p[8] = 1; parts.push(chunk('pHYs', p)); }
  parts.push(chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)));
  const file = path.join(out, name); fsSync.writeFileSync(file, Buffer.concat(parts)); return file;
}
function pdf(name) {
  const stream = '0.9 0.1 0.2 rg 20 20 243 100 re f';
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 283.46 141.73] /Contents 4 0 R >>', '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream'];
  let body = '%PDF-1.4\n'; const offsets = [];
  objs.forEach((o, i) => { offsets.push(body.length); body += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = body.length; body += 'xref\n0 5\n0000000000 65535 f \n' + offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  const file = path.join(out, name); fsSync.writeFileSync(file, body, 'latin1'); return file;
}
const fileA = png('Logo QA.png', 1600, 1400, [200, 150, 1381, 1331], [220, 40, 60], 11811); // 1182 px = 10,01 cm a 300 DPI, sobra cortada
const fileB = png('Sem DPI.png', 600, 300, [0, 0, 599, 299], [30, 90, 220], 0);              // sem pHYs: sugere 300 DPI
const fileC = pdf('Etiqueta QA.pdf');                                                          // página 10 × 5 cm, arte 8,57 × 3,53 cm

// ── servidor e navegador ──
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.mjs': 'text/javascript', '.wasm': 'application/wasm' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); let name = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html'; if (name === 'dtf') name = 'dtf.html';
  const file = path.resolve(dist, name); if (!file.startsWith(dist)) { res.writeHead(403); return res.end(); }
  try { const body = await fs.readFile(file); res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(body); } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r)); const origin = 'http://127.0.0.1:' + server.address().port;
const browser = process.env.QA_BROWSER || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9600 + Math.floor(Math.random() * 300), profile = await fs.mkdtemp(path.join(os.tmpdir(), 'z19-dtf-prof-'));
const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-allow-origins=*', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
const delay = ms => new Promise(r => setTimeout(r, ms)), pending = new Map(), errors = [], consoleErrors = []; let socket, id = 0, chooserFiles = null;
const send = (method, params = {}) => { const k = ++id; return new Promise((resolve, reject) => { const t = setTimeout(() => { pending.delete(k); reject(Error('CDP timeout ' + method)); }, 60000); pending.set(k, { resolve: v => { clearTimeout(t); resolve(v); }, reject: e => { clearTimeout(t); reject(e); } }); socket.send(JSON.stringify({ id: k, method, params })); }); };
const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const wait = async (expression, label, timeout = 30000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await evaluate('!!(' + expression + ')').catch(() => false)) return; await delay(80); } throw Error('Timeout: ' + label + '\n' + (await evaluate('document.body.innerText.slice(0,1500)').catch(() => ''))); };
const shot = async name => { const d = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(out, name + '.png'), Buffer.from(d.data, 'base64')); };
const noSideScroll = async label => { const w = await evaluate('({doc:document.documentElement.scrollWidth,vw:innerWidth})'); assert(w.doc <= w.vw + 1, label + ': rolagem lateral ' + JSON.stringify(w)); };
// Balões de ajuda: confere que aparece e toca "Já entendi" (o que a pessoa ia fazer continua).
const tipsSeen = new Set();
const okTips = async () => { for (let n = 0; n < 6; n++) { await delay(220); const title = await evaluate("document.querySelector('.dtf-tip b')?.textContent||''"); if (!title) return; tipsSeen.add(title); await evaluate("document.querySelector('.dtf-tip [data-tip-ok]').click()"); } };
// Toque de verdade (o navegador só abre a escolha de arquivo depois de um toque real).
const realClick = async selector => {
  const box = await evaluate('(()=>{const e=document.querySelector(' + JSON.stringify(selector) + ');e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
};
const tap = async selector => { await evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()'); await okTips(); };
const setValue = (selector, value) => evaluate('(()=>{const i=document.querySelector(' + JSON.stringify(selector) + ');i.value=' + JSON.stringify(value) + ';i.dispatchEvent(new Event("input",{bubbles:true}));i.dispatchEvent(new Event("change",{bubbles:true}));return true})()');
const text = selector => evaluate('document.querySelector(' + JSON.stringify(selector) + ')?.innerText||""');
const report = []; let ok = false;
const watchdog = setTimeout(() => { console.log('watchdog'); process.exit(2); }, 900000);
try {
  // Cliente de teste cadastrado pela "equipe" e link de acesso.
  cleanup();
  const rows = asStaff("select public.z19p_dtf_issue_access((public.z19p_dtf_save_client('" + JSON.stringify({ name: 'TESTE QA DTF (apagar)', email, whatsapp: '(00) 00000-0000', price58: 80, price28: 45, mode: 'auto', artTable: [{ maxWidthCm: 12, maxHeightCm: 12, price: 6 }, { maxWidthCm: 30, maxHeightCm: 30, price: 15 }] }) + "'::jsonb)->>'id')::uuid) as r");
  const token = (typeof rows[0].r === 'string' ? JSON.parse(rows[0].r) : rows[0].r).token;
  assert.ok(token && token.length > 20, 'link de acesso gerado');

  let target; for (let n = 0; n < 100 && !target; n++) { try { target = (await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* ainda abrindo */ } if (!target) await delay(150); }
  socket = new WebSocket(target); await new Promise(r => socket.addEventListener('open', r, { once: true }));
  socket.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.id) { const c = pending.get(m.id); pending.delete(m.id); m.error ? c?.reject(Error(m.error.message)) : c?.resolve(m.result); return; }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params.args.map(x => x.value || x.description || '').join(' ').slice(0, 300));
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description?.split('\n')[0] || m.params.exceptionDetails?.text);
    if (m.method === 'Page.fileChooserOpened' && chooserFiles) { const files = chooserFiles; chooserFiles = null; send('DOM.setFileInputFiles', { files, backendNodeId: m.params.backendNodeId }).catch(e => errors.push('chooser ' + e.message)); }
  });
  await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable'); await send('Page.setInterceptFileChooserDialog', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  // 1) Link de acesso → criar senha → entra.
  await send('Page.navigate', { url: origin + '/dtf#convite=' + token });
  await wait('document.querySelector("#inviteForm")', 'tela de criar senha', 40000);
  assert.match(await text('.dtf-auth-card'), /Crie sua senha/); assert.equal(await evaluate("document.querySelector('#inviteForm input[readonly]').value"), email, 'mostra o e-mail do login');
  await shot('01-criar-senha-celular'); await noSideScroll('criar senha');
  await setValue('#newPass', password); await setValue('#newPass2', password + 'x');
  await evaluate("document.querySelector('#inviteForm button[type=submit]').click()");
  await wait("!document.querySelector('#inviteErr').hidden", 'senhas diferentes avisam'); assert.match(await text('#inviteErr'), /não são iguais/);
  await setValue('#newPass2', password); await evaluate("document.querySelector('#inviteForm button[type=submit]').click()");
  await wait('document.querySelector(".dtf-app .dtf-head h1")', 'entrou na área', 40000);
  assert.equal(await evaluate('location.hash'), '', 'o código do link sai do endereço');
  await wait('document.querySelector(".dtf-tip")', 'balão de boas-vindas'); assert.match(await text('.dtf-tip'), /Bem-vindo/);
  await shot('02-boas-vindas'); await okTips();
  report.push('entrou pelo link e criou a senha');

  // 2) Pasta nova.
  await tap('#newFolder');
  await wait('document.querySelector(".dtf-modal input[name=v]")', 'janela da pasta'); await setValue('.dtf-modal input[name=v]', 'Camisetas QA');
  await evaluate("document.querySelector('.dtf-modal [data-yes]').click()");
  await wait('[...document.querySelectorAll(".dtf-chip.is-on")].some(c=>c.textContent.includes("Camisetas QA"))', 'pasta criada e aberta');

  // 3) Subir 3 artes (PNG 300 DPI com sobra, PNG sem DPI, PDF).
  chooserFiles = [fileA, fileB, fileC];
  await evaluate("document.querySelector('#upBtn').click()");
  await wait('document.querySelector(".dtf-tip [data-tip-ok]")', 'balão do Subir artes'); tipsSeen.add('Subir artes');
  await realClick('.dtf-tip [data-tip-ok]');
  await wait('document.querySelectorAll(".dtf-up [data-f=w]").length===3', 'as 3 artes lidas', 90000);
  await shot('03-subir-artes-celular'); await noSideScroll('subir');
  const up = await evaluate('[...document.querySelectorAll(".dtf-up")].map(n=>({name:n.querySelector("[data-name]")?.value,w:n.querySelector("[data-f=w]")?.value,h:n.querySelector("[data-f=h]")?.value,info:n.querySelector(".dtf-up-info")?.innerText,warn:[...n.querySelectorAll(".dtf-warn")].map(x=>x.innerText).join(" | ")}))');
  report.push('lidas: ' + JSON.stringify(up));
  const a = up.find(x => x.name === 'Logo QA'), b = up.find(x => x.name === 'Sem DPI'), c = up.find(x => /Etiqueta QA/.test(x.name));
  assert.ok(a && b && c, 'nomes das 3 artes');
  assert.equal(a.w, '10,01'); assert.equal(a.h, '10,01'); assert.match(a.info, /Sobra cortada/); assert.match(a.info, /Ótima · 300 DPI/);
  assert.match(b.warn, /300 DPI/, 'arquivo sem DPI avisa'); assert.equal(b.w, '5,08');
  assert.match(c.info, /PDF/); assert.ok(Math.abs(parseFloat(c.w.replace(',', '.')) - 8.57) < 0.05, 'PDF na medida real ' + c.w);
  // Muda a medida da arte sem DPI pela largura: a altura acompanha; fica abaixo de 300 DPI (vai ser ampliada).
  await evaluate("(()=>{const i=[...document.querySelectorAll('.dtf-up')].find(n=>n.querySelector('[data-name]').value==='Sem DPI').querySelector('[data-f=w]');i.focus();})()"); await okTips();
  await evaluate("(()=>{const n=[...document.querySelectorAll('.dtf-up')].find(n=>n.querySelector('[data-name]').value==='Sem DPI'),i=n.querySelector('[data-f=w]');i.value='20';i.dispatchEvent(new Event('input',{bubbles:true}));})()");
  const bAfter = await evaluate("(()=>{const n=[...document.querySelectorAll('.dtf-up')].find(n=>n.querySelector('[data-name]').value==='Sem DPI');return {h:n.querySelector('[data-f=h]').value,q:n.querySelector('[data-q]').innerText}})()");
  assert.equal(bAfter.h, '10'); assert.match(bAfter.q, /Baixa/);
  await tap('#upSave');
  await wait('!document.querySelector(".dtf-modal")', 'artes salvas e janela fechada', 120000);
  await wait('document.querySelectorAll(".dtf-art").length===3', 'as 3 artes na pasta');
  await wait('[...document.querySelectorAll(".dtf-art img")].every(i=>i.complete&&i.naturalWidth>0)', 'miniaturas carregadas');
  await shot('04-minhas-artes-celular'); await noSideScroll('minhas artes');
  const assets = sql("select a.name, a.source_dpi, a.width_px, a.height_px, a.dpi, a.width_cm, a.height_cm, a.trimmed, a.upscaled, a.folder_id is not null as in_folder, a.original_path is not null as has_original from public.z19p_dtf_assets a join public.z19p_dtf_clients c on c.id=a.client_id where c.email='" + email + "' order by a.name");
  report.push('no banco: ' + JSON.stringify(assets));
  const dbA = assets.find(x => x.name === 'Logo QA'), dbB = assets.find(x => x.name === 'Sem DPI'), dbC = assets.find(x => /Etiqueta/.test(x.name));
  assert.equal(dbA.width_px, 1182); assert.equal(dbA.height_px, 1182); assert.equal(Number(dbA.dpi), 300); assert.equal(dbA.trimmed, true); assert.equal(dbA.upscaled, false); assert.equal(dbA.has_original, false);
  assert.equal(Number(dbA.source_dpi), 300); assert.ok(Number(dbB.source_dpi) < 80, 'origem baixa guardada');
  assert.match(await evaluate("[...document.querySelectorAll('.dtf-art')].find(n=>n.innerText.includes('Sem DPI')).querySelector('.dtf-q').innerText"), /Baixa/, 'arte ampliada mostra a qualidade real');
  assert.equal(dbB.upscaled, true); assert.equal(dbB.width_px, 2362); assert.equal(dbB.height_px, 1181); assert.equal(Number(dbB.dpi), 300); assert.equal(Number(dbB.width_cm), 20);
  assert.equal(dbC.has_original, true, 'o PDF fica guardado como original'); assert.ok(assets.every(x => x.in_folder), 'todas na pasta aberta');

  // 4) Marcar 2 e pôr no filme.
  await tap('.dtf-art:nth-child(1) .dtf-check input'); await evaluate("document.querySelector('.dtf-art:nth-child(2) .dtf-check input').click()");
  await wait('document.querySelector("#selBar.is-on")', 'barra das marcadas'); assert.match(await text('#selBar'), /2 marcadas/);
  await tap('#selFilm');
  await wait('document.querySelectorAll(".dtf-item").length===2', 'filme novo com 2 artes', 30000);
  await wait('document.querySelector(".dtf-sum-total")', 'valor calculado', 30000);
  await okTips();
  // Quantidade +, largura 28, girar, adicionar a 3ª.
  await tap('.dtf-item:nth-child(1) [data-q="1"]'); await evaluate("document.querySelector('.dtf-item:nth-child(1) [data-q=\"1\"]').click()");
  await wait('document.querySelector(".dtf-item:nth-child(1) [data-qi]").value==="3"', 'quantidade 3');
  await tap('[data-w="28"]'); await wait('document.querySelector("[data-w=\\"28\\"]").classList.contains("is-on")', 'filme 28 cm');
  await tap('#fAdd'); await wait('document.querySelectorAll(".dtf-pick").length===3', 'escolher artes');
  await evaluate("[...document.querySelectorAll('.dtf-pick')].find(b=>!b.querySelector('.dtf-chip-mini')).click()");
  await evaluate("document.querySelector('#pkOk').click()");
  await wait('document.querySelectorAll(".dtf-item").length===3', '3 artes no filme');
  await wait('document.querySelector(".dtf-sum-total")&&!document.querySelector("#fSummary .dtf-spin")', 'valor de novo', 30000);
  await delay(900);
  const sum1 = await text('#fSummary'); report.push('resumo 28 cm: ' + sum1.replace(/\s+/g, ' '));
  assert.match(sum1, /Comprimento/i); assert.match(sum1, / cm\b/, 'menos de 1 m aparece em cm'); assert.match(sum1, /R\$/);
  // Arte maior que o filme sem poder girar: avisa e trava o envio.
  await tap('#fRotate'); await wait('!document.querySelector("#fRotate").checked', 'girar desligado');
  await evaluate("(()=>{const i=document.querySelector('.dtf-item:nth-child(2) [data-f=w]');i.value='30';i.dispatchEvent(new Event('input',{bubbles:true}));})()"); await okTips();
  await wait('/não cabe/.test(document.querySelector("#fSummary").innerText)', 'aviso de arte que não cabe');
  assert.equal(await evaluate('document.querySelector("#fBarSend").disabled'), true, 'envio travado');
  await shot('05-filme-nao-cabe-celular');
  await evaluate("(()=>{const i=document.querySelector('.dtf-item:nth-child(2) [data-f=w]');i.value='20';i.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await evaluate("document.querySelector('#fRotate').click()");
  await wait('document.querySelector(".dtf-sum-total")&&!document.querySelector("#fBarSend").disabled', 'volta a poder enviar', 30000);
  await delay(900);
  await shot('06-montar-filme-celular'); await noSideScroll('montar filme');
  const preview = await evaluate('(()=>{const c=document.querySelector("#fCanvas");return {w:c.width,h:c.height}})()'); assert.ok(preview.w > 100 && preview.h > 50, 'prévia desenhada');
  const clientTotal = await text('#fBarTotal'); report.push('total na tela: ' + clientTotal);

  // 5) Enviar (receber em casa, com observação).
  await tap('#fBarSend');
  await wait('document.querySelector("#sOk")', 'janela de envio'); await okTips();
  await tap('[data-d="shipping"]'); await setValue('#sNote', 'Teste automático: pode apagar');
  await shot('07-enviar-celular');
  await tap('#sOk');
  await wait('document.querySelector("#goOrders")', 'pedido enviado', 40000);
  const success = await text('.dtf-success'); report.push('enviado: ' + success.replace(/\s+/g, ' '));
  const orderNumber = success.match(/#(\d+)/)[1];
  assert.ok(success.includes(clientTotal.trim()), 'o total enviado é o da tela');
  await shot('08-pedido-enviado');
  await tap('#goOrders');
  await wait('document.querySelector(".dtf-order")', 'meus pedidos'); await okTips();
  assert.match(await text('.dtf-order'), /Na fila da ZERO19/); assert.match(await text('.dtf-order'), new RegExp('#' + orderNumber));
  await shot('09-meus-pedidos-celular'); await noSideScroll('meus pedidos');
  const order = sql("select o.status, o.payment_status, o.payment_timing, o.pickup_balance_due, o.origin, o.shipping_method, o.total_amount, o.observacao_cliente, f.id as film, f.total, f.length_cm, (select json_agg(json_build_object('n',product_name,'q',quantity,'u',unit_price,'t',subtotal)) from public.order_items i where i.order_id=o.id) items from public.orders o join public.z19p_dtf_films f on f.order_id=o.id where o.display_id=" + orderNumber)[0];
  report.push('pedido no PDV: ' + JSON.stringify(order));
  assert.equal(order.status, 'RECEBIDO'); assert.equal(order.payment_timing, 'PAY_AT_PICKUP'); assert.equal(order.origin, 'PDV'); assert.equal(Number(order.pickup_balance_due), Number(order.total_amount));
  assert.equal(order.shipping_method, 'A COMBINAR (DTF)'); assert.match(order.observacao_cliente, /Filme 28 cm/); assert.match(order.observacao_cliente, /pode apagar/);
  assert.ok(clientTotal.replace(/\D/g, '').endsWith(String(Math.round(Number(order.total) * 100))), 'valor do servidor = valor da tela');

  // 6) Equipe põe no filme → cliente vê "Em produção" e não pode mais cancelar.
  asStaff("select public.z19p_dtf_staff_set_status('" + order.film + "','printing')");
  await tap('#oRefresh'); await wait('/Em produção/.test(document.querySelector(".dtf-order .dtf-status").innerText)', 'em produção');
  assert.equal(await evaluate('!!document.querySelector(".dtf-order [data-oa=cancel]")'), false, 'sem cancelar depois de começar');
  await tap('.dtf-order [data-oa=details]'); await wait('document.querySelector(".dtf-detail")', 'detalhes'); assert.equal(await evaluate('document.querySelectorAll(".dtf-detail").length'), 3);
  await shot('10-detalhes-celular'); await evaluate("document.querySelector('.dtf-modal [data-close]').click()");

  // 7) Montar de novo → enviar (retirar) → cancelar pelo cliente.
  await tap('.dtf-order [data-oa=again]');
  await wait('document.querySelectorAll(".dtf-item").length===3&&document.querySelector(".dtf-sum-total")', 'filme refeito', 40000);
  await delay(700); await tap('#fBarSend'); await wait('document.querySelector("#sOk")', 'janela de envio 2');
  await tap('#sOk'); await wait('document.querySelector("#goOrders")', 'enviado 2', 40000);
  const second = (await text('.dtf-success')).match(/#(\d+)/)[1];
  await tap('#goOrders'); await wait('document.querySelectorAll(".dtf-order").length===2', '2 pedidos');
  await tap('.dtf-order [data-oa=cancel]'); await wait('document.querySelector(".dtf-modal [data-yes]")', 'confirmar cancelamento');
  await evaluate("document.querySelector('.dtf-modal [data-yes]').click()");
  await wait('document.querySelector(".dtf-order.is-cancelled")', 'pedido cancelado');
  const o2 = sql('select status, payment_status, pickup_balance_due from public.orders where display_id=' + second)[0];
  assert.equal(o2.status, 'CANCELADO'); assert.equal(Number(o2.pickup_balance_due), 0);
  await shot('11-cancelado-celular');

  // 8) Computador: as 3 telas sem rolagem lateral.
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false }); await delay(400);
  await tap('[data-tab=arts]'); await wait('document.querySelectorAll(".dtf-art").length', 'artes no computador'); await shot('12-artes-pc'); await noSideScroll('artes pc');
  await tap('[data-tab=film]'); await wait('document.querySelector(".dtf-head h1")', 'filmes pc'); await shot('13-filmes-pc'); await noSideScroll('filmes pc');
  await tap('#newFilm'); await wait('document.querySelector("#fAdd")', 'filme novo pc'); await tap('#fAdd');
  await wait('document.querySelectorAll(".dtf-pick").length===3', 'escolher pc');
  await evaluate("document.querySelectorAll('.dtf-pick').forEach(b=>b.click())"); await evaluate("document.querySelector('#pkOk').click()");
  await wait('document.querySelector(".dtf-sum-total")', 'valor pc', 30000); await delay(900);
  await shot('14-montar-filme-pc'); await noSideScroll('montar pc');
  await tap('[data-tab=orders]'); await wait('document.querySelector(".dtf-order")', 'pedidos pc'); await shot('15-pedidos-pc'); await noSideScroll('pedidos pc');

  // 9) Menu: rever dicas, sair e entrar de novo com e-mail e senha.
  await tap('#userBtn'); await wait('document.querySelector("#mOut")', 'menu da conta'); await shot('16-menu');
  await tap('#mOut'); await wait('document.querySelector("#loginForm")', 'saiu', 30000);
  await setValue('#loginEmail', email); await setValue('#loginPass', 'errada');
  await evaluate("document.querySelector('#loginForm button[type=submit]').click()");
  await wait('/errados/.test(document.querySelector(".dtf-auth-card").innerText)', 'senha errada avisa', 30000);
  await setValue('#loginPass', password); await evaluate("document.querySelector('#loginForm button[type=submit]').click()");
  await wait('document.querySelector(".dtf-app .dtf-head h1")', 'entrou de novo', 40000);
  assert.equal(await evaluate('!!document.querySelector(".dtf-tip")'), false, 'balão já visto não volta depois de entrar de novo');

  // Apaga os arquivos do teste (como o próprio cliente).
  const removed = await evaluate(`(async()=>{const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.57.4');const sb=createClient('https://kedggjyerexnzmipaick.supabase.co','sb_publishable_WoobBV7n0p5Jf-4DLJVzIA_4sUoAvsT',{auth:{storageKey:'z19p-dtf-client',persistSession:true}});
    const uid=(await sb.auth.getUser()).data.user.id;const {data:dirs}=await sb.storage.from('z19p-private').list(uid+'/dtf',{limit:100});const paths=[];
    for(const d of dirs||[]){const {data:files}=await sb.storage.from('z19p-private').list(uid+'/dtf/'+d.name,{limit:100});for(const f of files||[])paths.push(uid+'/dtf/'+d.name+'/'+f.name);}
    if(paths.length){const {error}=await sb.storage.from('z19p-private').remove(paths);if(error)throw error;}return paths.length})()`);
  report.push('arquivos apagados: ' + removed);
  report.push('balões vistos: ' + [...tipsSeen].join(' · '));
  assert.ok(tipsSeen.size >= 12, 'balões de ajuda nos botões (' + tipsSeen.size + ')');
  const real = errors.filter(Boolean), cons = consoleErrors.filter(e => !/favicon|ERR_FILE_NOT_FOUND/.test(e));
  assert.deepEqual(real, [], 'erros de tela'); assert.deepEqual(cons, [], 'erros no console');
  ok = true;
} catch (error) {
  report.push('FALHOU: ' + (error?.stack || error));
  try { await shot('zz-falha'); } catch { /* ok */ }
} finally {
  clearTimeout(watchdog);
  try { report.push('limpeza: ' + JSON.stringify(cleanup())); } catch (error) { report.push('LIMPEZA FALHOU: ' + error.message); ok = false; }
  try { socket?.close(); } catch { /* ok */ }
  child.kill('SIGKILL'); server.close();
  await fs.writeFile(path.join(out, 'relatorio.txt'), report.join('\n'));
  console.log(report.join('\n')); console.log('fotos: ' + out);
  console.log(ok ? 'PASS área do cliente DTF por metro (banco real, celular e computador)' : 'FAIL');
  process.exit(ok ? 0 : 1);
}
