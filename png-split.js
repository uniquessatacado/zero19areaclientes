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
function alphaReader(info, width = info.width) {
  const { colorType: ct, bitDepth: bd, trns } = info, w = width;
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
export async function scanPng(blob, { signal, onProgress, thumbMax = 1200 } = {}) {
  const info = await readPngInfo(blob);
  if (info.problem) throw fail(info.problem);
  const W = info.width, H = info.height, maxA = new Uint8Array(H), min8 = new Int32Array(H).fill(-1), max8 = new Int32Array(H).fill(-1),
    minAny = new Int32Array(H).fill(-1), maxAny = new Int32Array(H).fill(-1), alpha = new Uint8Array(W), readAlpha = alphaReader(info), readRgba = rgbaReader(info);
  const scale = Math.min(1, thumbMax / Math.max(W, H)), tw = Math.max(1, Math.round(W * scale)), th = Math.max(1, Math.round(H * scale)), thumb = new Uint8ClampedArray(tw * th * 4);
  // Miniatura pela MÉDIA dos pixels de cada ponto (cor ponderada pelo alfa): nítida, sem serrilhado.
  const sums = new Float64Array(tw * th * 4), counts = new Float64Array(tw * th), thumbX = new Int32Array(W), colCount = new Float64Array(tw), px = new Uint8ClampedArray(4), rgba8 = info.colorType === 6 && info.bitDepth === 8;
  for (let x = 0; x < W; x++) { thumbX[x] = Math.min(tw - 1, Math.floor(x * tw / W)); colCount[thumbX[x]]++; }
  // 13/11 (2): mapa de onde tem pixel visível, em quadradinhos de c px — é com ele que o corte contorna as artes
  // quando não existe linha reta vazia.
  let c = 4; while (Math.ceil(W / c) * Math.ceil(H / c) > 40e6) c *= 2;
  const gw = Math.ceil(W / c), gh = Math.ceil(H / c), occ = new Uint8Array(gw * gh), cellOfX = new Int32Array(W);
  for (let x = 0; x < W; x++) cellOfX[x] = Math.floor(x / c);
  for await (const { y, raw } of pngRows(blob, info, { signal, onProgress })) {
    readAlpha(raw, alpha);
    let top = 0, a8 = -1, b8 = -1, a0 = -1, b0 = -1;
    const cellRow = Math.floor(y / c) * gw, thumbRow = Math.min(th - 1, Math.floor(y * th / H)) * tw;
    for (let tx = 0; tx < tw; tx++) counts[thumbRow + tx] += colCount[tx];
    for (let x = 0; x < W; x++) {
      const a = alpha[x];
      if (!a) continue;
      if (a0 < 0) a0 = x; b0 = x; if (a > top) top = a;
      if (a >= VISIBLE_ALPHA) { if (a8 < 0) a8 = x; b8 = x; occ[cellRow + cellOfX[x]] = 1; }
      const k = (thumbRow + thumbX[x]) * 4;
      if (rgba8) { const o = x * 4; sums[k] += raw[o] * a; sums[k + 1] += raw[o + 1] * a; sums[k + 2] += raw[o + 2] * a; }
      else { readRgba(raw, x, a, px, 0); sums[k] += px[0] * a; sums[k + 1] += px[1] * a; sums[k + 2] += px[2] * a; }
      sums[k + 3] += a;
    }
    maxA[y] = top; min8[y] = a8; max8[y] = b8; minAny[y] = a0; maxAny[y] = b0;
  }
  for (let k = 0; k < tw * th; k++) { const A = sums[k * 4 + 3]; if (A > 0) { thumb[k * 4] = sums[k * 4] / A; thumb[k * 4 + 1] = sums[k * 4 + 1] / A; thumb[k * 4 + 2] = sums[k * 4 + 2] / A; thumb[k * 4 + 3] = A / counts[k]; } }
  const analysis = { ...info, rows: { maxA, min8, max8, minAny, maxAny }, thumb: { width: tw, height: th, data: thumb }, grid: { c, gw, gh, occ } };
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

// Passo 2: onde cortar. Primeiro o corte reto: linha inteira sem pixel visível, de cima para baixo. Se não existe linha
// reta vazia onde precisa, o corte CONTORNA as artes (13/11, dono: "se não tiver linha reta, contorna o que tiver mais
// próximo de reto possível, mas não corta a arte"). E a tela mostra até 3 opções para escolher (13/11, dono: "tome
// cuidado para não cortar uma estampa em duas partes; mostre 3 opções de corte para escolher, para verificarmos, e então
// executar na que escolhermos"). pxPerCm = escala do arquivo (pixels por cm).
function checkScale(pxPerCm, maxCm) {
  if (!(pxPerCm > 0) || !Number.isFinite(pxPerCm)) throw fail('Informe a medida da arte inteira (largura ou altura) para saber onde fica cada metro.');
  if (!(maxCm >= 5) || !Number.isFinite(maxCm)) throw fail('O tamanho máximo de cada parte precisa ter pelo menos 5 cm.');
}
// Sem escolha: a primeira (recomendada) das opções.
export function planSplit(analysis, { pxPerCm, maxCm = 100, params = null } = {}) {
  checkScale(pxPerCm, maxCm);
  return planFor(analysis, pxPerCm, maxCm, params || planOptions(analysis, { pxPerCm, maxCm }).options[0].params);
}
function finishParts(parts, pxPerCm) {
  const total = parts.length;
  parts.forEach((part, index) => Object.assign(part, { index: index + 1, total, widthCm: part.width / pxPerCm, heightCm: part.height / pxPerCm }));
  return parts;
}
const maxPxOf = (pxPerCm, maxCm) => Math.floor(maxCm * pxPerCm + 1e-6);

// Corte reto (linhas inteiras sem pixel). fill < 1 = cada parte vai só até essa fração do limite (corte mais alto).
// minGapPx: só corta em faixa vazia com pelo menos essa altura (faixa menor é espaço DENTRO de uma estampa).
function planStraight(analysis, pxPerCm, maxCm, fill = 1, minGapPx = 0) {
  const blocks = [];
  for (const block of visibleBlocks(analysis)) {
    const last = blocks[blocks.length - 1];
    if (last && block[0] - last[1] - 1 < minGapPx) last[1] = block[1]; else blocks.push([...block]);
  }
  if (!blocks.length) throw fail('A imagem não tem arte visível (só transparência).');
  const H = analysis.height, maxPx = maxPxOf(pxPerCm, maxCm), limit = Math.max(1, Math.floor(maxPx * fill)), parts = [];
  let i = 0, upLimit = 0;
  while (i < blocks.length) {
    const down = k => (k + 1 < blocks.length ? blocks[k + 1][0] - 1 : H - 1);
    let j = i, box = boxFor(analysis, blocks[i][0], blocks[i][1], upLimit, down(i));
    while (j + 1 < blocks.length) {
      const next = boxFor(analysis, blocks[i][0], blocks[j + 1][1], upLimit, down(j + 1));
      if (next.height > limit) break;
      j++; box = next;
    }
    parts.push({ ...box, oversize: box.height > maxPx });
    upLimit = box.bottom + 1; i = j + 1;
  }
  finishParts(parts, pxPerCm);
  const cuts = parts.slice(1).map((part, index) => Math.round((parts[index].bottom + part.top) / 2));
  return { mode: 'straight', params: { mode: 'straight', fill, minGapPx }, parts, cuts, maxPx, pxPerCm, maxCm };
}

// --- Corte que contorna as artes -------------------------------------------------------------------------------------
// "Arte" = grupo de pixels visíveis próximos (letras de um nome, pontos de um halftone, peças de uma estampa ficam
// juntas). Junta o que está a menos de X mm; quanto maior X, mais seguro (menos chance de separar peças de uma mesma
// estampa). Cada arte vai inteira para UMA parte; a parte leva só as artes dela (o resto do retângulo fica transparente).
const MERGE_MM = [20, 10, 5, 3, 1.5, 0.5, 0];
const FILLS = [1, 0.95, 0.9, 0.85, 0.8];

function dilate(src, gw, gh, r) {
  if (!r) return src;
  const tmp = new Uint8Array(gw * gh), out = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    const b = y * gw; let count = 0;
    for (let k = 0; k <= r && k < gw; k++) count += src[b + k];
    for (let x = 0; x < gw; x++) { tmp[b + x] = count > 0 ? 1 : 0; if (x + r + 1 < gw) count += src[b + x + r + 1]; if (x - r >= 0) count -= src[b + x - r]; }
  }
  for (let x = 0; x < gw; x++) {
    let count = 0;
    for (let k = 0; k <= r && k < gh; k++) count += tmp[k * gw + x];
    for (let y = 0; y < gh; y++) { out[y * gw + x] = count > 0 ? 1 : 0; if (y + r + 1 < gh) count += tmp[(y + r + 1) * gw + x]; if (y - r >= 0) count -= tmp[(y - r) * gw + x]; }
  }
  return out;
}
// Grupos ligados (8 vizinhos) do mapa engordado em r quadradinhos: quadradinhos a até 2r+1 de distância se juntam.
function labelCells(occ, gw, gh, r) {
  const src = dilate(occ, gw, gh, r), n = gw * gh, label = new Int32Array(n);
  let parent = new Int32Array(4096), next = 1;
  const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let y = 0; y < gh; y++) {
    const row = y * gw, up = row - gw;
    for (let x = 0; x < gw; x++) {
      const i = row + x;
      if (!src[i]) continue;
      let l = 0;
      for (let k = 0; k < 4; k++) {
        let j;
        if (k === 0) { if (x === 0) continue; j = i - 1; }
        else { if (y === 0) break; const dx = k - 2; if (x + dx < 0 || x + dx >= gw) continue; j = up + x + dx; }
        const lj = label[j];
        if (!lj) continue;
        const rj = find(lj);
        if (!l) l = rj;
        else if (rj !== l) { if (rj < l) { parent[l] = rj; l = rj; } else parent[rj] = l; }
      }
      if (!l) { if (next >= parent.length) { const grown = new Int32Array(parent.length * 2); grown.set(parent); parent = grown; } parent[next] = next; l = next++; }
      label[i] = l;
    }
  }
  const compact = new Int32Array(next);
  let count = 0;
  for (let k = 1; k < next; k++) { const root = find(k); if (!compact[root]) compact[root] = ++count; compact[k] = compact[root]; }
  for (let i = 0; i < n; i++) if (label[i]) label[i] = compact[label[i]];
  return { label, count };
}
// Caixa de cada arte em pixels, com 1 quadradinho a mais em volta (borda suave da arte).
function cellElements(occ, label, count, gw, c, W, H) {
  const minR = new Int32Array(count + 1).fill(2147483647), maxR = new Int32Array(count + 1).fill(-1), minC = new Int32Array(count + 1).fill(2147483647), maxC = new Int32Array(count + 1).fill(-1);
  for (let i = 0; i < occ.length; i++) {
    if (!occ[i]) continue;
    const l = label[i], y = (i / gw) | 0, x = i - y * gw;
    if (y < minR[l]) minR[l] = y; if (y > maxR[l]) maxR[l] = y; if (x < minC[l]) minC[l] = x; if (x > maxC[l]) maxC[l] = x;
  }
  const elements = [];
  for (let l = 1; l <= count; l++) if (maxR[l] >= 0) { const top = Math.max(0, (minR[l] - 1) * c), bottom = Math.min(H - 1, (maxR[l] + 2) * c - 1), left = Math.max(0, (minC[l] - 1) * c), right = Math.min(W - 1, (maxC[l] + 2) * c - 1); elements.push({ id: l, top, bottom, left, right, width: right - left + 1, height: bottom - top + 1 }); }
  return elements;
}
// Legenda (13/11 (4), dono: "a frase nutri que ficava embaixo desta arte ficou em outro corte"): peça pequena logo acima
// ou abaixo de uma arte maior, alinhada com ela e a até 3 cm (e até 30% da altura da arte), fica JUNTO dessa arte.
function attachCaptions(elements, pxPerCm, union) {
  if (elements.length < 2 || elements.length > 4000) return;
  const maxGap = 3 * pxPerCm;
  for (const e of elements) {
    let best = null, bestGap = Infinity;
    for (const f of elements) {
      if (f === e || e.height > 0.35 * f.height) continue;
      if (Math.min(e.right, f.right) - Math.max(e.left, f.left) + 1 < 0.6 * Math.min(e.width, f.width)) continue;
      const gap = e.top > f.bottom ? e.top - f.bottom - 1 : f.top > e.bottom ? f.top - e.bottom - 1 : -1;
      if (gap < 0 || gap > maxGap || gap > 0.3 * f.height) continue;
      // a mais perto; empate (até 2 mm de diferença) fica com a de cima (legenda costuma ficar embaixo da arte)
      const above = f.bottom < e.top, tie = Math.abs(gap - bestGap) <= 0.2 * pxPerCm;
      if (!best || (tie ? above && !(best.bottom < e.top) : gap < bestGap)) { best = f; bestGap = gap; }
    }
    if (best) union(e.id, best.id);
  }
}
// joins: peças que a pessoa juntou na tela, cada uma como [x1, y1, x2, y2] em pixels do arquivo (ficam juntas sempre).
function contourPrep(analysis, pxPerCm, mergeMm, joins = []) {
  const { c, gw, gh, occ } = analysis.grid, r = Math.max(0, Math.round((mergeMm / 10 * pxPerCm / c - 1) / 2)), { label, count } = labelCells(occ, gw, gh, r);
  const base = count ? cellElements(occ, label, count, gw, c, analysis.width, analysis.height) : [], parent = new Int32Array(count + 1);
  for (let i = 0; i <= count; i++) parent[i] = i;
  const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
  attachCaptions(base, pxPerCm, union);
  // ponto tocado → arte mais perto (até 4 quadradinhos em volta)
  const at = (x, y) => { const cx = Math.floor(x / c), cy = Math.floor(y / c); for (let d = 0; d <= 4; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; const xx = cx + dx, yy = cy + dy; if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue; const i = yy * gw + xx; if (occ[i]) return label[i]; } return 0; };
  let joined = 0;
  for (const join of joins || []) { const a = at(join[0], join[1]), b = at(join[2], join[3]); if (a && b && find(a) !== find(b)) { union(a, b); joined++; } }
  const rootOf = new Int32Array(count + 1), boxes = new Map();
  for (const e of base) {
    const root = find(e.id), box = boxes.get(root);
    rootOf[e.id] = root;
    if (!box) boxes.set(root, { ...e, id: root });
    else { box.top = Math.min(box.top, e.top); box.bottom = Math.max(box.bottom, e.bottom); box.left = Math.min(box.left, e.left); box.right = Math.max(box.right, e.right); box.width = box.right - box.left + 1; box.height = box.bottom - box.top + 1; }
  }
  for (let l = 1; l <= count; l++) if (!rootOf[l]) rootOf[l] = find(l);
  return { mergeMm, r, label, count, rootOf, joins: joins || [], joined, elements: [...boxes.values()] };
}
// Partes "até onde cabe": a de cima leva todas as artes que cabem no limite a partir da arte mais alta (o menor número
// de partes possível). Arte sozinha maior que o limite fica numa parte própria (com o que couber ao lado dela).
function fitGroups(rem, limit) {
  const groups = [];
  while (rem.length) {
    let Y = rem[0].top + limit - 1; if (rem[0].bottom > Y) Y = rem[0].bottom;
    const take = [], keep = [];
    for (const e of rem) (e.bottom <= Y ? take : keep).push(e);
    groups.push(take); rem = keep;
  }
  return groups;
}
// O mais reto possível: se existe uma linha reta que nenhuma arte atravessa e ela não aumenta o número de partes, corta
// nela; senão o corte é a linha do limite, contornando só as artes que passariam dela.
function groupElements(elements, limit) {
  let rem = [...elements].sort((a, b) => a.top - b.top || a.left - b.left);
  const groups = [];
  while (rem.length) {
    const T = rem[0].top; let Y = T + limit - 1; if (rem[0].bottom > Y) Y = rem[0].bottom;
    let take = [], keep = [];
    for (const e of rem) (e.bottom <= Y ? take : keep).push(e);
    let cut = -1, end = -Infinity;
    for (const e of rem) { if (end >= T && e.top > end) { if (e.top <= Y + 1) cut = e.top; else break; } if (e.bottom > end) end = e.bottom; }
    if (cut > T && take.length < rem.length) {
      const straightTake = [], straightKeep = [];
      for (const e of rem) (e.bottom < cut ? straightTake : straightKeep).push(e);
      if (straightTake.length && straightTake.length < take.length && fitGroups(straightKeep, limit).length <= fitGroups(keep, limit).length) { take = straightTake; keep = straightKeep; }
    }
    groups.push(take); rem = keep;
  }
  return groups;
}
const groupBox = group => { const box = { top: Infinity, bottom: -1, left: Infinity, right: -1 }; for (const e of group) { if (e.top < box.top) box.top = e.top; if (e.bottom > box.bottom) box.bottom = e.bottom; if (e.left < box.left) box.left = e.left; if (e.right > box.right) box.right = e.right; } return { ...box, width: box.right - box.left + 1, height: box.bottom - box.top + 1 }; };
function planContour(analysis, pxPerCm, maxCm, prep, fill = 1) {
  if (!prep.elements.length) throw fail('A imagem não tem arte visível (só transparência).');
  const maxPx = maxPxOf(pxPerCm, maxCm), groups = groupElements(prep.elements, Math.max(1, Math.floor(maxPx * fill)));
  const parts = groups.map((group, p) => ({ ...groupBox(group), mask: true, ownerId: p })).map(part => ({ ...part, oversize: part.height > maxPx }));
  // Partes separadas por uma reta (sem se encaixar): recorte exato pela regra da prancheta (alfa ≥ 8 + até 2 px de borda
  // suave), como o corte reto; todo pixel dessas linhas é da própria parte.
  const ordered = [...parts].sort((a, b) => a.top - b.top), { maxA } = analysis.rows;
  if (ordered.every((part, k) => !k || part.top > ordered[k - 1].bottom)) {
    ordered.forEach((part, k) => {
      let top = part.top, bottom = part.bottom;
      while (top <= bottom && maxA[top] < VISIBLE_ALPHA) top++;
      while (bottom >= top && maxA[bottom] < VISIBLE_ALPHA) bottom--;
      if (top > bottom) return;
      const exact = boxFor(analysis, top, bottom, k ? ordered[k - 1].bottom + 1 : 0, k + 1 < ordered.length ? ordered[k + 1].top - 1 : analysis.height - 1);
      if (exact) Object.assign(part, exact, { oversize: exact.height > maxPx });
    });
  }
  finishParts(parts, pxPerCm);
  return { mode: 'contour', params: { mode: 'contour', mergeMm: prep.mergeMm, fill, joins: prep.joins }, parts, cuts: [], maxPx, pxPerCm, maxCm, groups, prep };
}
// Dono de cada quadradinho (parte), com a borda suave em volta de cada arte (-2 = encostado em artes de duas partes).
function contourOwner(analysis, plan) {
  const { gw, gh, occ } = analysis.grid, { label } = plan.prep, partOf = new Int32Array(plan.prep.count + 1).fill(-1);
  plan.groups.forEach((group, p) => { for (const e of group) partOf[e.id] = p; });
  const n = gw * gh, owner = new Int16Array(n).fill(-1);
  for (let i = 0; i < n; i++) if (occ[i]) owner[i] = partOf[plan.prep.rootOf[label[i]]];
  const grid = owner.slice();
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const i = y * gw + x;
    if (owner[i] >= 0) continue;
    let o = -1;
    for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= gh) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= gw) continue; const v = owner[yy * gw + xx]; if (v < 0) continue; if (o === -1) o = v; else if (o !== v) o = -2; } }
    grid[i] = o;
  }
  return grid;
}
// Pixel totalmente transparente no formato do arquivo (para apagar, na parte, o que é da outra parte).
function transparentPixel(info) {
  const { colorType: ct, bitDepth: bd, trns, bpp } = info;
  if (ct === 6 || ct === 4) return new Uint8Array(bpp);
  if (ct === 3) { if (!trns) return null; for (let i = 0; i < trns.length; i++) if (trns[i] === 0) return Uint8Array.of(i); return null; }
  if (!trns) return null;
  if (ct === 0) return bd === 8 ? Uint8Array.of(trns[1]) : Uint8Array.of(trns[0], trns[1]);
  return bd === 8 ? Uint8Array.of(trns[1], trns[3], trns[5]) : Uint8Array.of(...trns.subarray(0, 6));
}
// Plano completo de uma escolha (mesmo resultado sempre para os mesmos parâmetros).
export function planFor(analysis, pxPerCm, maxCm, params) {
  checkScale(pxPerCm, maxCm);
  if (!params || params.mode === 'straight') return planStraight(analysis, pxPerCm, maxCm, params?.fill || 1, params?.minGapPx || 0);
  if (!analysis.grid || !transparentPixel(analysis)) throw fail('Este PNG não permite contornar as artes.');
  const plan = planContour(analysis, pxPerCm, maxCm, contourPrep(analysis, pxPerCm, params.mergeMm, params.joins || []), params.fill || 1);
  plan.owner = contourOwner(analysis, plan); plan.grid = { c: analysis.grid.c, gw: analysis.grid.gw, gh: analysis.grid.gh };
  return plan;
}

