import assert from 'node:assert/strict';
import { composeCmykSpot, createSpotTiffHeader, CURVE_INK_LUT } from '../film-tiff-core.js';

// Independently observed output for every 8-bit ink level in the Photoshop
// pre/post-curve reference pair. No private fixture or diagnostic folder needed.
const observedCurve = Uint8Array.from(Buffer.from(
  '00000101020202030304040505050606070707080809090a0a0a0b0b0c0c0d0d0e0e0e0f0f10101111121213131414151516161717181819191a1a1b1b1c1c1d' +
  '1d1e1f1f20202121222323242425262627272829292a2b2b2c2d2d2e2f30303132323334353536373839393a3b3c3d3d3e3f40414243434445464748494a4b4c' +
  '4d4e4f505152535455565758595a5b5c5e5f6061626364666768696a6c6d6e6f717273747677787a7b7c7e7f808283848687888a8b8d8e8f919294959698999b' +
  '9c9e9fa1a2a4a5a7a8aaabadaeb0b1b3b4b6b7b9babcbdbfc1c2c4c5c7c8cacccdcfd0d2d4d5d7d8dadbdddfe0e2e4e5e7e8eaecedeff0f2f4f5f7f9fafcfdff',
  'hex',
));
assert.equal(observedCurve.length, 256);
assert.deepEqual([...CURVE_INK_LUT], [...observedCurve]);
assert.ok(Object.isFrozen(CURVE_INK_LUT));
assert.equal(CURVE_INK_LUT[0], 0);
assert.equal(CURVE_INK_LUT[138], 87); // Photoshop ACV's 117 -> 168 inverse encoding
assert.equal(CURVE_INK_LUT[255], 255);

// Parser deliberately independent of the encoder: validate tag bounds, field
// lengths, inline-vs-offset payloads, next-IFD and Photoshop resource framing.
function readTiffHeader(header) {
  const data = new DataView(header.buffer, header.byteOffset, header.byteLength);
  assert.equal(data.getUint16(0, false), 0x4949);
  assert.equal(data.getUint16(2, true), 42);
  const ifdOffset = data.getUint32(4, true);
  assert.equal(ifdOffset, 8);
  const tagCount = data.getUint16(ifdOffset, true);
  const tags = new Map();
  const sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8 };
  let previousTag = 0;
  for (let index = 0; index < tagCount; index++) {
    const at = ifdOffset + 2 + index * 12;
    const id = data.getUint16(at, true);
    const type = data.getUint16(at + 2, true);
    const count = data.getUint32(at + 4, true);
    assert.ok(id > previousTag, 'TIFF tags are ordered and unique');
    previousTag = id;
    assert.ok(sizes[type]);
    const length = sizes[type] * count;
    const offset = length <= 4 ? at + 8 : data.getUint32(at + 8, true);
    assert.ok(offset + length <= header.length);
    if (length > 4) assert.equal(offset % 2, 0, 'TIFF values must be word-aligned');
    const bytes = header.slice(offset, offset + length);
    const field = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let values;
    if (type === 3 || type === 4) {
      values = Array.from({ length: count }, (_, i) => type === 3 ?
        field.getUint16(i * 2, true) : field.getUint32(i * 4, true));
    } else if (type === 5) {
      values = Array.from({ length: count }, (_, i) =>
        [field.getUint32(i * 8, true), field.getUint32(i * 8 + 4, true)]);
    } else if (type === 2) {
      assert.equal(bytes.at(-1), 0);
      values = Buffer.from(bytes.subarray(0, -1)).toString('ascii');
    }
    tags.set(id, { type, count, bytes, values });
  }
  assert.equal(data.getUint32(ifdOffset + 2 + tagCount * 12, true), 0);
  return tags;
}

function readResources(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const resources = new Map();
  let offset = 0;
  while (offset < bytes.length) {
    assert.equal(Buffer.from(bytes.subarray(offset, offset + 4)).toString('ascii'), '8BIM');
    const id = view.getUint16(offset + 4, false);
    assert.ok(!resources.has(id));
    offset += 6;
    const pascalBytes = 1 + bytes[offset];
    offset += pascalBytes + pascalBytes % 2;
    const length = view.getUint32(offset, false);
    offset += 4;
    assert.ok(offset + length <= bytes.length);
    resources.set(id, bytes.slice(offset, offset + length));
    offset += length;
    if (length % 2) assert.equal(bytes[offset++], 0);
  }
  assert.equal(offset, bytes.length);
  return resources;
}

