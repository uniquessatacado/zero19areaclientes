// Sombreado livre (pele, tecido, brilho de aerógrafo, arco-íris): quando um degradê reto ou redondo não reproduz a região, a cor
// dela é dividida em ZONAS finas (cerca de 3 ΔE cada, como curvas de nível), desenhadas lado a lado e DESFOCADAS JUNTAS
// (feGaussianBlur), recortadas pelo contorno da própria região. O desfoque transforma o degrau entre zonas numa transição
// contínua (é isso que tira a faixa) e o recorte mantém o contorno da região nítido. O tamanho do desfoque é escolhido medindo,
// pixel a pixel, qual reproduz melhor a arte. Tudo continua vetor: caminhos, cores e um filtro de desfoque padrão do SVG.
import { labOf } from './color.js';
import { traceRegions } from './trace.js';

const MARGIN = 32; // a região é "esticada" para fora por 32 px antes de desfocar (o recorte esconde isso): borda sem halo

const colorError = (r, g, b, a, R, G, B, A) => {
  const x = labOf(r, g, b), y = labOf(R, G, B), w = Math.min(a, A) / 255;
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * Math.max(0.15, w) + Math.abs(a - A) * 0.15;
};

/** Desfoque gaussiano (pré-multiplicado, como o SVG faz) de uma imagem RGBA em Float32. A partir de 2 px usa 3 caixas
 *  seguidas (a aproximação que a própria especificação do SVG descreve), em tempo que não depende do tamanho do desfoque. */
export function blurRgba(src, w, h, sigma) {
  if (sigma < 2) return gaussRgba(src, w, h, sigma);
  const sizes = boxesForGauss(sigma), a = Float32Array.from(src), b = new Float32Array(src.length);
  for (const size of sizes) { const r = (size - 1) / 2; boxH(a, b, w, h, r); boxV(b, a, w, h, r); }
  return a;
}
function boxesForGauss(sigma, n = 3) {
  const ideal = Math.sqrt(12 * sigma * sigma / n + 1); let wl = Math.floor(ideal); if (wl % 2 === 0) wl--;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  return Array.from({ length: n }, (_, i) => i < m ? wl : wl + 2);
}
function boxH(src, dst, w, h, r) {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) { const row = y * w * 4;
    for (let c = 0; c < 4; c++) {
      let acc = 0; for (let k = 0; k <= r && k < w; k++) acc += src[row + k * 4 + c];
      for (let x = 0; x < w; x++) { dst[row + x * 4 + c] = acc * inv; const add = x + r + 1, sub = x - r; if (add < w) acc += src[row + add * 4 + c]; if (sub >= 0) acc -= src[row + sub * 4 + c]; }
    } }
}
function boxV(src, dst, w, h, r) {
  const inv = 1 / (2 * r + 1), stride = w * 4;
  for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
    const col = x * 4 + c; let acc = 0; for (let k = 0; k <= r && k < h; k++) acc += src[k * stride + col];
    for (let y = 0; y < h; y++) { dst[y * stride + col] = acc * inv; const add = y + r + 1, sub = y - r; if (add < h) acc += src[add * stride + col]; if (sub >= 0) acc -= src[sub * stride + col]; }
  }
}
function gaussRgba(src, w, h, sigma) {
  const radius = Math.max(1, Math.ceil(sigma * 3)), kernel = new Float32Array(radius * 2 + 1);
  let sum = 0; for (let i = -radius; i <= radius; i++) { kernel[i + radius] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += kernel[i + radius]; }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let k = -radius; k <= radius; k++) { const xx = x + k; if (xx < 0 || xx >= w) continue; const o = (y * w + xx) * 4, f = kernel[k + radius]; r += src[o] * f; g += src[o + 1] * f; b += src[o + 2] * f; a += src[o + 3] * f; }
    const o = (y * w + x) * 4; tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b; tmp[o + 3] = a;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let k = -radius; k <= radius; k++) { const yy = y + k; if (yy < 0 || yy >= h) continue; const o = (yy * w + x) * 4, f = kernel[k + radius]; r += tmp[o] * f; g += tmp[o + 1] * f; b += tmp[o + 2] * f; a += tmp[o + 3] * f; }
    const o = (y * w + x) * 4; out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
  }
  return out;
}

