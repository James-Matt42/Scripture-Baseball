import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ScriptureRequestError,
  checkScriptureAnswer,
  fetchChallengeQuestions,
  fetchChallenges,
  fetchScriptureBooks,
  fetchScriptureQuestion,
  toPracticeAttempt,
  restoredStageRequest,
} from './scriptureApi.js';

function fakeFetch(payload, status = 200) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: status >= 200 && status < 300, status, json: async () => payload };
    },
  };
}

test('challenge lists use same-origin URLs and omit empty filters', async () => {
  const fake = fakeFetch([{ id: 'four-gospels' }]);
  assert.deepEqual(await fetchChallenges({ volume: 'new-testament', difficulty: '' }, fake), [{ id: 'four-gospels' }]);
  assert.equal(fake.calls[0].url, '/api/challenges?volume=new-testament');
  assert.equal(fake.calls[0].options.method, 'GET');
});

test('fetch challenge question prompts without adding an answer key', async () => {
  const fake = fakeFetch({ questions: [{ id: 'a', passage: 'Hello', choices: ['john', 'mark'] }] });
  const result = await fetchChallengeQuestions('four-gospels', { volume: 'new-testament' }, fake);
  assert.deepEqual(result.questions, [{ id: 'a', passage: 'Hello', choices: ['john', 'mark'] }]);
  assert.equal(fake.calls[0].url, '/api/challenges/four-gospels/questions?volume=new-testament');
});

test('book and single-question requests use safe relative URLs', async () => {
  const fake = fakeFetch([]);
  await fetchScriptureBooks(fake);
  await fetchScriptureQuestion('weird/id?value', fake);
  assert.deepEqual(fake.calls.map((call) => call.url), [
    '/api/scripture/books', '/api/scripture/questions/weird%2Fid%3Fvalue',
  ]);
});

test('answer submission uses JSON POST and forwards independent answer stages', async () => {
  const fake = fakeFetch({ questionId: 'john-3-16', bookCorrect: false, chapterCorrect: true });
  const answer = { stage: 'chapter', bookId: 'mark', chapter: 3, exactVerse: true };
  assert.equal((await checkScriptureAnswer('john-3-16', answer, fake)).chapterCorrect, true);
  assert.equal(fake.calls[0].url, '/api/scripture/questions/john-3-16/answer');
  assert.equal(fake.calls[0].options.method, 'POST');
  assert.equal(fake.calls[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(fake.calls[0].options.body), answer);
});

test('error responses expose useful JSON messages and status codes', async () => {
  const fake = fakeFetch({ error: 'Challenge not found' }, 404);
  await assert.rejects(fetchChallengeQuestions('bad-id', {}, fake), (error) => {
    assert.ok(error instanceof ScriptureRequestError);
    assert.equal(error.status, 404);
    assert.equal(error.message, 'Challenge not found');
    return true;
  });
});

test('invalid JSON responses fail explicitly instead of silently grading locally', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => { throw new Error('html'); } });
  await assert.rejects(fetchScriptureQuestion('john', { fetchImpl }), /invalid response/);
});

test('network failures provide retryable messages; aborts are not converted', async () => {
  const failed = async () => { throw new Error('offline'); };
  await assert.rejects(fetchChallenges({}, { fetchImpl: failed }), /Unable to reach/);
  const aborted = Object.assign(new Error('cancelled'), { name: 'AbortError' });
  const cancelled = async () => { throw aborted; };
  await assert.rejects(fetchChallenges({}, { fetchImpl: cancelled }), (error) => error === aborted);
});

test('local attempt projection preserves book/chapter independent server results', () => {
  assert.deepEqual(toPracticeAttempt({
    questionId: 'john-3-16', bookId: 'mark', chapter: 3,
    bookCorrect: false, chapterCorrect: true, correctReference: 'John 3:16',
  }), {
    questionId: 'john-3-16', bookId: 'mark', chapter: 3,
    bookCorrect: false, chapterCorrect: true,
  });
  assert.deepEqual(toPracticeAttempt({
    questionId: 'john-3-16', bookId: 'john', chapter: 4, verse: 16,
    bookCorrect: true, chapterCorrect: false, verseCorrect: true,
  }), {
    questionId: 'john-3-16', bookId: 'john', chapter: 4, verse: 16,
    bookCorrect: true, chapterCorrect: false, verseCorrect: true,
  });
});


test('restoration rechecks only already-committed stages, keeping exact verse hidden', () => {
  const values = { bookId: 'mark', chapter: 3, verse: 16, exactVerse: true };
  assert.deepEqual(restoredStageRequest('chapter', values), { stage: 'book', bookId: 'mark' });
  assert.deepEqual(restoredStageRequest('verse', values), {
    stage: 'chapter', bookId: 'mark', chapter: 3, exactVerse: true,
  });
  assert.deepEqual(restoredStageRequest('feedback', values), {
    stage: 'verse', bookId: 'mark', chapter: 3, verse: 16,
  });
  assert.deepEqual(restoredStageRequest('feedback', { ...values, exactVerse: false }), {
    stage: 'chapter', bookId: 'mark', chapter: 3, exactVerse: false,
  });
  assert.equal(restoredStageRequest('book', values), null);
});
