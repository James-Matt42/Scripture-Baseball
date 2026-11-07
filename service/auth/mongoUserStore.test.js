import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { once } from 'node:events';
import { test } from 'node:test';
import { createMongoUserStore } from './mongoUserStore.js';
import { DuplicateEmailError } from './validation.js';
import { createApp, startServer } from '../index.js';
import { createInMemorySessionStore } from './sessionStore.js';
import { fakeMongoProgressDatabase } from '../progress/fakeMongoProgressDatabase.testSupport.js';

// An in-process stand-in for the MongoDB collection operations used by DB-02.
// Live Atlas and a process restart against a real database must be tested at
// release time; this fake exercises the adapter's contracts without secrets.
function fakeUsersDatabase() {
  const rows = new Map();
  const sessionRows = new Map();
  const progressDb = fakeMongoProgressDatabase();
  const attemptRows = progressDb.attemptRows;
  const calls = [];
  const users = {
    async findOne(query, { projection }) {
      calls.push(['findOne', query, projection]);
      const row = query._id ? rows.get(query._id) :
        [...rows.values()].find((item) => item.email === query.email);
      if (!row) return null;
      const copy = { ...row };
      delete copy._id;
      return copy;
    },
    async insertOne(document) {
      calls.push(['insertOne', document]);
      if ([...rows.values()].some((item) => item.email === document.email)) {
        const error = new Error('E11000 duplicate key error');
        error.code = 11000;
        error.keyPattern = { email: 1 };
        throw error;
      }
      rows.set(document._id, { ...document });
      return { insertedId: document._id };
    },
  };
  const sessions = {
    async insertOne(document) {
      assert.ok(document.expiresAt instanceof Date);
      sessionRows.set(document.tokenDigest, { ...document });
      return { acknowledged: true };
    },
    async findOne(filter) {
      const session = sessionRows.get(filter.tokenDigest);
      return session && session.expiresAt > filter.expiresAt.$gt ? { ...session } : null;
    },
    async deleteOne(filter) {
      return { deletedCount: sessionRows.delete(filter.tokenDigest) ? 1 : 0 };
    },
  };
  return {
    rows, sessionRows, attemptRows, calls, client: progressDb.client,
    collection(name) {
      if (name === 'users') return users;
      if (name === 'sessions') return sessions;
      return progressDb.collection(name);
    },
  };
}

const account = {
  displayName: 'Reader',
  email: ' READER@EXAMPLE.COM ',
  password: 'a-long-test-password',
};

async function request(baseUrl, path, { method = 'GET', body, cookie } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { response, body: response.status === 204 ? null : await response.json() };
}

async function startWithDb(t, database) {
  const mongo = { async connect() { return database; }, async close() {} };
  const { server } = await startServer({ port: 0, mongo });
  t.after(() => server.listening ? new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve())) : undefined);
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

test('Mongo user store writes normalized accounts and looks up by email and stable ID', async () => {
  const database = fakeUsersDatabase();
  const store = createMongoUserStore(database);
  assert.equal(await store.findByEmail('missing@example.com'), null);
  const saved = await store.create({
    displayName: 'Reader', email: ' READER@EXAMPLE.COM ', passwordHash: 'bcrypt-hash',
  });
  assert.match(saved.id, /^[\da-f-]{36}$/u);
  assert.equal(saved.email, 'reader@example.com');
  assert.match(saved.createdAt, /^\d{4}-\d\d-\d\dT/u);
  assert.deepEqual(database.rows.get(saved.id), { _id: saved.id, ...saved });
  assert.deepEqual(await store.findByEmail('reader@example.com'), saved);
  assert.deepEqual(await store.findById(saved.id), saved);
  assert.equal(await store.findById('not-found'), null);
  assert.deepEqual(database.calls[0][2], {
    _id: 0, id: 1, displayName: 1, email: 1, passwordHash: 1, createdAt: 1,
  });
  const mutated = await store.findById(saved.id);
  mutated.displayName = 'Changed';
  assert.equal((await store.findById(saved.id)).displayName, 'Reader');
});

