// 2.17.96 (13/11, dono): subir arte PNG grande (2 m) e dividir em partes de até 1 m sem cortar estampa.
// Tela de "Subir arte": "✂ Ver opções de corte" quando a arte passa do limite → até 3 opções com mapa colorido (cada cor
// é uma parte; uma estampa nunca pode ter duas cores), "🔍 Ampliar" para conferir de perto e "Usar esta opção" (só grava
// depois de escolher). Corte reto quando existe linha vazia; senão o corte contorna as artes. "Desfazer divisão" volta a
// arte inteira. Ao salvar, o PNG da parte vai com os pixels exatos do original (sem passar pelo canvas).
import { readPngInfo, partName, partFileName, BIG_PNG_PIXELS } from './png-split.js?v=2.17.95';

export const DEFAULT_MAX_CM = 100;
const PX_PER_CM_300 = 300 / 2.54;
const COLORS = ['#2563eb', '#ea580c', '#16a34a', '#9333ea', '#dc2626', '#0891b2', '#ca8a04', '#db2777'];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = value => Number(String(value ?? '').replace(',', '.')) || 0;
const cmText = value => (Math.round(value * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const cmShort = value => (Math.round(value * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const cmField = value => String(Math.round(value * 100) / 100).replace('.', ',');
const sizeText = value => value >= 100 ? (value / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' m' : cmText(value) + ' cm';
const isPng = file => !!file && (file.type === 'image/png' || /\.png$/i.test(file.name || ''));
const baseName = q => String(q.name || '').trim() || String(q.file?.name || 'Arte').replace(/\.[^.]+$/, '').trim() || 'Arte';
const mergeText = mm => mm >= 10 ? 'peças a menos de 1 cm ficam juntas' : mm > 0 ? 'peças a menos de ' + String(mm).replace('.', ',') + ' mm ficam juntas' : 'só peças encostadas ficam juntas';

// O trabalho pesado vai para um Worker; se o navegador não deixar, roda aqui mesmo (mais lento, mesmo resultado).
let worker = null, workerBroken = false, sequence = 0;
const waiting = new Map();
async function direct(op, payload, onProgress) {
  const core = await import('./png-split.js?v=2.17.95');
  if (op === 'scan') return core.scanPng(payload.blob, { onProgress });
  if (op === 'options') return core.planOptions(payload.analysis, payload.options || {});
  if (op === 'split') return core.splitPng(payload.blob, payload.analysis, { ...(payload.options || {}), onProgress });
  return core.writeParts(payload.blob, payload.analysis, payload.parts, { ...(payload.options || {}), onProgress });
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
  if (w > 0 && q.sizeAxis !== 'height') return { pxPerCm: basis.width / w, from: 'largura de ' + cmText(w) + ' cm da arte inteira' };
  if (h > 0) return { pxPerCm: basis.height / h, from: 'altura de ' + cmText(h) + ' cm da arte inteira' };
  if (w > 0) return { pxPerCm: basis.width / w, from: 'largura de ' + cmText(w) + ' cm da arte inteira' };
  if (q.png.ppm && q.png.ppm.x === q.png.ppm.y) return { pxPerCm: q.png.ppm.x / 100, from: 'DPI do arquivo (' + Math.round(q.png.ppm.x * 0.0254) + ' DPI)' };
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
const choiceSignature = (q, trim) => [q.widthCm, q.heightCm, q.sizeAxis, num(q.splitMaxCm) || DEFAULT_MAX_CM, trim ? 1 : 0].join('|');
export const busy = queue => (queue || []).some(q => q.splitBusy);

function optionTitle(option) {
  const parts = option.parts, top = Math.min(...parts.map(p => p.top));
  if (option.straight) {
    const cuts = option.mode === 'straight' ? option.cuts : [...parts].sort((a, b) => a.top - b.top).slice(1).map(p => p.top);
    return 'Corte reto' + (cuts.length ? ' a ' + cuts.map(cut => cmShort((cut - top) / option.pxPerCm) + ' cm').join(' e ') : '');
  }
  return 'Contorna as artes · ' + mergeText(option.mergeMm);
}
function partsListHTML(parts, maxCm, name) {
  return '<ul>' + [...parts].sort((a, b) => a.index - b.index).map(part => '<li' + (part.oversize ? ' class="upload-split-warn"' : '') + '><i style="background:' + COLORS[(part.index - 1) % COLORS.length] + '"></i>' + esc(partName(name, part.index, part.total)) + ' · ' + esc(cmText(part.widthCm)) + ' × ' + esc(cmText(part.heightCm)) + ' cm' + (part.oversize ? ' · maior que ' + esc(cmText(maxCm)) + ' cm (uma arte sozinha passa do limite)' : '') + '</li>').join('') + '</ul>';
}

export function boxHTML(q, i, { trim = true } = {}) {
  if (q.type !== 'arte') return '';
  if (q.splitPart) return partHTML(q);
  if (!q.png || !isPng(q.file)) return '';
  if (q.splitChoice && q.splitChoice.signature !== choiceSignature(q, trim)) q.splitChoice = null;
  if (q.splitChoice) return choiceHTML(q, i);
  const maxCm = num(q.splitMaxCm) || DEFAULT_MAX_CM, height = heightCmOf(q);
  if (q.png.reading && !q.splitBusy) return '<div class="upload-split upload-split-mini"><small data-split-status="' + esc(q.splitKey) + '">' + esc(q.splitStatus || 'Lendo a arte grande…') + '</small></div>';
  if (!(height > maxCm) && !q.splitError && !q.splitNote) return '';
  if (q.png.problem) return '<div class="upload-split is-blocked"><b>✂ Não dá para dividir este PNG</b><small>' + esc(q.png.problem) + '</small></div>';
  if (!q.png.hasAlpha) return '<div class="upload-split is-blocked"><b>✂ Sem transparência</b><small>Esta imagem não tem fundo transparente: não dá para separar as artes sem cortar.</small></div>';
  return '<div class="upload-split" data-split-box="' + i + '">'
    + '<div class="upload-split-text"><b>✂ Arte com ' + esc(sizeText(height)) + ' de altura</b>'
    + '<small>Divide em partes de até ' + esc(cmText(maxCm)) + ' cm sem cortar nenhuma estampa: corta numa linha sem pixel ou contorna as artes. Você vê até 3 opções e escolhe uma antes de gravar. Os nomes ficam “' + esc(baseName(q)) + ' 1/2”, “' + esc(baseName(q)) + ' 2/2”…</small></div>'
    + '<label class="upload-split-max">Partes de até <input data-split-max="' + i + '" inputmode="decimal" value="' + esc(cmField(maxCm)) + '" aria-label="Altura máxima de cada parte em cm"> cm</label>'
    + '<button type="button" class="btn small upload-split-run" data-split-run="' + i + '"' + (q.splitBusy ? ' disabled' : '') + '>' + (q.splitBusy ? 'Calculando…' : '✂ Ver opções de corte') + '</button>'
    + (q.splitBusy ? '<small class="upload-split-status" data-split-status="' + esc(q.splitKey) + '" role="status">' + esc(q.splitStatus || 'Preparando…') + '</small>' : '')
    + (q.splitError ? '<small class="upload-split-error" role="alert">' + esc(q.splitError) + '</small>' : '')
    + (q.splitNote ? '<small class="upload-split-note" role="status">' + esc(q.splitNote) + '</small>' : '')
    + '</div>';
}
function choiceHTML(q, i) {
  const choice = q.splitChoice, name = baseName(q), anyValid = choice.options.some(o => !o.parts.some(p => p.oversize));
  return '<div class="upload-split is-choosing" data-split-box="' + i + '">'
    + '<div class="upload-split-text"><b>✂ Escolha como dividir “' + esc(name) + '”</b>'
    + '<small><b>Cada cor é uma parte.</b> Confira se nenhuma estampa ficou com duas cores (toque em Ampliar para ver de perto). Nada é gravado antes de você escolher. Escala: ' + esc(choice.from) + '.</small>'
    + (anyValid ? '' : '<small class="upload-split-error">' + esc(choice.background ? 'A imagem parece ter fundo (pixels em toda a área): tire o fundo para poder dividir sem cortar arte.' : 'Nenhuma opção fica toda dentro do limite: alguma arte sozinha passa de ' + cmText(choice.maxCm) + ' cm.') + '</small>') + '</div>'
    + (q.splitBusy ? '<small class="upload-split-status" data-split-status="' + esc(q.splitKey) + '" role="status">' + esc(q.splitStatus || 'Gravando…') + '</small>' : '')
    + (q.splitError ? '<small class="upload-split-error" role="alert">' + esc(q.splitError) + '</small>' : '')
    + '<div class="upload-split-options">' + choice.options.map((option, k) => '<article class="upload-split-option' + (option.recommended ? ' is-recommended' : '') + '">'
      + '<canvas class="upload-split-map" data-split-option="' + i + ':' + k + '" aria-label="Mapa da opção ' + (k + 1) + '"></canvas>'
      + '<div class="upload-split-option-text"><b>Opção ' + (k + 1) + (option.recommended ? ' · recomendada' : '') + '</b><small>' + esc(optionTitle(option)) + (option.balanced ? ' · partes parecidas' : '') + ' · ' + option.parts.length + ' partes</small>'
      + partsListHTML(option.parts, choice.maxCm, name)
      + (!option.straight && option.mergeMm < 3 ? '<small class="upload-split-warn">Peças bem próximas podem ter ido para partes diferentes: confira no mapa.</small>' : '') + '</div>'
      + '<div class="upload-split-option-actions"><button type="button" class="btn small" data-split-zoom="' + i + ':' + k + '">🔍 Ampliar</button><button type="button" class="btn small upload-split-run" data-split-choose="' + i + ':' + k + '"' + (q.splitBusy ? ' disabled' : '') + '>Usar esta opção</button></div>'
      + '</article>').join('') + '</div>'
    + '<button type="button" class="btn small" data-split-cancel="' + i + '"' + (q.splitBusy ? ' disabled' : '') + '>Cancelar</button>'
    + '</div>';
}
function partHTML(q) {
  const p = q.splitPart, group = q.splitGroup;
  if (p.index !== 1) return '<div class="upload-split upload-split-part"><small><i class="upload-split-dot" style="background:' + COLORS[(p.index - 1) % COLORS.length] + '"></i>Parte ' + p.index + ' de ' + p.total + ' de “' + esc(group.name) + '” · medida exata da parte (mesma escala do arquivo)' + (p.oversize ? ' · <b class="upload-split-warn">maior que ' + esc(cmText(group.maxCm)) + ' cm: uma arte sozinha passa do limite</b>' : '') + '</small></div>';
  return '<div class="upload-split is-done">'
    + '<canvas class="upload-split-map" data-split-map="' + esc(group.id) + '" aria-label="Como a arte foi dividida"></canvas>'
    + '<div class="upload-split-text"><b>✂ “' + esc(group.name) + '” dividida em ' + p.total + ' partes</b><small>' + esc(optionTitle(group.option)) + '</small>'
    + partsListHTML(group.option.parts, group.maxCm, group.name)
    + '<small>' + (group.option.straight ? 'Cortes só onde não tem pixel.' : 'O corte contorna as artes: cada parte leva só as artes dela (o resto fica transparente).') + ' Escala: ' + esc(group.from) + '. Cada parte leva os pixels exatos do arquivo, sem redimensionar.</small></div>'
    + '<div class="upload-split-option-actions"><button type="button" class="btn small" data-split-zoom-group="' + esc(group.id) + '">🔍 Ampliar</button><button type="button" class="btn small" data-split-undo="' + esc(group.id) + '">↶ Desfazer divisão</button></div>'
    + '</div>';
}

const thumbCanvas = thumb => {
  const canvas = document.createElement('canvas'); canvas.width = thumb.width; canvas.height = thumb.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(thumb.data), thumb.width, thumb.height), 0, 0);
  return canvas;
};
function partPreview(source, part) {
  try {
    const t = source.thumb, sx = t.width / source.width, sy = t.height / source.height, x = Math.floor(part.left * sx), y = Math.floor(part.top * sy),
      w = Math.max(1, Math.min(t.width - x, Math.ceil(part.width * sx))), h = Math.max(1, Math.min(t.height - y, Math.ceil(part.height * sy))), scale = Math.min(1, 160 / Math.max(w, h)), out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(w * scale)); out.height = Math.max(1, Math.round(h * scale));
    const ctx = out.getContext('2d'); ctx.drawImage(source.thumbCanvas ||= thumbCanvas(t), x, y, w, h, 0, 0, out.width, out.height);
    // o que é de outra parte aparece apagado na miniatura também
    if (source.option?.preview && !source.option.straight) {
      const img = ctx.getImageData(0, 0, out.width, out.height);
      for (let py = 0; py < out.height; py++) for (let px = 0; px < out.width; px++) {
        const tx = Math.min(t.width - 1, x + Math.floor((px + 0.5) / scale)), ty = Math.min(t.height - 1, y + Math.floor((py + 0.5) / scale)), o = source.option.preview[ty * t.width + tx];
        if (o !== part.index - 1) img.data[(py * out.width + px) * 4 + 3] = 0;
      }
      ctx.putImageData(img, 0, 0);
    }
    return out.toDataURL('image/png');
  } catch { return ''; }
}
// Mapa: a arte, cada parte com a sua cor por cima, caixas de cada parte e, no corte reto, a linha do corte.
function drawMap(canvas, source, option) {
  const t = source.thumb, ctx = canvas.getContext('2d'), sx = t.width / source.width, sy = t.height / source.height;
  canvas.width = t.width; canvas.height = t.height;
  const cell = Math.max(4, Math.round(t.height / 120));
  for (let y = 0; y < t.height; y += cell) for (let x = 0; x < t.width; x += cell) { ctx.fillStyle = ((x + y) / cell) % 2 ? '#e2e8f0' : '#f8fafc'; ctx.fillRect(x, y, cell, cell); }
  ctx.drawImage(source.thumbCanvas ||= thumbCanvas(t), 0, 0);
  if (option.preview) {
    const tint = ctx.getImageData(0, 0, t.width, t.height), rgb = COLORS.map(hex => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]);
    for (let k = 0; k < option.preview.length; k++) {
      const o = option.preview[k];
      if (o < 0 || !t.data[k * 4 + 3]) continue;
      const [r, g, b] = rgb[o % rgb.length], d = tint.data, q = k * 4;
      d[q] = Math.round(d[q] * 0.45 + r * 0.55); d[q + 1] = Math.round(d[q + 1] * 0.45 + g * 0.55); d[q + 2] = Math.round(d[q + 2] * 0.45 + b * 0.55);
    }
    ctx.putImageData(tint, 0, 0);
  }
  const line = Math.max(1, Math.round(t.height / 400));
  for (const part of option.parts) { ctx.lineWidth = line; ctx.strokeStyle = COLORS[(part.index - 1) % COLORS.length]; ctx.setLineDash([]); ctx.strokeRect(part.left * sx + line / 2, part.top * sy + line / 2, Math.max(1, part.width * sx - line), Math.max(1, part.height * sy - line)); }
  if (option.mode === 'straight') { ctx.lineWidth = line * 2; ctx.strokeStyle = '#dc2626'; ctx.setLineDash([line * 5, line * 3]); for (const cut of option.cuts) { const y = Math.round(cut * sy) + .5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(t.width, y); ctx.stroke(); } ctx.setLineDash([]); }
  const font = Math.max(11, Math.round(t.height / 45));
  ctx.font = 'bold ' + font + 'px system-ui, sans-serif'; ctx.textBaseline = 'middle';
  for (const part of option.parts) {
    const label = part.index + '/' + part.total, y = (part.top + Math.min(part.height / 2, 400)) * sy, w = ctx.measureText(label).width + font * 0.7;
    ctx.fillStyle = COLORS[(part.index - 1) % COLORS.length]; ctx.fillRect(part.left * sx + 2, y - font * 0.7, w, font * 1.4); ctx.fillStyle = '#fff'; ctx.fillText(label, part.left * sx + 2 + font * 0.35, y);
  }
}
// Ver de perto: a arte grande com as cores de cada parte, para conferir se alguma estampa ficou dividida.
function openZoom(source, option, title) {
  document.querySelector('.upload-split-zoom')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'upload-split-zoom'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', title);
  overlay.innerHTML = '<div class="upload-split-zoom-bar"><b>' + esc(title) + '</b><span>' + option.parts.map(part => '<i style="background:' + COLORS[(part.index - 1) % COLORS.length] + '"></i>' + part.index + '/' + part.total).join(' ') + '</span><div><button type="button" class="btn small" data-zoom-step="-1">−</button><button type="button" class="btn small" data-zoom-step="1">+</button><button type="button" class="btn small" data-zoom-close>Fechar</button></div></div><div class="upload-split-zoom-body"><canvas></canvas></div>';
  document.body.appendChild(overlay);
  const canvas = overlay.querySelector('canvas');
  drawMap(canvas, source, option);
  let zoom = 1;
  const fit = () => { const body = overlay.querySelector('.upload-split-zoom-body'); return Math.min(1, (body.clientHeight - 16) / canvas.height, (body.clientWidth - 16) / canvas.width); };
  const apply = () => { const scale = zoom === 1 ? fit() : zoom === 2 ? 1 : 2; canvas.style.width = Math.round(canvas.width * scale) + 'px'; canvas.style.height = Math.round(canvas.height * scale) + 'px'; };
  apply();
  overlay.querySelectorAll('[data-zoom-step]').forEach(button => button.addEventListener('click', () => { zoom = Math.max(1, Math.min(3, zoom + Number(button.dataset.zoomStep))); apply(); }));
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
  overlay.querySelector('[data-zoom-close]').addEventListener('click', close);
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', onKey, true);
}

// 1º passo: lê o arquivo e monta as opções (nada é gravado).
async function showOptions(q, { rerender, trim }) {
  if (!q || q.splitBusy) return;
  const maxCm = num(q.splitMaxCm) || DEFAULT_MAX_CM;
  if (maxCm < 5 || maxCm > 1000) { q.splitError = 'Use um tamanho de parte entre 5 e 1000 cm.'; rerender(); return; }
  q.splitBusy = true; q.splitError = ''; q.splitNote = ''; q.splitStatus = 'Procurando as linhas sem pixel…'; rerender();
  try {
    const analysis = await analyse(q, 'Procurando as linhas sem pixel'), scale = scaleOf(q, trim(), analysis);
    if (!scale) throw new Error('Digite a largura ou a altura da arte inteira: é ela que diz onde fica cada metro.');
    setStatus(q, 'Montando as opções de corte (sem cortar estampa)…');
    const result = await call('options', { analysis, options: { pxPerCm: scale.pxPerCm, maxCm } });
    if (result.fits) { q.splitNote = 'A arte inteira cabe em ' + cmText(result.options[0].parts[0].heightCm) + ' cm: não precisa dividir.'; return; }
    if (!result.options.some(o => o.parts.length > 1)) { q.splitNote = result.background ? 'A imagem parece ter fundo (pixels em toda a área): tire o fundo para poder dividir sem cortar arte.' : 'Não há como dividir sem cortar arte: as artes estão todas encostadas umas nas outras.'; return; }
    q.splitChoice = { options: result.options, background: result.background, from: scale.from, pxPerCm: scale.pxPerCm, maxCm, signature: choiceSignature(q, trim()) };
  } catch (error) {
    q.splitError = (error?.message || 'Não foi possível montar as opções.') + ' Nada foi alterado.';
  } finally {
    q.splitBusy = false; q.splitStatus = '';
    rerender();
  }
}
// 2º passo: grava a opção escolhida e troca a arte pelas partes.
async function chooseOption(q, k, { queue, rerender, toast }) {
  const choice = q?.splitChoice, option = choice?.options[k];
  if (!option || q.splitBusy) return;
  q.splitBusy = true; q.splitError = ''; q.splitStatus = 'Gravando as partes (pixels do original)…'; rerender();
  try {
    const analysis = await analyse(q, 'Lendo a arte');
    const { written } = await call('split', { blob: q.file, analysis, options: { pxPerCm: choice.pxPerCm, maxCm: choice.maxCm, params: option.params } }, p => setStatus(q, 'Gravando as partes… ' + Math.round(p * 100) + '%'));
    if (written.length !== option.parts.length) throw new Error('As partes gravadas não conferem com a opção escolhida.');
    const list = queue(), at = list.indexOf(q);
    if (at < 0) return;
    const name = baseName(q), exact = PX_PER_CM_300 / choice.pxPerCm <= 1.001;
    const group = { id: globalThis.crypto?.randomUUID?.() || String(Date.now()), original: q, name, from: choice.from, maxCm: choice.maxCm, pxPerCm: choice.pxPerCm, option,
      thumb: analysis.thumb, width: analysis.width, height: analysis.height, sourceName: q.file.name };
    const items = written.map(part => ({
      file: new File([part.blob], partFileName(name, part.index, part.total), { type: 'image/png' }),
      name: partName(name, part.index, part.total), type: 'arte', folderId: q.folderId, showFolder: q.showFolder, readyForPrint: q.readyForPrint,
      widthCm: cmField(part.widthCm), heightCm: cmField(part.heightCm), sizeAxis: 'width', aspectRatio: part.width / part.height,
      standaloneHalftone: false, noOrder: true, autoName: false, preview: partPreview(group, part), splitGroup: group,
      splitPart: { index: part.index, total: part.total, top: part.top, left: part.left, width: part.width, height: part.height, widthCm: part.widthCm, heightCm: part.heightCm,
        pxPerCm: choice.pxPerCm, oversize: part.oversize, exact, sourceWidth: analysis.width, sourceHeight: analysis.height, sourceName: q.file.name, maxCm: choice.maxCm, mode: option.mode, mergeMm: option.mergeMm },
    }));
    q.splitChoice = null;
    list.splice(at, 1, ...items);
    toast('“' + name + '” dividida em ' + items.length + ' partes. Confira e salve.', 'ok');
  } catch (error) {
    q.splitError = (error?.message || 'Não foi possível gravar as partes.') + ' Nada foi alterado.';
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
  const ctx = { queue, rerender, toast, trim }, item = key => { const [i, k] = String(key).split(':').map(Number); return { q: queue()[i], k }; };
  for (const input of list.querySelectorAll('[data-split-max]')) input.addEventListener('change', () => { const q = queue()[+input.dataset.splitMax]; if (!q) return; q.splitMaxCm = input.value.replace(/[^0-9,.]/g, ''); q.splitNote = ''; q.splitError = ''; q.splitChoice = null; rerender(); });
  for (const button of list.querySelectorAll('[data-split-run]')) button.addEventListener('click', () => { const q = queue()[+button.dataset.splitRun], input = list.querySelector('[data-split-max="' + button.dataset.splitRun + '"]'); if (q && input) q.splitMaxCm = input.value.replace(/[^0-9,.]/g, ''); void showOptions(q, ctx); });
  for (const button of list.querySelectorAll('[data-split-choose]')) button.addEventListener('click', () => { const { q, k } = item(button.dataset.splitChoose); void chooseOption(q, k, ctx); });
  for (const button of list.querySelectorAll('[data-split-cancel]')) button.addEventListener('click', () => { const q = queue()[+button.dataset.splitCancel]; if (q && !q.splitBusy) { q.splitChoice = null; q.splitError = ''; rerender(); } });
  for (const button of list.querySelectorAll('[data-split-zoom]')) button.addEventListener('click', () => { const { q, k } = item(button.dataset.splitZoom), option = q?.splitChoice?.options[k]; if (option && q.png?.analysis) openZoom({ thumb: q.png.analysis.thumb, width: q.png.analysis.width, height: q.png.analysis.height }, option, 'Opção ' + (k + 1) + ' · ' + baseName(q)); });
  for (const button of list.querySelectorAll('[data-split-zoom-group]')) button.addEventListener('click', () => { const q = queue().find(x => x.splitGroup?.id === button.dataset.splitZoomGroup); if (q) openZoom(q.splitGroup, q.splitGroup.option, '“' + q.splitGroup.name + '” dividida'); });
  for (const button of list.querySelectorAll('[data-split-undo]')) button.addEventListener('click', () => undoSplit(button.dataset.splitUndo, ctx));
  for (const canvas of list.querySelectorAll('[data-split-option]')) { const { q, k } = item(canvas.dataset.splitOption), option = q?.splitChoice?.options[k]; if (option && q.png?.analysis) try { drawMap(canvas, { thumb: q.png.analysis.thumb, width: q.png.analysis.width, height: q.png.analysis.height }, option); } catch { /* o mapa é só ajuda visual */ } }
  for (const canvas of list.querySelectorAll('[data-split-map]')) { const q = queue().find(x => x.splitGroup?.id === canvas.dataset.splitMap); if (q) try { drawMap(canvas, q.splitGroup, q.splitGroup.option); } catch { /* o mapa é só ajuda visual */ } }
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
    row.metadata = { ...(row.metadata || {}), split_part: { index: p.index, total: p.total, from_file: p.sourceName, source_box: { top: p.top, left: p.left, width: p.width, height: p.height }, source_size: { width: p.sourceWidth, height: p.sourceHeight }, px_per_cm: p.pxPerCm, max_cm: p.maxCm, oversize: p.oversize, exact_pixels: Boolean(p.exact), cut: p.mode === 'contour' ? 'contorno' : 'reto', merge_mm: p.mergeMm ?? null } };
  } else if (result?.engine === 'png-exact') row.metadata = { ...(row.metadata || {}), exact_pixels: true, px_per_cm: result.pxPerCm };
}
// Erro de tamanho do servidor em palavras claras.
export function uploadErrorText(error) {
  const text = String(error?.message || error || '');
  return /exceed|maximum|too large|payload|413/i.test(text) ? 'arquivo maior que o limite de envio do servidor (Supabase). Use “✂ Ver opções de corte” para mandar em partes menores, ou aumente o limite de envio no Supabase.' : text;
}
