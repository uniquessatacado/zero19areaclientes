// Área do cliente DTF por metro (13/11, dono): "quando ele subir a arte já corta a sobra, joga em 300 DPI igual o nosso faz
// quando sobe arte". Igual ao 019:
//  - PNG: lido aos pedaços (sem abrir a imagem inteira; PNG de 1 m não trava o celular), corte até o último pixel visível
//    (alfa ≥ 8, até 2 px de borda suave). Se a arte já tem 300 DPI ou mais na medida escolhida, o PNG final sai com os
//    pixels EXATOS do original (DPI real gravado no arquivo). Abaixo de 300 DPI o arquivo é ampliado para 300 DPI.
//  - PDF: cada página vira PNG transparente de 300 DPI no tamanho real da página (pdf.js); o PDF fica guardado como original.
//  - JPG/WEBP: não têm transparência (o fundo também é impresso): avisa. São abertos pelo navegador.
import { readPngInfo, scanPng, writeParts, VISIBLE_ALPHA } from './png-split.js?v=2.17.95';
import { isPdf, pdfToPngs } from './pdf-raster.js?v=2.17.96';

export const TARGET_DPI = 300;
const CM_PER_INCH = 2.54;
export const ACCEPT = '.png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf';
const coarse = () => { try { return matchMedia('(pointer: coarse)').matches || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent); } catch { return false; } };
// Maior imagem que o navegador desenha com segurança (Safari do iPhone: 16,7 milhões de pixels).
export const canvasLimit = () => coarse() ? 16e6 : 40e6;
export const dpiOf = (pixels, cm) => pixels / (cm / CM_PER_INCH);
export const cmOf = (pixels, dpi) => pixels / dpi * CM_PER_INCH;
export function quality(dpi) {
  if (dpi >= 295) return { level: 'great', label: 'Ótima · ' + Math.round(dpi) + ' DPI' };
  if (dpi >= 200) return { level: 'good', label: 'Boa · ' + Math.round(dpi) + ' DPI' };
  if (dpi >= 150) return { level: 'fair', label: 'Regular · ' + Math.round(dpi) + ' DPI' };
  return { level: 'low', label: 'Baixa · ' + Math.round(dpi) + ' DPI' };
}
const baseName = name => String(name || 'Arte').replace(/\.(png|jpe?g|webp|pdf)$/i, '').replace(/[_]+/g, ' ').trim().slice(0, 100) || 'Arte';
const kindOf = file => isPdf(file) ? 'pdf' : /png$/i.test(file.type) || /\.png$/i.test(file.name || '') ? 'png' : /jpe?g$/i.test(file.type) || /\.jpe?g$/i.test(file.name || '') ? 'jpg' : /webp$/i.test(file.type) || /\.webp$/i.test(file.name || '') ? 'webp' : '';

// ── Leitura do PNG fora da tela (o mesmo trabalhador do "Dividir em partes" do 019) ──
let worker = null, workerBroken = false, seq = 0;
const pending = new Map();
function getWorker() {
  if (worker || workerBroken || typeof Worker === 'undefined') return worker;
  try {
    worker = new Worker(new URL('./png-split-worker.js?v=2.17.96', import.meta.url), { type: 'module' });
    worker.onmessage = event => { const { id, progress, result, error } = event.data || {}, job = pending.get(id); if (!job) return; if (progress !== undefined) { job.onProgress?.(progress); return; } pending.delete(id); error ? job.reject(new Error(error)) : job.resolve(result); };
    worker.onerror = () => { workerBroken = true; for (const job of pending.values()) job.reject(new Error('worker')); pending.clear(); worker = null; };
  } catch { workerBroken = true; worker = null; }
  return worker;
}
async function call(op, payload, onProgress) {
  const w = getWorker();
  if (w) {
    try { return await new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject, onProgress }); w.postMessage({ id, op, ...payload }); }); }
    catch (error) { if (error?.message !== 'worker') throw error; }
  }
  if (op === 'scan') return scanPng(payload.blob, { onProgress });
  if (op === 'write') return writeParts(payload.blob, payload.analysis, payload.parts, { ...(payload.options || {}), onProgress });
  throw new Error('Operação desconhecida.');
}

