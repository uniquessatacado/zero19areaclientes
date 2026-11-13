// 2.17.96 (13/11, dono): subir arte PNG grande (2 m) ou PDF e dividir em partes de até 1 m sem cortar estampa.
// Tela de "Subir arte": "✂ Ver opções de corte" quando a arte passa do limite → até 3 opções com mapa colorido (cada cor
// é uma parte; uma estampa nunca pode ter duas cores), "🔍 Ampliar" para conferir de perto e "🔗 Juntar peças" (toque
// numa peça e na outra: ficam sempre na mesma parte), e "Usar esta opção" (só grava depois de escolher). O corte passa só
// entre as estampas. "Desfazer divisão" volta a arte inteira. Cada parte leva os pixels EXATOS do arquivo: nunca é
// ampliada nem reprocessada ("🔎 Ver em tamanho real" abre a parte para conferir). PDF vira PNG 300 DPI ao escolher.
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
export const isPdf = file => !!file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));
const baseName = q => String(q.name || '').trim() || String(q.file?.name || 'Arte').replace(/\.[^.]+$/, '').trim() || 'Arte';
const mergeText = mm => mm >= 10 ? 'peças a menos de ' + String(mm / 10).replace('.', ',') + ' cm ficam juntas' : mm > 0 ? 'peças a menos de ' + String(mm).replace('.', ',') + ' mm ficam juntas' : 'só peças encostadas ficam juntas';
const dpiOf = pxPerCm => Math.round(pxPerCm * 2.54);

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

// PDF: cada página vira um PNG 300 DPI antes de entrar na lista (o PDF fica como original da arte).
export async function expandFiles(files, { onStatus, toast } = {}) {
  const out = [];
  for (const file of files) {
    if (!isPdf(file)) { out.push(file); continue; }
    onStatus?.('Convertendo o PDF “' + file.name + '” em PNG 300 DPI…');
    try {
      const { pdfToPngs } = await import('./pdf-raster.js?v=2.17.95');
      const pages = await pdfToPngs(file, { onProgress: ({ page, pages, done }) => onStatus?.('Convertendo o PDF “' + file.name + '”' + (pages > 1 ? ' · página ' + page + ' de ' + pages : '') + ' · ' + Math.round(done * 100) + '%') });
      for (const page of pages) { page.file.__fromPdf = { file, page: page.page, pages: page.pages, name: page.name, dpi: page.dpi }; out.push(page.file); }
    } catch (error) {
      toast?.('PDF “' + file.name + '”: ' + (error?.message || 'não foi possível converter.'), 'err');
    }
  }
  onStatus?.('');
  return out;
}

// Ao escolher o arquivo: PNG grande (ou vindo de PDF) é lido linha por linha, sem abrir a imagem inteira no navegador.
// Devolve true quando cuidou da proporção (o 019 não precisa abrir a imagem no canvas).
export async function prepare(q, { trim = true, onChange } = {}) {
  if (!isPng(q.file)) return false;
  const fromPdf = q.file.__fromPdf || null;
  if (fromPdf) { q.originalFile = fromPdf.file; q.fromPdf = { name: fromPdf.file.name, page: fromPdf.page, pages: fromPdf.pages, dpi: fromPdf.dpi }; if (!String(q.name || '').trim()) q.name = fromPdf.name; }
  let info;
  try { info = await readPngInfo(q.file); } catch { return false; }
  q.splitKey ||= (globalThis.crypto?.randomUUID?.() || String(Math.random()).slice(2));
  q.png = { width: info.width, height: info.height, ppm: info.ppm, dpi: info.dpi, problem: info.problem, hasAlpha: info.hasAlpha, big: info.width * info.height > BIG_PNG_PIXELS };
  if (!(q.png.big || fromPdf) || info.problem || !info.hasAlpha) return false;
  q.png.reading = true;
  analyse(q, fromPdf ? 'Lendo o PDF convertido' : 'Lendo a arte grande').then(analysis => {
    q.png.reading = false;
    const box = trim ? analysis.box : { width: analysis.width, height: analysis.height };
    if (box?.width > 0 && box.height > 0) {
      q.aspectRatio = box.width / box.height;
      const w = num(q.widthCm), h = num(q.heightCm);
      // PDF tem tamanho real: a medida da arte já vem pronta (300 DPI), a pessoa só confere.
      if (fromPdf && !(w > 0) && !(h > 0)) { q.widthCm = cmField(box.width / PX_PER_CM_300); q.heightCm = cmField(box.height / PX_PER_CM_300); q.sizeAxis = 'width'; q.fromPdf.prefill = q.widthCm + '|' + q.heightCm; }
      else if (w > 0 && !(h > 0)) q.heightCm = cmField(w / q.aspectRatio);
      else if (h > 0 && !(w > 0)) q.widthCm = cmField(h * q.aspectRatio);
    }
    onChange?.();
  }, error => { q.png.reading = false; q.png.readError = error.message; onChange?.(); });
  return true;
}