test('Mongo user store converts duplicate email insert errors to HTTP conflict', async () => {
  const store = createMongoUserStore(fakeUsersDatabase());
  await store.create({ displayName: 'First', email: 'same@example.com', passwordHash: 'hash' });
  await assert.rejects(store.create({
    displayName: 'Second', email: ' SAME@EXAMPLE.COM ', passwordHash: 'hash',
  }), (error) => error instanceof DuplicateEmailError && error.status === 409);
});

test('Mongo user store does not disguise non-email database failures as conflicts', async () => {
  const database = fakeUsersDatabase();
  const store = createMongoUserStore(database);
  const broken = new Error('Database unavailable');
  database.collection('users').insertOne = async () => { throw broken; };
  await assert.rejects(store.create({
    displayName: 'Reader', email: 'reader@example.com', passwordHash: 'hash',
  }), (error) => error === broken);
});

test('database-backed HTTP accounts support login after restarting the service', async (t) => {
  const database = fakeUsersDatabase();
  const first = await startWithDb(t, database);
  const registration = await request(first.baseUrl, '/api/auth/register', { method: 'POST', body: account });
  assert.equal(registration.response.status, 201);
  assert.equal(registration.body.user.email, 'reader@example.com');
  assert.deepEqual(Object.keys(registration.body.user).sort(), ['createdAt', 'displayName', 'email', 'id']);
  assert.ok(!JSON.stringify(registration.body).includes('password'));
  const stored = database.rows.get(registration.body.user.id);
  assert.match(stored.passwordHash, /^\$2[aby]\$12\$/u);
  assert.equal(await bcrypt.compare(account.password, stored.passwordHash), true);

  // A new HTTP server creates a different userStore, but Mongo retains the user.
  await new Promise((resolve) => first.server.close(resolve));
  const second = await startWithDb(t, database);
  const login = await request(second.baseUrl, '/api/auth/login', { method: 'POST', body: account });
  assert.equal(login.response.status, 200);
  assert.deepEqual(login.body.user, registration.body.user);
  const cookie = login.response.headers.get('set-cookie')?.split(';')[0];
  assert.match(cookie, /^sb_session=/u);
  const me = await request(second.baseUrl, '/api/account/me', { cookie });
  assert.equal(me.response.status, 200);
  assert.deepEqual(me.body, { user: registration.body.user });
});

test('concurrent registrations share the database unique-email guard', async (t) => {
  const database = fakeUsersDatabase();
  const first = await startWithDb(t, database);
  const second = await startWithDb(t, database);
  const registrations = await Promise.all([first, second].map(({ baseUrl }) =>
    request(baseUrl, '/api/auth/register', { method: 'POST', body: account })));
  assert.deepEqual(registrations.map(({ response }) => response.status).sort(), [201, 409]);
  assert.equal(database.rows.size, 1);
  assert.ok(registrations.some(({ body }) => body.error === 'An account with this email already exists'));
});

test('user-store errors return generic JSON failures instead of leaked internals', async (t) => {
  const database = fakeUsersDatabase();
  const users = database.collection('users');
  users.findOne = async () => { throw new Error('private-db: secret password'); };
  const { baseUrl } = await startWithDb(t, database);
  for (const [path, method, body] of [
    ['/api/auth/register', 'POST', account],
    ['/api/auth/login', 'POST', account],
  ]) {
    const result = await request(baseUrl, path, { method, body });
    assert.equal(result.response.status, 500);
    assert.deepEqual(result.body, { error: 'Internal service error' });
  }
});

