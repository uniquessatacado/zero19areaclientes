// Preenchimento de cada região (especificação, seção 6, passos 3–5): testa cor sólida, degradê linear e degradê radial com várias
// paradas, com cores lidas dos pixels da própria arte (sem a mistura da borda) e escolhe pelo erro medido de volta nos pixels.
// O SVG interpola degradês em sRGB, então o ajuste é feito em sRGB; o erro é medido em ΔE (Lab), como o olho vê.
import { labOf } from './color.js';
import { fitOverlays } from './shading.js';
import { buildZones } from './zones.js';

const ALPHA_ERR = 0.15; // 255 de diferença de alfa ≈ 38 ΔE
const MAX_SAMPLES = 30000, ERROR_SAMPLES = 6000;

function solveLinear(A, b) { // eliminação de Gauss com pivô (sistemas 3×3 e 4×4)
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-9) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((row, i) => row[n] / row[i]);
}
function leastSquares(rows, values) { // rows: vetores de base; values: [canal][amostra]
  const k = rows[0].length, A = Array.from({ length: k }, () => new Float64Array(k)), B = values.map(() => new Float64Array(k));
  for (let s = 0; s < rows.length; s++) { const r = rows[s]; for (let i = 0; i < k; i++) { for (let j = 0; j < k; j++) A[i][j] += r[i] * r[j]; for (let c = 0; c < values.length; c++) B[c][i] += r[i] * values[c][s]; } }
  return values.map((_, c) => solveLinear(A.map(row => [...row]), [...B[c]]));
}

const colorError = (r, g, b, a, R, G, B, A) => {
  const x = labOf(r, g, b), y = labOf(R, G, B), w = Math.min(a, A) / 255;
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * Math.max(0.15, w) + Math.abs(a - A) * ALPHA_ERR;
};
const lerp = (a, b, t) => a + (b - a) * t;
export function stopAt(stops, offset) {
  if (offset <= stops[0].offset) return stops[0].color;
  for (let i = 1; i < stops.length; i++) if (offset <= stops[i].offset) {
    const a = stops[i - 1], b = stops[i], t = (offset - a.offset) / Math.max(1e-9, b.offset - a.offset);
    return a.color.map((v, c) => lerp(v, b.color[c], t));
  }
  return stops[stops.length - 1].color;
}

// Perfil 1D (cor × posição) em faixas finas → menor conjunto de paradas que reproduz o perfil com erro < tol.
function profileStops(positions, colors, lo, hi, tol = 1.0) {
  const span = Math.max(1e-6, hi - lo), bins = Math.max(4, Math.min(160, Math.round(span / 1.25)));
  const acc = Array.from({ length: bins }, () => [0, 0, 0, 0, 0]);
  for (let s = 0; s < positions.length; s++) {
    const b = Math.max(0, Math.min(bins - 1, Math.floor((positions[s] - lo) / span * bins)));
    const c = colors[s]; acc[b][0] += c[0]; acc[b][1] += c[1]; acc[b][2] += c[2]; acc[b][3] += c[3]; acc[b][4]++;
  }
  let points = acc.map((v, b) => v[4] ? { offset: (b + 0.5) / bins, color: [v[0] / v[4], v[1] / v[4], v[2] / v[4], v[3] / v[4]] } : null).filter(Boolean);
  if (!points.length) return null;
  // Cor de faixa quase transparente é ruído: usa a cor da faixa visível mais próxima (sem franja escura no degradê).
  const visible = points.filter(p => p.color[3] >= 24);
  if (visible.length) for (const p of points) if (p.color[3] < 24) { const near = visible.reduce((a, b) => Math.abs(b.offset - p.offset) < Math.abs(a.offset - p.offset) ? b : a); p.color = [...near.color.slice(0, 3), p.color[3]]; }
  points[0] = { ...points[0], offset: 0 }; points[points.length - 1] = { ...points[points.length - 1], offset: 1 };
  if (points.length === 1) return [{ offset: 0, color: points[0].color }, { offset: 1, color: points[0].color }];
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const split = (i, j) => {
    let worst = -1, worstErr = tol;
    for (let k = i + 1; k < j; k++) {
      const t = (points[k].offset - points[i].offset) / (points[j].offset - points[i].offset), c = points[i].color.map((v, ch) => lerp(v, points[j].color[ch], t)), p = points[k].color;
      const err = colorError(p[0], p[1], p[2], p[3], c[0], c[1], c[2], c[3]);
      if (err > worstErr) { worstErr = err; worst = k; }
    }
    if (worst > 0) { keep[worst] = 1; split(i, worst); split(worst, j); }
  };
  split(0, points.length - 1);
  return points.filter((_, i) => keep[i]).slice(0, 64);
}