// Mapa da miniatura: de que parte é cada ponto (-1 = sem arte ou fora das partes).
function previewOf(analysis, plan) {
  const t = analysis.thumb, W = analysis.width, H = analysis.height, out = new Int8Array(t.width * t.height).fill(-1);
  const partOf = plan.mode === 'contour' ? (() => { const m = new Int32Array(plan.prep.count + 1).fill(-1); plan.groups.forEach((g, p) => { for (const e of g) m[e.id] = p; }); return m; })() : null;
  const { c, gw, occ } = analysis.grid || {};
  for (let ty = 0; ty < t.height; ty++) {
    const y = Math.min(H - 1, Math.floor((ty + 0.5) * H / t.height));
    for (let tx = 0; tx < t.width; tx++) {
      if (!t.data[(ty * t.width + tx) * 4 + 3]) continue;
      const x = Math.min(W - 1, Math.floor((tx + 0.5) * W / t.width));
      if (partOf) {
        // ponto da miniatura cai num quadradinho sem pixel visível (borda suave): usa o vizinho com arte
        let o = -1;
        const cx = Math.floor(x / c), cy = Math.floor(y / c);
        for (let d = 0; d <= 1 && o < 0; d++) for (let dy = -d; dy <= d && o < 0; dy++) for (let dx = -d; dx <= d && o < 0; dx++) { const i = (cy + dy) * gw + cx + dx; if (cy + dy >= 0 && cx + dx >= 0 && cx + dx < gw && i < occ.length && occ[i]) o = partOf[plan.prep.rootOf[plan.prep.label[i]]]; }
        out[ty * t.width + tx] = o;
      } else for (const part of plan.parts) if (y >= part.top && y <= part.bottom && x >= part.left && x <= part.right) { out[ty * t.width + tx] = part.index - 1; break; }
    }
  }
  return out;
}
const sortedParts = plan => [...plan.parts].sort((a, b) => a.top - b.top);
const isStraight = plan => plan.mode === 'straight' || sortedParts(plan).every((part, k, list) => !k || part.top > list[k - 1].bottom);
function summarize(analysis, plan, extra = {}) {
  const straight = isStraight(plan), ordered = sortedParts(plan), cuts = plan.mode === 'straight' ? plan.cuts : straight ? ordered.slice(1).map((part, k) => Math.round((ordered[k].bottom + part.top) / 2)) : [];
  return { params: plan.params, mode: plan.mode, straight, mergeMm: plan.params.mergeMm ?? null, fill: plan.params.fill,
    parts: plan.parts.map(({ index, total, top, bottom, left, right, width, height, widthCm, heightCm, oversize }) => ({ index, total, top, bottom, left, right, width, height, widthCm, heightCm, oversize })),
    cuts, maxPx: plan.maxPx, pxPerCm: plan.pxPerCm, maxCm: plan.maxCm, preview: previewOf(analysis, plan), ...extra };
}
// Até 3 opções diferentes. As opções são montadas pelas ESTAMPAS (grupos de pixels próximos), nunca por linha vazia
// solta: o corte só passa entre estampas — reto quando há um corredor vazio entre elas, contornando quando não há
// (13/11 (3), dono: "nos 3 exemplos está cortando reto passando em cima da estampa; tem que contornar a estampa").
// Ordem: dentro do limite; juntando peças a mais distância (mais seguro: menos chance de separar uma estampa); menos
// partes; corte reto antes de contorno; parte cheia até o limite antes de partes parecidas. Opções quase iguais (menos de
// 1 cm de diferença) não se repetem.
export function planOptions(analysis, { pxPerCm, maxCm = 100, budgetMs = 6000, joins = [] } = {}) {
  checkScale(pxPerCm, maxCm);
  const maxPx = maxPxOf(pxPerCm, maxCm), box = artBox(analysis);
  if (!box) throw fail('A imagem não tem arte visível (só transparência).');
  if (box.height <= maxPx) return { fits: true, options: [summarize(analysis, planStraight(analysis, pxPerCm, maxCm, 1))] };
  const candidates = [], started = Date.now();
  const valid = plan => !plan.parts.some(p => p.oversize);
  const score = plan => [plan.parts.filter(p => p.oversize).length, -(plan.params.mergeMm ?? plan.params.minGapPx / pxPerCm * 10), plan.parts.length, isStraight(plan) ? 0 : 1, plan.params.fill === 1 ? 0 : 1, Math.max(...plan.parts.map(p => p.height))];
  const balancedFill = count => Math.min(1, Math.ceil(box.height / Math.max(1, count)) * 1.04 / maxPx);
  const pick = () => {
    // opção acima do limite só aparece quando nenhuma fica dentro dele
    const pool = candidates.some(valid) ? candidates.filter(valid) : candidates;
    const ranked = pool.map(plan => ({ plan, key: score(plan) })).sort((a, b) => { for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i]; return 0; });
    const chosen = [], tolerance = Math.max(1, pxPerCm);
    for (const { plan } of ranked) {
      const parts = sortedParts(plan);
      const same = chosen.some(other => { const o = sortedParts(other); return o.length === parts.length && o.every((p, k) => Math.abs(p.top - parts[k].top) < tolerance && Math.abs(p.bottom - parts[k].bottom) < tolerance && Math.abs(p.left - parts[k].left) < tolerance && Math.abs(p.right - parts[k].right) < tolerance); });
      if (!same) chosen.push(plan);
      if (chosen.length === 3) break;
    }
    return chosen;
  };
  if (analysis.grid && transparentPixel(analysis)) {
    for (const mm of MERGE_MM) {
      const prep = contourPrep(analysis, pxPerCm, mm, joins);
      if (!prep.elements.length) break;
      const level = FILLS.map(fill => planContour(analysis, pxPerCm, maxCm, prep, fill)), good = level.filter(valid);
      if (good.length) level.push(planContour(analysis, pxPerCm, maxCm, prep, balancedFill(Math.min(...good.map(p => p.parts.length)))));
      candidates.push(...level);
      const picked = pick();
      // Só as que ainda podem ser escolhidas guardam o mapa de grupos (cada um tem dezenas de MB num arquivo de 2 m).
      for (const plan of candidates) if (!picked.includes(plan)) plan.prep = null;
      if (picked.length === 3 && picked.every(valid)) break;
      if (picked.some(valid) && Date.now() - started > budgetMs) break;
    }
  } else {
    // Formato sem cor transparente para apagar (raro): só corte reto, e só em faixa vazia de pelo menos 1 cm.
    const minGapPx = Math.ceil(pxPerCm);
    for (const fill of FILLS) candidates.push(planStraight(analysis, pxPerCm, maxCm, fill, minGapPx));
  }
  const chosen = pick();
  const whole = !chosen.some(p => p.parts.length > 1) && box.width * box.height >= 0.9 * analysis.width * analysis.height;
  return { fits: false, background: whole, options: chosen.map((plan, k) => summarize(analysis, plan, { recommended: k === 0, balanced: plan.params.fill !== 1 && !FILLS.includes(plan.params.fill) })) };
}

