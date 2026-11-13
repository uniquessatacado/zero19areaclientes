// 2.17.96: dividir PNG grande em partes de até N cm sem cortar arte nem mudar tamanho (png-split.js).
// PNGs reais gerados aqui (zlib do Node), com filtros variados, vários IDAT, perfil de cor e texto; cada parte é
// decodificada por um leitor independente e comparada byte a byte com o recorte do original.
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { scanPng, planSplit, planOptions, planFor, splitPng, writeParts, readPngInfo, partName, partFileName, createPngWriter, VISIBLE_ALPHA } from '../png-split.js';

const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = bytes => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); out.write(type, 4, 'latin1'); Buffer.from(data).copy(out, 8); out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length); return out; };
const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
function filterLine(type, raw, prev, bpp) {
  const out = Buffer.alloc(raw.length + 1); out[0] = type;
  for (let i = 0; i < raw.length; i++) {
    const a = i >= bpp ? raw[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
    out[i + 1] = (raw[i] - [0, a, b, (a + b) >> 1, paeth(a, b, c)][type]) & 255;
  }
  return out;
}
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
// Monta um PNG a partir dos bytes crus das linhas. extra: { before:[[type,data]], after:[[type,data]], idatSize, interlace }
function encodePng({ width, height, bitDepth = 8, colorType = 6, rows, plte, trns, ppm, extra = {}, filters = 'random', seed = 7 }) {
  const bpp = Math.max(1, CHANNELS[colorType] * bitDepth / 8), rowBytes = Math.ceil(width * CHANNELS[colorType] * bitDepth / 8);
  let prev = Buffer.alloc(rowBytes), state = seed;
  const rnd = () => (state = (state * 1103515245 + 12345) >>> 0) / 2 ** 32;
  const lines = [];
  for (let y = 0; y < height; y++) { const type = filters === 'random' ? Math.floor(rnd() * 5) : filters; lines.push(filterLine(type, rows[y], prev, bpp)); prev = rows[y]; }
  const compressed = zlib.deflateSync(Buffer.concat(lines), { level: 6 }), idatSize = extra.idatSize || 1000, idat = [];
  for (let at = 0; at < compressed.length; at += idatSize) idat.push(chunk('IDAT', compressed.subarray(at, at + idatSize)));
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = bitDepth; ihdr[9] = colorType; ihdr[12] = extra.interlace ? 1 : 0;
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr)];
  for (const [type, data] of extra.before || []) parts.push(chunk(type, data));
  if (ppm) { const d = Buffer.alloc(9); d.writeUInt32BE(ppm, 0); d.writeUInt32BE(ppm, 4); d[8] = 1; parts.push(chunk('pHYs', d)); }
  if (plte) parts.push(chunk('PLTE', plte));
  if (trns) parts.push(chunk('tRNS', trns));
  parts.push(...idat);
  for (const [type, data] of extra.after || []) parts.push(chunk(type, data));
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return new Blob([Buffer.concat(parts)], { type: 'image/png' });
}
// Leitor independente (só para o teste).
async function decodePng(blob) {
  const buf = Buffer.from(await blob.arrayBuffer());
  assert.deepEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'assinatura PNG');
  let off = 8, ihdr, idat = [], chunks = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('latin1', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    assert.equal(buf.readUInt32BE(off + 8 + len), crc(buf.subarray(off + 4, off + 8 + len)), 'CRC de ' + type);
    chunks.push({ type, data }); if (type === 'IHDR') ihdr = data; if (type === 'IDAT') idat.push(data);
    off += 12 + len; if (type === 'IEND') break;
  }
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4), bitDepth = ihdr[8], colorType = ihdr[9];
  const bpp = Math.max(1, CHANNELS[colorType] * bitDepth / 8), rowBytes = Math.ceil(width * CHANNELS[colorType] * bitDepth / 8), raw = zlib.inflateSync(Buffer.concat(idat));
  assert.equal(raw.length, height * (rowBytes + 1), 'tamanho dos dados da imagem');
  const rows = []; let prev = Buffer.alloc(rowBytes);
  for (let y = 0; y < height; y++) {
    const type = raw[y * (rowBytes + 1)], f = raw.subarray(y * (rowBytes + 1) + 1, (y + 1) * (rowBytes + 1)), out = Buffer.alloc(rowBytes);
    for (let i = 0; i < rowBytes; i++) { const a = i >= bpp ? out[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0; out[i] = (f[i] + [0, a, b, (a + b) >> 1, paeth(a, b, c)][type]) & 255; }
    rows.push(out); prev = out;
  }
  return { width, height, bitDepth, colorType, rows, chunks, bpp };
}

