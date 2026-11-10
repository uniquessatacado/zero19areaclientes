// Motor de vetorização (prova técnica, Etapa 1). Ordem: fundo → caixa dos pixels visíveis (aparo) → medida → regiões por
// continuidade → preenchimento (sólido/linear/radial) → contornos compartilhados → SVG. Sem rede, sem IA generativa:
// nada é redesenhado, só medido e reconstruído a partir dos pixels da própria arte.
import { prepareBackground } from './background.js';
import { alphaBox, crop, physicalSize } from './measure.js';
import { segment, mergeWeakBoundaries, splitRegion, cleanupSlivers } from './segment.js';
import { fitRegions } from './fit.js';
import { findFalseSeams, mergePairs } from './seams.js';
import { mergeSoftBoundaries } from './soft.js';
import { traceRegions } from './trace.js';
import { buildSvg, inspectSvg } from './svg.js';

export const ENGINE_VERSION = 'zero19-vetor 0.2.0 (sombreado esfumado)';

/** Prepara fundo e aparo. image = {width,height,data RGBA}. */
export function prepare(image, { removeBackground = true, keepFull = false } = {}) {
  const background = prepareBackground(image, { remove: removeBackground });
  const box = alphaBox(background.image);
  if (!box) return { error: 'O recorte apagou a imagem inteira. Ajuste o recorte ou desmarque Remover fundo.', mode: background.mode, warnings: background.warnings };
  // keepFull: devolve também a imagem preparada inteira (sem aparo), para a tela aplicar Apagar/Restaurar e aparar depois.
  return { art: keepFull ? null : crop(background.image, box), full: keepFull ? background.image : undefined, box, mode: background.mode, warnings: background.warnings, original: { width: image.width, height: image.height } };
}

/** Vetoriza a arte já preparada. size = {reference:'largura'|'altura', value: cm}. */
/** Blocos de compressão (JPEG): degrau médio na grade de 8 px dividido pelo degrau fora dela (≈1 sem compressão). */
export function blockiness(img, offset = { x: 0, y: 0 }) {
  const { width, height, data } = img; let on = 0, onN = 0, off = 0, offN = 0;
  const lum = i => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width - 1; x++) {
    const i = (y * width + x) * 4; if (data[i + 3] < 250 || data[i + 7] < 250) continue;
    const d = Math.abs(lum(i + 4) - lum(i)); if (d > 12) continue; // borda de verdade não conta
    if ((x + offset.x + 1) % 8 === 0) { on += d; onN++; } else { off += d; offN++; }
  }
  // Imagem lisa demais (degrau médio < 0,4 de luminância fora da grade): a razão é só ruído, não é compressão.
  return onN > 200 && offN > 200 && off / offN >= 0.4 ? (on / onN) / (off / offN) : 1;
}

