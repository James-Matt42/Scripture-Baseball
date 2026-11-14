import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../index.js';
import { createPracticeSessionEngine } from '../scripture/practiceSession.js';
import { fixtureCorpus, sharedVerse } from '../scripture/practiceFixtures.testSupport.js';

async function start(t, corpus = null) {
  let sequence = 0;
  const practiceEngine = corpus ? createPracticeSessionEngine({ corpus, random: () => 0,
    tokenGenerator: () => `${String(++sequence).padStart(32, '0')}opaque_http_token` }) : null;
  const server = createApp({ practiceEngine }).listen(0);
  t.after(() => new Promise((resolve, reject) =>
    server.close((err) => err ? reject(err) : resolve())));
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

const json = (url, body) => fetch(url, { method: 'POST',
  headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('corpus-backed endpoints return a clear 503 without a configured SQLite database', async (t) => {
  const base = await start(t);
  const response = await json(`${base}/api/practice/pitches`, {});
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Scripture corpus is not configured' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('HTTP practice issues only opaque pitch tokens and grades the full staged flow', async (t) => {
  const base = await start(t, await fixtureCorpus(t));
  const catalog = await fetch(`${base}/api/practice/catalog`);
  assert.equal(catalog.status, 200);
  const catalogBody = await catalog.json();
  assert.ok(catalogBody.volumes.find((item) => item.id === 'bom')?.books.some((b) => b.id === '2-ne'));
  assert.ok(!catalogBody.volumes.find((item) => item.id === 'dc')?.books.some((b) => b.id === 'od'));

  const created = await json(`${base}/api/practice/pitches`, {
    scope: { volume: 'bom', book: '2-ne' }, exactVerse: true,
  });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('cache-control'), 'no-store');
  const pitch = await created.json();
  assert.equal(pitch.stage, 'chapter');
  assert.equal(pitch.passage, sharedVerse);
  assert.equal(Object.hasOwn(pitch, 'reference'), false);
  assert.equal(Object.hasOwn(pitch, 'correctChapter'), false);

  const resume = await fetch(`${base}/api/practice/pitches/${pitch.pitchId}`);
  assert.equal(resume.status, 200);
  assert.equal((await resume.json()).stage, 'chapter');
  const badOrder = await json(`${base}/api/practice/pitches/${pitch.pitchId}/answers`, { stage: 'verse', verse: 1 });
  assert.equal(badOrder.status, 409);
  const chapter = await json(`${base}/api/practice/pitches/${pitch.pitchId}/answers`, { stage: 'chapter', chapter: 9 });
  assert.equal(chapter.status, 200);
  const response = await chapter.json();
  assert.equal(response.chapterCorrect, true);
  assert.equal(Object.hasOwn(response, 'correctReference'), false);
  const verse = await json(`${base}/api/practice/pitches/${pitch.pitchId}/answers`, { stage: 'verse', verse: 1 });
  assert.equal(verse.status, 200);
  const final = await verse.json();
  assert.equal(final.verseCorrect, true);
  assert.equal(final.reference, 'bom:2-ne:9:1');
  assert.equal(final.correctReference, '2 Nephi 9:1');
  assert.equal((await (await fetch(`${base}/api/practice/pitches/${pitch.pitchId}`)).json()).stage, 'complete');
});

test('HTTP validation forbids forged book choices and untrusted answer fields', async (t) => {
  const base = await start(t, await fixtureCorpus(t));
  const invalid = await json(`${base}/api/practice/pitches`, { scope: { volume: 'nt', book: '2-ne' } });
  assert.equal(invalid.status, 400);
  const created = await json(`${base}/api/practice/pitches`, { scope: { volume: 'bom' } });
  const { pitchId, choices } = await created.json();
  assert.ok(choices.length >= 2);
  const bad = await json(`${base}/api/practice/pitches/${pitchId}/answers`, {
    stage: 'book', bookId: 'not-a-book',
  });
  assert.equal(bad.status, 400);
  const forged = await json(`${base}/api/practice/pitches/${pitchId}/answers`, {
    stage: 'book', bookId: choices[0].id, bookCorrect: true,
  });
  assert.equal(forged.status, 400);
  const valid = await json(`${base}/api/practice/pitches/${pitchId}/answers`, {
    stage: 'book', bookId: choices[0].id,
  });
  assert.equal(valid.status, 200);
  const absent = await fetch(`${base}/api/practice/pitches/not-a-pitch`);
  assert.equal(absent.status, 404);
  const wrongShape = await json(`${base}/api/practice/pitches`, { scope: ['bom'] });
  assert.equal(wrongShape.status, 400);
});


test('favorites updates return 503 instead of a 500 when the corpus is absent', async (t) => {
  const base = await start(t);
  const fields = { displayName: 'Reader', email: 'reader@example.com', password: 'Long-Example-Password-123' };
  assert.equal((await json(`${base}/api/auth/register`, fields)).status, 201);
  const loggedIn = await json(`${base}/api/auth/login`, fields);
  const cookie = loggedIn.headers.get('set-cookie').split(';')[0];
  const response = await fetch(`${base}/api/practice/favorites`, {
    method: 'PUT', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ favorites: ['bom:2-ne:9:1'] }),
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Scripture corpus is not configured' });
});
