// 019 Personalizacoes v2.17.9 — deterministic, streamable CMYK + white Spot TIFF.
// Color conversion happens upstream with the approved ICCs. This module never
// converts RGB, guesses an ICC, mirrors/resizes pixels, or applies the curve to Spot.

// Fixed 8-bit ink-domain LUT for the user's ACV: internal points (0,0),
// (117,168), (255,255), displayed as 54 -> 34% ink. Every input level was
// independently observed in the Photoshop before/after TIFF reference pair.
// This is not a claim about arbitrary Photoshop curves or 16-bit interpolation.
export const CURVE_INK_LUT = Object.freeze([
  0,0,1,1,2,2,2,3,3,4,4,5,5,5,6,6,
  7,7,7,8,8,9,9,10,10,10,11,11,12,12,13,13,
  14,14,14,15,15,16,16,17,17,18,18,19,19,20,20,21,
  21,22,22,23,23,24,24,25,25,26,26,27,27,28,28,29,
  29,30,31,31,32,32,33,33,34,35,35,36,36,37,38,38,
  39,39,40,41,41,42,43,43,44,45,45,46,47,48,48,49,
  50,50,51,52,53,53,54,55,56,57,57,58,59,60,61,61,
  62,63,64,65,66,67,67,68,69,70,71,72,73,74,75,76,
  77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,
  94,95,96,97,98,99,100,102,103,104,105,106,108,109,110,111,
  113,114,115,116,118,119,120,122,123,124,126,127,128,130,131,132,
  134,135,136,138,139,141,142,143,145,146,148,149,150,152,153,155,
  156,158,159,161,162,164,165,167,168,170,171,173,174,176,177,179,
  180,182,183,185,186,188,189,191,193,194,196,197,199,200,202,204,
  205,207,208,210,212,213,215,216,218,219,221,223,224,226,228,229,
  231,232,234,236,237,239,240,242,244,245,247,249,250,252,253,255,
]);

const UINT32_MAX = 0xffffffff;
const SPOT_NAME = 'Cor Spot 1';

function byteArray(value) {
  return value instanceof Uint8Array || value instanceof Uint8ClampedArray;
}

/**
 * Compose one independently sized pixel chunk; input CMYK is uncurved ink
 * coverage (0=no ink, 255=full ink), not Photoshop's inverse layer encoding.
 * RGB values are deliberately ignored here; only original RGBA alpha is used.
 * Inputs are not mutated. The caller can transfer/reuse their buffers afterwards.
 */
export function composeCmykSpot(rgba, cmyk) {
  if (!byteArray(rgba) || !byteArray(cmyk)) {
    throw new TypeError('Os pixels RGBA e CMYK devem ser vetores de bytes de 8 bits.');
  }
  if (rgba.length !== cmyk.length || rgba.length % 4 !== 0) {
    throw new RangeError('Os blocos RGBA e CMYK devem ter o mesmo numero de pixels completos.');
  }
  const outputBytes = (rgba.length / 4) * 5;
  if (!Number.isSafeInteger(outputBytes) || outputBytes > UINT32_MAX) {
    throw new RangeError('Bloco TIFF muito grande. Processe os pixels em faixas menores.');
  }
  const output = new Uint8Array(outputBytes);
  for (let input = 0, target = 0; input < rgba.length; input += 4, target += 5) {
    const alpha = rgba[input + 3];
    output[target] = Math.round(CURVE_INK_LUT[cmyk[input]] * alpha / 255);
    output[target + 1] = Math.round(CURVE_INK_LUT[cmyk[input + 1]] * alpha / 255);
    output[target + 2] = Math.round(CURVE_INK_LUT[cmyk[input + 2]] * alpha / 255);
    output[target + 3] = Math.round(CURVE_INK_LUT[cmyk[input + 3]] * alpha / 255);
    output[target + 4] = 255 - alpha;
  }
  return output;
}

function fromHex(hex) {
  return Uint8Array.from(hex.match(/../g), value => Number.parseInt(value, 16));
}

function ascii(value) {
  return Uint8Array.from(value, character => character.charCodeAt(0));
}

function uint16s(values) {
  const result = new Uint8Array(values.length * 2);
  const view = new DataView(result.buffer);
  values.forEach((value, index) => view.setUint16(index * 2, value, true));
  return result;
}

function uint32s(values) {
  const result = new Uint8Array(values.length * 4);
  const view = new DataView(result.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value, true));
  return result;
}

function photoshopResource(id, payload) {
  // TIFF fields are little endian; Photoshop image-resource fields stay big endian.
  // Empty resource Pascal name occupies two bytes, payload is even-byte padded.
  const resource = new Uint8Array(12 + payload.length + payload.length % 2);
  const view = new DataView(resource.buffer);
  resource.set(ascii('8BIM'));
  view.setUint16(4, id, false);
  view.setUint32(8, payload.length, false);
  resource.set(payload, 12);
  return resource;
}

