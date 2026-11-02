import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ProgressRequestError, fetchAccountProgress, recordAccountAttempt, fetchAccountFavorites,
  saveAccountFavorites, fetchAccountPreferences, patchAccountPreferences,
  importAccountPractice, fetchAccountChallengeQuestions,
} from './progressApi.js';

const mockFetch = (payload, status = 200) => {
  const calls = [];
  return {
    calls, fetchImpl: async (path, options) => {
      calls.push({ path, options });
      return { ok: status >= 200 && status < 300, status, json: async () => payload };
    },
  };
};

test('account progress and preferences use same-origin cookie requests', async () => {
  const mock = mockFetch({ attempts: [], summary: {} });
  assert.deepEqual(await fetchAccountProgress({ fetchImpl: mock.fetchImpl }), { attempts: [], summary: {} });
  assert.deepEqual(mock.calls[0], {
    path: '/api/account/progress', options: { method: 'GET', credentials: 'same-origin' },
  });
  await fetchAccountFavorites({ fetchImpl: mock.fetchImpl });
  await fetchAccountPreferences({ fetchImpl: mock.fetchImpl });
  assert.deepEqual(mock.calls.map((call) => call.path), [
    '/api/account/progress', '/api/account/favorites', '/api/account/preferences',
  ]);
});

test('idempotent attempts and import snapshots are POSTed without browser-supplied grading', async () => {
  const mock = mockFetch({ created: true, attempt: { id: 'pitch-1' } }, 201);
  const attempt = { id: 'pitch-1', questionId: '2-nephi-2-25', bookId: 'alma', chapter: 2 };
  await recordAccountAttempt(attempt, { fetchImpl: mock.fetchImpl });
  assert.deepEqual(mock.calls[0], {
    path: '/api/account/attempts', options: {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt),
    },
  });
  const importBatch = { importId: 'migrate.1', attempts: [attempt], favorites: [], preferences: {} };
  await importAccountPractice(importBatch, { fetchImpl: mock.fetchImpl });
  assert.equal(mock.calls[1].path, '/api/account/import');
  assert.deepEqual(JSON.parse(mock.calls[1].options.body), importBatch);
});

test('favorites and preferences use PUT/PATCH, authenticated personal decks escape filters', async () => {
  const mock = mockFetch({ favorites: ['john-3-16'] });
  await saveAccountFavorites(['john-3-16'], { fetchImpl: mock.fetchImpl });
  assert.equal(mock.calls[0].options.method, 'PUT');
  assert.deepEqual(JSON.parse(mock.calls[0].options.body), { favorites: ['john-3-16'] });
  await patchAccountPreferences({ answerDifficulty: 'exact-verse' }, { fetchImpl: mock.fetchImpl });
  assert.equal(mock.calls[1].path, '/api/account/preferences');
  assert.equal(mock.calls[1].options.method, 'PATCH');
  await fetchAccountChallengeQuestions('my-favorites', 'new-testament', { fetchImpl: mock.fetchImpl });
  assert.equal(mock.calls[2].path, '/api/account/challenges/my-favorites/questions?volume=new-testament');
  assert.equal(mock.calls[2].options.credentials, 'same-origin');
});

test('failed authorization and network errors are reported rather than falling back to local answers', async () => {
  await assert.rejects(fetchAccountProgress({ fetchImpl: mockFetch({ error: 'Sign in required' }, 401).fetchImpl }),
    (error) => error instanceof ProgressRequestError && error.status === 401 && error.message === 'Sign in required');
  await assert.rejects(fetchAccountProgress({ fetchImpl: async () => { throw Error('offline'); } }),
    (error) => error instanceof ProgressRequestError && /local work is still saved/i.test(error.message));
  await assert.rejects(fetchAccountProgress({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw Error('invalid'); } }) }),
    ProgressRequestError);
  const abort = new Error('aborted'); abort.name = 'AbortError';
  await assert.rejects(fetchAccountProgress({ fetchImpl: async () => { throw abort; } }), (error) => error === abort);
});
