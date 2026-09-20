import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createFilmMaskCache} from '../film-mask-cache.js';

// Exercise the actual production scan and item adapter with deterministic image
// and canvas boundaries. No account, network, app source patch or browser needed.
const source = await fs.readFile(new URL('../production-v217.js', import.meta.url), 'utf8');
const start = source.indexOf('  const filmMaskCache=createFilmMaskCache(');
const end = source.indexOf('  async function calculateFilm(media)', start);
assert.ok(start >= 0 && end > start, 'Production mask extraction anchors must exist');
const productionMasks = source.slice(start, end);
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const images = new Map(), canvases = [], warnings = [], decoded = [];
  const state = {active: 0, peak: 0, reads: 0, onRead: null};
  class Image {
    set src(value) {
      this.url = value;
      if (!value) this.cancel?.();
    }
    decode() {
      const entry = images.get(this.url);
      if (!entry) return Promise.reject(new Error('Unknown synthetic image'));
      decoded.push(this.url); state.active++; state.peak = Math.max(state.peak, state.active);
      this.entry = entry; this.naturalWidth = entry.width; this.naturalHeight = entry.height;
      return new Promise((resolve, reject) => {
        this.cancel = () => reject(new DOMException('Synthetic decode cancelled', 'AbortError'));
        if (entry.hold) entry.release = resolve;
        else setImmediate(() => entry.decodeFailure ? reject(new Error('Synthetic decode failure')) : resolve());
      }).finally(() => { state.active--; this.cancel = null; });
    }
  }
  const document = {createElement(name) {
    assert.equal(name, 'canvas');
    let image, row;
    const canvas = {width: 0, height: 0, getContext(type) {
      assert.equal(type, '2d');
      return {
        clearRect() {},
        drawImage(input, x, y) { image = input; row = y; },
        getImageData(x, y, width, height) {
          state.reads++;
          if (image.entry.readFailure) throw new Error('Synthetic canvas read failure');
          const offset = row * image.entry.width * 4;
          const data = image.entry.rgba.slice(offset, offset + width * height * 4);
          state.onRead?.();
          return {data};
        }
      };
    }};
    canvases.push(canvas); return canvas;
  }};
  const api = new Function('createFilmMaskCache', 'Image', 'document', 'ctx', 'console',
    'let filmItems=[];const filmSettings={freeRotation:false};' + productionMasks +
    ';return {maskForItem,prepareFilmMask,filmNestingItems,clear:()=>filmMaskCache.clear(),setItems:value=>filmItems=value};')(
    createFilmMaskCache, Image, document, {publicUrl: value => value}, {warn: (...args) => warnings.push(args)});
  return {...api, images, canvases, warnings, decoded, state};
}

const asset = (path, localId = path) => ({type: 'asset', path, localId, widthCm: 10, heightCm: 5, quantity: 1, rotationPolicy: '90'});
const bitmap = (width, height) => ({width, height, rgba: new Uint8ClampedArray(width * height * 4)});
const freed = f => assert.ok(f.canvases.every(canvas => canvas.width === 1 && canvas.height === 1), 'All scan canvases must be released');

// Sparse alpha=1 pixels must survive reduction, including strip boundaries,
// right/bottom edges, isolated islands, and a fully transparent surrounding area.
{
  const f = fixture(), image = bitmap(361, 137);
  const islands = [[0, 0, 1], [360, 136, 1], [180, 64, 1], [1, 63, 255], [359, 128, 2], [180, 1, 127]];
  for (const [x, y, alpha] of islands) image.rgba[(y * image.width + x) * 4 + 3] = alpha;
  f.images.set('sparse', image);
  const mask = await f.maskForItem(asset('sparse'));
  assert.equal(mask.w, 180); assert.equal(mask.h, Math.ceil(180 * 137 / 361));
  const expected = new Uint8Array(mask.w * mask.h);
  for (const [x, y] of islands) expected[Math.floor(y * mask.h / image.height) * mask.w + Math.floor(x * mask.w / image.width)] = 1;
  assert.deepEqual(mask.data, expected);
  assert.equal(mask.data.reduce((sum, value) => sum + value, 0), islands.length);
  assert.equal(await f.maskForItem(asset('sparse', 'another-copy')), mask);
  assert.equal(f.decoded.length, 1); assert.equal(f.state.reads, 3); freed(f);
}

// The item adapter preserves order, physical measurements, quantity and rotation;
// only two original decodes run at once. Identical team artwork shares one scan.
{
  const f = fixture();
  for (let i = 0; i < 5; i++) f.images.set('parallel-' + i, bitmap(12, 8));
  f.setItems(Array.from({length: 5}, (_, i) => ({...asset('parallel-' + i), quantity: i + 1})));
  const items = await f.filmNestingItems();
  assert.equal(f.state.peak, 2); assert.equal(f.decoded.length, 5);
  assert.deepEqual(items.map(item => [item.id, item.widthMm, item.heightMm, item.quantity, item.rotationPolicy]),
    Array.from({length: 5}, (_, i) => ['parallel-' + i, 100, 50, i + 1, '90']));
  const image = 'data:image/svg+xml,same-exact-digit'; f.images.set(image, bitmap(10, 10));
  const [one, two] = await Promise.all(['piece-1', 'piece-2'].map(localId => f.maskForItem({type: 'team_customization', localId, previewDataUrl: image})));
  assert.equal(one, two); assert.equal(f.decoded.filter(value => value === image).length, 1);
  const count = f.decoded.length;
  assert.equal(await f.maskForItem({...asset('absent'), halftone: true}), null);
  assert.equal(await f.maskForItem({...asset('absent'), allowInternalNesting: false}), null);
  assert.equal(f.decoded.length, count); freed(f);
}

// Account clear during the first strip invalidates the returned mask, frees the
// canvas, and forces a clean read in the new scope rather than caching old pixels.
{
  const f = fixture(); f.images.set('account', bitmap(200, 130));
  f.state.onRead = () => { f.state.onRead = null; f.clear(); };
  await assert.rejects(f.maskForItem(asset('account')), error => error.name === 'AbortError');
  await new Promise(resolve => setTimeout(resolve, 5)); freed(f);
  assert.ok(await f.maskForItem(asset('account')));
  assert.equal(f.decoded.length, 2); freed(f);
}

// Cancelling while decode is pending settles callers and allows the next account
// to load that source. Decode/read errors are not retained as successful masks.
{
  const f = fixture(), image = bitmap(8, 8); image.hold = true; f.images.set('held', image);
  const loading = f.maskForItem(asset('held'));
  const rejected = assert.rejects(loading, error => error.name === 'AbortError');
  await tick(); f.clear(); await rejected; await tick();
  image.hold = false; assert.ok(await f.maskForItem(asset('held')));
  const broken = bitmap(8, 8); broken.readFailure = true; f.images.set('broken', broken);
  assert.equal(await f.maskForItem(asset('broken')), null); freed(f);
  broken.readFailure = false; assert.ok(await f.maskForItem(asset('broken')));
  assert.equal(f.decoded.filter(value => value === 'broken').length, 2); freed(f);
  assert.equal(f.warnings.length, 1);
}

console.log('Production mask integration: alpha=1 islands, exact strip projection, concurrency=2, team-source dedup, item geometry, account clear, retry and canvas cleanup OK');