// Escala do arquivo (pixels por cm): pela medida digitada da arte inteira (como o 019 mede: arte sem prancheta) ou pelo DPI.
// PDF com a medida que veio dele (não mexida): escala exata de 300 DPI (a medida na tela é arredondada).
const pdfExact = q => !!q.fromPdf?.prefill && q.fromPdf.prefill === q.widthCm + '|' + q.heightCm;
function scaleOf(q, trim, analysis) {
  if (pdfExact(q)) return { pxPerCm: PX_PER_CM_300, from: 'tamanho real do PDF (300 DPI)' };
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
const choiceSignature = (q, trim) => [q.widthCm, q.heightCm, q.sizeAxis, num(q.splitMaxCm) || DEFAULT_MAX_CM, trim ? 1 : 0, (q.splitJoins || []).length].join('|');
export const busy = queue => (queue || []).some(q => q.splitBusy);

function optionTitle(option) {
  const parts = option.parts, top = Math.min(...parts.map(p => p.top));
  if (option.straight) return 'Corte reto entre as estampas' + (option.cuts.length ? ' a ' + option.cuts.map(cut => cmShort((cut - top) / option.pxPerCm) + ' cm').join(' e ') : '') + (option.mergeMm !== null ? ' · ' + mergeText(option.mergeMm) : '');
  return 'Contorna as estampas · ' + mergeText(option.mergeMm);
}
function partsListHTML(parts, maxCm, name) {
  return '<ul>' + [...parts].sort((a, b) => a.index - b.index).map(part => '<li' + (part.oversize ? ' class="upload-split-warn"' : '') + '><i style="background:' + COLORS[(part.index - 1) % COLORS.length] + '"></i>' + esc(partName(name, part.index, part.total)) + ' · ' + esc(cmText(part.widthCm)) + ' × ' + esc(cmText(part.heightCm)) + ' cm' + (part.oversize ? ' · maior que ' + esc(cmText(maxCm)) + ' cm (uma arte sozinha passa do limite)' : '') + '</li>').join('') + '</ul>';
}
const qualityHTML = pxPerCm => '<small class="upload-split-quality' + (dpiOf(pxPerCm) < 200 ? ' upload-split-warn' : '') + '">Qualidade: os pixels do arquivo, sem ampliar nem reduzir (' + dpiOf(pxPerCm) + ' DPI na medida' + (dpiOf(pxPerCm) < 200 ? ': o arquivo original já é de baixa resolução' : '') + ').</small>';

export function boxHTML(q, i, { trim = true } = {}) {
  if (q.type !== 'arte') return '';
  if (q.splitPart) return partHTML(q, i);
  const pdf = q.fromPdf ? '<div class="upload-split upload-split-mini upload-split-pdf"><small>PDF convertido em PNG 300 DPI no tamanho real do PDF' + (q.fromPdf.pages > 1 ? ' (página ' + q.fromPdf.page + ' de ' + q.fromPdf.pages + ')' : '') + '. O PDF original fica guardado junto.</small></div>' : '';
  if (!q.png || !isPng(q.file)) return pdf;
  if (q.splitChoice && q.splitChoice.signature !== choiceSignature(q, trim)) q.splitChoice = null;
  if (q.splitChoice) return pdf + choiceHTML(q, i);
  const maxCm = num(q.splitMaxCm) || DEFAULT_MAX_CM, height = heightCmOf(q);
  if (q.png.reading && !q.splitBusy) return pdf + '<div class="upload-split upload-split-mini"><small data-split-status="' + esc(q.splitKey) + '">' + esc(q.splitStatus || 'Lendo a arte grande…') + '</small></div>';
  if (!(height > maxCm) && !q.splitError && !q.splitNote) return pdf;
  if (q.png.problem) return pdf + '<div class="upload-split is-blocked"><b>✂ Não dá para dividir este PNG</b><small>' + esc(q.png.problem) + '</small></div>';
  if (!q.png.hasAlpha) return pdf + '<div class="upload-split is-blocked"><b>✂ Sem transparência</b><small>Esta imagem não tem fundo transparente: não dá para separar as artes sem cortar.</small></div>';
  return pdf + '<div class="upload-split" data-split-box="' + i + '">'
    + '<div class="upload-split-text"><b>✂ Arte com ' + esc(sizeText(height)) + ' de altura</b>'
    + '<small>Divide em partes de até ' + esc(cmText(maxCm)) + ' cm sem cortar nenhuma estampa: o corte passa só entre as estampas (reto quando há espaço vazio entre elas, contornando quando não há). Você vê até 3 opções e escolhe uma antes de gravar. Os nomes ficam “' + esc(baseName(q)) + ' 1/2”, “' + esc(baseName(q)) + ' 2/2”…</small></div>'
    + '<label class="upload-split-max">Partes de até <input data-split-max="' + i + '" inputmode="decimal" value="' + esc(cmField(maxCm)) + '" aria-label="Altura máxima de cada parte em cm"> cm</label>'
    + '<button type="button" class="btn small upload-split-run" data-split-run="' + i + '"' + (q.splitBusy ? ' disabled' : '') + '>' + (q.splitBusy ? 'Calculando…' : '✂ Ver opções de corte') + '</button>'
    + (q.splitBusy ? '<small class="upload-split-status" data-split-status="' + esc(q.splitKey) + '" role="status">' + esc(q.splitStatus || 'Preparando…') + '</small>' : '')
    + (q.splitError ? '<small class="upload-split-error" role="alert">' + esc(q.splitError) + '</small>' : '')
    + (q.splitNote ? '<small class="upload-split-note" role="status">' + esc(q.splitNote) + '</small>' : '')
    + ((q.splitJoins || []).length ? '<small class="upload-split-note">🔗 ' + q.splitJoins.length + (q.splitJoins.length === 1 ? ' junção feita por você' : ' junções feitas por você') + '. <button type="button" class="btn small" data-split-unjoin="' + i + '">Desfazer junções</button></small>' : '')
    + '</div>';
}
function choiceHTML(q, i) {
  const choice = q.splitChoice, name = baseName(q), anyValid = choice.options.some(o => !o.parts.some(p => p.oversize)), joins = (q.splitJoins || []).length;
  return '<div class="upload-split is-choosing" data-split-box="' + i + '">'
    + '<div class="upload-split-text"><b>✂ Escolha como dividir “' + esc(name) + '”</b>'
    + '<small><b>Cada cor é uma parte.</b> Confira se nenhuma estampa ficou com duas cores: toque em <b>Ampliar</b> para ver de perto e, se uma estampa estiver separada, use <b>🔗 Juntar peças</b> ali dentro. Nada é gravado antes de você escolher. Escala: ' + esc(choice.from) + '.</small>'
    + (joins ? '<small class="upload-split-note">🔗 ' + joins + (joins === 1 ? ' junção feita por você' : ' junções feitas por você') + ' (essas peças ficam sempre na mesma parte). <button type="button" class="btn small" data-split-unjoin="' + i + '">Desfazer junções</button></small>' : '')
    + (anyValid ? '' : '<small class="upload-split-error">' + esc(choice.background ? 'A imagem parece ter fundo (pixels em toda a área): tire o fundo para poder dividir sem cortar arte.' : 'Nenhuma opção fica toda dentro do limite: alguma arte (ou peças juntadas) passa de ' + cmText(choice.maxCm) + ' cm.') + '</small>')
    + qualityHTML(choice.pxPerCm) + '</div>'
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
function partHTML(q, i) {
  const p = q.splitPart, group = q.splitGroup, open = '<button type="button" class="btn small" data-split-open="' + i + '">🔎 Ver em tamanho real</button>', dims = p.width + ' × ' + p.height + ' px · ' + dpiOf(p.pxPerCm) + ' DPI';
  if (p.index !== 1) return '<div class="upload-split upload-split-part"><small><i class="upload-split-dot" style="background:' + COLORS[(p.index - 1) % COLORS.length] + '"></i>Parte ' + p.index + ' de ' + p.total + ' de “' + esc(group.name) + '” · ' + esc(dims) + ' · pixels do arquivo, sem ampliar' + (p.oversize ? ' · <b class="upload-split-warn">maior que ' + esc(cmText(group.maxCm)) + ' cm: uma arte sozinha passa do limite</b>' : '') + '</small>' + open + '</div>';
  return '<div class="upload-split is-done">'
    + '<canvas class="upload-split-map" data-split-map="' + esc(group.id) + '" aria-label="Como a arte foi dividida"></canvas>'
    + '<div class="upload-split-text"><b>✂ “' + esc(group.name) + '” dividida em ' + p.total + ' partes</b><small>' + esc(optionTitle(group.option)) + '</small>'
    + partsListHTML(group.option.parts, group.maxCm, group.name)
    + '<small>' + (group.option.straight ? 'Corte reto entre as estampas.' : 'O corte contorna as estampas: cada parte leva só as estampas dela (o resto fica transparente).') + ' Escala: ' + esc(group.from) + '. Esta parte: ' + esc(dims) + '.</small>'
    + qualityHTML(p.pxPerCm) + '</div>'
    + '<div class="upload-split-option-actions">' + open + '<button type="button" class="btn small" data-split-zoom-group="' + esc(group.id) + '">🔍 Ampliar</button><button type="button" class="btn small" data-split-undo="' + esc(group.id) + '">↶ Desfazer divisão</button></div>'
    + '</div>';
}

const thumbCanvas = thumb => {
  const canvas = document.createElement('canvas'); canvas.width = thumb.width; canvas.height = thumb.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(thumb.data), thumb.width, thumb.height), 0, 0);
  return canvas;
};
// Miniatura da parte: feita pela média dos pixels da própria parte (nítida), na gravação.
function partPreview(preview) {
  try { return thumbCanvas(preview).toDataURL('image/png'); } catch { return ''; }
}
// Mapa: a arte, cada parte com a sua cor por cima, caixas de cada parte, a linha do corte reto e as peças juntadas.
function drawMap(canvas, source, option, joins = [], pending = null) {
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
  if (option.straight && option.cuts?.length) { ctx.lineWidth = line * 2; ctx.strokeStyle = '#dc2626'; ctx.setLineDash([line * 5, line * 3]); for (const cut of option.cuts) { const y = Math.round(cut * sy) + .5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(t.width, y); ctx.stroke(); } ctx.setLineDash([]); }
  const dot = Math.max(4, Math.round(t.height / 150));
  ctx.lineWidth = Math.max(2, line * 2); ctx.strokeStyle = '#0f172a'; ctx.fillStyle = '#facc15';
  for (const [x1, y1, x2, y2] of joins) { ctx.beginPath(); ctx.moveTo(x1 * sx, y1 * sy); ctx.lineTo(x2 * sx, y2 * sy); ctx.stroke(); for (const [x, y] of [[x1, y1], [x2, y2]]) { ctx.beginPath(); ctx.arc(x * sx, y * sy, dot, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } }
  if (pending) { ctx.beginPath(); ctx.arc(pending[0] * sx, pending[1] * sy, dot * 1.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  const font = Math.max(11, Math.round(t.height / 45));
  ctx.font = 'bold ' + font + 'px system-ui, sans-serif'; ctx.textBaseline = 'middle';
  for (const part of option.parts) {
    const label = part.index + '/' + part.total, y = (part.top + Math.min(part.height / 2, 400)) * sy, w = ctx.measureText(label).width + font * 0.7;
    ctx.fillStyle = COLORS[(part.index - 1) % COLORS.length]; ctx.fillRect(part.left * sx + 2, y - font * 0.7, w, font * 1.4); ctx.fillStyle = '#fff'; ctx.fillText(label, part.left * sx + 2 + font * 0.35, y);
  }
}
// Ver de perto (e juntar peças): a arte grande com as cores de cada parte.
function openZoom(source, option, title, join = null) {
  document.querySelector('.upload-split-zoom')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'upload-split-zoom'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', title);
  overlay.innerHTML = '<div class="upload-split-zoom-bar"><b>' + esc(title) + '</b><span>' + option.parts.map(part => '<i style="background:' + COLORS[(part.index - 1) % COLORS.length] + '"></i>' + part.index + '/' + part.total).join(' ') + '</span><div>'
    + (join ? '<button type="button" class="btn small" data-zoom-join>🔗 Juntar peças</button>' : '')
    + '<button type="button" class="btn small" data-zoom-step="-1" aria-label="Diminuir">−</button><button type="button" class="btn small" data-zoom-step="1" aria-label="Aumentar">+</button><button type="button" class="btn small" data-zoom-close>Fechar</button></div></div>'
    + (join ? '<div class="upload-split-zoom-join" hidden><b>🔗 Toque numa peça da estampa e depois na outra peça</b><span data-zoom-join-text></span><div><button type="button" class="btn small" data-zoom-join-undo>Desfazer a última</button><button type="button" class="btn small upload-split-run" data-zoom-join-done>Refazer as opções com as peças juntas</button></div></div>' : '')
    + '<div class="upload-split-zoom-body"><canvas></canvas></div>';
  document.body.appendChild(overlay);
  const canvas = overlay.querySelector('canvas'), joins = join ? [...(join.joins || [])] : [];
  let zoom = 1, joining = false, pending = null;
  const redraw = () => drawMap(canvas, source, option, joins, pending);
  redraw();
  const fit = () => { const body = overlay.querySelector('.upload-split-zoom-body'); return Math.min(1, (body.clientHeight - 16) / canvas.height, (body.clientWidth - 16) / canvas.width); };
  const apply = () => { const scale = zoom === 1 ? fit() : zoom === 2 ? 1 : 2; canvas.style.width = Math.round(canvas.width * scale) + 'px'; canvas.style.height = Math.round(canvas.height * scale) + 'px'; };
  apply();
  const joinText = () => { const node = overlay.querySelector('[data-zoom-join-text]'); if (node) node.textContent = pending ? 'Agora toque na outra peça.' : joins.length ? joins.length + (joins.length === 1 ? ' junção' : ' junções') + ' · toque em outra peça para juntar mais.' : 'Ex.: toque no desenho e depois na frase embaixo dele.'; };
  overlay.querySelectorAll('[data-zoom-step]').forEach(button => button.addEventListener('click', () => { zoom = Math.max(1, Math.min(3, zoom + Number(button.dataset.zoomStep))); apply(); }));
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
  overlay.querySelector('[data-zoom-close]').addEventListener('click', close);
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', onKey, true);
  if (!join) return;
  const panel = overlay.querySelector('.upload-split-zoom-join');
  overlay.querySelector('[data-zoom-join]').addEventListener('click', () => { joining = !joining; panel.hidden = !joining; canvas.style.cursor = joining ? 'crosshair' : ''; pending = null; joinText(); redraw(); });
  canvas.addEventListener('click', event => {
    if (!joining) return;
    const rect = canvas.getBoundingClientRect(), tx = Math.min(canvas.width - 1, Math.max(0, Math.floor((event.clientX - rect.left) / rect.width * canvas.width))), ty = Math.min(canvas.height - 1, Math.max(0, Math.floor((event.clientY - rect.top) / rect.height * canvas.height)));
    const t = source.thumb;
    let hit = false;
    for (let d = 0; d <= 3 && !hit; d++) for (let dy = -d; dy <= d && !hit; dy++) for (let dx = -d; dx <= d && !hit; dx++) { const xx = tx + dx, yy = ty + dy; if (xx >= 0 && yy >= 0 && xx < t.width && yy < t.height && t.data[(yy * t.width + xx) * 4 + 3] > 0) hit = true; }
    if (!hit) { const node = overlay.querySelector('[data-zoom-join-text]'); if (node) node.textContent = 'Toque em cima de uma arte (não no espaço vazio).'; return; }
    const point = [Math.round((tx + 0.5) * source.width / t.width), Math.round((ty + 0.5) * source.height / t.height)];
    if (!pending) pending = point; else { joins.push([...pending, ...point]); pending = null; }
    joinText(); redraw();
  });
  overlay.querySelector('[data-zoom-join-undo]').addEventListener('click', () => { if (pending) pending = null; else joins.pop(); joinText(); redraw(); });
  overlay.querySelector('[data-zoom-join-done]').addEventListener('click', () => { close(); join.onDone(joins); });
  joinText();
}

// 1º passo: lê o arquivo e monta as opções (nada é gravado).
async function showOptions(q, { rerender, trim }) {
  if (!q || q.splitBusy) return;
  const maxCm = num(q.splitMaxCm) || DEFAULT_MAX_CM;
  if (maxCm < 5 || maxCm > 1000) { q.splitError = 'Use um tamanho de parte entre 5 e 1000 cm.'; rerender(); return; }
  q.splitBusy = true; q.splitError = ''; q.splitNote = ''; q.splitChoice = null; q.splitStatus = 'Procurando as estampas…'; rerender();
  try {
    const analysis = await analyse(q, 'Procurando as estampas'), scale = scaleOf(q, trim(), analysis);
    if (!scale) throw new Error('Digite a largura ou a altura da arte inteira: é ela que diz onde fica cada metro.');
    setStatus(q, 'Montando as opções de corte (sem cortar estampa)…');
    const result = await call('options', { analysis, options: { pxPerCm: scale.pxPerCm, maxCm, joins: q.splitJoins || [] } });
    if (result.fits) { q.splitNote = 'A arte inteira cabe em ' + cmText(result.options[0].parts[0].heightCm) + ' cm: não precisa dividir.'; return; }
    if (!result.options.some(o => o.parts.length > 1)) { q.splitNote = result.background ? 'A imagem parece ter fundo (pixels em toda a área): tire o fundo para poder dividir sem cortar arte.' : 'Não há como dividir sem cortar arte: as artes estão todas encostadas umas nas outras (ou as peças juntadas passam do limite).'; return; }
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
    const name = baseName(q);
    const group = { id: globalThis.crypto?.randomUUID?.() || String(Date.now()), original: q, name, from: choice.from, maxCm: choice.maxCm, pxPerCm: choice.pxPerCm, option,
      thumb: analysis.thumb, width: analysis.width, height: analysis.height, sourceName: q.originalFile?.name || q.file.name };
    const items = written.map(part => ({
      file: new File([part.blob], partFileName(name, part.index, part.total), { type: 'image/png' }),
      name: partName(name, part.index, part.total), type: 'arte', folderId: q.folderId, showFolder: q.showFolder, readyForPrint: q.readyForPrint,
      widthCm: cmField(part.widthCm), heightCm: cmField(part.heightCm), sizeAxis: 'width', aspectRatio: part.width / part.height,
      standaloneHalftone: false, noOrder: true, autoName: false, preview: part.preview ? partPreview(part.preview) : '', splitGroup: group, fromPdf: q.fromPdf || null, originalFile: q.originalFile || undefined,
      // a parte nunca é ampliada nem reprocessada: os pixels do arquivo valem como estão (13/11 (4), dono: "não era para mudar a qualidade")
      splitPart: { index: part.index, total: part.total, top: part.top, left: part.left, width: part.width, height: part.height, widthCm: part.widthCm, heightCm: part.heightCm,
        pxPerCm: choice.pxPerCm, oversize: part.oversize, exact: true, sourceWidth: analysis.width, sourceHeight: analysis.height, sourceName: group.sourceName, maxCm: choice.maxCm, mode: option.mode, mergeMm: option.mergeMm, joins: (option.params.joins || []).length },
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
  const sourceOf = q => ({ thumb: q.png.analysis.thumb, width: q.png.analysis.width, height: q.png.analysis.height });
  for (const input of list.querySelectorAll('[data-split-max]')) input.addEventListener('change', () => { const q = queue()[+input.dataset.splitMax]; if (!q) return; q.splitMaxCm = input.value.replace(/[^0-9,.]/g, ''); q.splitNote = ''; q.splitError = ''; q.splitChoice = null; rerender(); });
  for (const button of list.querySelectorAll('[data-split-run]')) button.addEventListener('click', () => { const q = queue()[+button.dataset.splitRun], input = list.querySelector('[data-split-max="' + button.dataset.splitRun + '"]'); if (q && input) q.splitMaxCm = input.value.replace(/[^0-9,.]/g, ''); void showOptions(q, ctx); });
  for (const button of list.querySelectorAll('[data-split-choose]')) button.addEventListener('click', () => { const { q, k } = item(button.dataset.splitChoose); void chooseOption(q, k, ctx); });
  for (const button of list.querySelectorAll('[data-split-cancel]')) button.addEventListener('click', () => { const q = queue()[+button.dataset.splitCancel]; if (q && !q.splitBusy) { q.splitChoice = null; q.splitError = ''; rerender(); } });
  for (const button of list.querySelectorAll('[data-split-unjoin]')) button.addEventListener('click', () => { const q = queue()[+button.dataset.splitUnjoin]; if (q && !q.splitBusy) { q.splitJoins = []; void showOptions(q, ctx); } });
  for (const button of list.querySelectorAll('[data-split-zoom]')) button.addEventListener('click', () => {
    const { q, k } = item(button.dataset.splitZoom), option = q?.splitChoice?.options[k];
    if (option && q.png?.analysis) openZoom(sourceOf(q), option, 'Opção ' + (k + 1) + ' · ' + baseName(q), { joins: q.splitJoins || [], onDone: joins => { q.splitJoins = joins; void showOptions(q, ctx); } });
  });
  for (const button of list.querySelectorAll('[data-split-zoom-group]')) button.addEventListener('click', () => { const q = queue().find(x => x.splitGroup?.id === button.dataset.splitZoomGroup); if (q) openZoom(q.splitGroup, q.splitGroup.option, '“' + q.splitGroup.name + '” dividida'); });
  for (const button of list.querySelectorAll('[data-split-open]')) button.addEventListener('click', () => { const q = queue()[+button.dataset.splitOpen]; if (!q?.file) return; const url = URL.createObjectURL(q.file); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 120000); });
  for (const button of list.querySelectorAll('[data-split-undo]')) button.addEventListener('click', () => undoSplit(button.dataset.splitUndo, ctx));
  for (const canvas of list.querySelectorAll('[data-split-option]')) { const { q, k } = item(canvas.dataset.splitOption), option = q?.splitChoice?.options[k]; if (option && q.png?.analysis) try { drawMap(canvas, sourceOf(q), option, q.splitJoins || []); } catch { /* o mapa é só ajuda visual */ } }
  for (const canvas of list.querySelectorAll('[data-split-map]')) { const q = queue().find(x => x.splitGroup?.id === canvas.dataset.splitMap); if (q) try { drawMap(canvas, q.splitGroup, q.splitGroup.option, q.splitGroup.option.params?.joins || []); } catch { /* o mapa é só ajuda visual */ } }
}

// Ao salvar: parte dividida vai com os pixels exatos (nunca ampliada nem reprocessada); PNG grande (ou vindo de PDF)
// também, desde que tenha pelo menos 100 DPI na medida (abaixo disso segue o caminho de sempre do 019, que amplia).
export async function exactResult(q, { trim, widthCm, heightCm, byHeight, onStage }) {
  if (q.splitPart) {
    if (!q.splitPart.exact) return null;
    return { blob: q.file, width: q.splitPart.width, height: q.splitPart.height, sourceWidth: q.splitPart.sourceWidth, sourceHeight: q.splitPart.sourceHeight, upscaled: false, engine: 'png-split', targetPixels: null, pxPerCm: q.splitPart.pxPerCm };
  }
  if (!(q.png?.big || q.fromPdf) || q.type !== 'arte' || !trim || q.png.problem || !q.png.hasAlpha || !(widthCm > 0 || heightCm > 0)) return null;
  onStage?.('Lendo a arte…');
  const analysis = await analyse(q, 'Lendo a arte'), box = analysis.box;
  if (!box) return null;
  const pxPerCm = pdfExact(q) ? PX_PER_CM_300 : byHeight ? box.height / heightCm : box.width / widthCm;
  if (PX_PER_CM_300 / pxPerCm > 3) return null;
  onStage?.('Gravando o PNG final com os pixels do original…');
  const [part] = await call('write', { blob: q.file, analysis, parts: [{ ...box, index: 1, total: 1 }], options: { pxPerCm } }, p => onStage?.('Gravando o PNG final… ' + Math.round(p * 100) + '%'));
  return { blob: part.blob, width: box.width, height: box.height, sourceWidth: analysis.width, sourceHeight: analysis.height, upscaled: false, engine: 'png-exact',
    targetPixels: { axis: byHeight ? 'height' : 'width', pixels: byHeight ? box.height : box.width, cm: byHeight ? heightCm : widthCm }, pxPerCm };
}
export function decorateAsset(row, q, result) {
  if (result?.pxPerCm > 0 && !result.upscaled) row.dpi = dpiOf(result.pxPerCm);
  const meta = { ...(row.metadata || {}) };
  if (q.fromPdf) meta.from_pdf = { name: q.fromPdf.name, page: q.fromPdf.page, pages: q.fromPdf.pages, dpi: q.fromPdf.dpi };
  if (q.splitPart) {
    const p = q.splitPart;
    meta.split_part = { index: p.index, total: p.total, from_file: p.sourceName, source_box: { top: p.top, left: p.left, width: p.width, height: p.height }, source_size: { width: p.sourceWidth, height: p.sourceHeight }, px_per_cm: p.pxPerCm, max_cm: p.maxCm, oversize: p.oversize, exact_pixels: Boolean(p.exact), cut: p.mode === 'contour' ? 'contorno' : 'reto', merge_mm: p.mergeMm ?? null, joins: p.joins || 0 };
  } else if (result?.engine === 'png-exact') Object.assign(meta, { exact_pixels: true, px_per_cm: result.pxPerCm });
  row.metadata = meta;
}
// Erro de tamanho do servidor em palavras claras.
export function uploadErrorText(error) {
  const text = String(error?.message || error || '');
  return /exceed|maximum|too large|payload|413/i.test(text) ? 'arquivo maior que o limite de envio do servidor (Supabase). Use “✂ Ver opções de corte” para mandar em partes menores, ou aumente o limite de envio no Supabase.' : text;
}
