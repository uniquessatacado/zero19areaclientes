import assert from 'node:assert/strict';
import {listFilmJobs, getFilmJob, FILM_JOB_LIST_COLUMNS, FILM_JOB_LIST_LIMIT} from '../film-job-list.js';

const expectedColumns = 'id,name,film_width_cm,calculated_length_cm,updated_at,commit_state:settings_snapshot->>commit_state';
const expectedFilter = 'settings_snapshot->>kind.is.null,settings_snapshot->>kind.neq.named_film_draft_v1';
let checks = 0;
function spy(response = {data: [], error: null}, rejection = null) {
  const calls = [], requests = [];
  return {
    calls, requests,
    from(table) {
      const request = [['from', table]];
      requests.push(request);
      calls.push(request[0]);
      const query = {};
      for (const method of ['select', 'eq', 'or', 'order', 'limit', 'maybeSingle']) {
        query[method] = (...args) => { const call = [method, ...args]; calls.push(call); request.push(call); return query; };
      }
      query.then = (resolve, reject) => (rejection ? Promise.reject(rejection) : Promise.resolve(response)).then(resolve, reject);
      return query;
    }
  };
}
async function check(name, run) { await run(); checks++; console.log('PASS ' + name); }

await check('projection returns only small summaries and preserves pending flag', async () => {
  const sample = {id: 'job-a', name: 'Filme', film_width_cm: 58, calculated_length_cm: 150, updated_at: '2026-09-20', commit_state: 'pending'};
  const api = spy({data: [{...sample, settings_snapshot: {filmItems: ['not requested']}, owner_id: 'account-a'}]});
  assert.deepEqual(await listFilmJobs(api, 'account-a'), [sample]);
  assert.equal(FILM_JOB_LIST_COLUMNS, expectedColumns);
  assert.equal(FILM_JOB_LIST_LIMIT, 12);
  assert.deepEqual(api.calls, [
    ['from', 'z19p_print_jobs'], ['select', expectedColumns], ['eq', 'owner_id', 'account-a'],
    ['or', expectedFilter], ['order', 'updated_at', {ascending: false}],
    ['order', 'id', {ascending: false}], ['limit', 12]
  ]);
  assert.equal(api.requests.length, 1, 'list must not perform per-job reads');
  assert.ok(!api.calls.some(call => call[0] === 'select' && call[1] === '*'));
});

await check('legacy jobs without commit_state remain visible', async () => {
  const rows = await listFilmJobs(spy({data: [{id: 'legacy'}]}), 'account-a');
  assert.equal(rows[0].id, 'legacy');
  assert.equal(rows[0].commit_state, null);
  assert.equal(await getFilmJob(spy({data: {id: 'legacy', owner_id: 'account-a', settings_snapshot: null}}), 'account-a', 'legacy').then(row => row.id), 'legacy');
});

await check('null/empty results and list limit are bounded', async () => {
  assert.deepEqual(await listFilmJobs(spy({data: null}), 'account-a'), []);
  assert.deepEqual(await listFilmJobs(spy(), 'account-a'), []);
  assert.equal((await listFilmJobs(spy({data: Array.from({length: 20}, (_, i) => ({id: 'job-' + i}))}), 'account-a')).length, 12);
});

await check('full job is fetched lazily with owner, id, kind and maybeSingle', async () => {
  const snapshot = {filmItems: [{localId: 'example'}], lastFilm: {placements: []}, commit_state: 'complete'};
  const job = {id: 'job-a', owner_id: 'account-a', settings_snapshot: snapshot};
  const api = spy({data: job});
  assert.strictEqual(await getFilmJob(api, 'account-a', 'job-a'), job);
  assert.deepEqual(api.calls, [
    ['from', 'z19p_print_jobs'], ['select', '*'], ['eq', 'owner_id', 'account-a'],
    ['eq', 'id', 'job-a'], ['or', expectedFilter], ['maybeSingle']
  ]);
});

await check('missing, other-account and named-draft jobs are unavailable', async () => {
  for (const data of [null, {id: 'job-a', owner_id: 'account-b'}, {id: 'job-b', owner_id: 'account-a'}, {id: 'job-a', owner_id: 'account-a', settings_snapshot: {kind: 'named_film_draft_v1'}}]) {
    assert.equal(await getFilmJob(spy({data}), 'account-a', 'job-a'), null);
  }
});

await check('missing account or job ID performs no request', async () => {
  const api = spy();
  for (const owner of ['', ' ', null, undefined, {}]) {
    await assert.rejects(listFilmJobs(api, owner), /conta/);
    await assert.rejects(getFilmJob(api, owner, 'job-a'), /conta/);
  }
  for (const id of ['', ' ', null, undefined, {}]) await assert.rejects(getFilmJob(api, 'account-a', id), /Selecione o job/);
  assert.equal(api.requests.length, 0);
});

await check('queries are rebuilt per account and not cached', async () => {
  const api = spy();
  await listFilmJobs(api, 'account-a');
  await listFilmJobs(api, 'account-b');
  await listFilmJobs(api, 'account-a');
  assert.equal(api.requests.length, 3);
  assert.deepEqual(api.requests.map(request => request.find(call => call[0] === 'eq')), [
    ['eq', 'owner_id', 'account-a'], ['eq', 'owner_id', 'account-b'], ['eq', 'owner_id', 'account-a']
  ]);
});

await check('query errors contain context and safe code, never backend URL/token', async () => {
  const secret = 'https://private.invalid/?token=DO_NOT_PRINT';
  for (const operation of ['list', 'get']) {
    const api = spy({data: null, error: {message: secret, details: 'Bearer DO_NOT_PRINT', code: '42703'}, status: 400});
    await assert.rejects(operation === 'list' ? listFilmJobs(api, 'account-a') : getFilmJob(api, 'account-a', 'job-a'), error => {
      assert.equal(error.name, 'FilmJobReadError');
      assert.equal(error.operation, operation);
      assert.equal(error.code, '42703');
      assert.equal(error.status, 400);
      assert.match(error.message, operation === 'list' ? /lista de jobs salvos/ : /abrir o job salvo/);
      assert.doesNotMatch(error.stack + JSON.stringify(error), /private|DO_NOT_PRINT|Bearer|account-a/);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

await check('thrown transport errors have useful safe connection context', async () => {
  await assert.rejects(listFilmJobs(spy(null, new TypeError('Failed to fetch https://private.invalid?token=secret')), 'account-a'), error => {
    assert.match(error.message, /Falha de conexão/);
    assert.doesNotMatch(error.message, /private|token|secret/);
    return true;
  });
  await assert.rejects(getFilmJob(spy({error: {code: '42501', message: 'private account'}}), 'account-a', 'job-a'), /permissão/);
  await assert.rejects(listFilmJobs(spy({error: {message: 'secret', code: 'https://private.invalid'}}), 'account-a'), error => !error.code && !error.message.includes('private'));
});

await check('malformed successful responses do not masquerade as valid jobs', async () => {
  for (const response of [undefined, {data: 'bad'}, {data: [null]}, {data: [{}]}]) {
    const api = response === undefined ? spy(null) : spy(response);
    await assert.rejects(listFilmJobs(api, 'account-a'), /lista de jobs salvos/);
  }
  for (const data of [[], 'bad', 42]) await assert.rejects(getFilmJob(spy({data}), 'account-a', 'job-a'), /abrir o job salvo/);
});

console.log(`Film job list: ${checks} test groups passed. Query spies only; no database/session accessed.`);
