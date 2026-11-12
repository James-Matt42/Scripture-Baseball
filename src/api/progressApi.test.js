import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProgressRequestError, fetchAccountProgress, fetchAccountPreferences,
  patchAccountPreferences } from './progressApi.js';

function makeFetch(status = 200, body = { attempts: [] }) {
  const calls = [];
  return { calls, fetchImpl: async (path, options) => {
    calls.push({ path, options });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  } };
}

test('the only account progress writes are authenticated preference patches', async () => {
  const mock = makeFetch();
  await fetchAccountProgress({ fetchImpl: mock.fetchImpl });
  await fetchAccountPreferences({ fetchImpl: mock.fetchImpl });
  await patchAccountPreferences({ preferredVolume: 'bom' }, { fetchImpl: mock.fetchImpl });
  assert.deepEqual(mock.calls.map((row) => row.path), [
    '/api/account/progress', '/api/account/preferences', '/api/account/preferences',
  ]);
  assert.equal(mock.calls[2].options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(mock.calls[2].options.body), { preferredVolume: 'bom' });
  assert.equal(mock.calls[2].options.method, 'PATCH');
});

test('errors never fall back to client-supplied grades', async () => {
  const mock = makeFetch(401, { error: 'Authentication required' });
  await assert.rejects(fetchAccountProgress({ fetchImpl: mock.fetchImpl }),
    (error) => error instanceof ProgressRequestError && error.status === 401);
  await assert.rejects(fetchAccountProgress({ fetchImpl: async () => { throw new Error('offline'); } }),
    /local work is still saved/i);
});
