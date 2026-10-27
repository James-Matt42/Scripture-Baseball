import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../index.js';

async function withService(t) {
  const server = createApp().listen(0);
  t.after(() => new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve())));
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

test('HTTP catalog filters and playable deck do not return secret answer fields', async (t) => {
  const base = await withService(t);
  const catalog = await fetch(`${base}/api/challenges?volume=new-testament&category=volume`);
  assert.equal(catalog.status, 200);
  const challenges = await catalog.json();
  assert.ok(challenges.some((item) => item.id === 'four-gospels'));

  const response = await fetch(`${base}/api/challenges/four-gospels/questions`);
  assert.equal(response.status, 200);
  const deck = await response.json();
  assert.equal(deck.questions.length, 6);
  assert.deepEqual(Object.keys(deck.questions[0]).sort(), ['choices', 'id', 'passage']);
  assert.equal(Object.hasOwn(deck.challenge, 'questionIds'), false);
});

test('HTTP staged answers validate each dimension independently', async (t) => {
  const base = await withService(t);
  const url = `${base}/api/scripture/questions/2-nephi-2-25/answer`;
  const options = (body) => ({
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const book = await fetch(url, options({ stage: 'book', bookId: 'alma' }));
  assert.equal(book.status, 200);
  assert.equal((await book.json()).bookCorrect, false);
  const chapter = await fetch(url, options({ stage: 'chapter', bookId: 'alma', chapter: 2, exactVerse: true }));
  assert.equal(chapter.status, 200);
  const chapterResult = await chapter.json();
  assert.equal(chapterResult.chapterCorrect, true);
  assert.equal(Object.hasOwn(chapterResult, 'correctReference'), false);
  const verse = await fetch(url, options({ stage: 'verse', bookId: 'alma', chapter: 2, verse: 25 }));
  assert.equal(verse.status, 200);
  assert.equal((await verse.json()).correctReference, '2 Nephi 2:25');
});

test('HTTP errors use JSON status codes, never the React HTML shell', async (t) => {
  const base = await withService(t);
  const unknown = await fetch(`${base}/api/scripture/questions/not-a-verse`);
  assert.equal(unknown.status, 404);
  assert.match(unknown.headers.get('content-type') ?? '', /application\/json/);
  const bad = await fetch(`${base}/api/scripture/questions/2-nephi-2-25/answer`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stage: 'chapter', bookId: 'alma', chapter: -1 }),
  });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /chapter/);

  const invalidJson = await fetch(`${base}/api/scripture/questions/2-nephi-2-25/answer`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: '{invalid json',
  });
  assert.equal(invalidJson.status, 400);
  assert.match(invalidJson.headers.get('content-type') ?? '', /application\/json/);
  assert.match((await invalidJson.json()).error, /Invalid JSON/);
});