const result = createSpotTiffHeader({ width: 3, height: 2 });
assert.deepEqual(Object.keys(result), ['header', 'pixelOffset', 'pixelBytes', 'totalBytes', 'width', 'height']);
assert.ok(result.header instanceof Uint8Array);
assert.equal(result.width, 3);
assert.equal(result.height, 2);
assert.equal(result.pixelOffset, result.header.length);
assert.equal(result.pixelBytes, 30);
assert.equal(result.totalBytes, result.header.length + 30);
assert.deepEqual(result.header, createSpotTiffHeader({ width: 3, height: 2 }).header);
const tags = readTiffHeader(result.header);
assert.equal(tags.size, 18);
assert.deepEqual(tags.get(254).values, [0]);
assert.deepEqual(tags.get(256).values, [3]);
assert.deepEqual(tags.get(257).values, [2]);
assert.deepEqual(tags.get(258).values, [8, 8, 8, 8, 8]);
for (const [tag, expected] of [[259, 1], [262, 5], [274, 1], [277, 5], [278, 2], [279, 30], [284, 1], [296, 2], [338, 0]]) {
  assert.deepEqual(tags.get(tag).values, [expected], `TIFF tag ${tag}`);
}
assert.equal(tags.get(273).count, 1, 'single logical strip, regardless of streamed chunk count');
assert.deepEqual(tags.get(273).values, [result.pixelOffset]);
assert.deepEqual(tags.get(282).values, [[3000000, 10000]]);
assert.deepEqual(tags.get(283).values, [[3000000, 10000]]);
assert.equal(tags.get(305).values, '019 Personalizacoes 2.17.9');
for (const excluded of [306, 315, 700, 33723, 34675, 37724]) {
  assert.ok(!tags.has(excluded), `no copied date, artist, history, ICC or layers: ${excluded}`);
}
const resources = readResources(tags.get(34377).bytes);
assert.deepEqual([...resources.keys()], [1006, 1041, 1045, 1053, 1067, 1077]);
assert.equal(Buffer.from(resources.get(1006)).toString('hex'), '0a436f722053706f742031');
assert.equal(Buffer.from(resources.get(1045)).toString('hex'), '0000000b0043006f0072002000530070006f0074002000310000');
assert.deepEqual([...resources.get(1041)], [1]);
assert.equal(Buffer.from(resources.get(1053)).toString('hex'), '00000003');
assert.equal(Buffer.from(resources.get(1067)).toString('hex'), '000100010000000300072710000000000000');
assert.equal(Buffer.from(resources.get(1077)).toString('hex'), '00000001000100000000ffff0000006402');
assert.ok(!resources.has(1039), 'no embedded ICC resource');

// Synthetic pixel identities: channel order, CMYK curve-before-alpha and no
// curve on Spot. Transparent colorful pixels cannot lay down any CMYK/white ink.
const edgeAlpha = [0, 1, 127, 128, 254, 255];
const rgba = Uint8ClampedArray.from(edgeAlpha.flatMap(a => [91, 73, 255, a]));
const cmyk = Uint8Array.from(edgeAlpha.flatMap(() => [0, 138, 200, 255]));
const rgbaCopy = rgba.slice(), cmykCopy = cmyk.slice();
const composed = composeCmykSpot(rgba, cmyk);
assert.ok(composed instanceof Uint8Array);
assert.deepEqual(rgba, rgbaCopy);
assert.deepEqual(cmyk, cmykCopy);
assert.equal(composed.length, edgeAlpha.length * 5);
for (const [index, alpha] of edgeAlpha.entries()) {
  assert.deepEqual([...composed.subarray(index * 5, index * 5 + 5)],
    [0, 87, 168, 255].map(ink => Math.floor((ink * alpha + 127) / 255)).concat(255 - alpha));
}
assert.deepEqual([...composed.subarray(0, 5)], [0, 0, 0, 0, 255]);
assert.deepEqual([...composed.subarray(25, 30)], [0, 87, 168, 255, 0]);
assert.deepEqual(composeCmykSpot(new Uint8Array(), new Uint8Array()), new Uint8Array());