export function fitRegions(img, seg, { only = null, previous = null, shading = false, zones = true, zoneMin = 1.3, keepRender = false } = {}) {
  const { width, height, data } = img, { labels, count } = seg, n = width * height;
  const sizes = new Int32Array(count); for (let i = 0; i < n; i++) if (labels[i] >= 0) sizes[labels[i]]++;
  const start = new Int32Array(count + 1); for (let r = 0; r < count; r++) start[r + 1] = start[r] + sizes[r];
  const pixels = new Int32Array(start[count]), fill = start.slice(0, count);
  for (let i = 0; i < n; i++) if (labels[i] >= 0) pixels[fill[labels[i]]++] = i;
  const interior = i => {
    const x = i % width, y = (i - x) / width, r = labels[i];
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (labels[(y + dy) * width + x + dx] !== r) return false;
    return true;
  };
  const regions = [];
  for (let r = 0; r < count; r++) {
    if (only && !only.has(r) && previous?.[r]) { regions.push(previous[r]); continue; }
    const all = pixels.subarray(start[r], start[r + 1]);
    let inner = []; for (const i of all) if (interior(i)) inner.push(i);
    // Linha fina (contorno): quase nenhum pixel de miolo. A cor vem do "núcleo" da linha = os pixels mais longe da cor
    // das regiões vizinhas (os da borda são mistura com elas), e não da média de tudo.
    if (inner.length < Math.max(12, all.length * 0.2)) {
      const outside = [0, 0, 0]; let count = 0;
      for (const i of all) { const x = i % width, y = (i - x) / width; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue; const j = yy * width + xx; if (labels[j] >= 0 && labels[j] !== r) { outside[0] += data[j * 4]; outside[1] += data[j * 4 + 1]; outside[2] += data[j * 4 + 2]; count++; } } }
      if (count && all.length >= 6) {
        const o = outside.map(v => v / count), far = Array.from(all, i => [i, (data[i * 4] - o[0]) ** 2 + (data[i * 4 + 1] - o[1]) ** 2 + (data[i * 4 + 2] - o[2]) ** 2]).sort((a, b) => b[1] - a[1]);
        inner = far.slice(0, Math.max(3, Math.round(far.length * 0.4))).map(v => v[0]);
      } else inner = Array.from(all);
    }
    const stride = Math.max(1, Math.floor(inner.length / MAX_SAMPLES)), sample = [];
    for (let s = 0; s < inner.length; s += stride) sample.push(inner[s]);
    const region = fitRegion(r, all, sample, img, shading);
    // Sombreado que o degradê não reproduz: zonas desfocadas (zones.js), com o degradê por baixo só para a borda.
    if (zones && region.error > zoneMin && all.length >= 300) {
      const z = buildZones(img, labels, seg.lab, region, all, { keepRender });
      if (z && z.error < region.error - 0.15) { region.zones = z; region.baseError = region.error; region.error = z.error; region.needsReview = z.error > 4 && all.length > 64; }
    }
    regions.push(region);
  }
  return regions;
}