// Arte de teste RGBA 8: retângulos coloridos com borda suave (alfa 3) e pó quase invisível (alfa 2) longe da arte.
function rgbaCanvas(width, height) { const rows = Array.from({ length: height }, () => Buffer.alloc(width * 4)); return { width, height, rows, set(x, y, r, g, b, a) { const o = x * 4; rows[y][o] = r; rows[y][o + 1] = g; rows[y][o + 2] = b; rows[y][o + 3] = a; } }; }
function rect(c, x0, y0, w, h, color, soft = true) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) c.set(x, y, color[0], color[1], color[2], 255 - ((x * 7 + y * 3) % 40));
  if (soft) { for (let x = x0; x < x0 + w; x++) { c.set(x, y0 - 1, color[0], color[1], color[2], 3); c.set(x, y0 + h, color[0], color[1], color[2], 5); } for (let y = y0; y < y0 + h; y++) { c.set(x0 - 1, y, ...color, 4); c.set(x0 + w, y, ...color, 6); } }
}
const alphaAt = (img, x, y) => img.rows[y][x * 4 + 3];

// Confere: partes ≤ limite (ou marcadas), sem sobreposição, corte só em linha sem pixel visível, cada parte = recorte exato,
// nenhum pixel visível perdido.
async function checkSplit(source, blob, { pxPerCm, maxCm, expectParts, expectOversize = 0, label }) {
  const analysis = await scanPng(blob), plan = planSplit(analysis, { pxPerCm, maxCm, params: { mode: 'straight', fill: 1 } });
  if (expectParts !== undefined) assert.equal(plan.parts.length, expectParts, label + ': número de partes');
  assert.equal(plan.parts.filter(p => p.oversize).length, expectOversize, label + ': partes maiores que o limite');
  for (const p of plan.parts) if (!p.oversize) assert(p.height <= plan.maxPx, label + ': parte ' + p.index + ' passa do limite');
  for (let k = 1; k < plan.parts.length; k++) {
    const a = plan.parts[k - 1], b = plan.parts[k];
    assert(b.top > a.bottom, label + ': partes sobrepostas');
    // entre o fim da arte de uma e o começo da outra só pode haver linhas sem pixel visível
    let lastVisibleA = a.bottom; while (analysis.rows.maxA[lastVisibleA] < VISIBLE_ALPHA) lastVisibleA--;
    let firstVisibleB = b.top; while (analysis.rows.maxA[firstVisibleB] < VISIBLE_ALPHA) firstVisibleB++;
    for (let y = lastVisibleA + 1; y < firstVisibleB; y++) assert(analysis.rows.maxA[y] < VISIBLE_ALPHA, label + ': corte em linha com pixel');
    assert(firstVisibleB > lastVisibleA + 1, label + ': precisa de pelo menos uma linha vazia entre as partes');
  }
  const written = await writeParts(blob, analysis, plan.parts, { pxPerCm });
  assert.equal(written.length, plan.parts.length, label + ': todas as partes gravadas');
  const bpp = analysis.bpp;
  for (const part of written) {
    const img = await decodePng(part.blob);
    assert.equal(img.width, part.width, label + ': largura da parte'); assert.equal(img.height, part.height, label + ': altura da parte');
    assert.equal(img.colorType, analysis.colorType); assert.equal(img.bitDepth, analysis.bitDepth);
    for (let y = 0; y < part.height; y++) assert(img.rows[y].equals(source.rows[part.top + y].subarray(part.left * bpp, (part.right + 1) * bpp)), label + ': pixels diferentes na linha ' + (part.top + y));
    const phys = img.chunks.find(c => c.type === 'pHYs');
    assert(phys && phys.data.readUInt32BE(0) === Math.round(pxPerCm * 100) && phys.data[8] === 1, label + ': DPI da parte');
    assert.equal(img.chunks.filter(c => c.type === 'pHYs').length, 1, label + ': um pHYs só');
    const idatAt = img.chunks.findIndex(c => c.type === 'IDAT');
    for (const c of img.chunks.slice(idatAt)) assert(c.type === 'IDAT' || img.chunks.indexOf(c) > img.chunks.map(x => x.type).lastIndexOf('IDAT'), label + ': IDAT seguidos');
  }
  return { analysis, plan, written };
}
// Todo pixel visível (alfa ≥ 8) do original está numa parte, no lugar certo.
function assertNothingLost(source, plan, alphaOf, label) {
  for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    if (alphaOf(source, x, y) < VISIBLE_ALPHA) continue;
    const p = plan.parts.find(part => y >= part.top && y <= part.bottom && x >= part.left && x <= part.right);
    assert(p, label + ': pixel visível perdido em ' + x + ',' + y);
  }
}

