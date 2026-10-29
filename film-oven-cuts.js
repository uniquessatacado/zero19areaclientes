// Linha do forno (28/10, dono: "deixe uma linha invisível no filme de no máximo 38 cm para ficar fácil de cortar o
// filme para pôr no forno de 40 cm… sem atravessar arte"; depois: "a linha está fazendo sobrar muito espaço no filme…
// não pode perder espaço"). Quem respeita a linha é o ENCAIXE (ovenBandMm no nesting-core.js e no
// nesting-batch-core.js): cada faixa de `bandMm` é preenchida sem arte em cima da linha. Depois, aqui, cada faixa sobe
// até encostar na de cima (só a distância normal entre artes), então a sobra do fim de cada faixa não vira filme
// perdido: os pedaços ficam com ATÉ `bandMm`. As linhas são achadas onde não há arte e só aparecem na tela.
const EPS = .01;
export const crossesLine = (placement, y) => placement.yMm < y - EPS && placement.yMm + placement.heightMm > y + EPS;
export const lineIsFree = (placements, y) => !placements.some(placement => crossesLine(placement, y));
const halfGap = gapMm => Math.max(Number(gapMm) || 0, 2) / 2;

// Linhas de corte com pedaços de até `band`: a cada passo, a linha livre mais longe possível (com `half` de folga
// de cada lado). `blocked` = trechos sem linha livre (arte maior que o pedaço ou arte arrastada para cima da linha).
export function ovenCutLines(placements, {band, half}) {
  const spans = placements.map(p => [p.yMm, p.yMm + p.heightMm]).sort((a, b) => a[0] - b[0]);
  if (!spans.length) return {cuts: [], blocked: 0};
  const reach = []; let deepest = -Infinity;
  for (const [, bottom] of spans) reach.push(deepest = Math.max(deepest, bottom));
  const free = y => { let lo = 0, hi = spans.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (spans[mid][0] < y + half - 1e-6) lo = mid + 1; else hi = mid; } return lo === 0 || reach[lo - 1] <= y - half + 1e-6; };
  // Um trecho livre vai de (fim de uma arte + folga) até (começo da próxima − folga): a linha mais longe possível é o
  // limite do pedaço ou o fim de um trecho livre.
  const length = deepest, lines = [...new Set(spans.flatMap(([top, bottom]) => [top - half, bottom + half]))].sort((a, b) => a - b), cuts = [];
  let start = 0, blocked = 0;
  while (length - start > band + 1e-6) {
    let next = free(start + band) ? start + band : -1;
    if (next < 0) for (const y of lines) { if (y <= start + 1e-6) continue; if (y > start + band + 1e-6) break; if (free(y)) next = y; }
    if (next < 0) { next = start + band; blocked++; }
    cuts.push(Math.round(next * 100) / 100); start = next;
  }
  return {cuts, blocked};
}
export const ovenFeasible = (rule, placements) => !rule || ovenCutLines(placements, rule).blocked === 0;

// Sobe cada faixa do encaixe até a de cima (sem mudar nada dentro da faixa, nem a posição lateral). Só quando o
// encaixe veio por faixas fixas: nenhuma arte cruza as linhas a cada `band` e nenhuma é maior que a faixa.
function compactBands(layout, {band, half, cell}) {
  const placements = layout.placements, clear = 2 * half;
  if (placements.some(p => p.locked || p.heightMm > band - clear + 1e-6)) return null;
  const index = p => Math.floor((p.yMm + 1e-6) / band);
  if (placements.some(p => Math.floor((p.yMm + p.heightMm - 1e-6) / band) !== index(p))) return null;
  const groups = new Map();
  for (const p of placements) { const k = index(p); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
  const moved = new Map(); let bottom = null;
  for (const k of [...groups.keys()].sort((a, b) => a - b)) {
    const group = groups.get(k), top = Math.min(...group.map(p => p.yMm));
    const target = bottom == null ? top : Math.max(0, Math.ceil((bottom + clear - 1e-6) / cell) * cell);
    const delta = Math.min(0, target - top);
    for (const p of group) moved.set(p, delta ? {...p, yMm: Math.round((p.yMm + delta) * 1000) / 1000} : p);
    bottom = Math.max(...group.map(p => p.yMm + delta + p.heightMm));
  }
  const next = placements.map(p => moved.get(p));
  const lengthMm = Math.max(...next.map(p => p.yMm + p.heightMm));
  const efficiency = Number.isFinite(layout.efficiency) && lengthMm > 0 ? Math.min(100, layout.efficiency * layout.lengthMm / lengthMm) : layout.efficiency;
  return {...layout, placements: next, lengthMm, efficiency, waste: Number.isFinite(efficiency) ? 100 - efficiency : layout.waste};
}

export function applyOvenCuts(layout, {bandMm = 380, gapMm, compact = true} = {}) {
  if (!layout?.placements?.length || !(bandMm > 0)) return layout;
  const half = halfGap(gapMm ?? layout.gapMm ?? 3), cell = Number(layout.cellMm) || 2;
  const packed = (compact && compactBands(layout, {band: bandMm, half, cell})) || layout;
  const {cuts} = ovenCutLines(packed.placements, {band: bandMm, half});
  const crossing = packed.placements.filter(p => cuts.some(y => crossesLine(p, y)));
  // Arte maior que o pedaço não tem como não ser cortada (avisada); qualquer outra em cima da linha pede Atualizar filme.
  const tooTall = crossing.filter(p => p.heightMm > bandMm - 2 * half + EPS);
  return {...packed, ovenBandMm: bandMm, ovenCutsMm: cuts, ovenTooTall: [...new Set(tooTall.map(p => p.id))], ovenCrossed: crossing.length - tooTall.length};
}

// Largura que as artes ocupam no filme (cm e pixels a 300 DPI).
export function usedFilmWidth(layout) {
  const mm = layout?.placements?.length ? Math.max(...layout.placements.map(p => p.xMm + p.widthMm)) : 0;
  return {mm, cm: Math.round(mm) / 10, px: Math.round(mm / 25.4 * 300), filmPx: Math.round((layout?.filmWidthMm || 0) / 25.4 * 300)};
}
