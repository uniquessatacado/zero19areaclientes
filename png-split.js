// 2.17.96 (13/11, dono): "preciso que crie uma função de dividir o arquivo em partes de 1 metro, para imprimir uma de cada
// vez; tem que achar algum lugar na arte que não tem pixel que dê para cortar sem afetar tamanhos das artes e sem distorcer
// nada; acha uma linha sem pixel, transparente, e divide; nome do arquivo ana → ana 1/2, ana 2/2; faz com calma e com segurança".
//
// Como funciona (sem canvas, sem redimensionar):
// 1. Lê o PNG linha por linha (zlib nativo do navegador). Para cada linha guarda só o alfa: se tem pixel visível e onde.
//    Visível = alfa ≥ 8 de 255, a MESMA regra da prancheta do 019 (pó quase invisível não conta como arte).
// 2. Junta as faixas de arte em partes de até N cm (padrão 100), cortando SÓ em linhas sem pixel visível. Se uma arte
//    sozinha passa de N cm, ela não é cortada: a parte fica maior e volta marcada (oversize).
// 3. Grava cada parte copiando os pixels exatamente como estão no original (mesma escala, mesmos bytes, mesmo perfil de
//    cor), recortada até a arte (até 2 px de borda suave, como a prancheta do 019). O DPI do arquivo (pHYs) diz a escala
//    exata da parte, para a impressora imprimir no tamanho certo.
// Funciona no navegador (de preferência num Worker) e no Node 18+ (testes).

const SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const SLICE = 4 * 1024 * 1024;
const IDAT_TARGET = 256 * 1024;
export const VISIBLE_ALPHA = 8;
export const BIG_PNG_PIXELS = 40e6;
// Pedaços que não podem ir para uma parte: viram outros (IHDR, pHYs, IDAT) ou não fazem sentido numa imagem recortada.
const DROP_CHUNKS = new Set(['IHDR', 'IDAT', 'IEND', 'pHYs', 'acTL', 'fcTL', 'fdAT', 'oFFs', 'pCAL', 'sCAL', 'eXIf', 'sTER', 'dSIG']);

export class PngSplitError extends Error {}
const fail = message => new PngSplitError(message);
const abortError = () => Object.assign(new Error('Divisão cancelada.'), { name: 'AbortError' });

