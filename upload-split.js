// 2.17.96 (13/11, dono): subir arte PNG grande (2 m) e dividir em partes de até 1 m, cortando só em linha sem pixel.
// Tela de "Subir arte": botão "✂ Dividir em partes" quando a arte passa do limite, progresso, mapa com os cortes,
// "Desfazer divisão" e, ao salvar, o PNG da parte vai com os pixels exatos do original (sem passar pelo canvas).
import { readPngInfo, planSplit, partName, partFileName, BIG_PNG_PIXELS } from './png-split.js?v=2.17.95';

export const DEFAULT_MAX_CM = 100;
const PX_PER_CM_300 = 300 / 2.54;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = value => Number(String(value ?? '').replace(',', '.')) || 0;
const cmText = value => (Math.round(value * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const cmField = value => String(Math.round(value * 100) / 100).replace('.', ',');
const sizeText = value => value >= 100 ? (value / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' m' : cmText(value) + ' cm';
const isPng = file => !!file && (file.type === 'image/png' || /\.png$/i.test(file.name || ''));
const baseName = q => String(q.name || '').trim() || String(q.file?.name || 'Arte').replace(/\.[^.]+$/, '').trim() || 'Arte';

// O trabalho pesado vai para um Worker; se o navegador não deixar, roda aqui mesmo (mais lento, mesmo resultado).
let worker = null, workerBroken = false, sequence = 0;
const waiting = new Map();
async function direct(op, payload, onProgress) {
  const core = await import('./png-split.js?v=2.17.95');
  return op === 'scan' ? core.scanPng(payload.blob, { onProgress }) : core.writeParts(payload.blob, payload.analysis, payload.parts, { ...(payload.options || {}), onProgress });
}
function call(op, payload, onProgress) {
  if (workerBroken || typeof Worker === 'undefined') return direct(op, payload, onProgress);
  try {
    if (!worker) {
      worker = new Worker(new URL('./png-split-worker.js?v=2.17.95', import.meta.url), { type: 'module' });
      worker.onmessage = event => {
        const { id, progress, result, error } = event.data || {}, job = waiting.get(id);
        if (!job) return;
        if (progress !== undefined) { job.onProgress?.(progress); return; }
        waiting.delete(id);
        error ? job.reject(new Error(error)) : job.resolve(result);
      };
      worker.onerror = event => {
        event.preventDefault?.(); workerBroken = true; worker?.terminate(); worker = null;
        const jobs = [...waiting.values()]; waiting.clear();
        for (const job of jobs) direct(job.op, job.payload, job.onProgress).then(job.resolve, job.reject);
      };
    }
  } catch { workerBroken = true; return direct(op, payload, onProgress); }
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    waiting.set(id, { op, payload, onProgress, resolve, reject });
    worker.postMessage({ id, op, ...payload });
  });
}

function setStatus(q, text) {
  q.splitStatus = text;
  if (typeof document === 'undefined' || !q.splitKey) return;
  for (const node of document.querySelectorAll('[data-split-status="' + q.splitKey + '"]')) node.textContent = text;
}
function analyse(q, label = 'Lendo a arte') {
  q.png.analysisPromise ||= call('scan', { blob: q.file }, p => setStatus(q, label + '… ' + Math.round(p * 100) + '%'))
    .then(analysis => { q.png.analysis = analysis; return analysis; })
    .catch(error => { q.png.analysisPromise = null; throw error; });
  return q.png.analysisPromise;
}

// Ao escolher o arquivo: PNG grande é lido linha por linha (sem abrir a imagem inteira no navegador, que travava).
// Devolve true quando cuidou da proporção (o 019 não precisa abrir a imagem no canvas).
export async function prepare(q, { trim = true, onChange } = {}) {
  if (!isPng(q.file)) return false;
  let info;
  try { info = await readPngInfo(q.file); } catch { return false; }
  q.splitKey ||= (globalThis.crypto?.randomUUID?.() || String(Math.random()).slice(2));
  q.png = { width: info.width, height: info.height, ppm: info.ppm, dpi: info.dpi, problem: info.problem, hasAlpha: info.hasAlpha, big: info.width * info.height > BIG_PNG_PIXELS };
  if (!q.png.big || info.problem || !info.hasAlpha) return false;
  q.png.reading = true;
  analyse(q, 'Lendo a arte grande').then(analysis => {
    q.png.reading = false;
    const box = trim ? analysis.box : { width: analysis.width, height: analysis.height };
    if (box?.width > 0 && box.height > 0) {
      q.aspectRatio = box.width / box.height;
      const w = num(q.widthCm), h = num(q.heightCm);
      if (w > 0 && !(h > 0)) q.heightCm = cmField(w / q.aspectRatio);
      else if (h > 0 && !(w > 0)) q.widthCm = cmField(h * q.aspectRatio);
    }
    onChange?.();
  }, error => { q.png.reading = false; q.png.readError = error.message; onChange?.(); });
  return true;
}

// Escala do arquivo (pixels por cm): pela medida digitada da arte inteira (como o 019 mede: arte sem prancheta) ou pelo DPI.
function scaleOf(q, trim, analysis) {
  const w = num(q.widthCm), h = num(q.heightCm), basis = trim && analysis?.box ? analysis.box : { width: q.png.width, height: q.png.height };
  if (w > 0 && q.sizeAxis !== 'height') return { pxPerCm: basis.width / w, from: 'a largura de ' + cmText(w) + ' cm' };
  if (h > 0) return { pxPerCm: basis.height / h, from: 'a altura de ' + cmText(h) + ' cm' };
  if (w > 0) return { pxPerCm: basis.width / w, from: 'a largura de ' + cmText(w) + ' cm' };
  if (q.png.ppm && q.png.ppm.x === q.png.ppm.y) return { pxPerCm: q.png.ppm.x / 100, from: 'o DPI do arquivo (' + Math.round(q.png.ppm.x * 0.0254) + ' DPI)' };
  return null;
}
function heightCmOf(q) {
  const h = num(q.heightCm);
  if (h > 0) return h;
  const w = num(q.widthCm);
  if (w > 0 && q.aspectRatio > 0) return w / q.aspectRatio;
  if (q.png?.ppm && q.png.ppm.y > 0) return (q.png.analysis?.box?.height || q.png.height) / (q.png.ppm.y / 100);
  return 0;
}
export const busy = queue => (queue || []).some(q => q.splitBusy);

export function boxHTML(q, i) {
  if (q.type !== 'arte') return '';
  if (q.splitPart) return partHTML(q);
  if (!q.png || !isPng(q.file)) return '';
  const maxCm = num(q.splitMaxCm) || DEFAULT_MAX_CM, height = heightCmOf(q);
  if (q.png.reading && !q.splitBusy) return '<div class="upload-split upload-split-mini"><small data-split-status="' + esc(q.splitKey) + '">' + esc(q.splitStatus || 'Lendo a arte grande…') + '</small></div>';
  if (!(height > maxCm) && !q.splitError && !q.splitNote) return '';
  if (q.png.problem) return '<div class="upload-split is-blocked"><b>✂ Não dá para dividir este PNG</b><small>' + esc(q.png.problem) + '</small></div>';
  if (!q.png.hasAlpha) return '<div class="upload-split is-blocked"><b>✂ Sem transparência</b><small>Esta imagem não tem fundo transparente: não existe linha vazia para cortar sem cortar a arte.</small></div>';
  return '<div class="upload-split" data-split-box="' + i + '">'
    + '<div class="upload-split-text"><b>✂ Arte com ' + esc(sizeText(height)) + ' de altura</b>'
    + '<small>Divide em partes de até ' + esc(cmText(maxCm)) + ' cm, cortando só onde a linha inteira está sem pixel: nenhuma arte é cortada e nada muda de tamanho. Os nomes ficam “' + esc(baseName(q)) + ' 1/2”, “' + esc(baseName(q)) + ' 2/2”…</small></div>'
    + '<label class="upload-split-max">Partes de até <input data-split-max="' + i + '" inputmode="decimal" value="' + esc(cmField(maxCm)) + '" aria-label="Altura máxima de cada parte em cm"> cm</label>'
    + '<button type="button" class="btn small upload-split-run" data-split-run="' + i + '"' + (q.splitBusy ? ' disabled' : '') + '>' + (q.splitBusy ? 'Dividindo…' : '✂ Dividir em partes') + '</button>'
    + (q.splitBusy ? '<small class="upload-split-status" data-split-status="' + esc(q.splitKey) + '" role="status">' + esc(q.splitStatus || 'Preparando…') + '</small>' : '')
    + (q.splitError ? '<small class="upload-split-error" role="alert">' + esc(q.splitError) + '</small>' : '')
    + (q.splitNote ? '<small class="upload-split-note" role="status">' + esc(q.splitNote) + '</small>' : '')
    + '</div>';
}
function partHTML(q) {
  const p = q.splitPart, group = q.splitGroup;
  if (p.index !== 1) return '<div class="upload-split upload-split-part"><small>Parte ' + p.index + ' de ' + p.total + ' de “' + esc(group.name) + '” · medida exata da parte (mesma escala do arquivo)' + (p.oversize ? ' · <b class="upload-split-warn">maior que ' + esc(cmText(group.maxCm)) + ' cm: não há linha vazia para cortar sem cortar a arte</b>' : '') + '</small></div>';
  return '<div class="upload-split is-done">'
    + '<canvas class="upload-split-map" data-split-map="' + esc(group.id) + '" aria-label="Onde a arte foi cortada"></canvas>'
    + '<div class="upload-split-text"><b>✂ “' + esc(group.name) + '” dividida em ' + p.total + ' partes</b>'
    + '<ul>' + group.parts.map(part => '<li' + (part.oversize ? ' class="upload-split-warn"' : '') + '>' + esc(partName(group.name, part.index, part.total)) + ' · ' + esc(cmText(part.widthCm)) + ' × ' + esc(cmText(part.heightCm)) + ' cm' + (part.oversize ? ' · maior que ' + esc(cmText(group.maxCm)) + ' cm (sem linha vazia para cortar)' : '') + '</li>').join('') + '</ul>'
    + '<small>Cortes (linhas vermelhas) só onde não tem pixel. Escala pela ' + esc(group.from) + '. Cada parte leva os pixels exatos do arquivo, sem redimensionar.</small></div>'
    + '<button type="button" class="btn small" data-split-undo="' + esc(group.id) + '">↶ Desfazer divisão</button>'
    + '</div>';
}

function thumbCanvas(thumb) {
  const canvas = document.createElement('canvas'); canvas.width = thumb.width; canvas.height = thumb.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(thumb.data), thumb.width, thumb.height), 0, 0);
  return canvas;
}
function partPreview(group, part) {
  try {
    const t = group.thumb, sx = t.width / group.width, sy = t.height / group.height, x = Math.floor(part.left * sx), y = Math.floor(part.top * sy),
      w = Math.max(1, Math.min(t.width - x, Math.ceil(part.width * sx))), h = Math.max(1, Math.min(t.height - y, Math.ceil(part.height * sy))), out = document.createElement('canvas');
    out.width = w; out.height = h; out.getContext('2d').drawImage(group.thumbCanvas ||= thumbCanvas(t), x, y, w, h, 0, 0, w, h);
    return out.toDataURL('image/png');
  } catch { return ''; }
}
function drawMap(canvas, group) {
  const t = group.thumb, ctx = canvas.getContext('2d'), sx = t.width / group.width, sy = t.height / group.height;
  canvas.width = t.width; canvas.height = t.height;
  for (let y = 0; y < t.height; y += 6) for (let x = 0; x < t.width; x += 6) { ctx.fillStyle = ((x + y) / 6) % 2 ? '#e2e8f0' : '#f8fafc'; ctx.fillRect(x, y, 6, 6); }
  ctx.drawImage(group.thumbCanvas ||= thumbCanvas(t), 0, 0);
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(37,99,235,.85)';
  for (const part of group.parts) ctx.strokeRect(part.left * sx + .5, part.top * sy + .5, Math.max(1, part.width * sx - 1), Math.max(1, part.height * sy - 1));
  ctx.lineWidth = 2; ctx.strokeStyle = '#dc2626'; ctx.setLineDash([5, 3]);
  for (const cut of group.cuts) { const y = Math.round(cut * sy) + .5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(t.width, y); ctx.stroke(); }
  ctx.setLineDash([]); ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textBaseline = 'middle';
  for (const part of group.parts) {
    const label = part.index + '/' + part.total, y = (part.top + part.height / 2) * sy, w = ctx.measureText(label).width + 8;
    ctx.fillStyle = 'rgba(15,23,42,.85)'; ctx.fillRect(2, y - 9, w, 18); ctx.fillStyle = '#fff'; ctx.fillText(label, 6, y);
  }
}

