const cancelled = () => new DOMException('Preparação das máscaras cancelada.', 'AbortError');

/**
 * Account-scoped, bounded scheduling for the existing exact alpha-mask reader.
 * `prepare(source, {signal})` owns decoding/pixel scanning and must not mutate a
 * returned mask afterwards. Source strings are opaque, including SVG data URLs.
 * Completed masks use a 60-entry LRU; in-flight requests are deduplicated apart
 * from that LRU so eviction never starts a duplicate decode of a pending source.
 */
export function createFilmMaskCache({prepare, concurrency = 2, maxEntries = 60} = {}) {
  if (typeof prepare !== 'function') throw new TypeError('Informe o preparador de máscaras.');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 2) throw new RangeError('Use uma ou duas preparações simultâneas.');
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 60) throw new RangeError('O cache permite de 1 a 60 máscaras.');

  const completed = new Map(), pending = new Map();
  let queue = [], active = 0, generation = 0;
  const current = task => task.generation === generation && !task.controller.signal.aborted;

  function finish(task, ok, result) {
    active--;
    // A late result from another account must not delete its replacement task.
    if (pending.get(task.source) === task) pending.delete(task.source);
    if (!current(task)) task.reject(cancelled());
    else if (!ok) task.reject(result);
    else {
      completed.set(task.source, result);
      if (completed.size > maxEntries) completed.delete(completed.keys().next().value);
      task.resolve(result);
    }
    drain();
  }

  function drain() {
    while (active < concurrency && queue.length) {
      const task = queue.shift();
      if (!current(task)) continue;
      active++;
      Promise.resolve().then(() => {
        if (!current(task)) throw cancelled();
        return prepare(task.source, {signal: task.controller.signal});
      }).then(value => finish(task, true, value), error => finish(task, false, error));
    }
  }

  function get(source) {
    if (typeof source !== 'string' || !source) return Promise.reject(new TypeError('A máscara precisa de uma fonte de imagem.'));
    if (completed.has(source)) {
      const value = completed.get(source);
      completed.delete(source);
      completed.set(source, value);
      return Promise.resolve(value);
    }
    if (pending.has(source)) return pending.get(source).promise;
    const task = {source, generation, controller: new AbortController()};
    task.promise = new Promise((resolve, reject) => { task.resolve = resolve; task.reject = reject; });
    pending.set(source, task);
    queue.push(task);
    drain();
    return task.promise;
  }

  function clear() {
    generation++;
    completed.clear();
    const obsolete = [...pending.values()];
    pending.clear();
    queue = [];
    for (const task of obsolete) {
      const error = cancelled();
      task.controller.abort(error);
      task.reject(error);
    }
    // Old preparations retain their slots until they actually settle. Releasing
    // them early could exceed the decode/memory limit after an account switch.
  }

  return {get, clear};
}
