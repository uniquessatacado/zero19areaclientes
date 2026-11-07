// Emendas falsas (o que o olho chama de "faixa"): fronteira entre duas regiões num trecho onde a arte era LISA, mas os dois
// preenchimentos não se encontram na mesma cor e aparece um degrau que não existia. Acontece quando um sombreado contínuo
// (pele, tecido, céu) foi cortado em pedaços. Aqui cada fronteira é conferida pixel a pixel: se a arte era lisa dos dois lados
// e o vetor criou degrau, as duas regiões voltam a ser uma só (o sombreado passa a ser feito pelos degradês e pelas camadas).
// Fronteira de verdade (a arte muda de cor ali) nunca é juntada.
import { labOf } from './color.js';
import { stopAt } from './fit.js';

function alphaAt(stops, rho) {
  if (rho >= 1) return 0;
  for (let i = 1; i < stops.length; i++) if (rho <= stops[i].offset) { const a = stops[i - 1], b = stops[i]; return a.alpha + (b.alpha - a.alpha) * (rho - a.offset) / Math.max(1e-9, b.offset - a.offset); }
  return 0;
}

/** Cor que o SVG pinta no ponto (x, y) da região: preenchimento + camadas de sombreado (sRGB 0–255). */
export function paintAt(region, x, y) {
  let c;
  if (region.model === 'solid') c = region.color;
  else if (region.model === 'linear') { const dx = region.x2 - region.x1, dy = region.y2 - region.y1; c = stopAt(region.stops, ((x - region.x1) * dx + (y - region.y1) * dy) / Math.max(1e-9, dx * dx + dy * dy)); }
  else c = stopAt(region.stops, Math.hypot(x - region.cx, y - region.cy) / Math.max(1e-9, region.r));
  let r = c[0], g = c[1], b = c[2];
  for (const layer of region.overlays || []) {
    const [a, bb, cc, d, e, f] = layer.matrix, det = a * d - bb * cc; if (!det) continue;
    const X = x - e, Y = y - f, u = (d * X - cc * Y) / det, v = (-bb * X + a * Y) / det, al = alphaAt(layer.stops, Math.hypot(u, v));
    if (!al) continue;
    r += al * (layer.color[0] - r); g += al * (layer.color[1] - g); b += al * (layer.color[2] - b);
  }
  return [r, g, b];
}

/** Pares de regiões com emenda falsa. Só regiões opacas (as semitransparentes são desenhadas por baixo e não emendam). */
export function findFalseSeams(seg, img, regions, { smooth = 1.5, step = 3, share = 0.3, minBad = 6, smoothShare = 0.6 } = {}) {
  const { labels, lab } = seg, { width, height, data } = img, pairs = new Map(), cache = new Map();
  const labPaint = (r, p) => { const key = r * 16777216 + p; let v = cache.get(key); if (!v) { const x = p % width, y = (p - x) / width, c = paintAt(regions[r], x + 0.5, y + 0.5); v = labOf(c[0], c[1], c[2]); cache.set(key, v); } return v; };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x, a = labels[p]; if (a < 0 || data[p * 4 + 3] < 250 || !regions[a]?.opaque) continue;
    for (const q of [x < width - 1 ? p + 1 : -1, y < height - 1 ? p + width : -1]) {
      if (q < 0) continue; const b = labels[q]; if (b < 0 || b === a || data[q * 4 + 3] < 250 || !regions[b]?.opaque) continue;
      const key = a < b ? a * 1048576 + b : b * 1048576 + a, e = pairs.get(key) || pairs.set(key, { total: 0, smooth: 0, bad: 0 }).get(key);
      e.total++;
      const inDiff = Math.hypot(lab[p * 3] - lab[q * 3], lab[p * 3 + 1] - lab[q * 3 + 1], lab[p * 3 + 2] - lab[q * 3 + 2]);
      if (inDiff >= smooth) continue;
      e.smooth++;
      const A = labPaint(a, p), B = labPaint(b, q);
      if (Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) > step) e.bad++;
    }
    if (cache.size > 400000) cache.clear();
  }
  const out = [];
  for (const [key, e] of pairs) if (e.bad >= minBad && e.smooth >= e.total * smoothShare && e.bad >= e.smooth * share) out.push({ a: Math.floor(key / 1048576), b: key % 1048576, ...e });
  return out.sort((x, y) => y.bad - x.bad);
}

/** Junta os pares e renumera. Devolve as regiões novas que mudaram e, para as outras, de qual número antigo vieram. */
export function mergePairs(seg, pairs, { maxArea = Infinity } = {}) {
  const parent = Array.from({ length: seg.count }, (_, i) => i), find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const area = new Float64Array(seg.count); for (const l of seg.labels) if (l >= 0) area[l]++;
  let merged = 0;
  for (const { a, b } of pairs) { const x = find(a), y = find(b); if (x === y || area[x] + area[y] > maxArea) continue; parent[y] = x; area[x] += area[y]; merged++; }
  if (!merged) return { merged: 0 };
  const map = new Map(), changed = new Set(), from = [];
  const touched = new Set(); for (let r = 0; r < seg.count; r++) if (find(r) !== r) { touched.add(find(r)); touched.add(r); }
  const { labels } = seg;
  for (let p = 0; p < labels.length; p++) {
    const old = labels[p]; if (old < 0) continue;
    const root = find(old); let id = map.get(root);
    if (id === undefined) { id = map.size; map.set(root, id); if (touched.has(root)) changed.add(id); else from[id] = root; }
    labels[p] = id;
  }
  seg.count = map.size;
  return { merged, changed, from };
}
