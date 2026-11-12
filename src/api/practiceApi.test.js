import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  answerPracticeStage, claimGuestPitch, createPracticePitch, fetchPracticeCatalog,
  fetchPracticePitch, putPracticeFavorites, PracticeRequestError,
} from './practiceApi.js';

function mockResponse(result, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => result };
}

test('scripture requests use same-origin cookies and send only the current stage', async () => {
  const calls = [];
  const fetchImpl = async (path, options) => {
    calls.push({ path, options });
    return mockResponse({ stage: 'chapter', chapterCorrect: true, nextStage: 'complete' });
  };
  await createPracticePitch({ scope: { volume: 'bom' }, exactVerse: false }, { fetchImpl });
  await answerPracticeStage('a'.repeat(43), { stage: 'chapter', chapter: 9 }, { fetchImpl });
  assert.equal(calls[0].path, '/api/practice/pitches');
  assert.equal(calls[1].options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(calls[1].options.body), { stage: 'chapter', chapter: 9 });
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(Object.hasOwn(JSON.parse(calls[1].options.body), 'reference'), false);
});

test('resume, catalog, favorites and guest-claim routes do not invent answers', async () => {
  const paths = [];
  const fetchImpl = async (path) => { paths.push(path); return mockResponse({ favorites: [] }); };
  await fetchPracticeCatalog({ fetchImpl });
  await fetchPracticePitch('a'.repeat(43), { fetchImpl });
  await claimGuestPitch('a'.repeat(43), { fetchImpl });
  await putPracticeFavorites(['bom:2-ne:9:1'], { fetchImpl });
  assert.deepEqual(paths, ['/api/practice/catalog', `/api/practice/pitches/${'a'.repeat(43)}`,
    `/api/practice/pitches/${'a'.repeat(43)}/claim`, '/api/practice/favorites']);
});

test('HTTP errors stay errors, never fall back to bundled sample questions', async () => {
  await assert.rejects(fetchPracticeCatalog({ fetchImpl: async () => mockResponse({ error: 'Corpus missing' }, 503) }),
    (error) => error instanceof PracticeRequestError && error.status === 503);
  await assert.rejects(fetchPracticeCatalog({ fetchImpl: async () => { throw new Error('offline'); } }),
    /Unable to reach/);
});