// 1) "2 metros" a 12 px/cm (240 cm = 2880 px), partes de até 100 cm (1200 px), RGBA 8, filtros variados, vários IDAT,
//    perfil de cor antes e texto depois da imagem.
{
  const pxPerCm = 12, c = rgbaCanvas(420, 2880);
  rect(c, 30, 20, 200, 300, [220, 30, 40]);          // arte A
  rect(c, 250, 200, 120, 500, [30, 90, 220]);        // arte B (cruza linhas com a A: um bloco só)
  rect(c, 40, 760, 330, 380, [20, 160, 70]);         // arte C: termina em 1140 (cabe na 1ª parte até 1200)
  rect(c, 60, 1180, 300, 600, [240, 200, 30]);       // arte D: começa em 1180 → corte antes dela
  rect(c, 10, 1900, 400, 700, [140, 40, 160]);       // arte E
  rect(c, 100, 2700, 150, 120, [0, 0, 0]);           // arte F
  c.set(5, 1150, 255, 255, 255, 2);                  // pó quase invisível numa linha vazia (não segura nada)
  const blob = encodePng({ width: c.width, height: c.height, rows: c.rows, ppm: 11811, extra: { before: [['iCCP', Buffer.concat([Buffer.from('teste\0\0'), zlib.deflateSync(Buffer.from('perfil'))])]], after: [['tEXt', Buffer.from('Comment\0arte ana')]] } });
  const info = await readPngInfo(blob);
  assert.equal(info.width, 420); assert.equal(info.height, 2880); assert.equal(info.idat.length > 5, true, 'vários IDAT');
  assert.equal(info.dpi, 300);
  const { plan, written } = await checkSplit(c, blob, { pxPerCm, maxCm: 100, label: 'arte de 2,4 m' });
  assertNothingLost(c, plan, alphaAt, 'arte de 2,4 m');
  assert.equal(plan.parts.length, 3, 'A+B+C | D | E+F');
  assert.equal(plan.parts[0].top, 19, 'borda suave de cima incluída'); assert.equal(plan.parts[0].bottom, 1140, 'borda suave de baixo incluída');
  assert.equal(plan.parts[1].top, 1179); assert.equal(plan.parts[1].bottom, 1780);
  assert.equal(plan.parts[0].left, 29); assert.equal(plan.parts[0].right, 370);
  for (const part of written) {
    const img = await decodePng(part.blob), types = img.chunks.map(x => x.type);
    assert(types.indexOf('iCCP') > 0 && types.indexOf('iCCP') < types.indexOf('IDAT'), 'perfil de cor preservado antes da imagem');
    assert(types.indexOf('tEXt') > types.lastIndexOf('IDAT'), 'texto preservado depois da imagem');
  }
  // medida exata: cm = pixels / escala, sem arredondar a escala
  assert.equal(plan.parts[0].heightCm, plan.parts[0].height / pxPerCm);
  assert(Math.abs(plan.parts[0].widthCm - 342 / 12) < 1e-9);
  // cortes no meio das faixas vazias
  assert.deepEqual(plan.cuts, [Math.round((1140 + 1179) / 2), Math.round((1780 + 1899) / 2)]);
  const auto = await scanPng(blob).then(a => planOptions(a, { pxPerCm, maxCm: 100 }));
  assert.equal(auto.options[0].straight, true, 'com corredor vazio entre as estampas a recomendada é corte reto'); assert.equal(auto.options[0].parts.length, 3);
  assert(auto.options.length >= 2 && auto.options.length <= 3, 'até 3 opções');
  // partes de até 50 cm: mais partes, mesma garantia
  const half = await checkSplit(c, blob, { pxPerCm, maxCm: 50, label: 'partes de 50 cm', expectOversize: 3 });
  assertNothingLost(c, half.plan, alphaAt, 'partes de 50 cm');
}

// 2) Arte maior que o limite e sem linha vazia: não corta, a parte fica maior e volta marcada.
{
  const c = rgbaCanvas(100, 600);
  rect(c, 10, 10, 80, 500, [10, 10, 10]);
  rect(c, 10, 540, 50, 40, [200, 10, 10]);
  const blob = encodePng({ width: c.width, height: c.height, rows: c.rows });
  const { plan } = await checkSplit(c, blob, { pxPerCm: 2, maxCm: 100, expectParts: 2, expectOversize: 1, label: 'arte maior que o limite' });
  assert.equal(plan.parts[0].oversize, true); assert.equal(plan.parts[1].oversize, false);
}

