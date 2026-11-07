// Contornos (especificação, seção 6, passo 2). As fronteiras entre regiões viram uma malha plana: cada trecho de fronteira entre
// duas regiões (ou região e transparência) é traçado UMA vez e usado pelas duas regiões, então não sobra fresta nem sobreposição.
// O degrau de pixel é trocado pelo meio de cada aresta, simplificado (Douglas–Peucker) e suavizado em curvas Bézier, mantendo os
// cantos vivos (ângulo fechado) e as junções (onde 3 ou mais regiões se encontram) exatamente no lugar.

const E = 0, S = 1, W = 2, N = 3;
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];

export function traceRegions(labels, width, height, count, { epsilon = 0.45, cornerAngle = 62 } = {}) {
  const label = (x, y) => x < 0 || y < 0 || x >= width || y >= height ? -1 : labels[y * width + x];
  // h(x,y): aresta de (x,y) a (x+1,y) entre o pixel de cima (x,y−1) e o de baixo (x,y). v(x,y): de (x,y) a (x,y+1) entre (x−1,y) e (x,y).
  const hB = new Uint8Array((height + 1) * width), vB = new Uint8Array(height * (width + 1));
  for (let y = 0; y <= height; y++) for (let x = 0; x < width; x++) hB[y * width + x] = label(x, y - 1) !== label(x, y) ? 1 : 0;
  for (let y = 0; y < height; y++) for (let x = 0; x <= width; x++) vB[y * (width + 1) + x] = label(x - 1, y) !== label(x, y) ? 1 : 0;
  const hVis = new Uint8Array(hB.length), vVis = new Uint8Array(vB.length);
  // Aresta que sai do canto (x,y) na direção d: índice, conjunto e rótulos esquerda/direita (andando, a esquerda fica à mão esquerda).
  const edgeOf = (x, y, d) => {
    if (d === E) return x < width ? { set: 'h', i: y * width + x, left: label(x, y - 1), right: label(x, y) } : null;
    if (d === W) return x > 0 ? { set: 'h', i: y * width + x - 1, left: label(x - 1, y), right: label(x - 1, y - 1) } : null;
    if (d === S) return y < height ? { set: 'v', i: y * (width + 1) + x, left: label(x, y), right: label(x - 1, y) } : null;
    return y > 0 ? { set: 'v', i: (y - 1) * (width + 1) + x, left: label(x - 1, y - 1), right: label(x, y - 1) } : null;
  };
  const isB = e => e && (e.set === 'h' ? hB[e.i] : vB[e.i]);
  const seen = e => e.set === 'h' ? hVis[e.i] : vVis[e.i];
  const mark = e => { if (e.set === 'h') hVis[e.i] = 1; else vVis[e.i] = 1; };
  // Quantas arestas de fronteira saem do canto (x,y): direto nos vetores, sem criar objeto (roda para cada canto da imagem).
  const degree = (x, y) => (x < width && hB[y * width + x] ? 1 : 0) + (x > 0 && hB[y * width + x - 1] ? 1 : 0) + (y < height && vB[y * (width + 1) + x] ? 1 : 0) + (y > 0 && vB[(y - 1) * (width + 1) + x] ? 1 : 0);
  const chains = [];
  const walk = (x0, y0, d0) => {
    const first = edgeOf(x0, y0, d0), points = [[x0, y0]];
    let x = x0, y = y0, d = d0, e = first;
    for (;;) {
      mark(e); x += DX[d]; y += DY[d]; points.push([x, y]);
      // Volta ao início: laço fechado só se o início não é junção (senão as pontas ficam presas na junção).
      if (x === x0 && y === y0) return chains.push({ points, left: first.left, right: first.right, closed: degree(x0, y0) === 2 });
      if (degree(x, y) !== 2) return chains.push({ points, left: first.left, right: first.right, closed: false });
      const back = (d + 2) % 4; let found = false;
      for (let k = 0; k < 4; k++) { if (k === back) continue; const next = edgeOf(x, y, k); if (isB(next) && !seen(next)) { d = k; e = next; found = true; break; } }
      if (!found) return chains.push({ points, left: first.left, right: first.right, closed: false });
    }
  };
  for (let y = 0; y <= height; y++) for (let x = 0; x <= width; x++) {
    if (degree(x, y) < 3) continue;
    for (let d = 0; d < 4; d++) { const e = edgeOf(x, y, d); if (isB(e) && !seen(e)) walk(x, y, d); }
  }
  for (let y = 0; y <= height; y++) for (let x = 0; x < width; x++) { const i = y * width + x; if (hB[i] && !hVis[i]) walk(x, y, E); }
  for (let y = 0; y < height; y++) for (let x = 0; x <= width; x++) { const i = y * (width + 1) + x; if (vB[i] && !vVis[i]) walk(x, y, S); }
  for (const chain of chains) chain.curve = smoothChain(chain.points, chain.closed, epsilon, cornerAngle);
  // Anéis de cada região: trechos orientados com a região à esquerda, ligados ponta com ponta.
  const byRegion = Array.from({ length: count }, () => []);
  chains.forEach((chain, c) => { if (chain.left >= 0) byRegion[chain.left].push({ c, reverse: false }); if (chain.right >= 0) byRegion[chain.right].push({ c, reverse: true }); });
  const key = p => p[0] + ',' + p[1];
  const regions = [];
  let broken = 0;
  for (let r = 0; r < count; r++) {
    const parts = byRegion[r].map(part => { const pts = chains[part.c].points; return { ...part, from: key(part.reverse ? pts[pts.length - 1] : pts[0]), to: key(part.reverse ? pts[0] : pts[pts.length - 1]) }; });
    const starts = new Map(); parts.forEach((p, i) => { if (!starts.has(p.from)) starts.set(p.from, []); starts.get(p.from).push(i); });
    const used = new Uint8Array(parts.length), rings = [];
    for (let i = 0; i < parts.length; i++) {
      if (used[i]) continue;
      const ring = [i]; used[i] = 1; let at = parts[i].to, guard = 0;
      while (at !== parts[i].from && guard++ < parts.length + 2) {
        const next = (starts.get(at) || []).find(j => !used[j]);
        if (next === undefined) { broken++; break; }
        used[next] = 1; ring.push(next); at = parts[next].to;
      }
      rings.push(ring.map(j => parts[j]));
    }
    regions.push({ id: r, d: rings.map(ring => ringPath(ring.map(p => p.reverse ? reverseCurve(chains[p.c].curve) : chains[p.c].curve))).join('') });
  }
  return { regions, chains: chains.length, broken };
}