// Passo 3: grava as partes. Pixels copiados do original (mesmo filtro de linha do original, recalculado para o recorte).
// Partes que se encaixam (corte contornando) são gravadas juntas, cada uma só com as artes dela.
export async function writeParts(blob, analysis, parts, { pxPerCm = 0, owner = null, signal, onProgress } = {}) {
  const info = analysis, bpp = info.bpp, ordered = [...parts].sort((a, b) => a.top - b.top || a.index - b.index), readRgba = rgbaReader(info);
  const masked = !!owner && ordered.every(part => part.mask && part.ownerId >= 0), blank = masked ? transparentPixel(info) : null;
  if (masked && !blank) throw fail('Este PNG não tem cor transparente para separar as artes: divisão cancelada.');
  if (!masked) for (let k = 1; k < ordered.length; k++) if (ordered[k].top <= ordered[k - 1].bottom) throw fail('Partes sobrepostas: divisão cancelada.');
  const physData = pxPerCm > 0 ? (() => { const ppm = Math.round(pxPerCm * 100), d = new Uint8Array(9), v = new DataView(d.buffer); v.setUint32(0, ppm); v.setUint32(4, ppm); d[8] = 1; return d; })() : null;
  const before = info.chunks.filter(c => !c.after && !DROP_CHUNKS.has(c.type)), after = info.chunks.filter(c => c.after && !DROP_CHUNKS.has(c.type)), sourcePhys = info.chunks.find(c => c.type === 'pHYs' && !c.after);
  const blankAll = blank && blank.every(v => v === 0);
  // Apaga (deixa transparente) o que, nesta linha, é de outra parte ou é pó solto.
  const applyMask = (buf, y, part) => {
    const { grid, c, gw, gh } = owner, cy = Math.floor(y / c), base = cy * gw, me = part.ownerId;
    let x = part.left;
    while (x <= part.right) {
      const cx = Math.floor(x / c), end = Math.min(part.right, cx * c + c - 1), o = grid[base + cx];
      let keep = o === me;
      if (o === -2) for (let dy = -1; dy <= 1 && !keep; dy++) { const yy = cy + dy; if (yy < 0 || yy >= gh) continue; for (let dx = -1; dx <= 1; dx++) { const xx = cx + dx; if (xx >= 0 && xx < gw && grid[yy * gw + xx] === me) { keep = true; break; } } }
      if (!keep) {
        const from = (x - part.left) * bpp, to = (end - part.left + 1) * bpp;
        if (blankAll) buf.fill(0, from, to); else for (let o2 = from; o2 < to; o2 += bpp) buf.set(blank, o2);
      }
      x = end + 1;
    }
  };
  const start = part => {
    const cs = new CompressionStream('deflate'), writer = cs.writable.getWriter(), reader = cs.readable.getReader(), idat = [];
    let pending = [], pendingBytes = 0;
    const flush = () => { if (!pendingBytes) return; const data = new Uint8Array(pendingBytes); let o = 0; for (const p of pending) { data.set(p, o); o += p.length; } idat.push(chunkBytes('IDAT', data)); pending = []; pendingBytes = 0; };
    const reading = (async () => { for (;;) { const { value, done } = await reader.read(); if (done) break; pending.push(value); pendingBytes += value.length; if (pendingBytes >= IDAT_TARGET) flush(); } flush(); })();
    reading.catch(() => {});
    const rowLength = part.width * bpp, prev = new Uint8Array(rowLength), work = masked ? new Uint8Array(rowLength) : null;
    const pScale = Math.min(1, 480 / Math.max(part.width, part.height)), pw = Math.max(1, Math.round(part.width * pScale)), ph = Math.max(1, Math.round(part.height * pScale));
    const pSums = new Float64Array(pw * ph * 4), pCounts = new Float64Array(pw * ph), pX = new Int32Array(part.width), pColCount = new Float64Array(pw), pAlpha = new Uint8Array(part.width), readPartAlpha = alphaReader(info, part.width), px = new Uint8ClampedArray(4);
    for (let x = 0; x < part.width; x++) { pX[x] = Math.min(pw - 1, Math.floor(x * pw / part.width)); pColCount[pX[x]]++; }
    return {
      async row(filterType, raw, y) {
        let source = raw.subarray(part.left * bpp, (part.right + 1) * bpp);
        if (work) { work.set(source); applyMask(work, y, part); source = work; }
        readPartAlpha(source, pAlpha);
        const pRow = Math.min(ph - 1, Math.floor((y - part.top) * ph / part.height)) * pw;
        for (let t = 0; t < pw; t++) pCounts[pRow + t] += pColCount[t];
        for (let x = 0; x < part.width; x++) { const a = pAlpha[x]; if (!a) continue; readRgba(source, x, a, px, 0); const k = (pRow + pX[x]) * 4; pSums[k] += px[0] * a; pSums[k + 1] += px[1] * a; pSums[k + 2] += px[2] * a; pSums[k + 3] += a; }
        const line = new Uint8Array(rowLength + 1);
        line[0] = filterType; filterRow(filterType, source, prev, line.subarray(1), bpp); prev.set(source);
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
        const pData = new Uint8ClampedArray(pw * ph * 4);
        for (let k = 0; k < pw * ph; k++) { const A = pSums[k * 4 + 3]; if (A > 0) { pData[k * 4] = pSums[k * 4] / A; pData[k * 4 + 1] = pSums[k * 4 + 1] / A; pData[k * 4 + 2] = pSums[k * 4 + 2] / A; pData[k * 4 + 3] = A / pCounts[k]; } }
        return { ...part, blob: new Blob(pieces, { type: 'image/png' }), preview: { width: pw, height: ph, data: pData } };
      },
      abort() { writer.abort(abortError()).catch(() => {}); },
    };
  };
  const results = new Array(ordered.length), active = new Map();
  let nextStart = 0, finished = 0;
  try {
    for await (const { y, filterType, raw } of pngRows(blob, info, { signal, onProgress })) {
      while (nextStart < ordered.length && ordered[nextStart].top === y) { active.set(nextStart, start(ordered[nextStart])); nextStart++; }
      for (const [k, enc] of active) {
        await enc.row(filterType, raw, y);
        if (y === ordered[k].bottom) { results[k] = await enc.finish(); active.delete(k); finished++; }
      }
      if (finished === ordered.length) break;
    }
  } catch (error) { for (const enc of active.values()) enc.abort(); throw error; }
  if (finished !== ordered.length) throw fail('Não foi possível gravar todas as partes. Nada foi salvo.');
  return results.sort((a, b) => a.index - b.index).map(({ mask, ownerId, ...part }) => part);
}

