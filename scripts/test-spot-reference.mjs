/**
 * Private reference regression for the production CMYK/Spot encoder.
 *
 * node scripts/test-spot-reference.mjs [--fixtures DIR] [--output DIR]
 *   [--references MANIFEST.json] [--require-fixtures] [--skip-long]
 *
 * Fixtures and generated art belong in ignored tmp/, never in the public build.
 * metadata.json describes samples {name,width,height,referenceChannels}; each
 * sample has .rgb, .alpha, .reference and (optional) .native.cmyk raw planes.
 * The optional manifest is {samples:[{name,png,tiff}]} with private local paths.
 * TIFF and PNG are reopened by the independent readers below, not the encoder.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, open, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = { fixtures: path.join(root, 'tmp/spot-diagnostic/wasm-fixtures'), output: path.join(root, 'tmp/spot-diagnostic/generated') };
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--require-fixtures') options.required = true;
  else if (arg === '--skip-long') options.skipLong = true;
  else if (['--fixtures', '--output', '--references'].includes(arg)) {
    assert.ok(process.argv[i + 1], `Missing value for ${arg}`);
    options[arg.slice(2)] = path.resolve(process.argv[++i]);
  } else throw new Error(`Unknown option: ${arg}`);
}
const exists = async file => { try { await access(file); return true; } catch { return false; } };
if (!await exists(path.join(options.fixtures, 'metadata.json'))) {
  if (options.required) throw new Error(`Private reference fixtures missing: ${options.fixtures}`);
  console.log('SKIP private Spot references: supply --fixtures DIR and --require-fixtures to require them.');
  process.exit(0);
}

const { createSpotTiffHeader, composeCmykSpot } = await import('../film-tiff-core.js');
const { createCmykConverter } = await import('../film-cmyk-converter.js');
const { writeSpotCanvas } = await import('../film-spot-export.js');
const metadata = JSON.parse(await readFile(path.join(options.fixtures, 'metadata.json'), 'utf8'));
const manifest = options.references ? JSON.parse(await readFile(options.references, 'utf8')) : { samples: [] };
const readFixture = file => readFile(path.join(options.fixtures, file));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const rowsPerChunk = 64;
await mkdir(options.output, { recursive: true });

async function readExactly(file, length, position) {
  const bytes = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const next = await file.read(bytes, done, length - done, position + done);
    assert.ok(next.bytesRead, `Unexpected EOF at ${position + done}`);
    done += next.bytesRead;
  }
  return bytes;
}

async function writeExactly(file, bytes) {
  let done = 0;
  while (done < bytes.length) {
    const next = await file.write(bytes, done, bytes.length - done);
    assert.ok(next.bytesWritten, 'Output writer made no progress');
    done += next.bytesWritten;
  }
}

// Independent, deliberately strict Classic TIFF reader: no application helpers.
async function inspectTiff(filename) {
  const file = await open(filename, 'r');
  try {
    const start = await readExactly(file, 8, 0);
    assert.equal(start.toString('ascii', 0, 2), 'II');
    assert.equal(start.readUInt16LE(2), 42);
    const firstIfd = start.readUInt32LE(4);
    const countBytes = await readExactly(file, 2, firstIfd);
    const entries = countBytes.readUInt16LE(0);
    const directory = await readExactly(file, entries * 12 + 4, firstIfd + 2);
    assert.equal(directory.readUInt32LE(entries * 12), 0, 'TIFF must have a single main IFD');
    const tags = new Map();
    const typeSize = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1 };
    for (let i = 0; i < entries; i++) {
      const entry = directory.subarray(i * 12, (i + 1) * 12);
      const id = entry.readUInt16LE(0), type = entry.readUInt16LE(2), count = entry.readUInt32LE(4);
      assert.ok(typeSize[type], `Unsupported TIFF field type ${type} for ${id}`);
      const length = count * typeSize[type];
      const raw = length <= 4 ? Buffer.from(entry.subarray(8, 8 + length)) : await readExactly(file, length, entry.readUInt32LE(8));
      let value;
      if ([1, 2, 7].includes(type)) value = raw;
      else value = Array.from({ length: count }, (_, n) => type === 3 ? raw.readUInt16LE(n * 2) : type === 4 ? raw.readUInt32LE(n * 4) : raw.readUInt32LE(n * 8) / raw.readUInt32LE(n * 8 + 4));
      tags.set(id, { id, type, count, raw, value });
    }
    const number = id => tags.get(id)?.value[0];
    return { filename, tags, number, width: number(256), height: number(257), channels: number(277), size: (await file.stat()).size };
  } finally { await file.close(); }
}

function photoshopResources(bytes) {
  const result = new Map();
  let position = 0;
  while (position < bytes.length) {
    assert.equal(bytes.toString('ascii', position, position + 4), '8BIM');
    const id = bytes.readUInt16BE(position + 4);
    position += 6;
    const nameLength = bytes[position];
    position += (nameLength + 2) & ~1;
    const length = bytes.readUInt32BE(position);
    position += 4;
    assert.ok(position + length <= bytes.length, `Truncated Photoshop resource ${id}`);
    result.set(id, bytes.subarray(position, position + length));
    position += length + (length & 1);
  }
  assert.equal(position, bytes.length);
  return result;
}

function verifySpotStructure(tiff, sample) {
  assert.equal(tiff.width, sample.width); assert.equal(tiff.height, sample.height);
  assert.equal(tiff.channels, 5); assert.equal(tiff.number(259), 1); // no compression
  assert.equal(tiff.number(262), 5); assert.equal(tiff.number(284), 1); // separated, chunky
  assert.deepEqual(tiff.tags.get(258).value, [8, 8, 8, 8, 8]);
  assert.deepEqual(tiff.tags.get(338)?.value, [0], 'ExtraSamples is unspecified, not alpha');
  assert.equal(tiff.number(282), 300); assert.equal(tiff.number(283), 300); assert.equal(tiff.number(296), 2);
  assert.equal(tiff.tags.get(273).count, 1); assert.equal(tiff.tags.get(279).count, 1);
  assert.equal(tiff.number(278), sample.height);
  assert.equal(tiff.number(279), sample.width * sample.height * 5);
  assert.equal(tiff.size, tiff.number(273) + tiff.number(279));
  assert.ok(!tiff.tags.has(34675), 'Final TIFF intentionally matches untagged Photoshop reference');
  const resources = photoshopResources(tiff.tags.get(34377).raw);
  assert.equal(resources.get(1041)?.toString('hex'), '01', 'ICC untagged marker');
  const names = resources.get(1006), nameCount = names?.[0];
  assert.equal(names?.toString('ascii', 1, nameCount + 1), 'Cor Spot 1');
  const unicode = resources.get(1045), characters = unicode?.readUInt32BE(0);
  const spotName = Array.from({ length: characters }, (_, n) => String.fromCharCode(unicode.readUInt16BE(4 + n * 2))).join('').replace(/\0+$/, '');
  assert.equal(spotName, 'Cor Spot 1');
  assert.equal(resources.get(1053)?.readUInt32BE(0), 3);
  assert.equal(resources.get(1077)?.toString('hex'), '00000001000100000000ffff0000006402', 'HSB white, solidity 100, channel kind Spot');
  return { width: tiff.width, height: tiff.height, channels: 5, dpi: 300, compression: 'none', strips: 1, bytes: tiff.size, spot: spotName, photoshopResourceIds: [...resources.keys()] };
}

// Decode the original 8-bit RGB/RGBA PNG only when private paths were supplied.
// CRC/profile interpretation are not reimplemented; byte preservation is checked
// with SHA-256 and raster decoding is independent from the browser/encoder.
function decodePng(bytes) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  let width, height, channels;
  const compressed = [];
  for (let position = 8; position < bytes.length;) {
    const length = bytes.readUInt32BE(position), type = bytes.toString('ascii', position + 4, position + 8);
    const data = bytes.subarray(position + 8, position + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      assert.equal(data[8], 8); assert.ok([2, 6].includes(data[9]), 'Private reference PNG must be RGB/RGBA');
      channels = data[9] === 2 ? 3 : 4;
      assert.equal(data[10], 0); assert.equal(data[11], 0); assert.equal(data[12], 0, 'Interlaced PNG unsupported in this QA reader');
    }
    if (type === 'IDAT') compressed.push(data);
    position += length + 12;
    if (type === 'IEND') break;
  }
  const raw = inflateSync(Buffer.concat(compressed)), stride = width * channels;
  assert.equal(raw.length, (stride + 1) * height);
  const pixels = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]; assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x, left = x >= channels ? pixels[index - channels] : 0;
      const above = y ? pixels[index - stride] : 0, diagonal = y && x >= channels ? pixels[index - stride - channels] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : paeth(left, above, diagonal);
      pixels[index] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  return { width, height, channels, pixels };
}

async function checkOriginals(sample, input, alpha, reference) {
  const original = manifest.samples?.find(item => item.name === sample.name);
  if (!original) return { checked: false, reason: 'No private paths supplied; decoded fixtures only' };
  const pngBytes = await readFile(original.png), tiffBytes = await readFile(original.tiff);
  const png = decodePng(pngBytes), tiff = await inspectTiff(original.tiff);
  assert.equal(png.width, sample.width); assert.equal(png.height, sample.height);
  assert.equal(tiff.width, sample.width); assert.equal(tiff.height, sample.height); assert.equal(tiff.channels, sample.referenceChannels);
  assert.equal(tiff.number(259), 1); assert.equal(tiff.number(284), 1);
  assert.equal(tiff.tags.get(273).count, 1);
  assert.deepEqual(tiffBytes.subarray(tiff.number(273), tiff.number(273) + reference.length), reference, `${sample.name}: original TIFF vs fixture`);
  for (let p = 0; p < sample.width * sample.height; p++) {
    assert.equal(png.pixels[p * png.channels], input[p * 3]);
    assert.equal(png.pixels[p * png.channels + 1], input[p * 3 + 1]);
    assert.equal(png.pixels[p * png.channels + 2], input[p * 3 + 2]);
    assert.equal(png.channels === 4 ? png.pixels[p * 4 + 3] : 255, alpha[p]);
  }
  return { checked: true, pngSha256: sha256(pngBytes), tiffSha256: sha256(tiffBytes), png: original.png, tiff: original.tiff };
}

function rgbaFor(rgb, alpha) {
  const rgba = new Uint8Array(alpha.length * 4);
  for (let p = 0; p < alpha.length; p++) {
    rgba[p * 4] = rgb[p * 3]; rgba[p * 4 + 1] = rgb[p * 3 + 1]; rgba[p * 4 + 2] = rgb[p * 3 + 2]; rgba[p * 4 + 3] = alpha[p];
  }
  return rgba;
}

const report = { createdAt: new Date().toISOString(), samples: [], synthetic: [], limitations: [
  'Independent numeric TIFF/Spot verification is not a Photoshop UI, RIP interpretation or physical print test.',
  'Private raster references do not cover all RGB colors, other profiles, arbitrary curves or all browser color management.',
  'Long-film test converts and counts every output chunk; it does not allocate/render the browser master canvas or write a 606 MB disk file.',
] };

// Use shipped profiles, not a hidden substitute from the private fixtures.
const sourceProfilePath = path.join(root, 'assets/print/sRGB-IEC61966-2.1.icc');
const destinationProfilePath = path.join(root, 'assets/print/swop-custom-019.icc');
const [sourceProfileBytes, destinationProfileBytes, wasmBinary] = await Promise.all([
  readFile(sourceProfilePath), readFile(destinationProfilePath), readFile(path.join(root, 'vendor/lcms-wasm/1.0.5/lcms.wasm')),
]);
assert.equal(sha256(sourceProfileBytes), sha256(await readFixture('source.icc')));
assert.equal(sha256(destinationProfileBytes), sha256(await readFixture('destination.icc')));
report.profiles = { sourceSha256: sha256(sourceProfileBytes), destinationSha256: sha256(destinationProfileBytes), wasmSha256: sha256(wasmBinary) };
const converter = await createCmykConverter({ sourceProfileBytes, destinationProfileBytes, wasmBinary });
try {
  for (const sample of metadata.samples) {
    assert.match(sample.name, /^[a-z0-9_-]+$/i, 'Unsafe fixture name');
    const pixels = sample.width * sample.height;
    const [input, alpha, reference] = await Promise.all([readFixture(sample.name + '.rgb'), readFixture(sample.name + '.alpha'), readFixture(sample.name + '.reference')]);
    assert.equal(input.length, pixels * 3); assert.equal(alpha.length, pixels); assert.equal(reference.length, pixels * sample.referenceChannels);
    const nativePath = path.join(options.fixtures, sample.name + '.native.cmyk');
    const native = await exists(nativePath) ? await readFile(nativePath) : null;
    if (native) assert.equal(native.length, pixels * 4);
    const originals = await checkOriginals(sample, input, alpha, reference);
    const filename = path.join(options.output, sample.name + '-019-com-spot.tif');
    if (originals.checked) assert.notEqual(path.resolve(originals.tiff).toLowerCase(), filename.toLowerCase(), 'Never overwrite original TIFF');
    const file = await open(filename, 'w'), descriptor = createSpotTiffHeader({ width: sample.width, height: sample.height, dpi: 300 });
    let bytesWritten = 0, nativeMismatchBytes = 0;
    const started = performance.now();
    try {
      await writeExactly(file, descriptor.header); bytesWritten += descriptor.header.length;
      for (let p = 0; p < pixels; p += sample.width * rowsPerChunk) {
        const count = Math.min(sample.width * rowsPerChunk, pixels - p);
        const rgb = input.subarray(p * 3, (p + count) * 3), rgba = rgbaFor(rgb, alpha.subarray(p, p + count));
        const cmyk = converter.convertRGB(rgb);
        if (native) for (let n = 0; n < cmyk.length; n++) nativeMismatchBytes += +(cmyk[n] !== native[p * 4 + n]);
        const output = composeCmykSpot(rgba, cmyk);
        assert.equal(output.length, count * 5);
        await writeExactly(file, output); bytesWritten += output.length;
      }
    } finally { await file.close(); }
    assert.equal(bytesWritten, descriptor.totalBytes);
    assert.equal(nativeMismatchBytes, 0, 'Shipped WASM must equal native NOOPTIMIZE reference');
    const reopened = await inspectTiff(filename), structure = verifySpotStructure(reopened, sample);
    const output = await open(filename, 'r');
    const max = [0, 0, 0, 0], absSum = [0, 0, 0, 0];
    let exactCmykPixels = 0, visiblePixels = 0, exactVisiblePixels = 0, spotMismatchPixels = 0, referenceSpotMismatchPixels = 0, aboveTwoPixels = 0;
    try {
      for (let p = 0; p < pixels; p += sample.width * rowsPerChunk) {
        const count = Math.min(sample.width * rowsPerChunk, pixels - p);
        const bytes = await readExactly(output, count * 5, reopened.number(273) + p * 5);
        for (let n = 0; n < count; n++) {
          let exact = true, above = false;
          for (let channel = 0; channel < 4; channel++) {
            const difference = Math.abs(bytes[n * 5 + channel] - reference[(p + n) * sample.referenceChannels + channel]);
            max[channel] = Math.max(max[channel], difference); absSum[channel] += difference;
            exact = exact && difference === 0; above ||= difference > 2;
            if (!alpha[p + n]) assert.equal(bytes[n * 5 + channel], 0, 'Transparent CMYK must be zero');
          }
          exactCmykPixels += +exact; aboveTwoPixels += +above;
          if (alpha[p + n]) { visiblePixels++; exactVisiblePixels += +exact; }
          spotMismatchPixels += +(bytes[n * 5 + 4] !== 255 - alpha[p + n]);
          if (sample.referenceChannels === 5) referenceSpotMismatchPixels += +(bytes[n * 5 + 4] !== reference[(p + n) * 5 + 4]);
        }
      }
    } finally { await output.close(); }
    assert.equal(spotMismatchPixels, 0); assert.equal(referenceSpotMismatchPixels, 0); assert.equal(aboveTwoPixels, 0);
    if (originals.checked) {
      assert.equal(sha256(await readFile(originals.png)), originals.pngSha256, 'Input PNG unchanged');
      assert.equal(sha256(await readFile(originals.tiff)), originals.tiffSha256, 'Input TIFF unchanged');
    }
    const result = { name: sample.name, filename, pixels, structure, originalFiles: originals, nativeMismatchBytes, maxCmykError: max, meanCmykError: absSum.map(sum => sum / pixels), exactCmykPixels, visiblePixels, exactVisiblePixels, spotMismatchPixels, referenceSpotMismatchPixels, aboveTwoPixels, seconds: (performance.now() - started) / 1000 };
    report.samples.push(result); console.log(JSON.stringify(result));
  }

  for (const scenario of [{ name: 'small-alpha', width: 16, height: 16 }, { name: 'medium-10x20cm', width: 1181, height: 2362 }, ...options.skipLong ? [] : [{ name: 'long-58x150cm', width: 6850, height: 17717 }]]) {
    const descriptor = createSpotTiffHeader({ ...scenario, dpi: 300 });
    let bytesCounted = 0, chunks = 0, maxChunkBytes = 0, pendingRgba = null, pendingCmyk = null;
    const started = performance.now();
    const syntheticContext = { getImageData(x, y, width, height) {
      assert.equal(x, 0); assert.equal(width, scenario.width); assert.ok(height <= rowsPerChunk);
      assert.equal(pendingRgba, null, 'Production writer must await the previous output write');
      const count = width * height, rgba = new Uint8ClampedArray(count * 4);
      for (let p = 0; p < count; p++) {
        const n = p + y * width;
        rgba[p * 4] = (n * 13) & 255; rgba[p * 4 + 1] = (n * 17 + 23) & 255;
        rgba[p * 4 + 2] = (n * 29 + 47) & 255; rgba[p * 4 + 3] = n & 255;
      }
      pendingRgba = rgba; return { data: rgba };
    } };
    const converted = await writeSpotCanvas({
      canvas: { width: scenario.width, height: scenario.height, getContext: () => syntheticContext },
      bounds: { x: 0, y: 0, width: scenario.width, height: scenario.height },
      converter: { async convert(rgba) {
        const rgb = new Uint8Array(rgba.length / 4 * 3);
        for (let p = 0; p < rgba.length / 4; p++) {
          rgb[p * 3] = rgba[p * 4]; rgb[p * 3 + 1] = rgba[p * 4 + 1]; rgb[p * 3 + 2] = rgba[p * 4 + 2];
        }
        pendingCmyk = converter.convertRGB(rgb);
        return composeCmykSpot(rgba, pendingCmyk);
      } },
      async write(output) {
        if (bytesCounted === 0) {
          assert.deepEqual(output, descriptor.header); bytesCounted += output.length; return;
        }
        const count = pendingRgba.length / 4;
        assert.equal(output.length, count * 5);
        for (let p = 0; p < count; p++) {
          const alpha = pendingRgba[p * 4 + 3];
          assert.equal(output[p * 5 + 4], 255 - alpha);
          for (let channel = 0; channel < 4; channel++) {
            const ink = 255 - metadata.lut[255 - pendingCmyk[p * 4 + channel]];
            assert.equal(output[p * 5 + channel], Math.floor((ink * alpha + 127) / 255));
          }
        }
        bytesCounted += output.length; chunks++; maxChunkBytes = Math.max(maxChunkBytes, output.length);
        // Exercise asynchronous write backpressure without retaining the chunk.
        await Promise.resolve(); pendingRgba = null; pendingCmyk = null;
      },
    });
    assert.equal(bytesCounted, descriptor.totalBytes);
    assert.equal(converted.bytes, descriptor.totalBytes);
    const result = { ...scenario, bytesCounted, pixelBytes: descriptor.pixelBytes, chunks, maxChunkBytes, seconds: (performance.now() - started) / 1000, writer: 'production writeSpotCanvas', sink: 'counter with synthetic canvas strips, no large disk file or full DOM canvas' };
    report.synthetic.push(result); console.log(JSON.stringify(result));
  }
} finally { converter.close(); }

const reportFile = path.join(options.output, 'spot-reference-report.json');
await writeFile(reportFile, JSON.stringify(report, null, 2));
console.log(`PASS private reference TIFF regression. Report: ${reportFile}`);
