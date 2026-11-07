// Fronteira SUAVE (brilho e sombra de aerógrafo, transição esfumada entre cores): a arte muda de cor aos poucos, em vários pixels.
// Se as duas regiões ficassem separadas, o vetor desenharia ali uma borda dura (o degrau que o olho vê como faixa). Aqui cada
// fronteira é medida na própria arte: largura da transição (do ponto em que a cor andou 20% até 80% da diferença total, olhando
// até 5 px para cada lado, sem atravessar outra região). Se a maior parte da fronteira é larga (≥ 3,5 px), as duas regiões viram
// uma só, e o sombreado entre elas passa a ser feito pelas zonas desfocadas (zones.js). Contorno nítido (traço preto, letra) tem
// transição de 1–2 px e nunca é juntado.
export function mergeSoftBoundaries(seg, img, { minWidth = 3.5, softShare = 0.6, minPairs = 8, reach = 5, weak = 3, maxColorGap = 30 } = {}) {
  const { labels, lab } = seg, { width, height, data } = img, n = width * height, pairs = new Map();
  const dE = (p, q) => Math.hypot(lab[p * 3] - lab[q * 3], lab[p * 3 + 1] - lab[q * 3 + 1], lab[p * 3 + 2] - lab[q * 3 + 2]);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x, a = labels[p]; if (a < 0 || data[p * 4 + 3] < 200) continue;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const qx = x + dx, qy = y + dy; if (qx >= width || qy >= height) continue;
      const q = qy * width + qx, b = labels[q]; if (b < 0 || b === a || data[q * 4 + 3] < 200) continue;
      // Perfil ao longo da linha p→q, de até 5 px antes de p até 5 px depois de q, parando se sair das duas regiões.
      const line = [p];
      for (let k = 1; k <= reach; k++) { const xx = x - dx * k, yy = y - dy * k; if (xx < 0 || yy < 0) break; const i = yy * width + xx; if (labels[i] !== a || data[i * 4 + 3] < 200) break; line.unshift(i); }
      line.push(q);
      for (let k = 1; k <= reach; k++) { const xx = qx + dx * k, yy = qy + dy * k; if (xx >= width || yy >= height) break; const i = yy * width + xx; if (labels[i] !== b || data[i * 4 + 3] < 200) break; line.push(i); }
      const start = line[0], total = dE(start, line[line.length - 1]);
      const key = a < b ? a * 1048576 + b : b * 1048576 + a, e = pairs.get(key) || pairs.set(key, { total: 0, soft: 0, weakCount: 0 }).get(key);
      e.total++;
      if (total < weak) { e.weakCount++; continue; }
      let i20 = -1, i80 = -1;
      for (let k = 0; k < line.length; k++) { const d = dE(start, line[k]); if (i20 < 0 && d >= total * 0.2) i20 = k; if (i80 < 0 && d >= total * 0.8) { i80 = k; break; } }
      // Transição que encosta no fim do perfil (região vizinha estreita) conta como larga só se já passou de 3,5 px.
      if (i20 >= 0 && i80 >= 0 && i80 - i20 >= minWidth) e.soft++;
    }
  }
  // Só junta cores parecidas (sombra e brilho do mesmo material: pele clara/escura, tecido, azul do vidro). Transição esfumada
  // entre cores muito diferentes (contorno preto borrado, uma cor do arco-íris para a outra) fica como borda: o vetor deixa nítida.
  // O limite vale para o grupo inteiro (cor média de cada grupo juntado), senão uma corrente de passos pequenos junta tudo.
  const mean = new Float64Array(seg.count * 3), size = new Float64Array(seg.count);
  for (let p = 0; p < n; p++) { const l = labels[p]; if (l < 0) continue; size[l]++; mean[l * 3] += lab[p * 3]; mean[l * 3 + 1] += lab[p * 3 + 1]; mean[l * 3 + 2] += lab[p * 3 + 2]; }
  for (let r = 0; r < seg.count; r++) if (size[r]) { mean[r * 3] /= size[r]; mean[r * 3 + 1] /= size[r]; mean[r * 3 + 2] /= size[r]; }
  const lo = Float64Array.from(mean), hi = Float64Array.from(mean); // faixa de cor (caixa em Lab) de cada grupo
  const parent = Array.from({ length: seg.count }, (_, i) => i), find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  let merged = 0;
  for (const [key, e] of [...pairs.entries()].sort((x, y) => (y[1].soft + y[1].weakCount) / y[1].total - (x[1].soft + x[1].weakCount) / x[1].total)) {
    if (e.total < minPairs) continue;
    if ((e.soft + e.weakCount) / e.total < softShare) continue;
    const a = find(Math.floor(key / 1048576)), b = find(key % 1048576); if (a === b) continue;
    let span = 0; for (let c = 0; c < 3; c++) span = Math.max(span, Math.max(hi[a * 3 + c], hi[b * 3 + c]) - Math.min(lo[a * 3 + c], lo[b * 3 + c]));
    if (span > maxColorGap) continue;
    parent[b] = a; merged++;
    for (let c = 0; c < 3; c++) { hi[a * 3 + c] = Math.max(hi[a * 3 + c], hi[b * 3 + c]); lo[a * 3 + c] = Math.min(lo[a * 3 + c], lo[b * 3 + c]); }
  }
  if (!merged) return 0;
  const map = new Map();
  for (let p = 0; p < n; p++) { const l = labels[p]; if (l < 0) continue; const r = find(l); let id = map.get(r); if (id === undefined) { id = map.size; map.set(r, id); } labels[p] = id; }
  seg.count = map.size;
  return merged;
}
