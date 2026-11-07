// Regiões por continuidade (especificação, seção 6, passo 1): NÃO por redução de paleta.
// 1. Borda = transição brusca: diferença de cor (Lab + um pouco de alfa) entre vizinhos, medida numa cópia levemente suavizada
//    (a suavização é só para medir; o arquivo nunca é borrado). Um degradê muda pouco por pixel e não vira borda, por mais
//    longo que seja; uma troca de cor nítida vira.
// 2. Regiões = pedaços ligados de pixels que não são borda.
// 3. Pixels de borda vão, de fora para dentro, para a região vizinha de cor mais parecida (a fronteira cai no meio da transição).
//    O que não combina com nenhum vizinho (ex.: contorno preto fino entre amarelo e branco) vira região própria — nada some.
// 4. Fiapos de antisserrilhado (faixa fina com cor de mistura entre duas regiões) são distribuídos entre as vizinhas.
import { labImage } from './color.js';

function smooth3(values, width, height, channels) { // núcleo 1-2-1 nas duas direções
  const tmp = new Float32Array(values.length), out = new Float32Array(values.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < channels; c++) {
    const i = (y * width + x) * channels + c, l = x > 0 ? i - channels : i, r = x < width - 1 ? i + channels : i;
    tmp[i] = (values[l] + 2 * values[i] + values[r]) / 4;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < channels; c++) {
    const i = (y * width + x) * channels + c, u = y > 0 ? i - width * channels : i, d = y < height - 1 ? i + width * channels : i;
    out[i] = (tmp[u] + 2 * tmp[i] + tmp[d]) / 4;
  }
  return out;
}

