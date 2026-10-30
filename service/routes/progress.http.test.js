import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../index.js';

async function fixture(t) {
  const server = createApp().listen(0);
  t.after(() => new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve())));
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

const fields = (name) => ({
  displayName: name, email: `${name.toLowerCase()}@example.com`, password: 'Test-Only-Passphrase-123',
});

async function json(base, url, { method = 'GET', cookie, body } = {}) {
  return fetch(`${base}${url}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function createAccount(base, name) {
  const registration = await json(base, '/api/auth/register', { method: 'POST', body: fields(name) });
  assert.equal(registration.status, 201);
  const login = await json(base, '/api/auth/login', { method: 'POST', body: {
    email: fields(name).email, password: fields(name).password,
  } });
  assert.equal(login.status, 200);
  return login.headers.get('set-cookie').split(';')[0];
}

const guess = (overrides = {}) => ({
  id: 'guest-1:0', questionId: '2-nephi-2-25', bookId: 'alma', chapter: 2,
  challengeId: 'todays-lineup', bookCorrect: true, chapterCorrect: false,
  ...overrides,
});

test('account progress, preferences, favorites and imports require a real session', async (t) => {
  const base = await fixture(t);
  const cases = [
    ['/api/account/progress', 'GET'],
    ['/api/account/attempts', 'POST', guess()],
    ['/api/account/favorites', 'GET'],
    ['/api/account/favorites', 'PUT', { favorites: [] }],
    ['/api/account/preferences', 'GET'],
    ['/api/account/preferences', 'PATCH', { preferredVolume: 'book-of-mormon' }],
    ['/api/account/import', 'POST', { importId: 'one', attempts: [] }],
    ['/api/account/challenges/my-misses/questions', 'GET'],
  ];
  for (const [path, method, body] of cases) {
    const response = await json(base, path, { method, body });
    assert.equal(response.status, 401, `${method} ${path}`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { error: 'Authentication required' });
  }
});

test('HTTP attempts are regraded independently and idempotent per authenticated user', async (t) => {
  const base = await fixture(t);
  const cookie = await createAccount(base, 'Reader');
  const first = await json(base, '/api/account/attempts', { method: 'POST', cookie, body: guess() });
  assert.equal(first.status, 201);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  const saved = (await first.json()).attempt;
  assert.equal(saved.bookCorrect, false); // Ignores intentionally false client truth.
  assert.equal(saved.chapterCorrect, true);
  assert.equal(saved.source, 'server');
  assert.equal(saved.earnedPoints, undefined);

  const replay = await json(base, '/api/account/attempts', { method: 'POST', cookie, body: guess() });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).created, false);
  const conflict = await json(base, '/api/account/attempts', {
    method: 'POST', cookie, body: guess({ chapter: 3 }),
  });
  assert.equal(conflict.status, 409);

  const verse = await json(base, '/api/account/attempts', {
    method: 'POST', cookie, body: guess({ id: 'guest-1:1', verse: 25, bookId: '2-nephi' }),
  });
  assert.equal(verse.status, 201);
  const verseResult = (await verse.json()).attempt;
  assert.equal(verseResult.bookCorrect, true);
  assert.equal(verseResult.chapterCorrect, true);
  assert.equal(verseResult.verseCorrect, true);
  const progress = await json(base, '/api/account/progress', { cookie });
  assert.equal(progress.status, 200);
  const data = await progress.json();
  assert.equal(data.summary.totalAttempts, 2);
  assert.equal(data.summary.uniquePassages, 1);
  assert.equal(data.summary.chapterCorrect, 2);
  assert.equal(data.summary.verseAttempts, 1);
  assert.equal(data.attempts.length, 2);
});

test('HTTP API validates malformed guesses, settings and unknown passages', async (t) => {
  const base = await fixture(t);
  const cookie = await createAccount(base, 'Reader');
  const invalid = [
    ['/api/account/attempts', 'POST', guess({ questionId: '__unknown__' })],
    ['/api/account/attempts', 'POST', guess({ bookId: 'john' })],
    ['/api/account/attempts', 'POST', guess({ chapter: -1 })],
    ['/api/account/preferences', 'PATCH', { isAdmin: true }],
    ['/api/account/preferences', 'PATCH', { answerDifficulty: 'fake' }],
    ['/api/account/favorites', 'PUT', { favorites: ['unknown'] }],
    ['/api/account/import', 'POST', { importId: 'one', attempts: [guess({ id: '' })] }],
    ['/api/account/challenges/my-misses/questions?volume=unknown', 'GET'],
  ];
  for (const [path, method, body] of invalid) {
    const response = await json(base, path, { method, cookie, body });
    assert.equal(response.status, 400, `${method} ${path}`);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/u);
  }
  assert.equal((await json(base, '/api/account/challenges/not-a-pack/questions', { cookie })).status, 404);
  assert.equal((await (await json(base, '/api/account/progress', { cookie })).json()).summary.totalAttempts, 0);
});

test('HTTP preferences merge partial patches and favorites support replacement', async (t) => {
  const base = await fixture(t);
  const cookie = await createAccount(base, 'Reader');
  const initial = await json(base, '/api/account/preferences', { cookie });
  assert.deepEqual((await initial.json()).preferences, {
    answerDifficulty: 'book-chapter', preferredVolume: '',
    practiceReminders: false, gameNotifications: true,
  });
  const updated = await json(base, '/api/account/preferences', {
    method: 'PATCH', cookie, body: { preferredVolume: 'book-of-mormon', practiceReminders: true },
  });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).preferences.answerDifficulty, 'book-chapter');
  const f = await json(base, '/api/account/favorites', {
    method: 'PUT', cookie, body: { favorites: ['alma-32-21', 'alma-32-21', '2-nephi-2-25'] },
  });
  assert.deepEqual((await f.json()).favorites, ['alma-32-21', '2-nephi-2-25']);
  const replaced = await json(base, '/api/account/favorites', {
    method: 'PUT', cookie, body: { favorites: [] },
  });
  assert.deepEqual((await replaced.json()).favorites, []);
});

test('HTTP guest import deduplicates batches, rejects conflicts and exposes personal packs', async (t) => {
  const base = await fixture(t);
  const cookie = await createAccount(base, 'Reader');
  const before = await json(base, '/api/account/challenges/my-misses/questions', { cookie });
  assert.equal((await before.json()).total, 0);
  const importData = {
    importId: 'guest-october:1', attempts: [{ ...guess(), answeredAt: '2026-10-01T00:00:00.000Z' }],
    favorites: ['alma-32-21'], preferences: { answerDifficulty: 'exact-verse' },
  };
  const imported = await json(base, '/api/account/import', {
    method: 'POST', cookie, body: importData,
  });
  assert.equal(imported.status, 200);
  assert.equal((await imported.json()).importedCount, 1);
  const repeated = await json(base, '/api/account/import', {
    method: 'POST', cookie, body: importData,
  });
  assert.equal((await repeated.json()).replayed, true);
  assert.equal((await (await json(base, '/api/account/progress', { cookie })).json()).attempts.length, 1);
  const conflict = await json(base, '/api/account/import', {
    method: 'POST', cookie, body: { ...importData, favorites: ['2-nephi-2-25'] },
  });
  assert.equal(conflict.status, 409);
  const misses = await json(base, '/api/account/challenges/my-misses/questions', { cookie });
  const missData = await misses.json();
  assert.equal(missData.total, 1);
  assert.deepEqual(Object.keys(missData.questions[0]).sort(), ['choices', 'id', 'passage']);
  assert.equal(missData.questions[0].id, '2-nephi-2-25');
  const favorites = await json(base, '/api/account/challenges/my-favorites/questions', { cookie });
  assert.deepEqual((await favorites.json()).questions.map((q) => q.id), ['alma-32-21']);
});

test('account progress is isolated between two accounts, regardless of request body IDs', async (t) => {
  const base = await fixture(t);
  const a = await createAccount(base, 'Alice');
  const b = await createAccount(base, 'Bob');
  await json(base, '/api/account/attempts', {
    method: 'POST', cookie: a, body: { ...guess(), userId: 'bob', bookCorrect: true },
  });
  const aProgress = await json(base, '/api/account/progress', { cookie: a });
  const bProgress = await json(base, '/api/account/progress', { cookie: b });
  assert.equal((await aProgress.json()).summary.totalAttempts, 1);
  assert.equal((await bProgress.json()).summary.totalAttempts, 0);
  const bMisses = await json(base, '/api/account/challenges/my-misses/questions', { cookie: b });
  assert.equal((await bMisses.json()).total, 0);
});
