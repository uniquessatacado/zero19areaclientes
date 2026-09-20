import assert from 'node:assert/strict';
import {createFilmMaskCache} from '../film-mask-cache.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};
const aborted = promise => promise.then(() => assert.fail('Expected cancellation'), error => assert.equal(error.name, 'AbortError'));

// Two actual preparations maximum; duplicate callers share the same promise and
// output object. The scheduler never resizes or modifies any alpha mask bytes.
{
  const started = [], tasks = new Map();
  let active = 0, peak = 0;
  const cache = createFilmMaskCache({prepare(source, {signal}) {
    assert.equal(signal.aborted, false);
    started.push(source); active++; peak = Math.max(peak, active);
    const task = deferred(); tasks.set(source, task);
    return task.promise.finally(() => active--);
  }});
  const sources = ['image-a', 'image-b', 'image-c', 'image-d'];
  const requests = sources.map(source => cache.get(source));
  assert.equal(cache.get('image-c'), requests[2], 'queued duplicates share the same task');
  assert.equal(cache.get('image-a'), requests[0], 'running duplicates share the same task');
  await tick(); assert.deepEqual(started, sources.slice(0, 2));
  const alphaMask = {w: 3, h: 2, data: new Uint8Array([1, 0, 1, 0, 0, 1])};
  tasks.get('image-a').resolve(alphaMask); await tick();
  assert.deepEqual(started, sources.slice(0, 3));
  tasks.get('image-b').resolve(null); await tick();
  assert.deepEqual(started, sources);
  tasks.get('image-c').resolve({w: 1, h: 1, data: new Uint8Array([1])});
  tasks.get('image-d').resolve(null);
  const results = await Promise.all(requests);
  assert.equal(results[0], alphaMask); assert.deepEqual([...alphaMask.data], [1, 0, 1, 0, 0, 1]);
  assert.equal(await cache.get('image-a'), alphaMask);
  assert.equal(await cache.get('image-b'), null, 'known unsupported dimensions may cache null');
  assert.equal(started.length, 4); assert.equal(peak, 2);
}

// Exact source identity, not item identity: identical SVG/digit content is reused;
// edited bytes/URLs remain separate so dimensions and internal holes cannot stale.
{
  let calls = 0;
  const cache = createFilmMaskCache({prepare: source => ({source, call: ++calls})});
  const digit = 'data:image/svg+xml;charset=utf-8,<svg>digit 1</svg>';
  const values = await Promise.all(Array.from({length: 20}, () => cache.get(digit)));
  assert.equal(calls, 1); assert.ok(values.every(value => value === values[0]));
  await cache.get(digit + ' '); assert.equal(calls, 2);
}

// A failed preparation is immediately retryable and frees its pool slot.
{
  let count = 0;
  const failure = new Error('Decode failed');
  const cache = createFilmMaskCache({concurrency: 1, prepare() {
    if (++count === 1) throw failure;
    if (count === 2) return Promise.reject(failure);
    return count;
  }});
  await assert.rejects(cache.get('retry'), error => error === failure);
  await assert.rejects(cache.get('retry'), error => error === failure);
  assert.equal(await cache.get('retry'), 3);
  assert.equal(await cache.get('retry'), 3);
}

// Completed masks have a 60-entry LRU cap. Touching one preserves it while the
// oldest untouched completed entry is evicted, independently of in-flight tasks.
{
  const counts = new Map();
  const cache = createFilmMaskCache({prepare(source) {
    counts.set(source, (counts.get(source) || 0) + 1); return source;
  }});
  for (let i = 0; i < 60; i++) await cache.get('item-' + i);
  await cache.get('item-0'); await cache.get('item-60'); await cache.get('item-0');
  assert.equal(counts.get('item-0'), 1);
  await cache.get('item-1'); assert.equal(counts.get('item-1'), 2);
  cache.clear(); await cache.get('item-0'); assert.equal(counts.get('item-0'), 2);
}

// Account changes reject old callers immediately, skip queued work, abort active
// signals, and cannot publish old values or erase a new task for the same source.
// A stubborn decoder that ignores abort still occupies its slot until settled.
{
  const started = [];
  let active = 0, peak = 0;
  const cache = createFilmMaskCache({prepare(source, {signal}) {
    const task = {...deferred(), source, signal}; started.push(task);
    active++; peak = Math.max(peak, active);
    return task.promise.finally(() => active--);
  }});
  const a = cache.get('same'), b = cache.get('other'), queued = cache.get('never-start');
  const cancelledResults = [a, b, queued].map(aborted);
  await tick(); assert.equal(started.length, 2);
  cache.clear(); await Promise.all(cancelledResults);
  assert.ok(started.every(task => task.signal.aborted));
  const replacement = cache.get('same');
  await tick(); assert.equal(started.length, 2, 'old work keeps the bounded memory slots');
  started[0].resolve('old-account'); await tick();
  assert.equal(started.length, 3); assert.equal(started[2].source, 'same');
  assert.equal(cache.get('same'), replacement);
  started[1].reject(new Error('Late failure from old account')); await tick();
  assert.equal(cache.get('same'), replacement, 'old rejection cannot delete new work');
  started[2].resolve('new-account');
  assert.equal(await replacement, 'new-account');
  assert.equal(await cache.get('same'), 'new-account');
  assert.equal(started.length, 3); assert.equal(peak, 2);
}

// clear() before the prepare microtask runs never calls the old decoder. A
// cooperative decoder also receives the cancellation reason via AbortSignal.
{
  let calls = 0;
  const cache = createFilmMaskCache({prepare(source, {signal}) {
    calls++;
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), {once: true}));
  }});
  const beforeStart = aborted(cache.get('early')); cache.clear(); await beforeStart; await tick();
  assert.equal(calls, 0);
  const running = aborted(cache.get('running')); await tick();
  assert.equal(calls, 1); cache.clear(); await running; await tick();
  cache.clear();
}

assert.throws(() => createFilmMaskCache(), TypeError);
for (const concurrency of [0, 3, 1.5, NaN]) assert.throws(() => createFilmMaskCache({prepare() {}, concurrency}), RangeError);
for (const maxEntries of [0, 61, -1, 1.5]) assert.throws(() => createFilmMaskCache({prepare() {}, maxEntries}), RangeError);
const invalid = createFilmMaskCache({prepare() { assert.fail('Invalid input must not be prepared'); }});
for (const source of ['', null, undefined, {}, 42]) await assert.rejects(invalid.get(source), TypeError);

console.log('Film masks: two-slot scheduling, source deduplication, exact result preservation, 60-entry LRU, retry and account cancellation races OK');