// ── PNG: gravar/trocar o DPI (pHYs) de um PNG feito pelo navegador ──
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = bytes => { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export async function setPngDpi(blob, dpi) {
  const bytes = new Uint8Array(await blob.arrayBuffer()), view = new DataView(bytes.buffer), parts = [bytes.subarray(0, 8)];
  let offset = 8, inserted = false;
  const ppm = Math.round(dpi / 0.0254), chunk = new Uint8Array(21), cv = new DataView(chunk.buffer);
  cv.setUint32(0, 9); chunk.set([112, 72, 89, 115], 4); cv.setUint32(8, ppm); cv.setUint32(12, ppm); chunk[16] = 1; cv.setUint32(17, crc(chunk.subarray(4, 17)));
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset), type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)), end = offset + 12 + length;
    if (type !== 'pHYs') parts.push(bytes.subarray(offset, end));
    if (type === 'IHDR' && !inserted) { parts.push(chunk); inserted = true; }
    offset = end;
    if (type === 'IEND') break;
  }
  return new Blob(parts, { type: 'image/png' });
}
const canvasToBlob = (canvas, type = 'image/png', q) => new Promise((resolve, reject) => {
  if (canvas.convertToBlob) { canvas.convertToBlob({ type, quality: q }).then(resolve, reject); return; }
  canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('O navegador não conseguiu gravar a imagem (memória cheia?).')), type, q);
});
const makeCanvas = (w, h) => { if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h); const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// Miniatura leve (até 480 px) para a tela: média dos pixels (nítida, sem serrilhado).
async function thumbFromRgba(data, w, h, crop) {
  const c = makeCanvas(crop.width, crop.height), ctx = c.getContext('2d');
  const image = new ImageData(crop.width, crop.height);
  for (let y = 0; y < crop.height; y++) image.data.set(data.subarray(((crop.top + y) * w + crop.left) * 4, ((crop.top + y) * w + crop.left + crop.width) * 4), y * crop.width * 4);
  ctx.putImageData(image, 0, 0);
  return canvasToBlob(c);
}
async function thumbFromSource(source, sw, sh, box, max = 480) {
  const scale = Math.min(1, max / Math.max(box.width, box.height)), w = Math.max(1, Math.round(box.width * scale)), h = Math.max(1, Math.round(box.height * scale));
  // Reduz em passos de metade para a miniatura ficar nítida.
  let current = source, cw = sw, ch = sh, sx = box.left, sy = box.top, sWidth = box.width, sHeight = box.height;
  while (sWidth / 2 > w * 1.01 && sHeight / 2 > h * 1.01) {
    const nw = Math.max(1, Math.round(sWidth / 2)), nh = Math.max(1, Math.round(sHeight / 2)), step = makeCanvas(nw, nh), sctx = step.getContext('2d');
    sctx.imageSmoothingQuality = 'high'; sctx.drawImage(current, sx, sy, sWidth, sHeight, 0, 0, nw, nh);
    current = step; cw = nw; ch = nh; sx = 0; sy = 0; sWidth = nw; sHeight = nh;
  }
  const c = makeCanvas(w, h), ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(current, sx, sy, sWidth, sHeight, 0, 0, w, h);
  void cw; void ch;
  return canvasToBlob(c);
}
function alphaBox(data, w, h) {
  let top = -1, bottom = -1, left = w, right = -1;
  for (let y = 0; y < h; y++) {
    let rowLeft = -1, rowRight = -1;
    for (let x = 0, i = y * w * 4 + 3; x < w; x++, i += 4) if (data[i] >= VISIBLE_ALPHA) { if (rowLeft < 0) rowLeft = x; rowRight = x; }
    if (rowLeft >= 0) { if (top < 0) top = y; bottom = y; left = Math.min(left, rowLeft); right = Math.max(right, rowRight); }
  }
  if (top < 0) return null;
  // Até 2 px de borda suave (alfa baixo) em volta, como no 019.
  top = Math.max(0, top - 2); bottom = Math.min(h - 1, bottom + 2); left = Math.max(0, left - 2); right = Math.min(w - 1, right + 2);
  return { top, left, width: right - left + 1, height: bottom - top + 1, bottom, right };
}