const fmt = v => { const s = (Math.round(v * 100) / 100).toString(); return s === '-0' ? '0' : s; };
function ringPath(curves) {
  let d = 'M' + fmt(curves[0].start[0]) + ' ' + fmt(curves[0].start[1]);
  for (const curve of curves) for (const s of curve.segments) d += s.c1 ? 'C' + [...s.c1, ...s.c2, ...s.p].map(fmt).join(' ') : 'L' + fmt(s.p[0]) + ' ' + fmt(s.p[1]);
  return d + 'Z';
}
function reverseCurve(curve) {
  const pts = [curve.start, ...curve.segments.map(s => s.p)], segments = [];
  for (let i = curve.segments.length - 1; i >= 0; i--) { const s = curve.segments[i]; segments.push(s.c1 ? { c1: s.c2, c2: s.c1, p: pts[i] } : { p: pts[i] }); }
  return { start: pts[pts.length - 1], segments };
}

// Degraus → meio das arestas → Douglas–Peucker → Bézier suave com cantos vivos. Pontas (junções) ficam fixas.
function smoothChain(points, closed, epsilon, cornerAngle) {
  if (points.length <= 2) return { start: points[0], segments: [{ p: points[points.length - 1] }] };
  let poly;
  if (closed) { poly = []; for (let i = 0; i < points.length - 1; i++) poly.push(mid(points[i], points[i + 1])); }
  else { poly = [points[0]]; for (let i = 0; i < points.length - 1; i++) poly.push(mid(points[i], points[i + 1])); poly.push(points[points.length - 1]); }
  let simple;
  if (closed) {
    let far = 0, best = -1; for (let i = 1; i < poly.length; i++) { const d = dist(poly[0], poly[i]); if (d > best) { best = d; far = i; } }
    const a = douglas(poly.slice(0, far + 1), epsilon), b = douglas([...poly.slice(far), poly[0]], epsilon);
    simple = [...a, ...b.slice(1, -1)];
  } else simple = douglas(poly, epsilon);
  const m = simple.length, corner = new Uint8Array(m);
  const vertex = i => simple[closed ? (i + m) % m : i];
  for (let i = 0; i < m; i++) {
    if (!closed && (i === 0 || i === m - 1)) { corner[i] = 1; continue; }
    const a = vertex(i - 1), b = vertex(i), c = vertex(i + 1);
    const turn = Math.abs(angleBetween([b[0] - a[0], b[1] - a[1]], [c[0] - b[0], c[1] - b[1]]));
    if (turn > cornerAngle) corner[i] = 1;
  }
  const tangent = i => {
    const a = vertex(i - 1), b = vertex(i), c = vertex(i + 1);
    const t = [c[0] - a[0], c[1] - a[1]], len = Math.hypot(t[0], t[1]) || 1; return [t[0] / len, t[1] / len];
  };
  const segments = [], last = closed ? m : m - 1;
  for (let i = 0; i < last; i++) {
    const p0 = vertex(i), p1 = vertex(i + 1), len = dist(p0, p1);
    const chord = [(p1[0] - p0[0]) / (len || 1), (p1[1] - p0[1]) / (len || 1)];
    const i1 = closed ? (i + 1) % m : i + 1;
    if (corner[i] && corner[i1]) { segments.push({ p: p1 }); continue; }
    const t0 = corner[i] ? chord : tangent(i), t1 = corner[i1] ? chord : tangent(i1);
    segments.push({ c1: [p0[0] + t0[0] * len / 3, p0[1] + t0[1] * len / 3], c2: [p1[0] - t1[0] * len / 3, p1[1] - t1[1] * len / 3], p: p1 });
  }
  return { start: simple[0], segments };
}
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const angleBetween = (u, v) => Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]) * 180 / Math.PI;
function douglas(points, epsilon) {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop(), a = points[i], b = points[j], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    let worst = -1, worstD = epsilon;
    for (let k = i + 1; k < j; k++) {
      const p = points[k], d = len ? Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len : dist(p, a);
      if (d > worstD) { worstD = d; worst = k; }
    }
    if (worst > 0) { keep[worst] = 1; stack.push([i, worst], [worst, j]); }
  }
  return points.filter((_, i) => keep[i]);
}
