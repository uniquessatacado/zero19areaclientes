// Teste do DTF por metro (13/11): preço igual ao do banco (public.z19p_dtf_price), encaixe pelo motor do Montar filme,
// DPI gravado no PNG, qualidade e itens que entram no filme da equipe. Os casos de preço são os mesmos conferidos no banco
// real em transação desfeita (pedido de teste: auto, 70,3 cm → metro R$ 80; 28 cm 1,55 m → 2 × R$ 45).
import assert from 'node:assert/strict';
import { filmPrice, artTablePrice, meterPrice, normalizeArtTable } from '../dtf-pricing.js';
import { nestFilm, GAP_MM } from '../dtf-nest.js';
import { setPngDpi, quality, dpiOf, cmOf } from '../dtf-upload.js';
import { dtfFilmItems } from '../dtf-staff.js';
import { readPngInfo, createPngWriter } from '../png-split.js';

const table = [{ maxWidthCm: 30, maxHeightCm: 30, price: 12 }, { maxWidthCm: 10, maxHeightCm: 10, price: 5 }];
const p = { price58: 80, price28: 45, mode: 'auto', artTable: table };
// Tabela: menor faixa em que a arte cabe, podendo girar.
assert.deepEqual(normalizeArtTable(table).map(r => r.price), [5, 12]);
assert.equal(artTablePrice(table, 9, 9), 5);
assert.equal(artTablePrice(table, 25, 8), 12);
assert.equal(artTablePrice(table, 8, 25), 12);
assert.equal(artTablePrice(table, 31, 5), null);
// Metro: sempre para cima, mínimo 1 m.
assert.deepEqual(meterPrice(p, 58, 30), { meters: 1, perMeter: 80, total: 80 });
assert.deepEqual(meterPrice(p, 58, 100), { meters: 1, perMeter: 80, total: 80 });
assert.deepEqual(meterPrice(p, 58, 100.1), { meters: 2, perMeter: 80, total: 160 });
assert.deepEqual(meterPrice(p, 28, 155), { meters: 2, perMeter: 45, total: 90 });
assert.equal(meterPrice({ ...p, price28: 0 }, 28, 50), null);
// Os mesmos casos do banco.
let r = filmPrice(p, { filmWidthCm: 58, lengthCm: 70.3, items: [{ widthCm: 25, heightCm: 30, quantity: 4 }, { widthCm: 9, heightCm: 9, quantity: 10 }] });
assert.equal(r.charged, 'meter'); assert.equal(r.total, 80); assert.equal(r.art.total, 98);
r = filmPrice(p, { filmWidthCm: 28, lengthCm: 155, items: [{ widthCm: 25, heightCm: 30, quantity: 5 }] });
assert.equal(r.charged, 'meter'); assert.equal(r.total, 90); assert.equal(r.art, null);
r = filmPrice({ ...p, artTable: [{ maxWidthCm: 10, maxHeightCm: 10, price: 5 }] }, { filmWidthCm: 58, lengthCm: 60, items: [{ widthCm: 9, heightCm: 9, quantity: 3 }, { widthCm: 20, heightCm: 20, quantity: 1 }] });
assert.equal(r.charged, 'meter'); assert.equal(r.total, 80, 'faixa faltando = metro');
r = filmPrice(p, { filmWidthCm: 58, lengthCm: 30, items: [{ widthCm: 9, heightCm: 9, quantity: 3 }] });
assert.equal(r.charged, 'art'); assert.equal(r.total, 15, 'menos de 1 m e mais barato por arte');
r = filmPrice({ ...p, mode: 'art' }, { filmWidthCm: 58, lengthCm: 130, items: [{ widthCm: 25, heightCm: 30, quantity: 20 }] });
assert.equal(r.charged, 'art'); assert.equal(r.total, 240, 'por arte mesmo passando de 1 m');
r = filmPrice({ ...p, mode: 'meter' }, { filmWidthCm: 58, lengthCm: 30, items: [{ widthCm: 9, heightCm: 9, quantity: 3 }] });
assert.equal(r.charged, 'meter'); assert.equal(r.total, 80);
r = filmPrice({ ...p, mode: 'auto' }, { filmWidthCm: 58, lengthCm: 120, items: [{ widthCm: 9, heightCm: 9, quantity: 3 }] });
assert.equal(r.charged, 'meter'); assert.equal(r.total, 160, '1 m ou mais = metro');

