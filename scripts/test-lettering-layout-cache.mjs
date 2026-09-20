import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const source = await fs.readFile(new URL('./film-v2176-functions.txt', import.meta.url), 'utf8');
const stop = source.indexOf('  async function upgradeCurrentLettering(');
assert.ok(stop > 0, 'Production lettering cache extraction anchor must exist');
const wrapper = source.slice(0, stop);
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const calls = [], controls = {gate: null, fail: false};
  const legacy = async item => {
    calls.push(item);
    if (controls.gate) await controls.gate;
    if (controls.fail) throw new Error('Synthetic official font failure');
    return {nameLine: {parts: []}, numberLine: {parts: []}, families: new Map([['font', 'official']])};
  };
  const refine = async (item, layout) => ({...layout, recipe: item, widthCm: item.name.length + item.nameTrackingCm, heightCm: item.nameHeightCm});
  const api = new Function('prepareLegacyLetteringLayout', 'refineLetteringLayout',
    'let productionAccountGeneration=1;const drawPreparedLetteringLine=()=>{},sanitizeSvg=x=>x,fontCoverageByFamily=new Map();' + wrapper +
    ';return {prepareLetteringLayout,clearLetteringLayoutCache,changeAccount:()=>productionAccountGeneration++,size:()=>letteringLayoutCache.size};')(legacy, refine);
  return {...api, calls, controls};
}
const recipe = () => ({type: 'team_customization', name: 'CÉSAR', number: '10', nameHeightCm: 5.5, numberHeightCm: 28, gapCm: 1.5,
  nameTrackingCm: .15, digitSpacingCm: .2, letteringMetricsVersion: 3, spacingMode: 'optical',
  fontSource: {id: 'font', storage_path: 'official.ttf', source_type: 'ttf'}, fontSources: [{id: 'font', storage_path: 'official.ttf'}],
  glyphs: [{glyph_key: '1', svg_markup: '<svg>1</svg>', font_source_id: 'font'}], palette: [{role: 'name', color_hex: '#ffffff'}]});

// Repeated name/digit instances and redraws reuse exact geometry without retaining
// bitmap previews. All nested inputs are snapshotted before asynchronous work.
{
  const f = fixture(), first = recipe();
  first.previewDataUrl = 'data:image/png,large'; first.localId = 'one'; first.quantity = 1;
  const [a, b] = await Promise.all([f.prepareLetteringLayout(first), f.prepareLetteringLayout({...first, localId: 'two', label: 'Other label', quantity: 5, previewDataUrl: 'data:image/png,other'})]);
  assert.equal(f.calls.length, 1); assert.equal(a, b);
  assert.equal(a.recipe.previewDataUrl, undefined); assert.equal(a.recipe.localId, undefined);
  assert.notEqual(a.recipe.glyphs, first.glyphs);
  first.glyphs[0].svg_markup = '<svg>changed</svg>';
  assert.equal(a.recipe.glyphs[0].svg_markup, '<svg>1</svg>');
  assert.notEqual(await f.prepareLetteringLayout(first), a); assert.equal(f.calls.length, 2);
}

// Every geometry/resource change misses the cache, including changes made while
// keeping the same metrics version. New recipe fields are conservatively keyed.
{
  const changes = [
    x => {x.name = 'CESAR';}, x => {x.number = '11';}, x => {x.nameHeightCm = 6;}, x => {x.numberHeightCm = 29;},
    x => {x.gapCm = 2;}, x => {x.nameTrackingCm = .3;}, x => {x.digitSpacingCm = .4;}, x => {x.spacingMode = 'rectangular';},
    x => {x.letteringMetricsVersion = 2;}, x => {x.fontSource.storage_path = 'new.ttf';}, x => {x.fontSources[0].storage_path = 'new.ttf';},
    x => {x.glyphs[0].svg_markup = '<svg>new</svg>';}, x => {x.glyphs[0].font_source_id = 'font-2';},
    x => {x.palette[0].color_hex = '#ff0000';}, x => {x.widthCm = 15;}, x => {x.futureRecipeOption = true;}
  ];
  for (const change of changes) {
    const f = fixture(), a = recipe(); await f.prepareLetteringLayout(a);
    const b = structuredClone(a); change(b); await f.prepareLetteringLayout(b);
    assert.equal(f.calls.length, 2);
  }
}

// Font/read failures are immediately retryable; account/epoch changes reject late
// results and old rejections cannot erase new pending work for the same recipe.
{
  const f = fixture(); f.controls.fail = true;
  await assert.rejects(f.prepareLetteringLayout(recipe()), /font failure/);
  assert.equal(f.size(), 0); f.controls.fail = false;
  await f.prepareLetteringLayout(recipe()); assert.equal(f.calls.length, 2);
  let release; f.controls.gate = new Promise(resolve => { release = resolve; });
  f.clearLetteringLayoutCache();
  const old = f.prepareLetteringLayout(recipe()), rejection = assert.rejects(old, error => error.name === 'AbortError');
  await tick(); f.changeAccount();
  const next = f.prepareLetteringLayout(recipe());
  release(); await rejection; const current = await next;
  assert.equal(await f.prepareLetteringLayout(recipe()), current); assert.equal(f.size(), 1);
  f.controls.gate = null; f.clearLetteringLayoutCache(); assert.equal(f.size(), 0);
}

// JSON normally aliases non-finite numbers to null. Never let a cached valid
// null/default gap disguise an invalid measurement on a later request.
{
  const f = fixture();
  await f.prepareLetteringLayout({...recipe(), gapCm: null});
  for (const gapCm of [NaN, Infinity, -Infinity]) await assert.rejects(f.prepareLetteringLayout({...recipe(), gapCm}), /medida inválida/);
  assert.equal(f.calls.length, 1);
}

// Bounded LRU and explicit cleanup; pending cancellation within the same account
// must also reject, not publish a layout after changing an official source.
{
  const f = fixture();
  for (let i = 0; i < 32; i++) await f.prepareLetteringLayout({...recipe(), name: 'NAME-' + i});
  assert.equal(f.size(), 32);
  await f.prepareLetteringLayout({...recipe(), name: 'NAME-0'});
  await f.prepareLetteringLayout({...recipe(), name: 'NAME-32'});
  assert.equal(f.size(), 32);
  const count = f.calls.length; await f.prepareLetteringLayout({...recipe(), name: 'NAME-0'}); assert.equal(f.calls.length, count);
  await f.prepareLetteringLayout({...recipe(), name: 'NAME-1'}); assert.equal(f.calls.length, count + 1);
  let release; f.controls.gate = new Promise(resolve => { release = resolve; });
  const old = f.prepareLetteringLayout({...recipe(), name: 'PENDING'}), rejected = assert.rejects(old, error => error.name === 'AbortError');
  f.clearLetteringLayoutCache(); release(); await rejected; assert.equal(f.size(), 0);
}

console.log('Lettering layout cache: exact recipe keys, resources/spacing invalidation, immutable input snapshot, promise dedup, 32-entry LRU, failures and account/epoch races OK');
