import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../index.js';
import { createPracticeSessionEngine } from '../scripture/practiceSession.js';
import { fixtureCorpus, sharedVerse } from '../scripture/practiceFixtures.testSupport.js';

async function fixture(t) {
  const corpus = await fixtureCorpus(t);
  const engine = createPracticeSessionEngine({ corpus, random: () => 0 });
  const listener = createApp({ practiceEngine: engine }).listen(0);
  t.after(() => new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve())));
  await once(listener, 'listening');
  const base = `http://127.0.0.1:${listener.address().port}`;
  const request = (path, body, cookie) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  async function account(email) {
    const registration = { displayName: email.split('@')[0], email, password: 'Long-Example-Password-123' };
    assert.equal((await request('/api/auth/register', registration)).status, 201);
    const login = await request('/api/auth/login', registration);
    assert.equal(login.status, 200);
    return login.headers.get('set-cookie').split(';')[0];
  }
  return { base, account, request };
}

test('catalog lists actual books and real collections without placeholder challenge packs', async (t) => {
  const api = await fixture(t);
  const result = await fetch(`${api.base}/api/practice/catalog`);
  assert.equal(result.status, 200);
  const { collections, volumes } = await result.json();
  assert.deepEqual(collections.map((item) => item.id), ['all', 'misses', 'favorites', 'weak-areas']);
  assert.ok(volumes.find((v) => v.id === 'bom').books.some((book) => book.id === '2-ne'));
  assert.equal(await fetch(`${api.base}/api/challenges`).then((r) => r.status), 404);
});

test('guest favorites are selectable within scope, but never reveal the reference before grading', async (t) => {
  const api = await fixture(t);
  const created = await api.request('/api/practice/pitches', { collection: 'favorites',
    scope: { volume: 'bom', book: '2-ne' }, guestSelection: { favorites: ['bom:2-ne:9:1'] } });
  assert.equal(created.status, 201);
  const pitch = await created.json();
  assert.equal(pitch.collection, 'favorites');
  assert.equal(pitch.passage, sharedVerse);
  assert.equal(Object.hasOwn(pitch, 'reference'), false);
  assert.equal(Object.hasOwn(pitch, 'correctChapter'), false);
  const done = await api.request(`/api/practice/pitches/${pitch.pitchId}/answers`, { stage: 'chapter', chapter: 9 });
  assert.equal(done.status, 200);
  assert.equal((await done.json()).reference, 'bom:2-ne:9:1');
  // The same text also occurs in the Old Testament fixture. Personal scope
  // contains only the saved Book of Mormon reference, so it stays playable.
  const mixedFavorite = await api.request('/api/practice/pitches', { collection: 'favorites',
    guestSelection: { favorites: ['bom:2-ne:9:1'] } });
  assert.equal(mixedFavorite.status, 201);
  assert.equal((await mixedFavorite.json()).passage, sharedVerse);
  const absent = await api.request('/api/practice/pitches', { collection: 'favorites',
    scope: { volume: 'nt' }, guestSelection: { favorites: ['bom:2-ne:9:1'] } });
  assert.equal(absent.status, 422);
});

test('signed-in misses and weak areas derive from verified account history; other accounts cannot access them', async (t) => {
  const api = await fixture(t);
  const alice = await api.account('alice@example.com');
  const bob = await api.account('bob@example.com');
  const started = await api.request('/api/practice/pitches', { scope: { volume: 'bom', book: '2-ne' } }, alice);
  assert.equal(started.status, 201);
  const { pitchId } = await started.json();
  const saved = await api.request(`/api/practice/pitches/${pitchId}/answers`,
    { stage: 'chapter', chapter: 1 }, alice);
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).savedToAccount, true);
  const misses = await api.request('/api/practice/pitches', { collection: 'misses',
    scope: { volume: 'bom', book: '2-ne' } }, alice);
  assert.equal(misses.status, 201);
  assert.equal((await misses.json()).passage, sharedVerse);
  const weak = await api.request('/api/practice/pitches', { collection: 'weak-areas',
    scope: { volume: 'bom' } }, alice);
  assert.equal(weak.status, 201);
  assert.equal((await weak.json()).passage, sharedVerse);
  const bobMisses = await api.request('/api/practice/pitches', { collection: 'misses',
    scope: { volume: 'bom', book: '2-ne' } }, bob);
  assert.equal(bobMisses.status, 422);
  assert.equal((await api.request('/api/practice/pitches', { collection: 'misses',
    scope: { volume: 'bom', book: '2-ne' }, guestSelection: { attempts: [
      { reference: 'bom:2-ne:9:1', chapterCorrect: false },
    ] } }, bob)).status, 400);
});

test('a saved account favorite appears in personal practice and not another user account', async (t) => {
  const api = await fixture(t);
  const alice = await api.account('alice@example.com');
  const bob = await api.account('bob@example.com');
  const saved = await fetch(`${api.base}/api/practice/favorites`, { method: 'PUT',
    headers: { cookie: alice, 'content-type': 'application/json' },
    body: JSON.stringify({ favorites: ['bom:2-ne:9:1'] }) });
  assert.equal(saved.status, 200);
  const pitch = await api.request('/api/practice/pitches', { collection: 'favorites',
    scope: { volume: 'bom', book: '2-ne' } }, alice);
  assert.equal(pitch.status, 201);
  assert.equal((await pitch.json()).passage, sharedVerse);
  assert.equal((await api.request('/api/practice/pitches', { collection: 'favorites',
    scope: { volume: 'bom', book: '2-ne' } }, bob)).status, 422);
  assert.equal((await api.request('/api/practice/pitches', { collection: 'doctrinal-mastery' }, alice)).status, 400);
});