function smoothField(field, valid, w, h, channels, sigma) { // média gaussiana só dos pixels válidos (normalizada), 4 canais
  const radius = Math.max(1, Math.ceil(sigma * 2.5)), kernel = new Float32Array(radius * 2 + 1); for (let i = -radius; i <= radius; i++) kernel[i + radius] = Math.exp(-(i * i) / (2 * sigma * sigma));
  const pass = (input, weightIn, horizontal) => {
    const out = new Float32Array(input.length), weight = new Float32Array(w * h), step = horizontal ? 1 : w;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, pos = horizontal ? x : y, len = horizontal ? w : h;
      let ws = 0, c0 = 0, c1 = 0, c2 = 0, c3 = 0;
      const k0 = Math.max(-radius, -pos), k1 = Math.min(radius, len - 1 - pos);
      for (let k = k0; k <= k1; k++) { const j = i + k * step, f = kernel[k + radius] * weightIn[j]; if (f === 0) continue; ws += f; const o = j * 4; c0 += input[o] * f; c1 += input[o + 1] * f; c2 += input[o + 2] * f; c3 += input[o + 3] * f; }
      weight[i] = ws; if (ws) { const o = i * 4; out[o] = c0 / ws; out[o + 1] = c1 / ws; out[o + 2] = c2 / ws; out[o + 3] = c3 / ws; }
    }
    return { out, weight };
  };
  const ones = new Float32Array(w * h); for (let i = 0; i < w * h; i++) ones[i] = valid[i] ? 1 : 0;
  const a = pass(field, ones, true), wb = new Float32Array(w * h); for (let i = 0; i < w * h; i++) wb[i] = a.weight[i] > 0 ? 1 : 0;
  return pass(a.out, wb, false).out;
}

/**
 * Zonas desfocadas de UMA região. labels = rótulos da imagem inteira; lab = Lab de cada pixel (Float32 ×3).
 * Devolve null se não compensa (região lisa, pequena) ou { x0, y0, w, h, sigma, colors, paths, error, render? }.
 */