// 3) Outros formatos: RGBA 16 bits, cinza+alfa, paleta com transparência, RGB com cor transparente.
{
  const W = 60, H = 400, art = (y, x) => (y > 20 && y < 150 && x > 5 && x < 50) || (y > 220 && y < 380 && x > 10 && x < 30);
  const rows16 = Array.from({ length: H }, (_, y) => { const r = Buffer.alloc(W * 8); for (let x = 0; x < W; x++) if (art(y, x)) { r.writeUInt16BE(1000 + x, x * 8); r.writeUInt16BE(40000, x * 8 + 2); r.writeUInt16BE(y * 100, x * 8 + 4); r.writeUInt16BE(65535 - y, x * 8 + 6); } return r; });
  const img16 = { width: W, height: H, rows: rows16 };
  await checkSplit(img16, encodePng({ width: W, height: H, bitDepth: 16, colorType: 6, rows: rows16 }), { pxPerCm: 2, maxCm: 100, expectParts: 2, label: 'RGBA 16 bits' });
  const rowsGa = Array.from({ length: H }, (_, y) => { const r = Buffer.alloc(W * 2); for (let x = 0; x < W; x++) if (art(y, x)) { r[x * 2] = (x * 4) & 255; r[x * 2 + 1] = 200; } return r; });
  await checkSplit({ width: W, height: H, rows: rowsGa }, encodePng({ width: W, height: H, colorType: 4, rows: rowsGa }), { pxPerCm: 2, maxCm: 100, expectParts: 2, label: 'cinza com alfa' });
  const rowsPal = Array.from({ length: H }, (_, y) => { const r = Buffer.alloc(W); for (let x = 0; x < W; x++) r[x] = art(y, x) ? 1 + (x % 3) : 0; return r; });
  const plte = Buffer.from([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]), trns = Buffer.from([0]);
  await checkSplit({ width: W, height: H, rows: rowsPal }, encodePng({ width: W, height: H, colorType: 3, rows: rowsPal, plte, trns }), { pxPerCm: 2, maxCm: 100, expectParts: 2, label: 'paleta com transparência' });
  const rowsRgb = Array.from({ length: H }, (_, y) => { const r = Buffer.alloc(W * 3, 0xff); for (let x = 0; x < W; x++) if (art(y, x)) { r[x * 3] = 10; r[x * 3 + 1] = x; r[x * 3 + 2] = 99; } return r; });
  await checkSplit({ width: W, height: H, rows: rowsRgb }, encodePng({ width: W, height: H, colorType: 2, rows: rowsRgb, trns: Buffer.from([0, 255, 0, 255, 0, 255]) }), { pxPerCm: 2, maxCm: 100, expectParts: 2, label: 'RGB com cor transparente' });
}

// 4) Arquivos que não dá para dividir: mensagem clara, nada é gravado.
{
  const c = rgbaCanvas(20, 20); rect(c, 2, 2, 10, 10, [1, 2, 3]);
  const interlaced = encodePng({ width: 20, height: 20, rows: c.rows, extra: { interlace: true } });
  await assert.rejects(scanPng(interlaced), /entrelaçado/);
  const good = Buffer.from(await encodePng({ width: 20, height: 20, rows: c.rows }).arrayBuffer());
  const broken = Buffer.from(good); broken[20] ^= 0xff;
  await assert.rejects(readPngInfo(new Blob([broken])), /corrompido/);
  await assert.rejects(readPngInfo(new Blob([good.subarray(0, good.length - 30)])), /incompleto|corrompido/);
  await assert.rejects(readPngInfo(new Blob([Buffer.from('não é png nenhum, só texto para testar')])), /não é um PNG|inválido/);
  const empty = rgbaCanvas(10, 10), emptyBlob = encodePng({ width: 10, height: 10, rows: empty.rows });
  assert.throws(() => planSplit({ ...emptyBlob, height: 10, width: 10, rows: { maxA: new Uint8Array(10), min8: new Int32Array(10).fill(-1), max8: new Int32Array(10).fill(-1), minAny: new Int32Array(10).fill(-1), maxAny: new Int32Array(10).fill(-1) } }, { pxPerCm: 1, maxCm: 100 }), /sem arte|não tem arte/);
  const scanned = await scanPng(encodePng({ width: 20, height: 20, rows: c.rows }));
  assert.throws(() => planSplit(scanned, { pxPerCm: 0, maxCm: 100 }), /medida/);
}

