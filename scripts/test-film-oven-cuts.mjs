// Linha do forno (28/10, dono): o encaixe respeita as linhas a cada 38 cm sem perder espaço no filme.
// Uso: node scripts/test-film-oven-cuts.mjs [caminho do nesting-core.js] (o build passa o do dist/).
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {applyOvenCuts, lineIsFree, crossesLine, usedFilmWidth} from '../film-oven-cuts.js';
import {nestBatchRectangles} from '../nesting-batch-core.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {nestItems, validateFilmPlacements} = await import(pathToFileURL(process.argv[2] || path.join(root, 'nesting-core.js')).href);
const BAND = 380, GAP = 3;
const overlaps = list => list.some((a, i) => list.some((b, j) => j > i && a.xMm < b.xMm + b.widthMm && b.xMm < a.xMm + a.widthMm && a.yMm < b.yMm + b.heightMm && b.yMm < a.yMm + a.heightMm));
// Nenhuma arte (que cabe numa faixa) em cima da linha, e de cada lado fica pelo menos metade da distância.
function assertBands(layout, label, half = GAP / 2) {
  for (const p of layout.placements) {
    if (p.heightMm > BAND - 2 * half) continue;
    for (let y = BAND; y < layout.lengthMm; y += BAND) assert.ok(p.yMm + p.heightMm <= y - half + 1e-6 || p.yMm >= y + half - 1e-6, `${label}: ${p.id}#${p.copy} (${p.yMm}–${p.yMm + p.heightMm}) em cima da linha ${y}`);
  }
  assert.equal(overlaps(layout.placements), false, label + ': nada se sobrepõe');
}
// Depois de subir as faixas: pedaços de até 38 cm, nenhuma linha em cima de arte, mesmas artes e medidas.
function assertCut(before, after, label) {
  assert.equal(after.ovenCrossed, 0, label + ': nenhuma arte em cima da linha');
  let start = 0; for (const y of [...after.ovenCutsMm, after.lengthMm]) { assert.ok(y - start <= BAND + 1e-6, `${label}: pedaço de ${y - start} mm`); start = y; }
  for (const y of after.ovenCutsMm) for (const p of after.placements) assert.ok(p.yMm + p.heightMm <= y - GAP / 2 + 1e-6 || p.yMm >= y + GAP / 2 - 1e-6, `${label}: folga da linha ${y}`);
  assert.equal(overlaps(after.placements), false, label + ': nada se sobrepõe depois de subir');
  assert.deepEqual(after.placements.map(p => [p.id, p.copy, p.xMm, p.widthMm, p.heightMm, p.rotation]), before.placements.map(p => [p.id, p.copy, p.xMm, p.widthMm, p.heightMm, p.rotation]), label + ': só sobe, medidas e lado iguais');
  assert.ok(after.placements.every((p, i) => p.yMm <= before.placements[i].yMm + 1e-6 && Math.abs(p.yMm / 2 - Math.round(p.yMm / 2)) < 1e-6), label + ': só sobe, na grade');
  assert.ok(after.lengthMm <= before.lengthMm + 1e-6);
}
const film = {filmWidthMm: 580, gapMm: GAP, cellMm: 2};
const mixed = [
  {id: 'costas', widthMm: 280, heightMm: 350, quantity: 5, rotationPolicy: 'none'},
  {id: 'frente', widthMm: 250, heightMm: 220, quantity: 4, rotationPolicy: 'none'},
  {id: 'peito', widthMm: 100, heightMm: 100, quantity: 18, rotationPolicy: '90'},
  {id: 'nome', widthMm: 300, heightMm: 60, quantity: 10, rotationPolicy: 'none'},
];
const {applyOvenCuts: oldShift} = await import(pathToFileURL(process.env.OLD_OVEN || '/dev/null').href).catch(() => ({}));
const report = [];
for (const mode of ['normal', 'maximum']) {
  const plain = nestItems(mixed, {...film, mode});
  const grid = nestItems(mixed, {...film, mode, ovenBandMm: BAND});
  assertBands(grid, mode);
  const oven = applyOvenCuts(grid, {bandMm: BAND, gapMm: GAP});
  assertCut(grid, oven, mode);
  assert.equal(oven.placements.length, mixed.reduce((n, i) => n + i.quantity, 0), mode + ': todas as cópias');
  // O validador do filme aceita o encaixe com a linha e recusa arte em cima da linha.
  validateFilmPlacements(mixed, oven.placements, {...film, mode, ovenBandMm: BAND});
  // Re-encaixe com o filme atual como base: continua valendo (linhas em qualquer altura).
  assert.ok(nestItems(mixed, {...film, mode, ovenBandMm: BAND, baselinePlacements: oven.placements}).lengthMm <= oven.lengthMm + 1e-6);
  const crossing = plain.placements.some(p => p.heightMm <= BAND - GAP && [BAND, 2 * BAND, 3 * BAND].some(y => crossesLine(p, y)));
  if (crossing) assert.throws(() => validateFilmPlacements(mixed, plain.placements, {...film, mode, ovenBandMm: BAND}), /linha do forno/);
  const old = oldShift ? oldShift(plain, {bandMm: BAND, gapMm: GAP}).lengthMm : null;
  report.push(`${mode}: sem linha ${(plain.lengthMm / 10).toFixed(1)} cm · linha nova ${(oven.lengthMm / 10).toFixed(1)} cm${old ? ` · linha antiga ${(old / 10).toFixed(1)} cm` : ''}`);
  // Só o necessário para não cortar arte: no máximo a altura que sobra no fim de cada faixa.
  assert.ok(oven.lengthMm <= plain.lengthMm * 1.06, `${mode}: a linha não pode desperdiçar filme (${oven.lengthMm} vs ${plain.lengthMm})`);
  if (old) assert.ok(oven.lengthMm <= old + 1e-6, `${mode}: linha nova gasta menos ou igual à antiga (${oven.lengthMm} vs ${old})`);
}
// Lote grande (100+ cópias) usa o encaixe retangular rápido.
const batch = [{id: 'peito', widthMm: 90, heightMm: 90, quantity: 80, rotationPolicy: '90'}, {id: 'costas', widthMm: 270, heightMm: 300, quantity: 30, rotationPolicy: 'none'}];
const quickGrid = nestBatchRectangles(batch, {...film, mode: 'normal', ovenBandMm: BAND});
assertBands(quickGrid, 'lote');
const quick = applyOvenCuts(quickGrid, {bandMm: BAND, gapMm: GAP});
assertCut(quickGrid, quick, 'lote');
assert.equal(quick.placements.length, 110);
const quickPlain = nestBatchRectangles(batch, {...film, mode: 'normal'});
report.push(`lote 110 cópias: sem linha ${(quickPlain.lengthMm / 10).toFixed(1)} cm · linha nova ${(quick.lengthMm / 10).toFixed(1)} cm${oldShift ? ` · linha antiga ${(oldShift(quickPlain, {bandMm: BAND, gapMm: GAP}).lengthMm / 10).toFixed(1)} cm` : ''}`);
assert.ok(quick.lengthMm <= quickPlain.lengthMm * 1.06, `lote: a linha não pode desperdiçar filme (${quick.lengthMm} vs ${quickPlain.lengthMm})`);
const viaCore = nestItems(batch, {...film, mode: 'maximum', ovenBandMm: BAND});
assertBands(viaCore, 'lote pelo nestItems');
// Arte maior que o forno (50 cm, sem girar): liberada, nada trava.
const tall = nestItems([{id: 'grande', widthMm: 200, heightMm: 500, quantity: 1}, {id: 'p', widthMm: 100, heightMm: 100, quantity: 6}], {...film, mode: 'maximum', ovenBandMm: BAND});
assertBands(tall, 'arte grande');
const marked = applyOvenCuts(tall, {bandMm: BAND, gapMm: GAP});
assert.deepEqual(marked.ovenTooTall, ['grande']); assert.equal(marked.ovenCrossed, 0);
assert.equal(marked.lengthMm, tall.lengthMm, 'com arte maior que o forno não sobe nada');
// Arte de 45 cm que pode girar: deita (25 cm) em vez de cruzar a linha.
const turns = nestItems([{id: 'gira', widthMm: 250, heightMm: 450, quantity: 2, rotationPolicy: '90'}], {...film, mode: 'normal', ovenBandMm: BAND});
assertBands(turns, 'arte que gira'); assert.ok(turns.placements.every(p => p.heightMm === 250), 'a arte deitou para caber na faixa');
// Arrastar uma arte para cima de uma linha da tela é recusado; o filme que não dá para cortar também.
const cut = applyOvenCuts(nestItems(mixed, {...film, mode: 'normal', ovenBandMm: BAND}), {bandMm: BAND, gapMm: GAP});
for (const y of cut.ovenCutsMm) assert.ok(lineIsFree(cut.placements, y));
const {snapFilmPlacement} = await import(pathToFileURL(process.argv[2] || path.join(root, 'nesting-core.js')).href);
const small = cut.placements.find(p => p.id === 'peito'), line = cut.ovenCutsMm[0];
const dragged = snapFilmPlacement(mixed, cut.placements.map(p => p === small ? {...p, yMm: Math.round((line - 50) / 2) * 2} : p), small, {...film, mode: 'normal', ovenBandMm: BAND, ovenCutsMm: cut.ovenCutsMm, lengthMm: cut.lengthMm});
const landed = dragged.placements.find(p => p.id === small.id && p.copy === small.copy);
assert.ok(landed.yMm + landed.heightMm <= line - GAP / 2 + 1e-6 || landed.yMm >= line + GAP / 2 - 1e-6, 'arrastada não para em cima da linha');
assert.deepEqual(applyOvenCuts({filmWidthMm: 580, lengthMm: 300, gapMm: 3, placements: [{id: 'a', xMm: 0, yMm: 0, widthMm: 100, heightMm: 290}]}, {bandMm: BAND}).ovenCutsMm, []);
const used = usedFilmWidth({filmWidthMm: 580, placements: [{xMm: 290, widthMm: 280}]}); assert.equal(used.cm, 57); assert.equal(used.px, 6732); assert.equal(used.filmPx, 6850);
console.log(report.join('\n'));
console.log('linha do forno: ok (encaixe por faixas de 38 cm, nenhuma arte em cima da linha, sem desperdício, lote grande, arte maior que o forno) · largura usada ok');