// Grava a opção escolhida (no Worker): refaz o plano com os mesmos parâmetros e grava as partes.
export async function splitPng(blob, analysis, { pxPerCm, maxCm = 100, params, signal, onProgress } = {}) {
  const plan = planFor(analysis, pxPerCm, maxCm, params);
  if (plan.parts.length < 2) return { plan: summarize(analysis, plan), written: [] };
  const written = await writeParts(blob, analysis, plan.parts, { pxPerCm, owner: plan.owner ? { grid: plan.owner, ...plan.grid } : null, signal, onProgress });
  return { plan: summarize(analysis, plan), written };
}

// PNG RGBA 8 bits gravado linha por linha (sem canvas do tamanho da imagem): usado para converter PDF em PNG.
// Filtro de cada linha: o que deixa os bytes menores (Sub ou Up), como os editores de imagem fazem.
export function createPngWriter({ width, height, ppm = 0 }) {
  if (!(width > 0 && height > 0)) throw fail('Tamanho de imagem inválido.');
  const cs = new CompressionStream('deflate'), writer = cs.writable.getWriter(), reader = cs.readable.getReader(), idat = [], rowLength = width * 4;
  let pending = [], pendingBytes = 0, rows = 0, prev = new Uint8Array(rowLength), sub = new Uint8Array(rowLength + 1), up = new Uint8Array(rowLength + 1);
  const flush = () => { if (!pendingBytes) return; const data = new Uint8Array(pendingBytes); let o = 0; for (const p of pending) { data.set(p, o); o += p.length; } idat.push(chunkBytes('IDAT', data)); pending = []; pendingBytes = 0; };
  const reading = (async () => { for (;;) { const { value, done } = await reader.read(); if (done) break; pending.push(value); pendingBytes += value.length; if (pendingBytes >= IDAT_TARGET) flush(); } flush(); })();
  reading.catch(() => {});
  const cost = line => { let total = 0; for (let i = 1; i < line.length; i++) { const v = line[i]; total += v < 128 ? v : 256 - v; } return total; };
  return {
    async addRow(rgba) {
      if (rows >= height) throw fail('Linhas demais para a imagem.');
      const raw = rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength);
      if (raw.length !== rowLength) throw fail('Linha com tamanho errado.');
      sub[0] = 1; filterRow(1, raw, prev, sub.subarray(1), 4); up[0] = 2; filterRow(2, raw, prev, up.subarray(1), 4);
      const line = (cost(sub) <= cost(up) ? sub : up).slice();
      prev.set(raw); rows++;
      await writer.write(line);
    },
    async finish() {
      if (rows !== height) throw fail('Imagem incompleta: ' + rows + ' de ' + height + ' linhas.');
      await writer.close(); await reading;
      const ihdr = new Uint8Array(13), v = new DataView(ihdr.buffer);
      v.setUint32(0, width); v.setUint32(4, height); ihdr[8] = 8; ihdr[9] = 6;
      const pieces = [SIGNATURE, chunkBytes('IHDR', ihdr)];
      if (ppm > 0) { const d = new Uint8Array(9), dv = new DataView(d.buffer); dv.setUint32(0, ppm); dv.setUint32(4, ppm); d[8] = 1; pieces.push(chunkBytes('pHYs', d)); }
      pieces.push(...idat, chunkBytes('IEND', new Uint8Array(0)));
      return new Blob(pieces, { type: 'image/png' });
    },
  };
}

// Nome das partes: "ana" → "ana 1/2", "ana 2/2".
export const partName = (base, index, total) => (String(base || '').trim() || 'Arte') + ' ' + index + '/' + total;
export const partFileName = (base, index, total) => (String(base || '').trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'arte') + ' ' + index + '-' + total + '.png';