export function vectorize(art, { size = null, epsilon = 0.45, title, offset = { x: 0, y: 0 }, refineEdges = null, refineError = null, remerge = true, shading = false, seams = false, seamRounds = 4, zones = true, soft = true, refine = null, onStage = null, keepLabels = false, keepRender = false } = {}) {
  const times = {}, t = () => (globalThis.performance ?? Date).now(), stage = name => { try { onStage?.(name); } catch {} };
  stage('regioes');
  let t0 = t();
  // Print comprimido: os degraus dos blocos de 8 px não viram regiões nem refino (a meta é o degradê liso por baixo).
  const blocks = blockiness(art, offset), compressed = blocks > 1.5;
  const seg = segment(art), merged = mergeWeakBoundaries(seg, art, compressed ? 7 : 4), softened = soft ? mergeSoftBoundaries(seg, art) : 0; times.regioes = t() - t0; t0 = t(); stage('cores');
  const fitOptions = { shading, zones, keepRender };
  let regions = fitRegions(art, seg, fitOptions); times.cores = t() - t0; t0 = t(); stage('refino');
  // Refino (especificação, passo 6): região grande com erro alto é separada de novo com limite de borda mais fino.
  let refined = 0;
  for (const edge of (refine ?? !zones) ? (refineEdges ?? [Math.max(2.5, seg.edge / 2), Math.max(1.5, seg.edge / 4)]) : []) {
    const bad = regions.filter(r => r.error > (refineError ?? (compressed ? 7 : 3)) && r.area > 200);
    if (!bad.length) break;
    const changed = new Set();
    for (const region of bad) { const created = splitRegion(seg, art, region, edge); if (created.length) { changed.add(region.id); created.forEach(id => changed.add(id)); refined++; } }
    if (!changed.size) break;
    regions = fitRegions(art, seg, { ...fitOptions, only: changed, previous: regions });
  }
  // Depois do refino: fronteira fraca (sombreado liso cortado em pedaços) volta a juntar; fiapos vão para as vizinhas.
  const rejoined = refined && remerge ? mergeWeakBoundaries(seg, art, compressed ? 7 : 4) : 0;
  const dissolved = refined ? cleanupSlivers(seg, art) : 0;
  if (dissolved || rejoined) regions = fitRegions(art, seg, fitOptions);
  times.refino = t() - t0; t0 = t();
  // Emendas falsas (faixas): onde a arte era lisa e o vetor criou degrau entre duas regiões, elas voltam a ser uma só.
  let seamMerged = 0, seamRoundsDone = 0;
  if (seams) for (let round = 0; round < seamRounds; round++) {
    const pairs = findFalseSeams(seg, art, regions);
    if (!pairs.length) break;
    const result = mergePairs(seg, pairs);
    if (!result.merged) break;
    seamMerged += result.merged; seamRoundsDone++;
    const previous = []; result.from.forEach((old, id) => { previous[id] = { ...regions[old], id }; });
    regions = fitRegions(art, seg, { ...fitOptions, only: result.changed, previous });
  }
  times.emendas = t() - t0; t0 = t(); stage('contornos');
  // Regiões opacas: o pixel de borda com menos de 50% de cobertura fica fora do contorno (o antisserrilhado é geometria, não cor).
  const traceLabels = seg.labels.slice();
  for (let i = 0; i < traceLabels.length; i++) { const r = traceLabels[i]; if (r >= 0 && regions[r].opaque && art.data[i * 4 + 3] < 128) traceLabels[i] = -1; }
  const traced = traceRegions(traceLabels, art.width, art.height, seg.count, { epsilon }); times.contornos = t() - t0; t0 = t(); stage('svg');
  const physical = size ? physicalSize({ width: art.width, height: art.height }, size) : null;
  const svgArgs = { width: art.width, height: art.height, paths: traced.regions, widthCm: physical?.widthCm, heightCm: physical?.heightCm, title };
  const svg = buildSvg({ ...svgArgs, regions });
  times.svg = t() - t0;
  const summary = {
    regions: regions.length, compression: Math.round(blocks * 100) / 100, compressed, edgeThreshold: Math.round(seg.edge * 10) / 10, mergedWeak: merged, softMerged: softened, refinedRegions: refined, zoned: regions.filter(r => r.zones).length, zonePaths: regions.reduce((n, r) => n + (r.zones?.zones || 0), 0), seamMerged, seamRounds: seamRoundsDone,
    solid: regions.filter(r => r.model === 'solid').length, linear: regions.filter(r => r.model === 'linear').length, radial: regions.filter(r => r.model === 'radial').length, shaded: regions.filter(r => r.overlays).length, overlays: regions.reduce((n, r) => n + (r.overlays?.length || 0), 0),
    needsReview: regions.filter(r => r.needsReview).map(r => ({ id: r.id, area: r.area, model: r.model, error: Math.round(r.error * 10) / 10, box: r.box })),
    brokenRings: traced.broken, chains: traced.chains, inspect: inspectSvg(svg), physical, times: Object.fromEntries(Object.entries(times).map(([k, v]) => [k, Math.round(v)])), engine: ENGINE_VERSION,
  };
  // svgArgs + regions permitem redesenhar o SVG depois (ex.: trocar a cor de uma parte, recolor()) sem vetorizar de novo.
  return keepLabels ? { svg, summary, regions, svgArgs, labels: seg.labels } : { svg, summary, regions, svgArgs };
}

/**
 * Troca a cor de partes já vetorizadas e redesenha o SVG (sem vetorizar de novo).
 * edits = [{ ids: [região, ...], fill }] na ordem em que foram feitas (a última vale). fill:
 *   { type: 'solid', color: [r,g,b] } · { type: 'linear', x1, y1, x2, y2, from: [r,g,b], to: [r,g,b] }
 *   { type: 'radial', cx, cy, r, from: [r,g,b], to: [r,g,b] }  (from = centro). Todas as partes de uma troca usam o MESMO
 *   degradê (mesmas coordenadas): ficam contínuas entre si. A transparência de cada parte é mantida.
 */
export function recolor({ regions, svgArgs }, edits = []) {
  const out = regions.slice();
  for (const { ids, fill } of edits) for (const id of ids) {
    const base = regions[id]; if (!base) continue;
    // Transparência da parte CHEIA da peça (a maior), não a média: peça que inclui uma borda esfumada ficaria meio transparente
    // por inteiro. Sombra que é transparente em toda parte continua transparente como era.
    const alphas = [...(base.model === 'solid' ? [base.color[3]] : base.stops.map(s => s.color[3])), ...(base.zones?.layers || []).flatMap(l => l.paths.map(p => p.color[3]))];
    const alpha = Math.max(...alphas);
    const { zones, overlays, ...rest } = base;
    const color = c => [c[0], c[1], c[2], alpha];
    if (fill.type === 'solid') out[id] = { ...rest, model: 'solid', color: color(fill.color), edited: true };
    else if (fill.type === 'linear') out[id] = { ...rest, model: 'linear', x1: fill.x1, y1: fill.y1, x2: fill.x2, y2: fill.y2, stops: [{ offset: 0, color: color(fill.from) }, { offset: 1, color: color(fill.to) }], edited: true };
    else if (fill.type === 'radial') out[id] = { ...rest, model: 'radial', cx: fill.cx, cy: fill.cy, r: Math.max(1, fill.r), stops: [{ offset: 0, color: color(fill.from) }, { offset: 1, color: color(fill.to) }], edited: true };
  }
  return buildSvg({ ...svgArgs, regions: out });
}
