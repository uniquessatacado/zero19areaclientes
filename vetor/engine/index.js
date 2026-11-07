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

export function vectorize(art, { size = null, epsilon = 0.45, title, offset = { x: 0, y: 0 }, refineEdges = null, refineError = null, remerge = true, shading = false, seams = false, seamRounds = 4, zones = true, soft = true, refine = null, onStage = null, keepLabels = false } = {}) {
  const times = {}, t = () => (globalThis.performance ?? Date).now(), stage = name => { try { onStage?.(name); } catch {} };
  stage('regioes');
  let t0 = t();
  // Print comprimido: os degraus dos blocos de 8 px não viram regiões nem refino (a meta é o degradê liso por baixo).
  const blocks = blockiness(art, offset), compressed = blocks > 1.5;
  const seg = segment(art), merged = mergeWeakBoundaries(seg, art, compressed ? 7 : 4), softened = soft ? mergeSoftBoundaries(seg, art) : 0; times.regioes = t() - t0; t0 = t(); stage('cores');
  const fitOptions = { shading, zones, keepRender: keepLabels };
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
  const svg = buildSvg({ width: art.width, height: art.height, regions, paths: traced.regions, widthCm: physical?.widthCm, heightCm: physical?.heightCm, title });
  times.svg = t() - t0;
  const summary = {
    regions: regions.length, compression: Math.round(blocks * 100) / 100, compressed, edgeThreshold: Math.round(seg.edge * 10) / 10, mergedWeak: merged, softMerged: softened, refinedRegions: refined, zoned: regions.filter(r => r.zones).length, zonePaths: regions.reduce((n, r) => n + (r.zones?.zones || 0), 0), seamMerged, seamRounds: seamRoundsDone,
    solid: regions.filter(r => r.model === 'solid').length, linear: regions.filter(r => r.model === 'linear').length, radial: regions.filter(r => r.model === 'radial').length, shaded: regions.filter(r => r.overlays).length, overlays: regions.reduce((n, r) => n + (r.overlays?.length || 0), 0),
    needsReview: regions.filter(r => r.needsReview).map(r => ({ id: r.id, area: r.area, model: r.model, error: Math.round(r.error * 10) / 10, box: r.box })),
    brokenRings: traced.broken, chains: traced.chains, inspect: inspectSvg(svg), physical, times: Object.fromEntries(Object.entries(times).map(([k, v]) => [k, Math.round(v)])), engine: ENGINE_VERSION,
  };
  return keepLabels ? { svg, summary, regions, labels: seg.labels } : { svg, summary, regions };
}