async function runSplit(q, { queue, rerender, toast, trim }) {
  if (!q || q.splitBusy) return;
  const maxCm = num(q.splitMaxCm) || DEFAULT_MAX_CM;
  if (maxCm < 5 || maxCm > 1000) { q.splitError = 'Use um tamanho de parte entre 5 e 1000 cm.'; rerender(); return; }
  q.splitBusy = true; q.splitError = ''; q.splitNote = ''; q.splitStatus = 'Procurando as linhas sem pixel…'; rerender();
  try {
    const analysis = await analyse(q, 'Procurando as linhas sem pixel'), scale = scaleOf(q, trim(), analysis);
    if (!scale) throw new Error('Digite a largura ou a altura da arte inteira: é ela que diz onde fica cada metro.');
    const plan = planSplit(analysis, { pxPerCm: scale.pxPerCm, maxCm });
    if (plan.parts.length < 2) { q.splitNote = plan.parts[0].oversize ? 'Não há nenhuma linha vazia para cortar sem cortar a arte: ela continua inteira.' : 'A arte inteira cabe em ' + cmText(plan.parts[0].heightCm) + ' cm: não precisa dividir.'; return; }
    setStatus(q, 'Gravando as partes (pixels do original)…');
    const written = await call('write', { blob: q.file, analysis, parts: plan.parts, options: { pxPerCm: scale.pxPerCm } }, p => setStatus(q, 'Gravando as partes… ' + Math.round(p * 100) + '%'));
    const list = queue(), at = list.indexOf(q);
    if (at < 0) return;
    const name = baseName(q), exact = PX_PER_CM_300 / scale.pxPerCm <= 1.001;
    const group = { id: globalThis.crypto?.randomUUID?.() || String(Date.now()), original: q, name, from: scale.from, maxCm, pxPerCm: scale.pxPerCm, cuts: plan.cuts,
      parts: written.map(part => ({ index: part.index, total: part.total, top: part.top, left: part.left, width: part.width, height: part.height, widthCm: part.widthCm, heightCm: part.heightCm, oversize: part.oversize })),
      thumb: analysis.thumb, width: analysis.width, height: analysis.height, sourceName: q.file.name };
    const items = written.map(part => ({
      file: new File([part.blob], partFileName(name, part.index, part.total), { type: 'image/png' }),
      name: partName(name, part.index, part.total), type: 'arte', folderId: q.folderId, showFolder: q.showFolder, readyForPrint: q.readyForPrint,
      widthCm: cmField(part.widthCm), heightCm: cmField(part.heightCm), sizeAxis: 'width', aspectRatio: part.width / part.height,
      standaloneHalftone: false, noOrder: true, autoName: false, preview: partPreview(group, part), splitGroup: group,
      splitPart: { index: part.index, total: part.total, top: part.top, left: part.left, width: part.width, height: part.height, widthCm: part.widthCm, heightCm: part.heightCm,
        pxPerCm: scale.pxPerCm, oversize: part.oversize, exact, sourceWidth: analysis.width, sourceHeight: analysis.height, sourceName: q.file.name, maxCm },
    }));
    list.splice(at, 1, ...items);
    toast('“' + name + '” dividida em ' + items.length + ' partes. Confira e salve.', 'ok');
  } catch (error) {
    q.splitError = (error?.message || 'Não foi possível dividir.') + ' Nada foi alterado.';
  } finally {
    q.splitBusy = false; q.splitStatus = '';
    rerender();
  }
}
function undoSplit(groupId, { queue, rerender }) {
  const list = queue(), positions = list.map((q, i) => (q.splitGroup?.id === groupId ? i : -1)).filter(i => i >= 0);
  if (!positions.length) return;
  const original = list[positions[0]].splitGroup.original;
  for (let k = positions.length - 1; k >= 0; k--) list.splice(positions[k], 1);
  list.splice(positions[0], 0, original);
  rerender();
}