export function buildZones(img, labels, lab, region, pixels, { spacing = 2, maxZones = 64, sigmas = [0.8, 1.4, 2.2, 3.4, 5], epsilon = 0.8, keepRender = false } = {}) {
  const T = globalThis.__zonesTime, tick = name => { if (T) { const now = performance.now(); T[name] = (T[name] || 0) + now - T._t; T._t = now; } }; if (T) T._t = performance.now();
  const { width: W, height: H, data } = img, id = region.id, box = region.box;
  const x0 = box.minX - MARGIN, y0 = box.minY - MARGIN, w = box.maxX - box.minX + 2 * MARGIN, h = box.maxY - box.minY + 2 * MARGIN, n = w * h;
  // 1. Pixels da região na janela e extensão para fora (cada pixel de fora copia o pixel da região mais perto, até 16 px).
  const src = new Int32Array(n).fill(-1), inside = new Uint8Array(n), steps = new Uint8Array(n), queue = new Int32Array(n);
  let tail = 0;
  for (const p of pixels) { const gx = p % W, gy = (p - gx) / W, i = (gy - y0) * w + (gx - x0); src[i] = p; inside[i] = 1; queue[tail++] = i; }
  for (let head = 0; head < tail; head++) {
    const i = queue[head], x = i % w, y = (i - x) / w; if (steps[i] >= MARGIN) continue;
    if (x > 0 && src[i - 1] < 0) { src[i - 1] = src[i]; steps[i - 1] = steps[i] + 1; queue[tail++] = i - 1; }
    if (x < w - 1 && src[i + 1] < 0) { src[i + 1] = src[i]; steps[i + 1] = steps[i] + 1; queue[tail++] = i + 1; }
    if (y > 0 && src[i - w] < 0) { src[i - w] = src[i]; steps[i - w] = steps[i] + 1; queue[tail++] = i - w; }
    if (y < h - 1 && src[i + w] < 0) { src[i + w] = src[i]; steps[i + w] = steps[i] + 1; queue[tail++] = i + w; }
  }
  const valid = new Uint8Array(n); for (let i = 0; i < n; i++) valid[i] = src[i] >= 0 ? 1 : 0; tick('extensao');
  // 2. Campo de cor (Lab + um pouco de alfa) levemente suavizado, só para decidir a zona de cada pixel (o ruído não vira zona).
  const field = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { const p = src[i]; if (p < 0) continue; field[i * 4] = lab[p * 3]; field[i * 4 + 1] = lab[p * 3 + 1]; field[i * 4 + 2] = lab[p * 3 + 2]; field[i * 4 + 3] = data[p * 4 + 3] * 0.12; }
  const smooth = smoothField(field, valid, w, h, 4, 1.1); tick('suavizar');
  // 3. Quantas zonas: extensão da cor no eixo principal (e no segundo) dividida pelo espaçamento.
  const sample = []; { const step = Math.max(1, Math.floor(pixels.length / 20000)); for (let k = 0; k < pixels.length; k += step) { const p = pixels[k], gx = p % W, gy = (p - gx) / W; sample.push((gy - y0) * w + (gx - x0)); } }
  const mean = [0, 0, 0, 0]; for (const i of sample) for (let c = 0; c < 4; c++) mean[c] += smooth[i * 4 + c] / sample.length;
  const cov = Array.from({ length: 4 }, () => new Float64Array(4));
  for (const i of sample) for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) cov[a][b] += (smooth[i * 4 + a] - mean[a]) * (smooth[i * 4 + b] - mean[b]) / sample.length;
  const axis = power(cov), proj = sample.map(i => { let s = 0; for (let c = 0; c < 4; c++) s += (smooth[i * 4 + c] - mean[c]) * axis[c]; return s; }).sort((a, b) => a - b);
  const range1 = proj[Math.floor(proj.length * 0.98)] - proj[Math.floor(proj.length * 0.02)];
  const deflated = cov.map((row, a) => row.map((v, b) => v - axis[a] * axis[b] * dot(cov, axis))), axis2 = power(deflated);
  const proj2 = sample.map(i => { let s = 0; for (let c = 0; c < 4; c++) s += (smooth[i * 4 + c] - mean[c]) * axis2[c]; return s; }).sort((a, b) => a - b);
  const range2 = proj2[Math.floor(proj2.length * 0.98)] - proj2[Math.floor(proj2.length * 0.02)];
  const K = Math.max(2, Math.min(maxZones, Math.ceil(range1 / spacing) + Math.ceil(range2 / (spacing * 2))));
  // 4. K-médias (começa espalhado no eixo principal: resultado igual toda vez).
  const order = sample.map((i, k) => [i, (() => { let s = 0; for (let c = 0; c < 4; c++) s += (smooth[i * 4 + c] - mean[c]) * axis[c]; return s; })()]).sort((a, b) => a[1] - b[1]);
  let centers = Array.from({ length: K }, (_, k) => { const i = order[Math.min(order.length - 1, Math.floor((k + 0.5) / K * order.length))][0]; return [smooth[i * 4], smooth[i * 4 + 1], smooth[i * 4 + 2], smooth[i * 4 + 3]]; });
  const nearest = i => { let best = 0, bd = Infinity; for (let k = 0; k < centers.length; k++) { const c = centers[k], d = (smooth[i * 4] - c[0]) ** 2 + (smooth[i * 4 + 1] - c[1]) ** 2 + (smooth[i * 4 + 2] - c[2]) ** 2 + (smooth[i * 4 + 3] - c[3]) ** 2; if (d < bd) { bd = d; best = k; } } return best; };
  for (let iter = 0; iter < 8; iter++) {
    const acc = centers.map(() => [0, 0, 0, 0, 0]);
    for (const i of sample) { const k = nearest(i), a = acc[k]; for (let c = 0; c < 4; c++) a[c] += smooth[i * 4 + c]; a[4]++; }
    centers = centers.map((c, k) => acc[k][4] ? acc[k].slice(0, 4).map(v => v / acc[k][4]) : c);
  }
  tick('kmedias');
  const zone = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) if (valid[i]) zone[i] = nearest(i); tick('atribuir');
  // 5. Pedaços minúsculos de zona (ruído) vão para a zona vizinha mais comum.
  cleanFragments(zone, w, h, Math.max(8, Math.min(40, Math.round(Math.sqrt(pixels.length) / 20))));
  // 6. Cor de cada zona = média das cores reais (sem suavizar) dos pixels dela.
  const sums = Array.from({ length: K }, () => [0, 0, 0, 0, 0]);
  for (let i = 0; i < n; i++) { const k = zone[i]; if (k < 0) continue; const p = src[i] * 4, s = sums[k]; s[0] += data[p]; s[1] += data[p + 1]; s[2] += data[p + 2]; s[3] += data[p + 3]; s[4]++; }
  const colors = sums.map(s => s[4] ? [s[0] / s[4], s[1] / s[4], s[2] / s[4], s[3] / s[4]] : null); tick('limpar');
  // 7. Duas camadas de desfoque. FUNDO: todas as zonas com desfoque maior (degradê suave fica liso, sem contorno de zona).
  // DETALHE: só as zonas estreitas (brilho fino, traço esfumado), por cima, com desfoque pequeno, para não borrar o que é estreito.
  // Espessura de cada zona = 2 × área / perímetro (numa faixa, é a largura dela). O tamanho do desfoque é escolhido medindo
  // o resultado contra os pixels da arte: o mais liso que quase não perde fidelidade.
  const area = new Float64Array(K), perim = new Float64Array(K);
  for (let i = 0; i < n; i++) { const k = zone[i]; if (k < 0) continue; area[k]++; const x = i % w; if (x < w - 1 && zone[i + 1] !== k) { perim[k]++; if (zone[i + 1] >= 0) perim[zone[i + 1]]++; } if (i + w < n && zone[i + w] !== k) { perim[k]++; if (zone[i + w] >= 0) perim[zone[i + w]]++; } }
  const thickness = Array.from({ length: K }, (_, k) => perim[k] ? 2 * area[k] / perim[k] : Infinity);
  // Janela enorme (mais de 2 milhões de pixels, ex.: contorno que atravessa a arte inteira): a escolha do desfoque é medida numa
  // cópia reduzida (memória e tempo caem 4 a 9 vezes; a escolha quase não muda). Os caminhos do SVG continuam em resolução cheia.
  const S = n > 2e6 ? Math.ceil(Math.sqrt(n / 2e6)) : 1, ew = Math.ceil(w / S), eh = Math.ceil(h / S), en = ew * eh;
  const ezone = S === 1 ? zone : (() => { const z = new Int32Array(en); for (let y = 0; y < eh; y++) for (let x = 0; x < ew; x++) z[y * ew + x] = zone[Math.min(h - 1, y * S) * w + Math.min(w - 1, x * S)]; return z; })();
  const premul = (only = null) => { const out = new Float32Array(en * 4); for (let i = 0; i < en; i++) { const k = ezone[i]; if (k < 0 || !colors[k] || (only && !only[k])) continue; const c = colors[k], al = c[3] / 255; out[i * 4] = c[0] * al; out[i * 4 + 1] = c[1] * al; out[i * 4 + 2] = c[2] * al; out[i * 4 + 3] = c[3]; } return out; };
  const measureIdx = []; { const step = Math.max(1, Math.floor(pixels.length / 15000)); for (let k = 0; k < pixels.length; k += step) { const p = pixels[k], gx = p % W, gy = (p - gx) / W; measureIdx.push([Math.min(eh - 1, Math.floor((gy - y0) / S)) * ew + Math.min(ew - 1, Math.floor((gx - x0) / S)), p]); } }
  const errorOf = (bottom, top) => {
    let sum = 0;
    for (const [i, p] of measureIdx) {
      let r = bottom[i * 4], g = bottom[i * 4 + 1], b = bottom[i * 4 + 2], A = bottom[i * 4 + 3];
      if (top) { const t = top[i * 4 + 3] / 255; r = top[i * 4] + r * (1 - t); g = top[i * 4 + 1] + g * (1 - t); b = top[i * 4 + 2] + b * (1 - t); A = top[i * 4 + 3] + A * (1 - t); }
      const f = A > 0 ? 255 / A : 0; sum += colorError(data[p * 4], data[p * 4 + 1], data[p * 4 + 2], data[p * 4 + 3], r * f, g * f, b * f, A);
    }
    return sum / measureIdx.length;
  };
  const DETAIL = 1.1, all = premul(), tried = [];
  for (const sigmaB of [2.2, 4, 7]) {
    let bottom = blurRgba(all, ew, eh, sigmaB / S); const detailSet = thickness.map(t => t < 3 * sigmaB);
    tried.push({ sigmaB, sigmaD: 0, error: errorOf(bottom, null), detailSet: null });
    if (detailSet.some((v, k) => v && colors[k])) { const top = blurRgba(premul(detailSet), ew, eh, DETAIL / S); tried.push({ sigmaB, sigmaD: DETAIL, error: errorOf(bottom, top), detailSet }); }
    bottom = null; // nada de guardar as imagens desfocadas (memória): só o erro de cada tentativa
  }
  // "Liso" = desfoque médio pela área: zona do detalhe conta com o desfoque pequeno, o resto com o do fundo.
  const zoneArea = new Float64Array(K); for (const p of pixels) { const gx = p % W, gy = (p - gx) / W, k = zone[(gy - y0) * w + (gx - x0)]; if (k >= 0) zoneArea[k]++; }
  const total = zoneArea.reduce((a, b) => a + b, 0) || 1;
  for (const t of tried) { let detailArea = 0; if (t.detailSet) for (let k = 0; k < K; k++) if (t.detailSet[k]) detailArea += zoneArea[k]; t.smooth = (detailArea * (t.sigmaD || t.sigmaB) + (total - detailArea) * t.sigmaB) / total; }
  const minError = Math.min(...tried.map(t => t.error)), ok = tried.filter(t => t.error <= minError + Math.max(0.08, minError * 0.06));
  const best = ok.sort((a, b) => b.smooth - a.smooth || a.error - b.error)[0];
  tick('desfoques');
  // 8. Contornos das zonas (na janela; o SVG desloca o grupo para o lugar).
  const traced = traceRegions(zone, w, h, K, { epsilon });
  const paths = traced.regions.map((r, k) => r.d && colors[k] ? { d: r.d, color: colors[k], detail: Boolean(best.detailSet?.[k]) } : null).filter(Boolean);
  tick('contornos');
  let render = null;
  if (keepRender) { // bancada: desenha a escolha em resolução cheia (a tela do 019 não precisa disto)
    const full = map => { const out = new Float32Array(n * 4); for (let i = 0; i < n; i++) { const k = zone[i]; if (k < 0 || !colors[k] || (map && !map[k])) continue; const c = colors[k], al = c[3] / 255; out[i * 4] = c[0] * al; out[i * 4 + 1] = c[1] * al; out[i * 4 + 2] = c[2] * al; out[i * 4 + 3] = c[3]; } return out; };
    const bottom = blurRgba(full(null), w, h, best.sigmaB), top = best.sigmaD ? blurRgba(full(best.detailSet), w, h, best.sigmaD) : null;
    render = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      let r = bottom[i * 4], g = bottom[i * 4 + 1], b = bottom[i * 4 + 2], A = bottom[i * 4 + 3];
      if (top) { const t = top[i * 4 + 3] / 255; r = top[i * 4] + r * (1 - t); g = top[i * 4 + 1] + g * (1 - t); b = top[i * 4 + 2] + b * (1 - t); A = top[i * 4 + 3] + A * (1 - t); }
      const f = A > 0 ? 255 / A : 0; render[i * 4] = r * f; render[i * 4 + 1] = g * f; render[i * 4 + 2] = b * f; render[i * 4 + 3] = A;
    }
  }
  const layers = [{ sigma: best.sigmaB, paths }]; if (best.sigmaD) layers.push({ sigma: best.sigmaD, paths: paths.filter(p => p.detail) });
  return { x0, y0, w, h, layers, sigma: best.sigmaB, error: best.error, zones: paths.length, render, K };
}

