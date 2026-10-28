import assert from 'node:assert/strict';
import {applyOvenCuts, lineIsFree, usedFilmWidth} from '../film-oven-cuts.js';
const p = (id, x, y, w, h) => ({id, copy: 0, xMm: x, yMm: y, widthMm: w, heightMm: h, rotation: 0});
const overlaps = list => list.some((a, i) => list.some((b, j) => j > i && a.xMm < b.xMm + b.widthMm && b.xMm < a.xMm + a.widthMm && a.yMm < b.yMm + b.heightMm && b.yMm < a.yMm + a.heightMm));
// 3 linhas de artes de 150 mm com 3 mm de espaço: 0–150, 153–303, 306–456 (cruza 380), 459–609
const layout = {filmWidthMm: 580, lengthMm: 612, gapMm: 3, placements: [p('a', 0, 0, 280, 150), p('b', 290, 0, 280, 150), p('c', 0, 153, 280, 150), p('d', 0, 306, 280, 150), p('e', 290, 306, 280, 150), p('f', 0, 459, 280, 150)]};
const out = applyOvenCuts(layout, {bandMm: 380});
assert.ok(out.ovenCutsMm.length >= 1);
for (const cut of out.ovenCutsMm) assert.ok(lineIsFree(out.placements, cut), 'nenhuma arte cruza a linha ' + cut);
let previous = 0; for (const cut of out.ovenCutsMm) { assert.ok(cut - previous <= 380 + .01, 'faixa até 38 cm'); previous = cut; }
assert.ok(Math.max(...out.placements.map(q => q.yMm + q.heightMm)) - previous <= 380 + .01, 'última faixa até 38 cm');
assert.equal(overlaps(out.placements), false, 'nada se sobrepõe');
assert.deepEqual(out.placements.map(q => [q.widthMm, q.heightMm, q.xMm]), layout.placements.map(q => [q.widthMm, q.heightMm, q.xMm]), 'medidas e posição lateral iguais');
assert.ok(out.lengthMm >= Math.max(...out.placements.map(q => q.yMm + q.heightMm)));
// linha livre já existente perto do limite: usa ela, não empurra nada
const easy = applyOvenCuts({filmWidthMm: 580, lengthMm: 700, gapMm: 3, placements: [p('a', 0, 0, 100, 370), p('b', 0, 376, 100, 300)]}, {bandMm: 380});
assert.equal(easy.placements[1].yMm, 376, 'não move quando a linha cabe no espaço entre artes'); assert.ok(lineIsFree(easy.placements, easy.ovenCutsMm[0]));
// arte maior que o forno: avisa e não trava
const tall = applyOvenCuts({filmWidthMm: 580, lengthMm: 900, gapMm: 3, placements: [p('big', 0, 0, 200, 500), p('x', 0, 503, 200, 300)]}, {bandMm: 380});
assert.deepEqual(tall.ovenTooTall, ['big']);
// filme curto: nenhuma linha
assert.deepEqual(applyOvenCuts({filmWidthMm: 580, lengthMm: 300, gapMm: 3, placements: [p('a', 0, 0, 100, 290)]}, {bandMm: 380}).ovenCutsMm, []);
const used = usedFilmWidth(layout); assert.equal(used.cm, 57); assert.equal(used.px, 6732); assert.equal(used.filmPx, 6850);
console.log('linha do forno: ok (faixas até 38 cm, sem arte cruzando, sem sobreposição) · largura usada ok');