// Liga os botões depois de cada renderização da lista.
export function bind(list, { queue, rerender, toast, trim }) {
  const ctx = { queue, rerender, toast, trim };
  for (const input of list.querySelectorAll('[data-split-max]')) input.addEventListener('change', () => { const q = queue()[+input.dataset.splitMax]; if (!q) return; q.splitMaxCm = input.value.replace(/[^0-9,.]/g, ''); q.splitNote = ''; q.splitError = ''; rerender(); });
  for (const button of list.querySelectorAll('[data-split-run]')) button.addEventListener('click', () => { const q = queue()[+button.dataset.splitRun], input = list.querySelector('[data-split-max="' + button.dataset.splitRun + '"]'); if (q && input) q.splitMaxCm = input.value.replace(/[^0-9,.]/g, ''); void runSplit(q, ctx); });
  for (const button of list.querySelectorAll('[data-split-undo]')) button.addEventListener('click', () => undoSplit(button.dataset.splitUndo, ctx));
  for (const canvas of list.querySelectorAll('[data-split-map]')) { const q = queue().find(item => item.splitGroup?.id === canvas.dataset.splitMap); if (q) try { drawMap(canvas, q.splitGroup); } catch { /* o mapa é só ajuda visual */ } }
}

// Ao salvar: parte dividida (ou PNG grande que já está em 300 DPI ou mais) vai com os pixels exatos, sem canvas.
// null = segue o caminho de sempre do 019 (ex.: arte abaixo de 300 DPI, que o 019 amplia).
export async function exactResult(q, { trim, widthCm, heightCm, byHeight, onStage }) {
  if (q.splitPart) {
    if (!q.splitPart.exact) return null;
    return { blob: q.file, width: q.splitPart.width, height: q.splitPart.height, sourceWidth: q.splitPart.sourceWidth, sourceHeight: q.splitPart.sourceHeight, upscaled: false, engine: 'png-split', targetPixels: null, pxPerCm: q.splitPart.pxPerCm };
  }
  if (!q.png?.big || q.type !== 'arte' || !trim || q.png.problem || !q.png.hasAlpha || !(widthCm > 0 || heightCm > 0)) return null;
  onStage?.('Lendo a arte grande…');
  const analysis = await analyse(q, 'Lendo a arte grande'), box = analysis.box;
  if (!box) return null;
  const pxPerCm = byHeight ? box.height / heightCm : box.width / widthCm;
  if (PX_PER_CM_300 / pxPerCm > 1.001) return null;
  onStage?.('Gravando o PNG final com os pixels do original…');
  const [part] = await call('write', { blob: q.file, analysis, parts: [{ ...box, index: 1, total: 1 }], options: { pxPerCm } }, p => onStage?.('Gravando o PNG final… ' + Math.round(p * 100) + '%'));
  return { blob: part.blob, width: box.width, height: box.height, sourceWidth: analysis.width, sourceHeight: analysis.height, upscaled: false, engine: 'png-exact',
    targetPixels: { axis: byHeight ? 'height' : 'width', pixels: byHeight ? box.height : box.width, cm: byHeight ? heightCm : widthCm }, pxPerCm };
}
export function decorateAsset(row, q, result) {
  if (result?.pxPerCm > 0 && !result.upscaled) row.dpi = Math.round(result.pxPerCm * 2.54);
  if (q.splitPart) {
    const p = q.splitPart;
    row.metadata = { ...(row.metadata || {}), split_part: { index: p.index, total: p.total, from_file: p.sourceName, source_box: { top: p.top, left: p.left, width: p.width, height: p.height }, source_size: { width: p.sourceWidth, height: p.sourceHeight }, px_per_cm: p.pxPerCm, max_cm: p.maxCm, oversize: p.oversize, exact_pixels: Boolean(p.exact) } };
  } else if (result?.engine === 'png-exact') row.metadata = { ...(row.metadata || {}), exact_pixels: true, px_per_cm: result.pxPerCm };
}
// Erro de tamanho do servidor em palavras claras.
export function uploadErrorText(error) {
  const text = String(error?.message || error || '');
  return /exceed|maximum|too large|payload|413/i.test(text) ? 'arquivo maior que o limite de envio do servidor (Supabase). Use “✂ Dividir em partes” para mandar em partes menores, ou aumente o limite de envio no Supabase.' : text;
}