export function segment(img, { edge = null, alphaWeight = 0.12, attach = 14, minSize = 6, wide = 4, wideEdge = null } = {}) {
  const { width, height, data } = img, n = width * height;
  const lab = labImage(data), feat = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { feat[i * 4] = lab[i * 3]; feat[i * 4 + 1] = lab[i * 3 + 1]; feat[i * 4 + 2] = lab[i * 3 + 2]; feat[i * 4 + 3] = data[i * 4 + 3] * alphaWeight; }
  const s = smooth3(feat, width, height, 4), alpha = i => data[i * 4 + 3];
  const diff = (p, q) => Math.hypot(s[p * 4] - s[q * 4], s[p * 4 + 1] - s[q * 4 + 1], s[p * 4 + 2] - s[q * 4 + 2], s[p * 4 + 3] - s[q * 4 + 3]);
  // Limite de borda: 5 ΔE, ou mais se a imagem tem ruído (JPEG, foto): 3× a diferença mediana entre vizinhos.
  if (edge === null) {
    const hist = new Uint32Array(400); let total = 0;
    for (let p = 0; p < n; p += 3) { const x = p % width; if (x >= width - 1 || !alpha(p) || !alpha(p + 1)) continue; hist[Math.min(399, Math.round(diff(p, p + 1) * 10))]++; total++; }
    let acc = 0, median = 0; for (let b = 0; b < 400; b++) { acc += hist[b]; if (acc >= total / 2) { median = b / 10; break; } }
    edge = Math.max(5, Math.min(12, 3 * median));
  }
  // 1. Borda
  const isEdge = new Uint8Array(n), grad = new Float32Array(n);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x; if (!alpha(p)) continue;
    let g = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
      const q = yy * width + xx, d = diff(p, q) / (dx && dy ? Math.SQRT2 : 1); if (d > g) g = d;
    }
    grad[p] = g; if (g > edge) isEdge[p] = 1;
  }
  // Borda borrada (ampliação, desfoque): pouca diferença por pixel, mas muita em poucos pixels. Mede de −wide a +wide nas
  // 4 direções; um degradê de verdade muda devagar e fica abaixo do limite.
  const wideLimit = wideEdge ?? edge * 3.2;
  if (wide > 0) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x; if (!alpha(p) || isEdge[p] || grad[p] < edge * 0.35) continue; // miolo liso não é borda
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const x0 = x - dx * wide, y0 = y - dy * wide, x1 = x + dx * wide, y1 = y + dy * wide;
      if (x0 < 0 || y0 < 0 || x1 >= width || y1 >= height || y0 >= height || y1 < 0) continue;
      const a = y0 * width + x0, b = y1 * width + x1; if (!alpha(a) || !alpha(b)) continue;
      if (diff(a, b) > wideLimit) { isEdge[p] = 1; break; }
    }
  }
  // 2. Regiões dos pixels que não são borda (4 vizinhos)
  const labels = new Int32Array(n).fill(-1), queue = new Int32Array(n);
  let count = 0;
  const flood = (seed, accept) => { let head = 0, tail = 0; labels[seed] = count; queue[tail++] = seed; while (head < tail) { const p = queue[head++], x = p % width; for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) if (q >= 0 && q < n && labels[q] < 0 && accept(q, p)) { labels[q] = count; queue[tail++] = q; } } return tail; };
  // Sobra cresce comparando com a cor média do que já juntou (não em cadeia, pixel a pixel): senão um contorno preto e uma
  // transição laranja se emendam devagarinho e viram uma coisa só.
  const grow = seed => {
    let sum0 = lab[seed * 3], sum1 = lab[seed * 3 + 1], sum2 = lab[seed * 3 + 2], k = 1;
    flood(seed, q => { if (!alpha(q) || labels[q] >= 0) return false; if (Math.hypot(lab[q * 3] - sum0 / k, lab[q * 3 + 1] - sum1 / k, lab[q * 3 + 2] - sum2 / k) >= 12) return false; sum0 += lab[q * 3]; sum1 += lab[q * 3 + 1]; sum2 += lab[q * 3 + 2]; k++; return true; });
    count++;
  };
  for (let p = 0; p < n; p++) if (labels[p] < 0 && alpha(p) && !isEdge[p]) { flood(p, q => alpha(q) && !isEdge[q]); count++; }
  const meanOf = () => { const sum = new Float64Array(count * 4), rgb = new Float64Array(count * 3), area = new Float64Array(count); for (let p = 0; p < n; p++) { const r = labels[p]; if (r < 0) continue; area[r]++; for (let c = 0; c < 3; c++) { sum[r * 4 + c] += lab[p * 3 + c]; rgb[r * 3 + c] += data[p * 4 + c]; } sum[r * 4 + 3] += data[p * 4 + 3] * alphaWeight; } return { sum, rgb, area }; };
  let { sum, rgb, area } = meanOf();
  // Regiões minúsculas viram borda de novo (serão absorvidas), exceto as isoladas (detalhe pequeno de verdade).
  for (let p = 0; p < n; p++) { const r = labels[p]; if (r >= 0 && area[r] < minSize) { labels[p] = -2; } }
  // 3. Pixels de borda: camadas de fora para dentro; só entra no vizinho se a cor combinar (ΔE ≤ attach).
  const pending = []; for (let p = 0; p < n; p++) if (alpha(p) && labels[p] < 0) pending.push(p);
  // A mistura do antisserrilhado é reta em sRGB (é assim que o desenho combina as cores), então o teste é em RGB.
  const between = (p, a, b) => {
    const A = [0, 1, 2].map(c => rgb[a * 3 + c] / area[a]), B = [0, 1, 2].map(c => rgb[b * 3 + c] / area[b]), ab = B.map((v, c) => v - A[c]), len2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
    if (len2 < 400) return false;
    const P = [data[p * 4], data[p * 4 + 1], data[p * 4 + 2]], t = ((P[0] - A[0]) * ab[0] + (P[1] - A[1]) * ab[1] + (P[2] - A[2]) * ab[2]) / len2;
    return t > -0.05 && t < 1.05 && Math.hypot(A[0] + t * ab[0] - P[0], A[1] + t * ab[1] - P[1], A[2] + t * ab[2] - P[2]) < 24;
  };
  const distTo = (p, r) => Math.hypot(lab[p * 3] - sum[r * 4] / area[r], lab[p * 3 + 1] - sum[r * 4 + 1] / area[r], lab[p * 3 + 2] - sum[r * 4 + 2] / area[r]);
  let left = pending;
  for (let round = 0; round < 64 && left.length; round++) {
    const assign = [], keep = [];
    for (const p of left) {
      const x = p % width, y = (p - x) / width, near = new Map();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const r = labels[yy * width + xx]; if (r < 0 || area[r] < minSize || near.has(r)) continue;
        near.set(r, distTo(p, r) * Math.min(1, alpha(p) / 96)); // cor de pixel quase transparente é imprecisa
      }
      let best = -1, bestD = Infinity; for (const [r, d] of near) if (d < bestD) { bestD = d; best = r; }
      // Mistura de antisserrilhado: cor no caminho entre duas regiões vizinhas → vai para a mais próxima.
      if (best >= 0 && (bestD <= attach || [...near.keys()].some(r => r !== best && between(p, best, r)))) assign.push(p, best); else keep.push(p);
    }
    if (!assign.length) break;
    for (let i = 0; i < assign.length; i += 2) labels[assign[i]] = assign[i + 1];
    left = keep;
  }
  // O que sobrou (traço fino com cor própria, detalhe pequeno) vira região própria.
  for (const p of left) if (labels[p] < 0) grow(p);
  for (let p = 0; p < n; p++) if (labels[p] === -2) labels[p] = -1;
  ({ sum, rgb, area } = meanOf());
  // Pixel de borda ainda solto (−1 com alfa): vai para qualquer vizinho rotulado mais parecido.
  for (let round = 0; round < 8; round++) {
    let changed = 0;
    for (let p = 0; p < n; p++) {
      if (!alpha(p) || labels[p] >= 0) continue;
      const x = p % width, y = (p - x) / width; let best = -1, bestD = Infinity;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue; const r = labels[yy * width + xx]; if (r >= 0 && area[r]) { const d = distTo(p, r); if (d < bestD) { bestD = d; best = r; } } }
      if (best >= 0) { labels[p] = best; changed++; }
    }
    if (!changed) break;
  }
  for (let p = 0; p < n; p++) if (alpha(p) && labels[p] < 0) grow(p);
  dissolveSlivers(labels, lab, data, width, height, count);
  return { labels, count: relabel(labels), lab, edge };
}