// ── 1º passo: ler cada arquivo (sem gravar nada) ──
// Devolve uma lista (PDF de várias páginas = várias artes). Cada uma: nome, caixa da arte, DPI do arquivo, medida sugerida,
// miniatura e avisos.
export async function analyzeFile(file, { onStage } = {}) {
  const kind = kindOf(file);
  if (!kind) throw new Error('Formato não aceito. Envie PNG, JPG, WEBP ou PDF.');
  if (kind === 'pdf') {
    onStage?.('Abrindo o PDF…');
    const pages = await pdfToPngs(file, { dpi: TARGET_DPI, onProgress: p => onStage?.('Preparando o PDF · página ' + p.page + ' de ' + p.pages + '… ' + Math.round((p.done || 0) * 100) + '%') });
    if (!pages.length) throw new Error('O PDF não tem páginas.');
    const out = [];
    for (const page of pages) {
      const entry = await analyzePng(page.file, { name: page.name, forcedDpi: TARGET_DPI, onStage, original: file, originalKind: 'pdf', page: page.page, pages: page.pages });
      if (entry) out.push(entry);
    }
    if (!out.length) throw new Error('O PDF está em branco (nenhuma arte visível).');
    return out;
  }
  if (kind === 'png') {
    const entry = await analyzePng(file, { name: baseName(file.name), onStage, original: null, originalKind: 'png' });
    if (!entry) throw new Error('Este PNG está todo transparente: não tem arte para imprimir.');
    return [entry];
  }
  return [await analyzeBitmap(file, { name: baseName(file.name), onStage, original: file, originalKind: kind, hasAlpha: kind === 'webp' })];
}

async function analyzePng(file, { name, forcedDpi = 0, onStage, original, originalKind, page = 0, pages = 0 }) {
  onStage?.('Lendo a arte…');
  const info = await readPngInfo(file);
  const fileDpi = forcedDpi || (info.dpi >= 150 && info.dpi <= 2400 ? info.dpi : 0);
  if (info.problem) {
    // Formato que não dá para ler aos pedaços (ex.: entrelaçado): o navegador abre, se couber na memória.
    if (info.width * info.height > canvasLimit()) throw new Error(info.problem);
    return analyzeBitmap(file, { name, onStage, original: original || file, originalKind, hasAlpha: info.hasAlpha, fileDpi, page, pages });
  }
  onStage?.('Cortando a sobra transparente…');
  const analysis = await call('scan', { blob: file }, p => onStage?.('Cortando a sobra transparente… ' + Math.round(p * 100) + '%'));
  const box = analysis.box;
  if (!box) return null;
  const thumb = analysis.thumb, sx = thumb.width / info.width, sy = thumb.height / info.height;
  const crop = { left: Math.floor(box.left * sx), top: Math.floor(box.top * sy) };
  crop.width = Math.max(1, Math.min(thumb.width - crop.left, Math.ceil((box.left + box.width) * sx) - crop.left));
  crop.height = Math.max(1, Math.min(thumb.height - crop.top, Math.ceil((box.top + box.height) * sy) - crop.top));
  const thumbBlob = await thumbFromRgba(thumb.data, thumb.width, thumb.height, crop);
  return finishEntry({ name, file, engine: 'stream', analysis, box, srcWidth: info.width, srcHeight: info.height, fileDpi, hasAlpha: info.hasAlpha,
    thumbBlob, original, originalKind, page, pages, trimmed: box.width < info.width || box.height < info.height });
}