test('async identity lookups protect account endpoints and propagate failures safely', async (t) => {
  const sessions = createInMemorySessionStore();
  const token = sessions.create('user-id');
  const userStore = {
    async findById() { throw new Error('private-db: secret password'); },
  };
  const server = createApp({ userStore, sessionStore: sessions }).listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const cookie = `sb_session=${token}`;
  for (const path of ['/api/auth/session', '/api/account/me', '/api/account/progress']) {
    const result = await request(baseUrl, path, { cookie });
    assert.equal(result.response.status, 500);
    assert.deepEqual(result.body, { error: 'Internal service error' });
  }
});


test('Mongo-backed HTTP sessions survive a server restart and logout revokes them', async (t) => {
  const database = fakeUsersDatabase();
  const first = await startWithDb(t, database);
  await request(first.baseUrl, '/api/auth/register', { method: 'POST', body: account });
  const login = await request(first.baseUrl, '/api/auth/login', { method: 'POST', body: account });
  const cookie = login.response.headers.get('set-cookie')?.split(';')[0];
  assert.equal(login.response.status, 200);
  assert.match(cookie, /^sb_session=/u);
  assert.equal(database.sessionRows.size, 1);
  const onlySession = [...database.sessionRows.values()][0];
  assert.ok(!JSON.stringify(onlySession).includes(cookie.split('=')[1]));

  await new Promise((resolve) => first.server.close(resolve));
  // startServer creates fresh store adapters for the second app instance.
  const second = await startWithDb(t, database);
  const restored = await request(second.baseUrl, '/api/auth/session', { cookie });
  assert.equal(restored.response.status, 200);
  assert.deepEqual(restored.body, { user: login.body.user });
  assert.equal((await request(second.baseUrl, '/api/account/me', { cookie })).response.status, 200);

  const rotation = await request(second.baseUrl, '/api/auth/login', {
    method: 'POST', body: account, cookie,
  });
  assert.equal(rotation.response.status, 200);
  const newCookie = rotation.response.headers.get('set-cookie')?.split(';')[0];
  assert.notEqual(newCookie, cookie);
  assert.equal(database.sessionRows.size, 1);
  assert.equal((await request(second.baseUrl, '/api/account/me', { cookie })).response.status, 401);
  assert.equal((await request(second.baseUrl, '/api/account/me', { cookie: newCookie })).response.status, 200);

  const logout = await request(second.baseUrl, '/api/auth/logout', {
    method: 'POST', cookie: newCookie,
  });
  assert.equal(logout.response.status, 204);
  assert.equal(database.sessionRows.size, 0);
  assert.equal((await request(second.baseUrl, '/api/account/me', { cookie: newCookie })).response.status, 401);
});

test('HTTP authorization fails closed on session database errors', async (t) => {
  const database = fakeUsersDatabase();
  const { baseUrl } = await startWithDb(t, database);
  await request(baseUrl, '/api/auth/register', { method: 'POST', body: account });
  const login = await request(baseUrl, '/api/auth/login', { method: 'POST', body: account });
  const cookie = login.response.headers.get('set-cookie')?.split(';')[0];
  assert.equal(login.response.status, 200);

  database.collection('sessions').findOne = async () => {
    throw new Error('private-db-host: secret credentials');
  };
  for (const path of ['/api/auth/session', '/api/account/me', '/api/account/progress']) {
    const result = await request(baseUrl, path, { cookie });
    assert.equal(result.response.status, 500);
    assert.deepEqual(result.body, { error: 'Internal service error' });
  }
});