/** Limpeza geral de fiapos depois do refino (o refino olha uma região por vez e não vê as duas vizinhas). */
export function cleanupSlivers(seg, img) {
  const before = seg.count;
  dissolveSlivers(seg.labels, seg.lab, img.data, img.width, img.height, seg.count);
  seg.count = relabel(seg.labels);
  return before - seg.count;
}

/** Junta regiões vizinhas cuja fronteira não é borda de verdade (diferença média pequena entre os pixels dos dois lados):
 *  degrau de bloco do JPEG, corte dentro de um mesmo degradê. Usa a imagem original, sem suavizar. */
export function mergeWeakBoundaries(seg, img, threshold = 4) {
  const { labels } = seg, { width, height, data } = img, lab = seg.lab, n = width * height, pairs = new Map();
  for (let p = 0; p < n; p++) {
    const a = labels[p]; if (a < 0) continue; const x = p % width;
    for (const [q, step] of [[x < width - 1 ? p + 1 : -1, 1], [p + width < n ? p + width : -1, width]]) {
      if (q < 0) continue; const b = labels[q]; if (b < 0 || b === a) continue;
      // Compara 3 px para dentro de cada lado (quando ainda é a mesma região): borda borrada não parece fraca só por ser larga.
      let u = p, v = q; for (let k = 0; k < 3; k++) { const uu = u - step, vv = v + step; if (uu >= 0 && labels[uu] === a && (step !== 1 || uu % width < u % width)) u = uu; if (vv < n && labels[vv] === b && (step !== 1 || vv % width > v % width)) v = vv; }
      const key = a < b ? a * 1048576 + b : b * 1048576 + a, d = Math.hypot(lab[u * 3] - lab[v * 3], lab[u * 3 + 1] - lab[v * 3 + 1], lab[u * 3 + 2] - lab[v * 3 + 2]) + 0.12 * Math.abs(data[u * 4 + 3] - data[v * 4 + 3]);
      const e = pairs.get(key) || [0, 0]; e[0] += d; e[1]++; pairs.set(key, e);
    }
  }
  const parent = Array.from({ length: seg.count }, (_, i) => i), find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  let merged = 0;
  for (const [key, [sum, cnt]] of [...pairs.entries()].sort((x, y) => x[1][0] / x[1][1] - y[1][0] / y[1][1])) {
    if (cnt < 3 || sum / cnt >= threshold) continue;
    const a = find(Math.floor(key / 1048576)), b = find(key % 1048576); if (a !== b) { parent[b] = a; merged++; }
  }
  if (!merged) return 0;
  for (let p = 0; p < n; p++) if (labels[p] >= 0) labels[p] = find(labels[p]);
  seg.count = relabel(labels);
  return merged;
}

/** Separa de novo UMA região com limite de borda mais fino (refino de regiões que ficaram com erro alto). */
export function splitRegion(seg, img, region, edge) {
  const { width, data } = img, { minX, minY, maxX, maxY } = region.box, w = maxX - minX, h = maxY - minY, sub = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (minY + y) * width + minX + x, o = (y * w + x) * 4;
    if (seg.labels[p] !== region.id) continue;
    sub[o] = data[p * 4]; sub[o + 1] = data[p * 4 + 1]; sub[o + 2] = data[p * 4 + 2]; sub[o + 3] = data[p * 4 + 3];
  }
  const part = segment({ width: w, height: h, data: sub }, { edge });
  if (part.count <= 1) return [];
  const created = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = part.labels[y * w + x]; if (l < 0) continue;
    if (l === 0) continue; // a primeira parte fica com o número da região
    const id = seg.count + l - 1; seg.labels[(minY + y) * width + minX + x] = id; created[l - 1] = id;
  }
  seg.count += part.count - 1;
  return created.filter(v => v !== undefined);
}