async function analyzeBitmap(file, { name, onStage, original, originalKind, hasAlpha = true, fileDpi = 0, page = 0, pages = 0 }) {
  onStage?.('Abrindo a imagem…');
  let bitmap;
  try { bitmap = await createImageBitmap(file, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); }
  catch { try { bitmap = await createImageBitmap(file); } catch { throw new Error('Não foi possível abrir esta imagem. Ela pode estar corrompida.'); } }
  const W = bitmap.width, H = bitmap.height;
  if (W * H > canvasLimit()) { bitmap.close?.(); throw new Error('Imagem grande demais para abrir neste aparelho (' + W + ' × ' + H + ' px). Envie em PNG.'); }
  const c = makeCanvas(W, H), ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  let box = { top: 0, left: 0, width: W, height: H, bottom: H - 1, right: W - 1 }, alpha = false;
  if (hasAlpha) {
    onStage?.('Cortando a sobra transparente…');
    const data = ctx.getImageData(0, 0, W, H).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 250) { alpha = true; break; }
    if (alpha) { const found = alphaBox(data, W, H); if (!found) { bitmap.close?.(); throw new Error('Esta imagem está toda transparente: não tem arte para imprimir.'); } box = found; }
  }
  const thumbBlob = await thumbFromSource(c, W, H, box);
  bitmap.close?.();
  return finishEntry({ name, file, engine: 'canvas', canvas: c, box, srcWidth: W, srcHeight: H, fileDpi, hasAlpha: alpha,
    thumbBlob, original, originalKind, page, pages, trimmed: box.width < W || box.height < H });
}

function finishEntry(entry) {
  const dpi = entry.fileDpi || TARGET_DPI, warnings = [];
  if (!entry.hasAlpha) warnings.push(entry.originalKind === 'jpg' ? 'JPG não tem fundo transparente: o fundo (inclusive o branco) também é impresso. Se a arte tem fundo, envie em PNG transparente.' : 'Esta imagem não tem fundo transparente: o fundo também será impresso.');
  if (!entry.fileDpi && entry.originalKind !== 'pdf') warnings.push('O arquivo não diz o tamanho de impressão: sugerimos pelo padrão de 300 DPI. Confira a medida.');
  // Medida EXATA pelo DPI do arquivo (a tela mostra arredondado): sem mexer, o PNG sai com o DPI do arquivo, sem 299,93.
  return { ...entry, id: crypto.randomUUID(), dpi, widthCm: cmOf(entry.box.width, dpi), heightCm: cmOf(entry.box.height, dpi), ratio: entry.box.height / entry.box.width, warnings };
}

// ── 2º passo: o PNG final na medida escolhida ──
// ≥ 300 DPI: pixels exatos do original (recortados). < 300 DPI: ampliado para 300 DPI (se couber na memória; senão vai como está
// e a ZERO19 ajusta na impressão).
export async function buildPrint(entry, widthCm, heightCm, { onStage } = {}) {
  const box = entry.box, dpi = dpiOf(box.width, widthCm), pxPerCm = box.width / widthCm;
  const targetW = Math.round(widthCm / CM_PER_INCH * TARGET_DPI), targetH = Math.round(heightCm / CM_PER_INCH * TARGET_DPI);
  const canUpscale = dpi < TARGET_DPI - 0.5 && targetW * targetH <= canvasLimit();
  let exact;
  if (entry.engine === 'stream') {
    onStage?.('Gravando o PNG com os pixels do original…');
    const [part] = await call('write', { blob: entry.file, analysis: entry.analysis, parts: [{ ...box, index: 1, total: 1 }], options: { pxPerCm } }, p => onStage?.('Gravando o PNG… ' + Math.round(p * 100) + '%'));
    exact = part.blob;
  } else {
    onStage?.('Gravando o PNG…');
    const c = makeCanvas(box.width, box.height); c.getContext('2d').drawImage(entry.canvas, box.left, box.top, box.width, box.height, 0, 0, box.width, box.height);
    exact = await setPngDpi(await canvasToBlob(c), dpi);
  }
  if (!canUpscale) return { blob: exact, widthPx: box.width, heightPx: box.height, dpi, upscaled: false };
  onStage?.('Ajustando para 300 DPI…');
  try {
    const source = await createImageBitmap(exact), c = makeCanvas(targetW, targetH), ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(source, 0, 0, targetW, targetH); source.close?.();
    const blob = await setPngDpi(await canvasToBlob(c), TARGET_DPI);
    return { blob, widthPx: targetW, heightPx: targetH, dpi: TARGET_DPI, upscaled: true };
  } catch {
    return { blob: exact, widthPx: box.width, heightPx: box.height, dpi, upscaled: false };
  }
}
export const releaseEntry = entry => { if (entry?.canvas) { entry.canvas.width = 1; entry.canvas.height = 1; entry.canvas = null; } entry.analysis = null; };