// 5) Caixa da arte = mesma regra da prancheta do 019 (alfa ≥ 8, até 2 px de borda suave): comparação com a regra exata.
{
  const exactTrim = img => {
    const w = img.width, h = img.height, a = (x, y) => alphaAt(img, x, y), rowV = y => { for (let x = 0; x < w; x++) if (a(x, y) >= 8) return true; return false; }, colV = x => { for (let y = 0; y < h; y++) if (a(x, y) >= 8) return true; return false; };
    let top = 0, bottom = h - 1, left = 0, right = w - 1; while (top < h && !rowV(top)) top++; while (bottom >= top && !rowV(bottom)) bottom--; while (left < w && !colV(left)) left++; while (right >= left && !colV(right)) right--;
    const er = (y, x1, x2) => { for (let x = x1; x <= x2; x++) if (a(x, y) > 0) return true; return false; }, ec = (x, y1, y2) => { for (let y = y1; y <= y2; y++) if (a(x, y) > 0) return true; return false; };
    for (let i = 0; i < 2; i++) { if (top > 0 && er(top - 1, left, right)) top--; if (bottom < h - 1 && er(bottom + 1, left, right)) bottom++; if (left > 0 && ec(left - 1, top, bottom)) left--; if (right < w - 1 && ec(right + 1, top, bottom)) right++; }
    return { top, bottom, left, right };
  };
  for (let seed = 1; seed <= 12; seed++) {
    const c = rgbaCanvas(80, 120); let s = seed;
    const rnd = n => (s = (s * 1103515245 + 12345) >>> 0) % n;
    for (let k = 0; k < 4; k++) rect(c, 3 + rnd(50), 3 + rnd(80), 2 + rnd(20), 2 + rnd(30), [rnd(255), rnd(255), rnd(255)], rnd(2) === 1);
    const analysis = await scanPng(encodePng({ width: 80, height: 120, rows: c.rows, seed }));
    const exact = exactTrim(c), box = analysis.box;
    for (const side of ['top', 'left']) assert(box[side] <= exact[side] && exact[side] - box[side] <= 2, 'caixa ' + side + ' seed ' + seed);
    for (const side of ['bottom', 'right']) assert(box[side] >= exact[side] && box[side] - exact[side] <= 2, 'caixa ' + side + ' seed ' + seed);
  }
}

