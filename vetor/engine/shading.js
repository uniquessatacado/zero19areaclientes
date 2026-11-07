// Camadas de sombreado (sombreado em 2 direções sem cortar a região em pedaços — pedaços criam emendas = faixas).
// Sobre o preenchimento de base da região entram degradês radiais ELÍPTICOS de uma cor só, com a opacidade caindo até zero
// (brilho, sombra, dobra). Cada camada é ajustada nos pixels da própria arte:
//   1. onde a sobra (arte − o que já foi desenhado) é maior → cor da camada = cor real ali;
//   2. quanto de opacidade cada pixel pede: α = sobra · (cor − atual) / |cor − atual|²;
//   3. elipse = média e espalhamento desses pixels (pesados por α); perfil de α por distância elíptica, em faixas finas,
//      por mínimos quadrados; termina em α = 0 (sem borda dura).
// A camada só entra se reduz o erro de verdade. Tudo é composto em sRGB, como o navegador e os editores desenham.

const K = 2.4; // a elipse vai até 2,4 desvios (onde a camada já sumiu)

export function fitOverlays({ xs, ys, colors, base, errorOf, box, maxLayers = 6, minGain = 0.12 }) {
  const n = xs.length, P = Float32Array.from(base), layers = [];
  let error = errorOf(P);
  const w = Math.max(1, box.maxX - box.minX), h = Math.max(1, box.maxY - box.minY);
  for (let layer = 0; layer < maxLayers; layer++) {
    // 1. Pico da sobra numa grade sobre a região.
    const G = Math.max(6, Math.min(32, Math.round(Math.sqrt(n / 30)))), cells = new Float64Array(G * G * 7);
    for (let s = 0; s < n; s++) {
      const gx = Math.min(G - 1, Math.max(0, Math.floor((xs[s] - box.minX) / w * G))), gy = Math.min(G - 1, Math.max(0, Math.floor((ys[s] - box.minY) / h * G))), o = (gy * G + gx) * 7, c = colors[s];
      cells[o] += c[0] - P[s * 3]; cells[o + 1] += c[1] - P[s * 3 + 1]; cells[o + 2] += c[2] - P[s * 3 + 2]; cells[o + 3]++; cells[o + 4] += c[0]; cells[o + 5] += c[1]; cells[o + 6] += c[2];
    }
    let best = -1, bestScore = 0;
    for (let i = 0; i < G * G; i++) {
      const o = i * 7, count = cells[o + 3]; if (count < 5) continue;
      const score = Math.hypot(cells[o], cells[o + 1], cells[o + 2]) / count * Math.sqrt(count);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) break;
    const o = best * 7, count = cells[o + 3], color = [cells[o + 4] / count, cells[o + 5] / count, cells[o + 6] / count];
    // 2. Opacidade que cada pixel pede e a elipse onde ela está.
    const alpha = new Float32Array(n), D = new Float32Array(n * 3);
    let sw = 0, mx = 0, my = 0;
    for (let s = 0; s < n; s++) {
      const dx = color[0] - P[s * 3], dy = color[1] - P[s * 3 + 1], dz = color[2] - P[s * 3 + 2], len2 = dx * dx + dy * dy + dz * dz;
      D[s * 3] = dx; D[s * 3 + 1] = dy; D[s * 3 + 2] = dz;
      if (len2 < 36) continue;
      const c = colors[s], a = ((c[0] - P[s * 3]) * dx + (c[1] - P[s * 3 + 1]) * dy + (c[2] - P[s * 3 + 2]) * dz) / len2;
      if (a <= 0.06) continue;
      alpha[s] = Math.min(1, a); sw += alpha[s]; mx += alpha[s] * xs[s]; my += alpha[s] * ys[s];
    }
    if (sw < 4) break;
    mx /= sw; my /= sw;
    let cxx = 0, cxy = 0, cyy = 0;
    for (let s = 0; s < n; s++) { if (!alpha[s]) continue; const u = xs[s] - mx, v = ys[s] - my; cxx += alpha[s] * u * u; cxy += alpha[s] * u * v; cyy += alpha[s] * v * v; }
    cxx /= sw; cxy /= sw; cyy /= sw;
    const tr = cxx + cyy, det = cxx * cyy - cxy * cxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const l1 = Math.max(1, tr / 2 + disc), l2 = Math.max(1, tr / 2 - disc), angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    const s1 = Math.max(2, K * Math.sqrt(l1)), s2 = Math.max(2, K * Math.sqrt(l2)), cos = Math.cos(angle), sin = Math.sin(angle);
    const rho = new Float32Array(n);
    for (let s = 0; s < n; s++) { const u = xs[s] - mx, v = ys[s] - my; rho[s] = Math.hypot((u * cos + v * sin) / s1, (-u * sin + v * cos) / s2); }
    // 3. Perfil de opacidade por faixas finas (mínimos quadrados), terminando em 0.
    const B = 24, num = new Float64Array(B), den = new Float64Array(B);
    for (let s = 0; s < n; s++) {
      if (rho[s] >= 1) continue;
      const b = Math.min(B - 1, Math.floor(rho[s] * B)), c = colors[s];
      num[b] += (c[0] - P[s * 3]) * D[s * 3] + (c[1] - P[s * 3 + 1]) * D[s * 3 + 1] + (c[2] - P[s * 3 + 2]) * D[s * 3 + 2];
      den[b] += D[s * 3] ** 2 + D[s * 3 + 1] ** 2 + D[s * 3 + 2] ** 2;
    }
    let profile = []; for (let b = 0; b < B; b++) if (den[b] > 0) profile.push({ offset: (b + 0.5) / B, alpha: Math.max(0, Math.min(1, num[b] / den[b])) });
    if (profile.length < 2) break;
    profile[0] = { ...profile[0], offset: 0 };
    profile.push({ offset: 1, alpha: 0 });
    profile = simplify(profile, 0.015);
    const at = r => { if (r >= 1) return 0; for (let i = 1; i < profile.length; i++) if (r <= profile[i].offset) { const a = profile[i - 1], b = profile[i]; return a.alpha + (b.alpha - a.alpha) * (r - a.offset) / Math.max(1e-9, b.offset - a.offset); } return 0; };
    // 4. Entra só se melhora.
    const next = Float32Array.from(P);
    for (let s = 0; s < n; s++) { const a = at(rho[s]); if (!a) continue; next[s * 3] += a * D[s * 3]; next[s * 3 + 1] += a * D[s * 3 + 1]; next[s * 3 + 2] += a * D[s * 3 + 2]; }
    const nextError = errorOf(next);
    if (error - nextError < Math.max(minGain, error * 0.03)) break;
    P.set(next); error = nextError;
    layers.push({ color, matrix: [cos * s1, sin * s1, -sin * s2, cos * s2, mx, my], stops: profile });
  }
  return { layers, error, predicted: P };
}

function simplify(points, tol) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop(); let worst = -1, worstD = tol;
    for (let k = i + 1; k < j; k++) { const t = (points[k].offset - points[i].offset) / Math.max(1e-9, points[j].offset - points[i].offset), d = Math.abs(points[i].alpha + (points[j].alpha - points[i].alpha) * t - points[k].alpha); if (d > worstD) { worstD = d; worst = k; } }
    if (worst > 0) { keep[worst] = 1; stack.push([i, worst], [worst, j]); }
  }
  return points.filter((_, i) => keep[i]);
}