const dot = (m, v) => { let s = 0; for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) s += v[a] * m[a][b] * v[b]; return s; };
function power(m) { // autovetor principal (iteração de potência)
  let v = [0.6, 0.5, 0.5, 0.2];
  for (let it = 0; it < 40; it++) { const u = [0, 1, 2, 3].map(a => m[a].reduce((s, x, b) => s + x * v[b], 0)), len = Math.hypot(...u) || 1; v = u.map(x => x / len); }
  return v;
}

function cleanFragments(zone, w, h, minSize) {
  for (let pass = 0; pass < 3; pass++) {
    const comp = new Int32Array(zone.length).fill(-1), queue = new Int32Array(zone.length); let changed = 0, next = 0;
    for (let s = 0; s < zone.length; s++) {
      if (zone[s] < 0 || comp[s] >= 0) continue;
      const k = zone[s]; let head = 0, tail = 0; comp[s] = next; queue[tail++] = s;
      while (head < tail) { const i = queue[head++], x = i % w; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < zone.length && comp[j] < 0 && zone[j] === k) { comp[j] = next; queue[tail++] = j; } }
      if (tail < minSize) {
        const votes = new Map();
        for (let t = 0; t < tail; t++) { const i = queue[t], x = i % w; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < zone.length && zone[j] >= 0 && zone[j] !== k) votes.set(zone[j], (votes.get(zone[j]) || 0) + 1); }
        let to = -1, most = 0; for (const [z, c] of votes) if (c > most) { most = c; to = z; }
        if (to >= 0) { for (let t = 0; t < tail; t++) zone[queue[t]] = to; changed++; }
      }
      next++;
    }
    if (!changed) break;
  }
}