function relabel(labels) {
  const map = new Map();
  for (let i = 0; i < labels.length; i++) if (labels[i] >= 0) { if (!map.has(labels[i])) map.set(labels[i], map.size); labels[i] = map.get(labels[i]); }
  return map.size;
}

// Fiapo: região fina (quase toda na borda) cuja cor é mistura de duas vizinhas, ou franja colada a uma vizinha da mesma cor.
function dissolveSlivers(labels, lab, data, width, height, count) {
  const area = new Float64Array(count), edge = new Float64Array(count), sum = new Float64Array(count * 3), rgb = new Float64Array(count * 3), neighbors = Array.from({ length: count }, () => new Map());
  const n = width * height;
  for (let i = 0; i < n; i++) {
    const r = labels[i]; if (r < 0) continue;
    area[r]++; sum[r * 3] += lab[i * 3]; sum[r * 3 + 1] += lab[i * 3 + 1]; sum[r * 3 + 2] += lab[i * 3 + 2]; rgb[r * 3] += data[i * 4]; rgb[r * 3 + 1] += data[i * 4 + 1]; rgb[r * 3 + 2] += data[i * 4 + 2];
    const x = i % width, y = (i - x) / width; let border = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy, s = xx < 0 || yy < 0 || xx >= width || yy >= height ? -1 : labels[yy * width + xx];
      if (s !== r) { border = true; if (s >= 0) neighbors[r].set(s, (neighbors[r].get(s) || 0) + 1); }
    }
    if (border) edge[r]++;
  }
  const mean = r => [sum[r * 3] / area[r], sum[r * 3 + 1] / area[r], sum[r * 3 + 2] / area[r]];
  // Fina = faixa de até ~6 px (borda borrada pela ampliação também é mistura). Cor de mistura é medida em RGB.
  const thin = r => area[r] && edge[r] / area[r] >= 0.3 && area[r] <= n * 0.02;
  const meanRgb = r => [rgb[r * 3] / area[r], rgb[r * 3 + 1] / area[r], rgb[r * 3 + 2] / area[r]];
  const sliver = new Uint8Array(count);
  for (let r = 0; r < count; r++) {
    if (!thin(r)) continue;
    const c = mean(r), near = [...neighbors[r].keys()].filter(s => !thin(s));
    if (near.some(s => Math.hypot(...mean(s).map((v, k) => v - c[k])) < 6)) { sliver[r] = 1; continue; }
    const C = meanRgb(r);
    for (let i = 0; i < near.length && !sliver[r]; i++) for (let j = i + 1; j < near.length; j++) {
      const a = meanRgb(near[i]), b = meanRgb(near[j]), ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
      if (len2 < 900) continue;
      const t = ((C[0] - a[0]) * ab[0] + (C[1] - a[1]) * ab[1] + (C[2] - a[2]) * ab[2]) / len2;
      const off = Math.hypot(a[0] + t * ab[0] - C[0], a[1] + t * ab[1] - C[1], a[2] + t * ab[2] - C[2]);
      if (t > 0.03 && t < 0.97 && off < 22) { sliver[r] = 1; break; }
    }
  }
  if (!sliver.some(Boolean)) return;
  const regionMean = Array.from({ length: count }, (_, r) => area[r] ? mean(r) : [0, 0, 0]);
  for (let pass = 0; pass < 8; pass++) {
    let changed = 0, left = 0;
    const next = labels.slice();
    for (let i = 0; i < n; i++) {
      const r = labels[i]; if (r < 0 || !sliver[r]) continue;
      left++;
      const x = i % width, y = (i - x) / width; let best = -1, bestD = Infinity;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const s = labels[yy * width + xx]; if (s < 0 || sliver[s]) continue;
        const c = regionMean[s], d = Math.hypot(lab[i * 3] - c[0], lab[i * 3 + 1] - c[1], lab[i * 3 + 2] - c[2]);
        if (d < bestD) { bestD = d; best = s; }
      }
      if (best >= 0) { next[i] = best; changed++; }
    }
    labels.set(next);
    if (!changed || changed === left) break;
  }
}