// 6b) Sem nenhuma linha reta vazia (artes encaixadas em escada): o corte contorna as artes. Cada arte inteira numa parte
//     só, nenhum pixel visível perdido nem repetido, o que é da outra parte fica transparente, até 3 opções diferentes
//     para escolher, e a recomendada não separa uma estampa de duas peças que fica bem no lugar do corte.
{
  const pxPerCm = 12, maxCm = 100, maxPx = 1200, W = 600, H = 2200, c = rgbaCanvas(W, H), designs = [];
  const columns = [[20, 180, 20], [220, 380, 120], [420, 580, 220]];
  for (const [x0, x1, y0] of columns) for (let k = 0; k < 6; k++) { const top = y0 + k * 320; designs.push([x0, x1, top, top + 299]); }
  for (const [x0, x1, top, bottom] of designs) {
    if (x0 === 220 && top === 1080) { rect(c, x0, top, x1 - x0 + 1, 120, [200, 0, 90]); rect(c, x0, top + 128, x1 - x0 + 1, bottom - top - 127, [200, 0, 90]); continue; } // estampa de 2 peças (vão de 8 px = 6,7 mm)
    rect(c, x0, top, x1 - x0 + 1, bottom - top + 1, [(x0 * 3) & 255, (top >> 2) & 255, 120]);
  }
  for (let y = 25; y < 2120; y++) assert(c.rows[y].some((v, i) => i % 4 === 3 && v >= 8), 'teste montado sem linha reta vazia (' + y + ')');
  const blob = encodePng({ width: W, height: H, rows: c.rows }), analysis = await scanPng(blob);
  const straight = planSplit(analysis, { pxPerCm, maxCm, params: { mode: 'straight', fill: 1 } });
  assert.equal(straight.parts.length, 1); assert.equal(straight.parts[0].oversize, true, 'sem linha reta: o corte reto não consegue');
  const { options, fits } = planOptions(analysis, { pxPerCm, maxCm });
  assert.equal(fits, false); assert(options.length >= 2 && options.length <= 3, 'até 3 opções: ' + options.length);
  assert(options.every(o => o.parts.every(p => !p.oversize)), 'todas as opções dentro do limite');
  assert.equal(options[0].recommended, true); assert.equal(options[0].mode, 'contour'); assert.equal(options[0].parts.length, 2, 'recomendada com 2 partes');
  assert(options[0].mergeMm >= 5, 'recomendada junta peças a pelo menos 5 mm: ' + options[0].mergeMm);
  for (let a = 0; a < options.length; a++) for (let b = a + 1; b < options.length; b++) assert.notDeepEqual(options[a].parts.map(p => [p.top, p.bottom, p.left, p.right]), options[b].parts.map(p => [p.top, p.bottom, p.left, p.right]), 'opções diferentes');
  for (const o of options) assert.equal(o.preview.length, analysis.thumb.width * analysis.thumb.height, 'mapa de cada opção');
  // grupos de pixels visíveis ligados (8 vizinhos) do original
  const comp = new Int32Array(W * H).fill(-1); let comps = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (alphaAt(c, x, y) < VISIBLE_ALPHA || comp[y * W + x] >= 0) continue;
    const stack = [y * W + x]; comp[y * W + x] = comps;
    while (stack.length) { const i = stack.pop(), yy = (i / W) | 0, xx = i - yy * W; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const ny = yy + dy, nx = xx + dx; if (ny < 0 || nx < 0 || ny >= H || nx >= W) continue; const j = ny * W + nx; if (comp[j] < 0 && alphaAt(c, nx, ny) >= VISIBLE_ALPHA) { comp[j] = comps; stack.push(j); } } }
    comps++;
  }
  for (const [k, option] of options.entries()) {
    const label = 'contorno opção ' + (k + 1), again = planFor(analysis, pxPerCm, maxCm, option.params);
    assert.deepEqual(again.parts.map(p => [p.top, p.bottom, p.left, p.right]), option.parts.map(p => [p.top, p.bottom, p.left, p.right]), label + ': mesmo resultado ao refazer');
    const { written } = await splitPng(blob, analysis, { pxPerCm, maxCm, params: option.params });
    assert.equal(written.length, option.parts.length, label + ': partes gravadas');
    const where = new Int8Array(W * H).fill(-1);
    for (const part of written) {
      assert(part.height <= maxPx, label + ': parte passa do limite');
      const img = await decodePng(part.blob);
      assert.equal(img.width, part.width); assert.equal(img.height, part.height);
      const phys = img.chunks.find(ch => ch.type === 'pHYs'); assert(phys && phys.data.readUInt32BE(0) === 1200, label + ': DPI');
      for (let y = 0; y < part.height; y++) for (let x = 0; x < part.width; x++) {
        const o = x * 4, sx = part.left + x, sy = part.top + y, px = img.rows[y].subarray(o, o + 4);
        if (px[0] === 0 && px[1] === 0 && px[2] === 0 && px[3] === 0) continue; // apagado (é de outra parte) ou transparente
        assert(px.equals(c.rows[sy].subarray(sx * 4, sx * 4 + 4)), label + ': pixel diferente do original em ' + sx + ',' + sy);
        if (px[3] >= VISIBLE_ALPHA) { assert.equal(where[sy * W + sx], -1, label + ': pixel repetido em duas partes ' + sx + ',' + sy); where[sy * W + sx] = part.index; }
      }
    }
    const partOfComp = new Map();
    for (let i = 0; i < W * H; i++) {
      if (comp[i] < 0) continue;
      assert(where[i] > 0, label + ': pixel visível perdido em ' + (i % W) + ',' + ((i / W) | 0));
      const seen = partOfComp.get(comp[i]);
      if (seen === undefined) partOfComp.set(comp[i], where[i]); else assert.equal(where[i], seen, label + ': uma arte foi cortada em duas partes');
    }
    if (option.recommended) {
      const top = where[1090 * W + 300], bottom = where[1300 * W + 300];
      assert.equal(top, bottom, 'recomendada: a estampa de 2 peças fica inteira numa parte só');
    }
  }
  // Fundo em tudo (sem transparência entre as artes): não dá para cortar sem cortar arte, e a tela avisa.
  const full = rgbaCanvas(80, 400); rect(full, 0, 0, 80, 400, [9, 9, 9], false);
  const bg = planOptions(await scanPng(encodePng({ width: 80, height: 400, rows: full.rows })), { pxPerCm: 2, maxCm: 100 });
  assert.equal(bg.options[0].parts.length, 1); assert.equal(bg.options[0].parts[0].oversize, true); assert.equal(bg.background, true, 'avisa que parece ter fundo');
}

