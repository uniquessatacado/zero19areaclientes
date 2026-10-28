// Linha do forno (28/10, dono: "deixe uma linha invisível no filme de no máximo 38 cm para ficar fácil de cortar o
// filme para pôr no forno de 40 cm… sem atravessar arte, para cortar fácil e não ter de manobrar as artes e errar
// no corte"). Depois do encaixe, a cada faixa de até `bandMm` acha uma linha livre (nenhuma arte cruzando). Se a
// arte cruza o limite, ela e tudo que está abaixo descem juntos (nada se sobrepõe; as medidas não mudam).
// A linha só aparece na tela: o arquivo de impressão não muda.
const EPS = .01;
export const crossesLine = (placement, y) => placement.yMm < y - EPS && placement.yMm + placement.heightMm > y + EPS;
export const lineIsFree = (placements, y) => !placements.some(placement => crossesLine(placement, y));

export function applyOvenCuts(layout, {bandMm = 380, gapMm} = {}) {
  if (!layout?.placements?.length || !(bandMm > 0)) return layout;
  const gap = Math.max(0, Number(gapMm ?? layout.gapMm ?? 3) || 0), half = Math.min(gap / 2, 2);
  let placements = layout.placements.map(placement => ({...placement})), start = 0, shifted = 0, guard = 0;
  const cuts = [], tooTall = [];
  const bottom = () => Math.max(...placements.map(p => p.yMm + p.heightMm));
  while (bottom() - start > bandMm + EPS && guard++ < 1000) {
    const limit = start + bandMm;
    const candidates = [limit, ...placements.map(p => p.yMm + p.heightMm + half).filter(y => y > start + 1 && y <= limit)];
    const free = candidates.filter(y => lineIsFree(placements, y)).sort((a, b) => b - a)[0];
    const crossing = placements.filter(p => crossesLine(p, limit));
    const tall = crossing.filter(p => p.heightMm > bandMm - gap);
    if (tall.length) {
      // Arte maior que a faixa do forno: não dá para não cortar; a linha vai logo depois dela.
      tooTall.push(...tall.map(p => p.id));
      const after = Math.max(...crossing.map(p => p.yMm + p.heightMm)) + half;
      const next = [after, ...placements.map(p => p.yMm + p.heightMm + half).filter(y => y >= after)].sort((a, b) => a - b).find(y => lineIsFree(placements, y)) ?? after;
      cuts.push(Math.round(next * 100) / 100); start = next; continue;
    }
    const delta = crossing.length ? limit + half - Math.min(...crossing.map(p => p.yMm)) : 0;
    // Linha livre até 3 cm antes do limite: usa ela e não mexe em nenhuma arte.
    if (free !== undefined && limit - free <= Math.max(delta, 30) + EPS) { cuts.push(Math.round(free * 100) / 100); start = free; continue; }
    placements = placements.map(p => p.yMm + p.heightMm > limit + EPS ? {...p, yMm: Math.round((p.yMm + delta) * 1000) / 1000} : p);
    shifted += delta; cuts.push(Math.round(limit * 100) / 100); start = limit;
  }
  const lengthMm = Math.max(Number(layout.lengthMm || 0) + shifted, bottom());
  const efficiency = Number.isFinite(layout.efficiency) && lengthMm > 0 ? layout.efficiency * Number(layout.lengthMm || lengthMm) / lengthMm : layout.efficiency;
  return {...layout, placements, lengthMm, efficiency, ovenBandMm: bandMm, ovenCutsMm: cuts, ovenTooTall: [...new Set(tooTall)]};
}

// Largura que as artes ocupam no filme (cm e pixels a 300 DPI).
export function usedFilmWidth(layout) {
  const mm = layout?.placements?.length ? Math.max(...layout.placements.map(p => p.xMm + p.widthMm)) : 0;
  return {mm, cm: Math.round(mm) / 10, px: Math.round(mm / 25.4 * 300), filmPx: Math.round((layout?.filmWidthMm || 0) / 25.4 * 300)};
}