function fitRegion(id, all, sample, img, shading = true) {
  const { width, data } = img;
  const xs = sample.map(i => (i % width) + 0.5), ys = sample.map(i => Math.floor(i / width) + 0.5);
  const colors = sample.map(i => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3]]);
  const errStride = Math.max(1, Math.floor(sample.length / ERROR_SAMPLES));
  const measure = predict => { let sum = 0, cnt = 0; for (let s = 0; s < sample.length; s += errStride) { const p = predict(s), c = colors[s]; sum += colorError(c[0], c[1], c[2], c[3], p[0], p[1], p[2], p[3]); cnt++; } return sum / cnt; };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const i of all) { const x = i % width, y = Math.floor(i / width); if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const box = { minX, minY, maxX: maxX + 1, maxY: maxY + 1 }, extent = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  // Sólida
  const mean = [0, 0, 0, 0]; for (const c of colors) for (let k = 0; k < 4; k++) mean[k] += c[k] / colors.length;
  const solid = { model: 'solid', color: mean, predict: () => mean, error: measure(() => mean) };
  const candidates = [solid];
  if (sample.length >= 24 && extent >= 6 && solid.error > 1.0) {
    const channels = [0, 1, 2, 3].map(k => colors.map(c => k === 3 ? c[3] * 0.5 : c[k]));
    // Linear: direção principal dos planos de cor de cada canal.
    const plane = leastSquares(xs.map((x, s) => [1, x, ys[s]]), channels);
    if (plane.every(Boolean)) {
      let sxx = 0, sxy = 0, syy = 0; for (const p of plane) { sxx += p[1] * p[1]; sxy += p[1] * p[2]; syy += p[2] * p[2]; }
      const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy), dx = Math.cos(angle), dy = Math.sin(angle);
      let lo = Infinity, hi = -Infinity; for (const i of all) { const t = ((i % width) + 0.5) * dx + (Math.floor(i / width) + 0.5) * dy; if (t < lo) lo = t; if (t > hi) hi = t; }
      lo -= 0.5; hi += 0.5;
      const ts = xs.map((x, s) => x * dx + ys[s] * dy), stops = profileStops(ts, colors, lo, hi);
      if (stops && stops.length >= 2) { const predict = s => stopAt(stops, (ts[s] - lo) / (hi - lo)); candidates.push({ model: 'linear', stops, x1: lo * dx, y1: lo * dy, x2: hi * dx, y2: hi * dy, predict, error: measure(predict) }); }
    }
    // Radial: centro pelo termo x²+y² de cada canal, refinado por busca local.
    const quad = leastSquares(xs.map((x, s) => [1, x, ys[s], x * x + ys[s] * ys[s]]), channels);
    if (quad.every(Boolean)) {
      let cx = 0, cy = 0, wsum = 0;
      for (const q of quad) { if (Math.abs(q[3]) < 1e-7) continue; const w = Math.abs(q[3]) * extent * extent; cx += w * -q[1] / (2 * q[3]); cy += w * -q[2] / (2 * q[3]); wsum += w; }
      if (wsum > 0 && Number.isFinite(cx / wsum)) {
        cx /= wsum; cy /= wsum;
        // Raio até o canto mais distante da caixa da região (o degradê cobre a região inteira).
        const reach = (x0, y0) => Math.max(...[[box.minX, box.minY], [box.maxX, box.minY], [box.minX, box.maxY], [box.maxX, box.maxY]].map(([x, y]) => Math.hypot(x - x0, y - y0)));
        // Busca do centro numa amostra pequena (rápido); ajuste final com a amostra inteira.
        const quick = Math.max(1, Math.floor(sample.length / 2500));
        const score = (x0, y0) => {
          const hi = reach(x0, y0), pos = [], col = [];
          for (let s = 0; s < sample.length; s += quick) { pos.push(Math.hypot(xs[s] - x0, ys[s] - y0)); col.push(colors[s]); }
          const stops = profileStops(pos, col, 0, hi);
          if (!stops) return Infinity;
          let sum = 0; for (let s = 0; s < pos.length; s += 3) { const p = stopAt(stops, pos[s] / hi), c = col[s]; sum += colorError(c[0], c[1], c[2], c[3], p[0], p[1], p[2], p[3]); }
          return sum / Math.ceil(pos.length / 3);
        };
        let bx = cx, by = cy, bestScore = score(cx, cy);
        for (let step = extent * 0.12; step >= 0.5; step /= 2) {
          let improved = true, guard = 0;
          while (improved && guard++ < 12) { improved = false; for (const [ox, oy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) { const next = score(bx + ox, by + oy); if (next < bestScore - 0.01) { bestScore = next; bx += ox; by += oy; improved = true; } } }
        }
        if (Number.isFinite(bestScore)) {
          const hi = reach(bx, by), rs = xs.map((x, s) => Math.hypot(x - bx, ys[s] - by)), stops = profileStops(rs, colors, 0, hi);
          if (stops) { const predict = s => stopAt(stops, rs[s] / hi); candidates.push({ model: 'radial', cx: bx, cy: by, r: hi, stops, predict, error: measure(predict) }); }
        }
      }
    }
  }
  // Escolha: sólida se já está fiel; senão o degradê (linear antes de radial no empate) que melhorar bem o erro.
  let chosen = solid;
  if (solid.error > 1.2) {
    const linear = candidates.find(c => c.model === 'linear'), radial = candidates.find(c => c.model === 'radial');
    const gradient = linear && radial ? (linear.error <= radial.error * 1.1 ? linear : radial) : linear || radial;
    if (gradient && gradient.error < solid.error * 0.75) chosen = gradient;
  }
  const opaque = chosen.model === 'solid' ? chosen.color[3] >= 242 : chosen.stops.every(s => s.color[3] >= 242);
  const { predict, ...fill } = chosen;
  // Sombreado em 2 direções (pele, tecido, dobra): camadas de degradê por cima do preenchimento, sem cortar a região.
  if (shading && opaque && fill.error > 2 && all.length >= 300 && sample.length >= 150) {
    const base = new Float32Array(sample.length * 3), baseA = new Float32Array(sample.length);
    for (let s = 0; s < sample.length; s++) { const p = predict(s); base[s * 3] = p[0]; base[s * 3 + 1] = p[1]; base[s * 3 + 2] = p[2]; baseA[s] = p[3]; }
    const idx = []; for (let s = 0; s < sample.length; s += errStride) idx.push(s);
    const target = idx.map(s => labOf(colors[s][0], colors[s][1], colors[s][2]));
    const errorOf = P => {
      let sum = 0;
      for (let k = 0; k < idx.length; k++) {
        const s = idx[k], c = colors[s], x = target[k], y = labOf(P[s * 3], P[s * 3 + 1], P[s * 3 + 2]), w = Math.min(c[3], baseA[s]) / 255;
        sum += Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) * Math.max(0.15, w) + Math.abs(c[3] - baseA[s]) * ALPHA_ERR;
      }
      return sum / idx.length;
    };
    const maxLayers = Math.max(3, Math.min(14, Math.round(3 + Math.sqrt(all.length) / 40)));
    const result = fitOverlays({ xs, ys, colors, base, errorOf, box, maxLayers });
    if (result.layers.length) { fill.overlays = result.layers; fill.error = result.error; }
  }
  return { id, area: all.length, box, opaque, ...fill, needsReview: fill.error > 4 && all.length > 64, alternatives: candidates.map(c => ({ model: c.model, error: Math.round(c.error * 100) / 100 })) };
}