// Exhaustive 256 ink inputs x 256 alpha inputs, four shifted channel patterns.
const allRgba = new Uint8Array(256 * 256 * 4);
const allCmyk = new Uint8Array(allRgba.length);
for (let alpha = 0; alpha < 256; alpha++) {
  for (let ink = 0; ink < 256; ink++) {
    const offset = (alpha * 256 + ink) * 4;
    allRgba.set([ink, 255 - ink, alpha ^ ink, alpha], offset);
    allCmyk.set([ink, (ink + 31) % 256, (ink + 127) % 256, 255 - ink], offset);
  }
}
const full = composeCmykSpot(allRgba, allCmyk);
for (let pixel = 0; pixel < 256 * 256; pixel++) {
  const alpha = allRgba[pixel * 4 + 3];
  for (let channel = 0; channel < 4; channel++) {
    const expectedInk = observedCurve[allCmyk[pixel * 4 + channel]];
    assert.equal(full[pixel * 5 + channel], Math.floor((expectedInk * alpha + 127) / 255));
  }
  assert.equal(full[pixel * 5 + 4], 255 - alpha);
}
// The same image split at arbitrary pixel boundaries has exactly equal output.
let writtenBytes = 0;
for (let start = 0; start < allRgba.length; start += 127 * 4) {
  const end = Math.min(start + 127 * 4, allRgba.length);
  const chunk = composeCmykSpot(allRgba.subarray(start, end), allCmyk.subarray(start, end));
  assert.ok(chunk.length <= 127 * 5);
  assert.deepEqual(chunk, full.subarray(writtenBytes, writtenBytes + chunk.length));
  writtenBytes += chunk.length;
}
assert.equal(writtenBytes, full.length);

// A 58 cm x 150 cm film has a tiny constant-size header, not a 607 MB buffer.
const longFilm = createSpotTiffHeader({ width: 6850, height: 17717 });
assert.equal(longFilm.pixelBytes, 606807250);
assert.equal(longFilm.header.length, result.header.length);
assert.ok(longFilm.header.length < 1024);
assert.deepEqual(readTiffHeader(longFilm.header).get(278).values, [17717]);
// Unsigned values above 2 GiB must never wrap into negative signed integers.
const twoGiB = createSpotTiffHeader({ width: 50000, height: 10000 });
assert.equal(twoGiB.pixelBytes, 2500000000);
assert.deepEqual(readTiffHeader(twoGiB.header).get(279).values, [2500000000]);
// Boundary includes metadata overhead, not just pixel byte count.
const maxPixels = Math.floor((0xffffffff - result.header.length) / 5);
const boundary = createSpotTiffHeader({ width: maxPixels, height: 1 });
assert.ok(boundary.totalBytes <= 0xffffffff);
assert.throws(() => createSpotTiffHeader({ width: maxPixels + 1, height: 1 }), /4 GiB/);
for (const invalid of [0, -1, 1.1, NaN, Infinity, '3', null, undefined, 0x100000000, Number.MAX_SAFE_INTEGER]) {
  assert.throws(() => createSpotTiffHeader({ width: invalid, height: 1 }));
  assert.throws(() => createSpotTiffHeader({ width: 1, height: invalid }));
}
assert.throws(() => createSpotTiffHeader());
assert.throws(() => createSpotTiffHeader({ width: 0xffffffff, height: 0xffffffff }), /4 GiB/);
for (const dpi of [0, -1, NaN, Infinity, '300', 0.00001, 429496.7296]) {
  assert.throws(() => createSpotTiffHeader({ width: 1, height: 1, dpi }));
}
assert.deepEqual(readTiffHeader(createSpotTiffHeader({ width: 1, height: 1, dpi: 299.9994 }).header).get(282).values, [[2999994, 10000]]);
for (const [badRgba, badCmyk] of [
  [[], []], [new Uint16Array(4), new Uint8Array(4)],
  [new Uint8Array(4), new Float32Array(4)],
  [new Uint8Array(3), new Uint8Array(3)],
  [new Uint8Array(4), new Uint8Array(8)],
  [null, null],
]) assert.throws(() => composeCmykSpot(badRgba, badCmyk));

console.log('TIFF core OK: independent IFD/IRB parsing, 256-level curve, 65,536 alpha/ink cases, chunk equivalence and classic-TIFF limits.');