// 6c) Estampa com linhas vazias por dentro (halftone em linhas, desenho com texto embaixo) bem onde cairia o corte de
//     1 m: nenhuma opção pode cortar dentro dela (13/11, dono: "nos 3 exemplos está cortando reto passando em cima da
//     estampa; tem que contornar a estampa para não cortar"). O corte só passa ENTRE as estampas.
{
  const pxPerCm = 12, W = 300, H = 2400, c = rgbaCanvas(W, H);
  rect(c, 20, 20, 260, 780, [30, 30, 200]);                                   // estampa de cima
  for (let y = 900; y <= 1500; y += 4) rect(c, 20, y, 260, 2, [200, 30, 30], false); // halftone em linhas: 2 px de pixel, 2 px vazios
  rect(c, 40, 1530, 220, 40, [200, 30, 30], false);                            // texto embaixo do desenho (a 28 px = 2,3 cm)
  rect(c, 20, 1700, 260, 650, [30, 160, 30]);                                  // estampa de baixo
  const blob = encodePng({ width: W, height: H, rows: c.rows }), analysis = await scanPng(blob), halftone = [];
  for (let y = 900; y <= 1569; y++) for (let x = 40; x < 260; x += 37) if (alphaAt(c, x, y) >= VISIBLE_ALPHA) halftone.push([x, y]);
  // o corte reto "em qualquer linha vazia" (o de antes) cortaria a estampa:
  const naive = planSplit(analysis, { pxPerCm, maxCm: 100, params: { mode: 'straight', fill: 1 } });
  assert(naive.parts.some(p => p.top > 900 && p.top < 1500), 'o corte reto antigo cortaria dentro da estampa (o teste reproduz o problema)');
  const { options } = planOptions(analysis, { pxPerCm, maxCm: 100 });
  assert(options.length >= 1);
  for (const [k, option] of options.entries()) {
    const plan = planFor(analysis, pxPerCm, 100, option.params), { written } = await splitPng(blob, analysis, { pxPerCm, maxCm: 100, params: option.params });
    const where = new Map();
    for (const part of written) {
      const img = await decodePng(part.blob);
      for (const [x, y] of halftone) if (y >= part.top && y <= part.bottom && x >= part.left && x <= part.right && img.rows[y - part.top][(x - part.left) * 4 + 3] >= VISIBLE_ALPHA) where.set(x + ',' + y, part.index);
    }
    const parts = new Set(halftone.map(([x, y]) => where.get(x + ',' + y)));
    assert(!parts.has(undefined), 'opção ' + (k + 1) + ': pedaço da estampa perdido');
    assert.equal(parts.size, 1, 'opção ' + (k + 1) + ': a estampa foi cortada em ' + parts.size + ' partes (' + JSON.stringify(option.params) + ')');
    assert(plan.parts.every(p => !p.oversize), 'opção ' + (k + 1) + ' dentro do limite');
  }
}

// 6d) Legenda embaixo da estampa (13/11 (4), dono: "a frase nutri que ficava embaixo desta arte ficou em outro corte"):
//     coluna de estampas a 4 mm umas das outras; a frase fica a 8 mm embaixo da sua estampa e a 12 mm da estampa de baixo;
//     o limite cai entre a estampa e a frase. Em TODAS as opções a frase vai junto com a sua estampa.
{
  const pxPerCm = 40, W = 800, H = 3520, c = rgbaCanvas(W, H);
  rect(c, 50, 40, 701, 800, [30, 30, 200]);       // D1
  rect(c, 50, 855, 701, 800, [200, 30, 30]);      // D2 ("bonito ser gostosa de energia")
  rect(c, 250, 1686, 301, 120, [200, 30, 30]);    // a frase "nutri" embaixo da D2 (8 mm)
  rect(c, 50, 1854, 701, 800, [30, 160, 30]);     // D3 (12 mm embaixo da frase)
  rect(c, 50, 2670, 701, 800, [160, 160, 30]);    // D4
  const blob = encodePng({ width: W, height: H, rows: c.rows }), analysis = await scanPng(blob);
  const { options } = planOptions(analysis, { pxPerCm, maxCm: 42.5 });
  assert(options.length >= 1 && options.every(o => !o.parts.some(p => p.oversize)), 'opções dentro do limite');
  for (const [k, option] of options.entries()) {
    const plan = planFor(analysis, pxPerCm, 42.5, option.params), partAt = (x, y) => plan.parts.find(p => y >= p.top && y <= p.bottom && x >= p.left && x <= p.right && (!plan.owner || plan.owner[Math.floor(y / plan.grid.c) * plan.grid.gw + Math.floor(x / plan.grid.c)] === p.ownerId))?.index;
    assert.equal(partAt(400, 1740), partAt(400, 1200), 'opção ' + (k + 1) + ': a frase ficou em outra parte que a estampa');
  }
}