function photoshopResources() {
  const unicodeName = new Uint8Array(4 + (SPOT_NAME.length + 1) * 2);
  const unicodeView = new DataView(unicodeName.buffer);
  unicodeView.setUint32(0, SPOT_NAME.length + 1, false);
  for (let index = 0; index < SPOT_NAME.length; index++) {
    unicodeView.setUint16(4 + index * 2, SPOT_NAME.charCodeAt(index), false);
  }
  const pascalName = new Uint8Array(1 + SPOT_NAME.length);
  pascalName[0] = SPOT_NAME.length;
  pascalName.set(ascii(SPOT_NAME), 1);
  const resources = [
    photoshopResource(1006, pascalName),
    photoshopResource(1041, Uint8Array.of(1)), // intentionally untagged ICC, like reference
    photoshopResource(1045, unicodeName),
    photoshopResource(1053, fromHex('00000003')), // stable Spot identifier
    photoshopResource(1067, fromHex('000100010000000300072710000000000000')),
    // v1 display info: HSB white, solidity 100, kind 2 (Spot, not alpha).
    photoshopResource(1077, fromHex('00000001000100000000ffff0000006402')),
  ];
  const result = new Uint8Array(resources.reduce((total, item) => total + item.length, 0));
  let offset = 0;
  for (const resource of resources) {
    result.set(resource, offset);
    offset += resource.length;
  }
  return result;
}

function validDimension(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= UINT32_MAX;
}

/**
 * Return only the header, never a full-image buffer. Append width*height*5 bytes
 * in row-major CMYK+Spot order. Many writes still constitute one logical TIFF
 * strip and one continuous image/file. Classic TIFF cannot exceed 32-bit offsets.
 * No Photoshop artist/history/layers or ICC from the private references is copied.
 */
export function createSpotTiffHeader({ width, height, dpi = 300 } = {}) {
  if (!validDimension(width) || !validDimension(height)) {
    throw new RangeError('Largura e altura TIFF devem ser inteiros positivos validos.');
  }
  const pixelBytes = width * height * 5;
  if (!Number.isSafeInteger(pixelBytes) || pixelBytes > UINT32_MAX) {
    throw new RangeError('O filme excede o limite de 4 GiB do TIFF classico; nao sera dividido nem reduzido.');
  }
  const resolutionNumerator = Math.round(dpi * 10000);
  if (typeof dpi !== 'number' || !Number.isFinite(dpi) || dpi <= 0 ||
      !Number.isSafeInteger(resolutionNumerator) || resolutionNumerator < 1 ||
      resolutionNumerator > UINT32_MAX) {
    throw new RangeError('A resolucao DPI nao pode ser representada neste TIFF.');
  }
  const resources = photoshopResources();
  const software = ascii('019 Personalizacoes 2.17.9\0');
  // [tag, TIFF type, element count, little-endian payload]
  const entries = [
    [254, 4, 1, uint32s([0])],
    [256, 4, 1, uint32s([width])],
    [257, 4, 1, uint32s([height])],
    [258, 3, 5, uint16s([8, 8, 8, 8, 8])],
    [259, 3, 1, uint16s([1])],
    [262, 3, 1, uint16s([5])],
    [273, 4, 1, uint32s([0])], // strip offset is filled after the small header is laid out
    [274, 3, 1, uint16s([1])],
    [277, 3, 1, uint16s([5])],
    [278, 4, 1, uint32s([height])],
    [279, 4, 1, uint32s([pixelBytes])],
    [282, 5, 1, uint32s([resolutionNumerator, 10000])],
    [283, 5, 1, uint32s([resolutionNumerator, 10000])],
    [284, 3, 1, uint16s([1])],
    [296, 3, 1, uint16s([2])],
    [305, 2, software.length, software],
    [338, 3, 1, uint16s([0])], // unspecified extra sample; IRBs identify it as Spot
    [34377, 1, resources.length, resources],
  ];
  let pixelOffset = 8 + 2 + entries.length * 12 + 4;
  for (const entry of entries) {
    if (entry[3].length > 4) pixelOffset += entry[3].length + entry[3].length % 2;
  }
  const totalBytes = pixelOffset + pixelBytes;
  if (totalBytes > UINT32_MAX) {
    throw new RangeError('Os metadados e pixels excedem o limite de 4 GiB do TIFF classico.');
  }
  const header = new Uint8Array(pixelOffset);
  const view = new DataView(header.buffer);
  header.set([0x49, 0x49, 42, 0]);
  view.setUint32(4, 8, true);
  view.setUint16(8, entries.length, true);
  let dataOffset = 8 + 2 + entries.length * 12 + 4;
  entries.forEach(([tag, type, count, payload], index) => {
    const entryOffset = 10 + index * 12;
    view.setUint16(entryOffset, tag, true);
    view.setUint16(entryOffset + 2, type, true);
    view.setUint32(entryOffset + 4, count, true);
    if (tag === 273) {
      view.setUint32(entryOffset + 8, pixelOffset, true);
    } else if (payload.length <= 4) {
      header.set(payload, entryOffset + 8);
    } else {
      view.setUint32(entryOffset + 8, dataOffset, true);
      header.set(payload, dataOffset);
      dataOffset += payload.length + payload.length % 2;
    }
  });
  // The next-IFD pointer and all unused padding are zero by construction.
  return { header, pixelOffset, pixelBytes, totalBytes, width, height };
}