let crcTable = null;
function crcUpdate(crc, bytes) {
  if (!crcTable) { crcTable = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
  let c = crc;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return c >>> 0;
}
export function crc32(bytes) { return (crcUpdate(0xffffffff, bytes) ^ 0xffffffff) >>> 0; }
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const typeOf = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
const readBytes = async (blob, start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer());
// Leitura em janelas de 1 MB: PNG com milhares de pedaços pequenos não vira milhares de leituras.
function windowReader(blob, size = 1 << 20) {
  let start = -1, buf = null;
  return async (offset, length) => {
    if (start < 0 || offset < start || offset + length > start + buf.length) { start = offset; buf = await readBytes(blob, offset, Math.min(blob.size, offset + Math.max(size, length))); }
    if (offset + length > start + buf.length) throw fail('PNG incompleto ou corrompido.');
    return buf.subarray(offset - start, offset - start + length);
  };
}
function chunkBytes(type, data) {
  const out = new Uint8Array(12 + data.length), view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
const channelsOf = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

// Cabeçalho e lista de pedaços, sem ler os dados da imagem (rápido, mesmo em arquivo de centenas de MB).
export async function readPngInfo(blob) {
  if (!blob || typeof blob.slice !== 'function' || !(blob.size >= 45)) throw fail('Arquivo PNG inválido.');
  const read = windowReader(blob), head = await read(0, 8);
  for (let i = 0; i < 8; i++) if (head[i] !== SIGNATURE[i]) throw fail('Este arquivo não é um PNG.');
  const chunks = [], idat = [];
  let offset = 8, idatBytes = 0, ended = false, ihdr = null, plte = null, trns = null, phys = null, seenIdat = false;
  while (offset + 12 <= blob.size) {
    const h = (await read(offset, 8)).slice(), length = u32(h, 0), type = typeOf(h, 4), dataOffset = offset + 8;
    if (!/^[A-Za-z]{4}$/.test(type) || dataOffset + length + 4 > blob.size) throw fail('PNG incompleto ou corrompido.');
    if (type === 'IDAT') {
      if (idat.length && idat[idat.length - 1].end !== offset) throw fail('PNG corrompido: imagem quebrada em partes separadas.');
      idat.push({ dataOffset, length, end: dataOffset + length + 4 }); idatBytes += length; seenIdat = true;
    } else {
      chunks.push({ type, offset, length, dataOffset, after: seenIdat });
      if (type === 'IHDR' || type === 'PLTE' || type === 'tRNS' || type === 'pHYs') {
        const data = (await read(dataOffset, length + 4)).slice(), crc = data.subarray(length);
        const check = new Uint8Array(4 + length); check.set(h.subarray(4, 8)); check.set(data.subarray(0, length), 4);
        if (crc32(check) !== u32(crc, 0)) throw fail('PNG corrompido (' + type + ').');
        const body = data.slice(0, length);
        if (type === 'IHDR') ihdr = body; else if (type === 'PLTE') plte = body; else if (type === 'tRNS') trns = body; else phys = body;
      }
      if (type === 'IEND') { ended = true; break; }
    }
    offset = dataOffset + length + 4;
  }
  if (!ihdr || chunks[0]?.type !== 'IHDR' || ihdr.length !== 13) throw fail('PNG sem cabeçalho válido.');
  if (!idat.length || !ended) throw fail('PNG incompleto: falta parte do arquivo.');
  const width = u32(ihdr, 0), height = u32(ihdr, 4), bitDepth = ihdr[8], colorType = ihdr[9], interlace = ihdr[12];
  if (!width || !height || width > 0x7fffffff || height > 0x7fffffff || ihdr[10] !== 0 || ihdr[11] !== 0) throw fail('PNG com cabeçalho inválido.');
  const channels = channelsOf[colorType];
  if (!channels) throw fail('PNG com tipo de cor inválido.');
  const info = { width, height, bitDepth, colorType, interlace, channels, chunks, idat, idatBytes, fileSize: blob.size,
    rowBytes: Math.ceil(width * channels * bitDepth / 8), bpp: Math.max(1, channels * bitDepth / 8), palette: plte, trns, ppm: null };
  if (phys && phys.length === 9 && phys[8] === 1) { const x = u32(phys, 0), y = u32(phys, 4); if (x > 0 && y > 0) info.ppm = { x, y }; }
  info.dpi = info.ppm && info.ppm.x === info.ppm.y ? Math.round(info.ppm.x * 0.0254 * 100) / 100 : null;
  info.problem = unsupported(info);
  info.hasAlpha = colorType === 4 || colorType === 6 || !!trns;
  return info;
}

function unsupported(info) {
  if (info.interlace) return 'Este PNG está entrelaçado (interlace). Salve de novo sem entrelaçamento e envie.';
  if (info.colorType === 3 ? info.bitDepth !== 8 : info.bitDepth !== 8 && info.bitDepth !== 16) return 'Este PNG usa um formato de cor pouco comum (' + info.bitDepth + ' bits). Salve como PNG RGBA 8 bits e envie.';
  if (info.colorType === 3 && !info.palette) return 'PNG com paleta sem as cores.';
  return '';
}

// Alfa (0–255, como o navegador mostra) de cada pixel da linha.
function alphaReader(info) {
  const { colorType: ct, bitDepth: bd, trns } = info, w = info.width;
  const a16 = v => Math.round(v / 257);
  if (ct === 6 && bd === 8) return (raw, out) => { for (let x = 0, i = 3; x < w; x++, i += 4) out[x] = raw[i]; };
  if (ct === 6) return (raw, out) => { for (let x = 0, i = 6; x < w; x++, i += 8) out[x] = a16((raw[i] << 8) | raw[i + 1]); };
  if (ct === 4 && bd === 8) return (raw, out) => { for (let x = 0, i = 1; x < w; x++, i += 2) out[x] = raw[i]; };
  if (ct === 4) return (raw, out) => { for (let x = 0, i = 2; x < w; x++, i += 4) out[x] = a16((raw[i] << 8) | raw[i + 1]); };
  if (ct === 3) {
    const table = new Uint8Array(256).fill(255);
    if (trns) for (let i = 0; i < Math.min(256, trns.length); i++) table[i] = trns[i];
    return (raw, out) => { for (let x = 0; x < w; x++) out[x] = table[raw[x]]; };
  }
  if (!trns) return (_raw, out) => out.fill(255);
  if (ct === 0) {
    const key = (trns[0] << 8) | trns[1];
    return bd === 8 ? (raw, out) => { for (let x = 0; x < w; x++) out[x] = raw[x] === (key & 255) ? 0 : 255; }
      : (raw, out) => { for (let x = 0, i = 0; x < w; x++, i += 2) out[x] = ((raw[i] << 8) | raw[i + 1]) === key ? 0 : 255; };
  }
  const r = (trns[0] << 8) | trns[1], g = (trns[2] << 8) | trns[3], b = (trns[4] << 8) | trns[5];
  return bd === 8 ? (raw, out) => { for (let x = 0, i = 0; x < w; x++, i += 3) out[x] = raw[i] === (r & 255) && raw[i + 1] === (g & 255) && raw[i + 2] === (b & 255) ? 0 : 255; }
    : (raw, out) => { for (let x = 0, i = 0; x < w; x++, i += 6) out[x] = ((raw[i] << 8) | raw[i + 1]) === r && ((raw[i + 2] << 8) | raw[i + 3]) === g && ((raw[i + 4] << 8) | raw[i + 5]) === b ? 0 : 255; };
}

// Cor de um pixel para a miniatura (8 bits RGBA).
function rgbaReader(info) {
  const { colorType: ct, bitDepth: bd, palette } = info, step = bd === 16 ? 2 : 1;
  return (raw, x, alpha, out, o) => {
    const p = x * info.channels * step;
    if (ct === 3) { const k = raw[x] * 3; out[o] = palette[k] ?? 0; out[o + 1] = palette[k + 1] ?? 0; out[o + 2] = palette[k + 2] ?? 0; }
    else if (ct === 0 || ct === 4) { out[o] = out[o + 1] = out[o + 2] = raw[p]; }
    else { out[o] = raw[p]; out[o + 1] = raw[p + step]; out[o + 2] = raw[p + 2 * step]; }
    out[o + 3] = alpha;
  };
}

function paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
function unfilter(type, f, prev, out, bpp) {
  const n = f.length;
  if (type === 0) { out.set(f); return; }
  if (type === 1) { for (let i = 0; i < n; i++) out[i] = (f[i] + (i >= bpp ? out[i - bpp] : 0)) & 255; return; }
  if (type === 2) { for (let i = 0; i < n; i++) out[i] = (f[i] + prev[i]) & 255; return; }
  if (type === 3) { for (let i = 0; i < n; i++) out[i] = (f[i] + (((i >= bpp ? out[i - bpp] : 0) + prev[i]) >> 1)) & 255; return; }
  if (type === 4) { for (let i = 0; i < n; i++) out[i] = (f[i] + paeth(i >= bpp ? out[i - bpp] : 0, prev[i], i >= bpp ? prev[i - bpp] : 0)) & 255; return; }
  throw fail('PNG corrompido (filtro de linha inválido).');
}
export function filterRow(type, raw, prev, out, bpp) {
  const n = raw.length;
  if (type === 0) { out.set(raw); return; }
  if (type === 1) { for (let i = 0; i < n; i++) out[i] = (raw[i] - (i >= bpp ? raw[i - bpp] : 0)) & 255; return; }
  if (type === 2) { for (let i = 0; i < n; i++) out[i] = (raw[i] - prev[i]) & 255; return; }
  if (type === 3) { for (let i = 0; i < n; i++) out[i] = (raw[i] - (((i >= bpp ? raw[i - bpp] : 0) + prev[i]) >> 1)) & 255; return; }
  for (let i = 0; i < n; i++) out[i] = (raw[i] - paeth(i >= bpp ? raw[i - bpp] : 0, prev[i], i >= bpp ? prev[i - bpp] : 0)) & 255;
}

// Linhas já sem filtro, uma de cada vez. O buffer devolvido é reaproveitado: use antes de pedir a próxima.
async function* pngRows(blob, info, { signal, onProgress } = {}) {
  if (info.problem) throw fail(info.problem);
  const ds = new DecompressionStream('deflate'), writer = ds.writable.getWriter(), reader = ds.readable.getReader();
  let sent = 0, lastReport = 0;
  // Os IDAT ficam seguidos no arquivo: lê em janelas de 4 MB e manda só os dados (sem cabeçalho/CRC) para o zlib.
  const pump = (async () => {
    const chunks = info.idat, regionStart = chunks[0].dataOffset - 8, regionEnd = chunks[chunks.length - 1].end;
    let c = 0;
    for (let pos = regionStart; pos < regionEnd && c < chunks.length; pos += SLICE) {
      if (signal?.aborted) throw abortError();
      const winEnd = Math.min(regionEnd, pos + SLICE), win = await readBytes(blob, pos, winEnd);
      while (c < chunks.length) {
        const dataStart = chunks[c].dataOffset, dataEnd = dataStart + chunks[c].length, from = Math.max(dataStart, pos), to = Math.min(dataEnd, winEnd);
        if (from < to) { await writer.write(win.subarray(from - pos, to - pos)); sent += to - from; }
        if (dataEnd <= winEnd) c++; else break;
      }
      if (onProgress && (sent - lastReport >= SLICE || sent === info.idatBytes)) { lastReport = sent; onProgress(info.idatBytes ? Math.min(1, sent / info.idatBytes) : 1); }
    }
    await writer.close();
  })();
  let pumpError = null;
  pump.catch(error => { pumpError = error; writer.abort(error).catch(() => {}); });
  const stride = info.rowBytes + 1, row = new Uint8Array(stride);
  let prev = new Uint8Array(info.rowBytes), cur = new Uint8Array(info.rowBytes), filled = 0, y = 0;
  try {
    while (y < info.height) {
      let chunk;
      try { chunk = await reader.read(); } catch (error) { throw pumpError || fail('PNG corrompido: não foi possível ler a imagem (' + (error?.message || error) + ').'); }
      if (chunk.done) break;
      const value = chunk.value;
      let i = 0;
      while (i < value.length && y < info.height) {
        const take = Math.min(stride - filled, value.length - i);
        row.set(value.subarray(i, i + take), filled); filled += take; i += take;
        if (filled === stride) {
          const filterType = row[0];
          unfilter(filterType, row.subarray(1), prev, cur, info.bpp);
          yield { y, filterType, raw: cur };
          const swap = prev; prev = cur; cur = swap; filled = 0; y++;
          if (signal?.aborted) throw abortError();
        }
      }
    }
    // Todas as linhas lidas = imagem completa (sobra depois do fim do zlib não importa).
    if (y < info.height) throw pumpError || fail('PNG incompleto: faltam ' + (info.height - y) + ' linhas da imagem.');
  } finally {
    reader.cancel().catch(() => {});
  }
}

// Passo 1: alfa de cada linha (+ miniatura). Memória: alguns números por linha, nunca a imagem inteira.
export async function scanPng(blob, { signal, onProgress, thumbMax = 360 } = {}) {
  const info = await readPngInfo(blob);
  if (info.problem) throw fail(info.problem);
  const W = info.width, H = info.height, maxA = new Uint8Array(H), min8 = new Int32Array(H).fill(-1), max8 = new Int32Array(H).fill(-1),
    minAny = new Int32Array(H).fill(-1), maxAny = new Int32Array(H).fill(-1), alpha = new Uint8Array(W), readAlpha = alphaReader(info), readRgba = rgbaReader(info);
  const scale = Math.min(1, thumbMax / Math.max(W, H)), tw = Math.max(1, Math.round(W * scale)), th = Math.max(1, Math.round(H * scale)), thumb = new Uint8ClampedArray(tw * th * 4);
  const sampleX = new Int32Array(tw); for (let tx = 0; tx < tw; tx++) sampleX[tx] = Math.min(W - 1, Math.floor((tx + 0.5) * W / tw));
  let nextThumbRow = 0, nextThumbY = Math.min(H - 1, Math.floor(0.5 * H / th));
  for await (const { y, raw } of pngRows(blob, info, { signal, onProgress })) {
    readAlpha(raw, alpha);
    let top = 0, a8 = -1, b8 = -1, a0 = -1, b0 = -1;
    for (let x = 0; x < W; x++) {
      const a = alpha[x];
      if (!a) continue;
      if (a0 < 0) a0 = x; b0 = x; if (a > top) top = a;
      if (a >= VISIBLE_ALPHA) { if (a8 < 0) a8 = x; b8 = x; }
    }
    maxA[y] = top; min8[y] = a8; max8[y] = b8; minAny[y] = a0; maxAny[y] = b0;
    while (nextThumbRow < th && y === nextThumbY) {
      for (let tx = 0; tx < tw; tx++) readRgba(raw, sampleX[tx], alpha[sampleX[tx]], thumb, (nextThumbRow * tw + tx) * 4);
      nextThumbRow++; nextThumbY = Math.min(H - 1, Math.floor((nextThumbRow + 0.5) * H / th));
    }
  }
  const analysis = { ...info, rows: { maxA, min8, max8, minAny, maxAny }, thumb: { width: tw, height: th, data: thumb } };
  analysis.box = artBox(analysis);
  return analysis;
}

// Caixa da arte entre as linhas s..e (mesma regra da prancheta do 019): pixels com alfa ≥ 8 e até 2 px de borda
// suave encostada (alfa > 0). up/down = até onde a borda pode crescer sem entrar na parte vizinha.
function boxFor(analysis, s, e, up, down) {
  const { min8, max8, minAny, maxAny } = analysis.rows, W = analysis.width;
  let left = Infinity, right = -1;
  for (let y = s; y <= e; y++) if (max8[y] >= 0) { if (min8[y] < left) left = min8[y]; if (max8[y] > right) right = max8[y]; }
  if (right < 0) return null;
  let top = s, bottom = e;
  const rowTouches = (y, l, r) => minAny[y] >= 0 && minAny[y] <= r && maxAny[y] >= l;
  const colTouches = (x, t, b) => { for (let y = t; y <= b; y++) if (minAny[y] >= 0 && minAny[y] <= x && maxAny[y] >= x) return true; return false; };
  for (let k = 0; k < 2; k++) {
    if (top - 1 >= up && rowTouches(top - 1, left, right)) top--;
    if (bottom + 1 <= down && rowTouches(bottom + 1, left, right)) bottom++;
    if (left > 0 && colTouches(left - 1, top, bottom)) left--;
    if (right < W - 1 && colTouches(right + 1, top, bottom)) right++;
  }
  return { top, bottom, left, right, width: right - left + 1, height: bottom - top + 1 };
}
function visibleBlocks(analysis) {
  const { maxA } = analysis.rows, blocks = [];
  let start = -1;
  for (let y = 0; y < analysis.height; y++) {
    const visible = maxA[y] >= VISIBLE_ALPHA;
    if (visible && start < 0) start = y;
    if (!visible && start >= 0) { blocks.push([start, y - 1]); start = -1; }
  }
  if (start >= 0) blocks.push([start, analysis.height - 1]);
  return blocks;
}
export function artBox(analysis) {
  const blocks = visibleBlocks(analysis);
  return blocks.length ? boxFor(analysis, blocks[0][0], blocks[blocks.length - 1][1], 0, analysis.height - 1) : null;
}

// Passo 2: onde cortar. Partes em ordem, de cima para baixo; cada corte fica numa faixa sem pixel visível.
// O menor número de partes possível (cada parte vai até onde cabe). pxPerCm = escala do arquivo (pixels por cm).
export function planSplit(analysis, { pxPerCm, maxCm = 100 } = {}) {
  if (!(pxPerCm > 0) || !Number.isFinite(pxPerCm)) throw fail('Informe a medida da arte inteira (largura ou altura) para saber onde fica cada metro.');
  if (!(maxCm >= 5) || !Number.isFinite(maxCm)) throw fail('O tamanho máximo de cada parte precisa ter pelo menos 5 cm.');
  const blocks = visibleBlocks(analysis);
  if (!blocks.length) throw fail('A imagem não tem arte visível (só transparência).');
  const H = analysis.height, maxPx = Math.floor(maxCm * pxPerCm + 1e-6), parts = [];
  let i = 0, upLimit = 0;
  while (i < blocks.length) {
    const down = k => (k + 1 < blocks.length ? blocks[k + 1][0] - 1 : H - 1);
    let j = i, box = boxFor(analysis, blocks[i][0], blocks[i][1], upLimit, down(i));
    while (j + 1 < blocks.length) {
      const next = boxFor(analysis, blocks[i][0], blocks[j + 1][1], upLimit, down(j + 1));
      if (next.height > maxPx) break;
      j++; box = next;
    }
    parts.push({ ...box, oversize: box.height > maxPx });
    upLimit = box.bottom + 1; i = j + 1;
  }
  const total = parts.length;
  parts.forEach((part, index) => Object.assign(part, { index: index + 1, total, widthCm: part.width / pxPerCm, heightCm: part.height / pxPerCm }));
  const cuts = parts.slice(1).map((part, index) => Math.round((parts[index].bottom + part.top) / 2));
  return { parts, cuts, maxPx, pxPerCm, maxCm, box: artBox(analysis) };
}

// Passo 3: grava as partes. Pixels copiados do original (mesmo filtro de linha do original, recalculado para o recorte).
export async function writeParts(blob, analysis, parts, { pxPerCm = 0, signal, onProgress } = {}) {
  const info = analysis, bpp = info.bpp, ordered = [...parts].sort((a, b) => a.top - b.top);
  for (let k = 1; k < ordered.length; k++) if (ordered[k].top <= ordered[k - 1].bottom) throw fail('Partes sobrepostas: divisão cancelada.');
  const physData = pxPerCm > 0 ? (() => { const ppm = Math.round(pxPerCm * 100), d = new Uint8Array(9), v = new DataView(d.buffer); v.setUint32(0, ppm); v.setUint32(4, ppm); d[8] = 1; return d; })() : null;
  const before = info.chunks.filter(c => !c.after && !DROP_CHUNKS.has(c.type)), after = info.chunks.filter(c => c.after && !DROP_CHUNKS.has(c.type)), sourcePhys = info.chunks.find(c => c.type === 'pHYs' && !c.after);
  const results = [];
  let index = 0, enc = null;
  const start = part => {
    const cs = new CompressionStream('deflate'), writer = cs.writable.getWriter(), reader = cs.readable.getReader(), idat = [];
    let pending = [], pendingBytes = 0;
    const flush = () => { if (!pendingBytes) return; const data = new Uint8Array(pendingBytes); let o = 0; for (const p of pending) { data.set(p, o); o += p.length; } idat.push(chunkBytes('IDAT', data)); pending = []; pendingBytes = 0; };
    const reading = (async () => { for (;;) { const { value, done } = await reader.read(); if (done) break; pending.push(value); pendingBytes += value.length; if (pendingBytes >= IDAT_TARGET) flush(); } flush(); })();
    reading.catch(() => {});
    const rowLength = part.width * bpp, prev = new Uint8Array(rowLength);
    return {
      async row(filterType, raw) {
        const crop = raw.subarray(part.left * bpp, (part.right + 1) * bpp), line = new Uint8Array(rowLength + 1);
        line[0] = filterType; filterRow(filterType, crop, prev, line.subarray(1), bpp); prev.set(crop);
        await writer.write(line);
      },
      async finish() {
        await writer.close(); await reading;
        const ihdr = new Uint8Array(13), v = new DataView(ihdr.buffer);
        v.setUint32(0, part.width); v.setUint32(4, part.height); ihdr[8] = info.bitDepth; ihdr[9] = info.colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
        const pieces = [SIGNATURE, chunkBytes('IHDR', ihdr)];
        if (physData) pieces.push(chunkBytes('pHYs', physData)); else if (sourcePhys) pieces.push(blob.slice(sourcePhys.offset, sourcePhys.dataOffset + sourcePhys.length + 4));
        for (const c of before) pieces.push(blob.slice(c.offset, c.dataOffset + c.length + 4));
        pieces.push(...idat);
        for (const c of after) pieces.push(blob.slice(c.offset, c.dataOffset + c.length + 4));
        pieces.push(chunkBytes('IEND', new Uint8Array(0)));
        return { ...part, blob: new Blob(pieces, { type: 'image/png' }) };
      },
      abort() { writer.abort(abortError()).catch(() => {}); },
    };
  };
  try {
    for await (const { y, filterType, raw } of pngRows(blob, info, { signal, onProgress })) {
      const part = ordered[index];
      if (!part) break;
      if (y < part.top) continue;
      if (!enc) enc = start(part);
      await enc.row(filterType, raw);
      if (y === part.bottom) { results.push(await enc.finish()); enc = null; index++; if (index >= ordered.length) break; }
    }
  } catch (error) { enc?.abort(); throw error; }
  if (results.length !== ordered.length) throw fail('Não foi possível gravar todas as partes. Nada foi salvo.');
  return results;
}

// Nome das partes: "ana" → "ana 1/2", "ana 2/2".
export const partName = (base, index, total) => (String(base || '').trim() || 'Arte') + ' ' + index + '/' + total;
export const partFileName = (base, index, total) => (String(base || '').trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'arte') + ' ' + index + '-' + total + '.png';