test('Mongo-backed HTTP practice history and personalized misses survive service restart', async (t) => {
  const database = fakeUsersDatabase();
  const first = await startWithDb(t, database);
  const registration = await request(first.baseUrl, '/api/auth/register', {
    method: 'POST', body: account,
  });
  assert.equal(registration.response.status, 201);
  const login = await request(first.baseUrl, '/api/auth/login', { method: 'POST', body: account });
  const cookie = login.response.headers.get('set-cookie')?.split(';')[0];
  const guess = {
    id: 'client-stable:1', questionId: '2-nephi-2-25',
    bookId: 'alma', chapter: 2, challengeId: 'todays-lineup',
    userId: 'forged-account-id', bookCorrect: true,
  };
  const created = await request(first.baseUrl, '/api/account/attempts', {
    method: 'POST', cookie, body: guess,
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.attempt.bookCorrect, false);
  assert.equal(database.attemptRows.size, 1);
  assert.equal([...database.attemptRows.values()][0].userId, registration.body.user.id);

  await new Promise((resolve) => first.server.close(resolve));
  const second = await startWithDb(t, database);
  const progress = await request(second.baseUrl, '/api/account/progress', { cookie });
  assert.equal(progress.response.status, 200);
  assert.equal(progress.body.summary.totalAttempts, 1);
  assert.equal(progress.body.summary.bookCorrect, 0);
  assert.equal(progress.body.summary.chapterCorrect, 1);
  assert.equal(progress.body.attempts[0].userId, undefined);
  assert.equal(progress.body.attempts[0]._id, undefined);

  const replay = await request(second.baseUrl, '/api/account/attempts', {
    method: 'POST', cookie, body: guess,
  });
  assert.equal(replay.response.status, 200);
  assert.equal(replay.body.created, false);
  const conflict = await request(second.baseUrl, '/api/account/attempts', {
    method: 'POST', cookie, body: { ...guess, chapter: 3 },
  });
  assert.equal(conflict.response.status, 409);
  const misses = await request(second.baseUrl, '/api/account/challenges/my-misses/questions', { cookie });
  assert.equal(misses.response.status, 200);
  assert.equal(misses.body.total, 1);

  const another = { ...account, email: 'another@example.com', displayName: 'Another' };
  await request(second.baseUrl, '/api/auth/register', { method: 'POST', body: another });
  const otherLogin = await request(second.baseUrl, '/api/auth/login', { method: 'POST', body: another });
  const otherCookie = otherLogin.response.headers.get('set-cookie')?.split(';')[0];
  const other = await request(second.baseUrl, '/api/account/progress', { cookie: otherCookie });
  assert.equal(other.body.summary.totalAttempts, 0);
});

test('Mongo-backed HTTP guest imports, preferences and favorites survive service restart', async (t) => {
  const database = fakeUsersDatabase();
  const first = await startWithDb(t, database);
  await request(first.baseUrl, '/api/auth/register', { method: 'POST', body: account });
  const login = await request(first.baseUrl, '/api/auth/login', { method: 'POST', body: account });
  const cookie = login.response.headers.get('set-cookie')?.split(';')[0];
  const imported = await request(first.baseUrl, '/api/account/import', { method: 'POST', cookie, body: {
    importId: 'guest:2026',
    attempts: [{ id: 'guest:1', questionId: '2-nephi-2-25', bookId: 'alma', chapter: 2,
      challengeId: 'todays-lineup', answeredAt: '2026-10-01T00:00:00.000Z' }],
    favorites: ['alma-32-21'], preferences: { answerDifficulty: 'exact-verse' },
  } });
  assert.equal(imported.response.status, 200);
  assert.equal(imported.body.importedCount, 1);
  await new Promise((resolve) => first.server.close(resolve));
  const second = await startWithDb(t, database);
  const progress = await request(second.baseUrl, '/api/account/progress', { cookie });
  assert.equal(progress.response.status, 200);
  assert.equal(progress.body.attempts.length, 1);
  assert.equal(progress.body.attempts[0].source, 'guest-import');
  assert.equal(progress.body.attempts[0].bookCorrect, false);
  const storedFavorites = await request(second.baseUrl, '/api/account/favorites', { cookie });
  assert.deepEqual(storedFavorites.body.favorites, ['alma-32-21']);
  const storedPreferences = await request(second.baseUrl, '/api/account/preferences', { cookie });
  assert.equal(storedPreferences.body.preferences.answerDifficulty, 'exact-verse');
  const sameImport = await request(second.baseUrl, '/api/account/import', {
    method: 'POST', cookie, body: {
      importId: 'guest:2026',
      attempts: [{ id: 'guest:1', questionId: '2-nephi-2-25', bookId: 'alma', chapter: 2,
        challengeId: 'todays-lineup', answeredAt: '2026-10-01T00:00:00.000Z' }],
      favorites: ['alma-32-21'], preferences: { answerDifficulty: 'exact-verse' },
    },
  });
  assert.equal(sameImport.response.status, 200);
  assert.equal(sameImport.body.replayed, true);
  assert.equal(sameImport.body.importedCount, 1);
});

test('Mongo attempt query errors remain generic JSON failures over HTTP', async (t) => {
  const database = fakeUsersDatabase();
  const { baseUrl } = await startWithDb(t, database);
  await request(baseUrl, '/api/auth/register', { method: 'POST', body: account });
  const login = await request(baseUrl, '/api/auth/login', { method: 'POST', body: account });
  const cookie = login.response.headers.get('set-cookie')?.split(';')[0];
  database.collection('attempts').findOne = async () => {
    throw new Error('private-db: credentials');
  };
  const failure = await request(baseUrl, '/api/account/attempts', {
    method: 'POST', cookie, body: {
      id: 'first', questionId: '2-nephi-2-25', bookId: 'alma', chapter: 2,
      challengeId: null,
    },
  });
  assert.equal(failure.response.status, 500);
  assert.deepEqual(failure.body, { error: 'Internal service error' });
  assert.equal(JSON.stringify(failure.body).includes('private-db'), false);
});

test('Mongo-backed HTTP favorites and preferences survive restart and reject cross-account leakage', async (t) => {
  const database = fakeUsersDatabase();
  const first = await startWithDb(t, database);
  await request(first.baseUrl, '/api/auth/register', { method: 'POST', body: account });
  const login = await request(first.baseUrl, '/api/auth/login', { method: 'POST', body: account });
  const readerCookie = login.response.headers.get('set-cookie')?.split(';')[0];
  const replace = await request(first.baseUrl, '/api/account/favorites', {
    method: 'PUT', cookie: readerCookie, body: { favorites: ['alma-32-21', '2-nephi-2-25'] },
  });
  assert.equal(replace.response.status, 200);
  assert.deepEqual(replace.body.favorites, ['alma-32-21', '2-nephi-2-25']);
  const update = await request(first.baseUrl, '/api/account/preferences', {
    method: 'PATCH', cookie: readerCookie,
    body: { preferredVolume: 'new-testament', gameNotifications: false },
  });
  assert.equal(update.response.status, 200);
  assert.equal(update.body.preferences.preferredVolume, 'new-testament');

  await new Promise((resolve) => first.server.close(resolve));
  const second = await startWithDb(t, database);
  const savedFavorites = await request(second.baseUrl, '/api/account/favorites', { cookie: readerCookie });
  assert.deepEqual(savedFavorites.body.favorites, ['alma-32-21', '2-nephi-2-25']);
  const savedPreferences = await request(second.baseUrl, '/api/account/preferences', { cookie: readerCookie });
  assert.equal(savedPreferences.body.preferences.preferredVolume, 'new-testament');
  assert.equal(savedPreferences.body.preferences.gameNotifications, false);

  const otherAccount = { ...account, email: 'other-reader@example.com' };
  await request(second.baseUrl, '/api/auth/register', { method: 'POST', body: otherAccount });
  const otherLogin = await request(second.baseUrl, '/api/auth/login', {
    method: 'POST', body: otherAccount,
  });
  const otherCookie = otherLogin.response.headers.get('set-cookie')?.split(';')[0];
  assert.deepEqual((await request(second.baseUrl, '/api/account/favorites', { cookie: otherCookie })).body,
    { favorites: [] });
  assert.equal((await request(second.baseUrl, '/api/account/preferences', { cookie: otherCookie }))
    .body.preferences.preferredVolume, '');
});
