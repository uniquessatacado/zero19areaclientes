// Preparação do fundo (especificação, seção 4). Remover fundo e aparar margens são operações diferentes; aqui só o fundo.
// - PNG que já tem transparência: o canal alfa é preservado (nada é apagado só porque a opção está marcada).
// - Fundo uniforme (prints, logos em fundo liso): remove apenas o fundo LIGADO À BORDA da imagem (inundação a partir das
//   bordas). Áreas internas da mesma cor (miolo de letras) NÃO são apagadas sozinhas: viram aviso para revisar.
// - Borda antisserrilhada: o alfa e a cor real de cada pixel de borda são separados da cor do fundo (sem halo branco/preto).
// - Fundo não uniforme (fotos): não remove nada e avisa (precisa de segmentação de primeiro plano, fora desta prova).
import { labImage } from './color.js';

const cloneImage = img => ({ width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) });

export function hasTransparency(img) {
  const { data } = img, n = data.length / 4;
  let transparent = 0;
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 250) transparent++;
  return transparent / n >= 0.005;
}

function borderIndices(width, height) {
  const out = [];
  for (let x = 0; x < width; x++) { out.push(x); out.push((height - 1) * width + x); }
  for (let y = 1; y < height - 1; y++) { out.push(y * width); out.push(y * width + width - 1); }
  return out;
}

/** Cor dominante da borda e quanto da borda ela ocupa. */
export function borderBackground(img, lab = labImage(img.data)) {
  const border = borderIndices(img.width, img.height), bins = new Map();
  for (const i of border) {
    const key = Math.round(lab[i * 3] / 4) + ':' + Math.round(lab[i * 3 + 1] / 4) + ':' + Math.round(lab[i * 3 + 2] / 4);
    bins.set(key, (bins.get(key) || 0) + 1);
  }
  const [best] = [...bins.entries()].sort((a, b) => b[1] - a[1])[0];
  const [L, A, B] = best.split(':').map(v => Number(v) * 4);
  let count = 0, sum = [0, 0, 0], rgb = [0, 0, 0], spread = 0;
  for (const i of border) {
    const d = Math.hypot(lab[i * 3] - L, lab[i * 3 + 1] - A, lab[i * 3 + 2] - B);
    if (d <= 10) { count++; sum[0] += lab[i * 3]; sum[1] += lab[i * 3 + 1]; sum[2] += lab[i * 3 + 2]; for (let c = 0; c < 3; c++) rgb[c] += img.data[i * 4 + c]; spread += d * d; }
  }
  const mean = sum.map(v => v / count);
  return { lab: mean, rgb: rgb.map(v => v / count), coverage: count / border.length, spread: Math.sqrt(spread / count) };
}

export function prepareBackground(input, { remove = true, tolerance = null } = {}) {
  const img = cloneImage(input), warnings = [];
  if (hasTransparency(input)) return { image: img, mode: 'alfa-existente', warnings: remove ? ['A imagem já tem fundo transparente: o canal alfa original foi mantido.'] : [] };
  if (!remove) return { image: img, mode: 'mantido', warnings };
  const { width, height, data } = img, n = width * height, lab = labImage(data);
  const bg = borderBackground(img, lab);
  if (bg.coverage < 0.6) {
    warnings.push('Fundo não uniforme (foto ou arte até a borda): a remoção automática não foi aplicada. Fotos precisam de outro método de recorte.');
    return { image: img, mode: 'nao-uniforme', warnings, background: bg };
  }
  const limit = tolerance ?? Math.max(6, Math.min(18, 3 * bg.spread + 4));
  const distance = i => Math.hypot(lab[i * 3] - bg.lab[0], lab[i * 3 + 1] - bg.lab[1], lab[i * 3 + 2] - bg.lab[2]);
  // Inundação a partir da borda (4 vizinhos): só o fundo que encosta na borda.
  const isBg = new Uint8Array(n), queue = new Int32Array(n);
  let head = 0, tail = 0;
  for (const i of borderIndices(width, height)) if (!isBg[i] && distance(i) <= limit) { isBg[i] = 1; queue[tail++] = i; }
  while (head < tail) {
    const i = queue[head++], x = i % width, y = (i - x) / width;
    const visit = j => { if (!isBg[j] && distance(j) <= limit) { isBg[j] = 1; queue[tail++] = j; } };
    if (x > 0) visit(i - 1); if (x < width - 1) visit(i + 1); if (y > 0) visit(i - width); if (y < height - 1) visit(i + width);
  }
  // Borda: pixel que não é fundo mas encosta no fundo (até 2 px). Separa alfa e cor real: C = a·F + (1−a)·B.
  const near = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (isBg[i]) continue;
    const x = i % width, y = (i - x) / width;
    outer: for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < width && yy < height && isBg[yy * width + xx]) { near[i] = 1; break outer; }
    }
  }
  const B = bg.rgb, out = img.data;
  for (let i = 0; i < n; i++) {
    if (isBg[i]) { out[i * 4 + 3] = 0; continue; }
    if (!near[i]) continue;
    // Cor de frente: o vizinho (raio 3) mais distante do fundo que não é borda nem fundo; sem ele, o próprio pixel.
    const x = i % width, y = (i - x) / width;
    let best = -1, bestD = -1;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
      const j = yy * width + xx;
      if (isBg[j] || near[j]) continue;
      const d = distance(j);
      if (d > bestD) { bestD = d; best = j; }
    }
    const C = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]], F = best >= 0 ? [data[best * 4], data[best * 4 + 1], data[best * 4 + 2]] : C;
    const fb = [F[0] - B[0], F[1] - B[1], F[2] - B[2]], cb = [C[0] - B[0], C[1] - B[1], C[2] - B[2]], len2 = fb[0] ** 2 + fb[1] ** 2 + fb[2] ** 2;
    if (len2 < 400) continue; // frente quase da cor do fundo: não dá para separar com segurança; fica opaco
    const a = Math.max(0, Math.min(1, (cb[0] * fb[0] + cb[1] * fb[1] + cb[2] * fb[2]) / len2));
    if (a >= 0.985) continue;
    out[i * 4 + 3] = Math.round(a * 255);
    if (a > 0) for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(Math.max(0, Math.min(255, B[c] + (C[c] - B[c]) / a)));
  }
  // Áreas internas da cor do fundo (ex.: miolo de letras) ficam: aviso para revisar com a ferramenta Apagar.
  let holes = 0;
  for (let i = 0; i < n; i++) if (!isBg[i] && distance(i) <= limit * 0.6) holes++;
  if (holes > n * 0.0005) warnings.push(`Há áreas internas com a cor do fundo (${holes} px, ex.: miolo de letras). Foram mantidas; revise se devem ficar transparentes.`);
  return { image: img, mode: 'fundo-uniforme', warnings, background: bg, tolerance: limit, internalBackgroundPixels: holes };
}