// 6e) Juntar à mão: sem junção o adesivo vai com a estampa de baixo (corte reto entre as estampas); juntado à estampa de
//     cima, vai com ela em todas as opções.
{
  const pxPerCm = 12, W = 600, H = 2300, c = rgbaCanvas(W, H);
  rect(c, 0, 40, 301, 961, [30, 30, 200]);        // B
  rect(c, 450, 1050, 101, 101, [200, 120, 0]);    // adesivo
  rect(c, 0, 1250, 301, 901, [30, 160, 30]);      // E
  const blob = encodePng({ width: W, height: H, rows: c.rows }), analysis = await scanPng(blob);
  const where = (option, x, y) => { const plan = planFor(analysis, pxPerCm, 100, option.params); return plan.parts.find(p => y >= p.top && y <= p.bottom && x >= p.left && x <= p.right && plan.owner[Math.floor(y / plan.grid.c) * plan.grid.gw + Math.floor(x / plan.grid.c)] === p.ownerId)?.index; };
  const free = planOptions(analysis, { pxPerCm, maxCm: 100 }).options[0];
  assert.equal(where(free, 500, 1100), where(free, 150, 1700), 'sem juntar: o adesivo vai com a estampa de baixo (corte reto)');
  const joined = planOptions(analysis, { pxPerCm, maxCm: 100, joins: [[500, 1100, 150, 500]] });
  for (const option of joined.options) assert.equal(where(option, 500, 1100), where(option, 150, 500), 'juntado: o adesivo vai com a estampa de cima');
  assert.deepEqual(joined.options[0].params.joins, [[500, 1100, 150, 500]], 'a junção vai junto na escolha (mesmo resultado ao gravar)');
  const { written } = await splitPng(blob, analysis, { pxPerCm, maxCm: 100, params: joined.options[0].params });
  for (const part of written) { assert(part.preview && part.preview.width > 0 && part.preview.height > 0, 'miniatura da parte'); assert(part.preview.data.some((v, i) => i % 4 === 3 && v > 200), 'miniatura com a arte'); }
}

// 6f) Gravador de PNG linha por linha (PDF convertido): o que entra é o que sai.
{
  const W = 37, H = 23, rows = Array.from({ length: H }, (_, y) => { const r = new Uint8Array(W * 4); for (let i = 0; i < r.length; i++) r[i] = (i * 7 + y * 13) & 255; return r; });
  const writer = createPngWriter({ width: W, height: H, ppm: 11811 });
  for (const r of rows) await writer.addRow(r);
  const img = await decodePng(await writer.finish());
  assert.equal(img.width, W); assert.equal(img.height, H); assert.equal(img.colorType, 6);
  for (let y = 0; y < H; y++) assert(img.rows[y].equals(Buffer.from(rows[y])), 'linha ' + y + ' igual');
  assert.equal(img.chunks.find(ch => ch.type === 'pHYs').data.readUInt32BE(0), 11811, 'DPI do PNG convertido');
}

// 6) Nomes: "ana" → "ana 1/2"; arquivo sem barra.
assert.equal(partName('ana', 1, 2), 'ana 1/2'); assert.equal(partName('  ', 2, 3), 'Arte 2/3');
assert.equal(partFileName('ana/maria', 1, 2), 'ana-maria 1-2.png');

// 7) Tamanho real (opcional): PNG_SPLIT_BIG=1 gera ~2 m a 300 DPI (58 × 200 cm) e mede o tempo.
if (process.env.PNG_SPLIT_BIG === '1') {
  const W = 6850, H = 23622, rows = [];
  for (let y = 0; y < H; y++) { const r = Buffer.alloc(W * 4); const band = Math.floor(y / 1500); if (y % 1500 < 1350) for (let x = 200; x < W - 200; x++) { const o = x * 4; r[o] = (x + band * 40) & 255; r[o + 1] = (y >> 3) & 255; r[o + 2] = 120; r[o + 3] = 255; } rows.push(r); }
  const blob = encodePng({ width: W, height: H, rows, ppm: 11811, extra: { idatSize: 65536 }, filters: 4 });
  rows.length = 0;
  const t0 = Date.now(), analysis = await scanPng(blob), t1 = Date.now(), plan = planSplit(analysis, { pxPerCm: 11811 / 100, maxCm: 100 }), written = await writeParts(blob, analysis, plan.parts, { pxPerCm: 11811 / 100 }), t2 = Date.now();
  console.log('2 m (' + (blob.size / 1048576).toFixed(0) + ' MB): leitura ' + (t1 - t0) + ' ms, gravação ' + (t2 - t1) + ' ms, partes ' + written.map(p => (p.heightCm).toFixed(1) + ' cm / ' + (p.blob.size / 1048576).toFixed(0) + ' MB').join(' · '));
  assert(plan.parts.every(p => p.height <= plan.maxPx));
}

console.log('PASS dividir PNG: corte só entre estampas (reto ou contornando, até 3 opções), legenda junto da estampa, peças juntadas à mão, miniaturas, gravador do PDF, cortes só em linha sem pixel, partes até o limite (ou marcadas), pixels idênticos ao original, nada visível perdido, DPI exato, perfil de cor e textos preservados, 16 bits/cinza/paleta/RGB, arquivos inválidos recusados.');