// Encaixe: 4 artes 25 × 30 no filme de 58 cm = 2 por fileira, 2 fileiras (30 + 3 mm + 30).
let layout = await nestFilm([{ key: 0, widthCm: 25, heightCm: 30, quantity: 4 }], { filmWidthCm: 58, allowRotate: false });
assert.equal(layout.placements.length, 4);
assert.ok(Math.abs(layout.lengthMm - (600 + GAP_MM)) < 3, 'comprimento ' + layout.lengthMm);
for (const a of layout.placements) { assert.ok(a.xMm >= 0 && a.xMm + a.widthMm <= 580 + 1e-6, 'dentro da largura'); }
for (let i = 0; i < layout.placements.length; i++) for (let j = i + 1; j < layout.placements.length; j++) {
  const a = layout.placements[i], b = layout.placements[j];
  assert.ok(a.xMm + a.widthMm + GAP_MM - 1e-6 <= b.xMm || b.xMm + b.widthMm + GAP_MM - 1e-6 <= a.xMm || a.yMm + a.heightMm + GAP_MM - 1e-6 <= b.yMm || b.yMm + b.heightMm + GAP_MM - 1e-6 <= a.yMm, 'sem encostar');
}
// Arte de 40 × 20 no filme de 28: só cabe deitada.
layout = await nestFilm([{ key: 0, widthCm: 40, heightCm: 20, quantity: 2 }], { filmWidthCm: 28, allowRotate: true });
assert.ok(layout.placements.every(pl => pl.rotation === 90 && pl.widthMm <= 280), 'deitou para caber');
await assert.rejects(nestFilm([{ key: 0, widthCm: 40, heightCm: 20, quantity: 1 }], { filmWidthCm: 28, allowRotate: false }));
// Comprimento do encaixe nunca é menor que o limite que o servidor confere (área / largura e maior lado mínimo).
layout = await nestFilm([{ key: 0, widthCm: 9, heightCm: 9, quantity: 37 }, { key: 1, widthCm: 25, heightCm: 30, quantity: 3 }], { filmWidthCm: 58, allowRotate: true });
const area = 9 * 9 * 37 + 25 * 30 * 3;
assert.ok(layout.lengthMm / 10 >= area / 58 - 0.5, 'comprimento coerente com a área');

// Qualidade e medidas.
assert.equal(quality(300).level, 'great'); assert.equal(quality(250).level, 'good'); assert.equal(quality(160).level, 'fair'); assert.equal(quality(100).level, 'low');
assert.ok(Math.abs(dpiOf(2953, 25) - 300) < 0.1); assert.ok(Math.abs(cmOf(3543, 300) - 30) < 0.01);

// DPI gravado: PNG feito pelo gravador do 019, depois setPngDpi(300) → pHYs 11811 px/m (300 DPI).
const w = createPngWriter({ width: 3, height: 2 });
for (let y = 0; y < 2; y++) w.addRow(new Uint8Array(3 * 4).fill(200));
const png = await w.finish();
const withDpi = await setPngDpi(png, 300), info = await readPngInfo(withDpi);
assert.equal(info.width, 3); assert.equal(info.height, 2); assert.equal(info.ppm.x, 11811); assert.equal(info.dpi, 300);
const again = await readPngInfo(await setPngDpi(withDpi, 150));
assert.equal(again.ppm.x, 5906, 'troca o pHYs sem duplicar');
const bytes = new Uint8Array(await (await setPngDpi(withDpi, 150)).arrayBuffer()), text = String.fromCharCode(...bytes);
assert.equal(text.split('pHYs').length - 1, 1, 'um pHYs só');

// Itens que entram no filme da equipe: um por arte, medida e quantidade do cliente, arquivo privado.
const items = dtfFilmItems({ id: 'f1', orderNumber: 51000, clientName: 'Ana DTF', items: [{ assetId: 'a1', name: 'Logo', path: 'u/dtf/a1/print.png', widthCm: 25, heightCm: 30, quantity: 4 }, { assetId: 'a2', name: 'Peito', path: 'u/dtf/a2/print.png', widthCm: 9, heightCm: 9, quantity: 10 }] });
assert.equal(items.length, 2);
assert.deepEqual(items.map(i => [i.type, i.sourceId, i.widthCm, i.heightCm, i.quantity, i.storageBucket, i.path]), [['asset', 'dtf:a1', 25, 30, 4, 'z19p-private', 'u/dtf/a1/print.png'], ['asset', 'dtf:a2', 9, 9, 10, 'z19p-private', 'u/dtf/a2/print.png']]);
assert.ok(items.every(i => i.localId && i.label.startsWith('Ana DTF • ') && i.dtfFilmId === 'f1'));
assert.notEqual(items[0].localId, items[1].localId);

console.log('PASS DTF por metro: preço igual ao do banco (metro, por arte, automático), encaixe pelo motor do filme, DPI no PNG, itens do filme da equipe');
