import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { once } from 'node:events';
import { test } from 'node:test';
import { createMongoUserStore } from './mongoUserStore.js';
import { DuplicateEmailError } from './validation.js';
import { createApp, startServer } from '../index.js';
import { createInMemorySessionStore } from './sessionStore.js';

// An in-process stand-in for the MongoDB collection operations used by DB-02.
// Live Atlas and a process restart against a real database must be tested at
// release time; this fake exercises the adapter's contracts without secrets.
function fakeUsersDatabase() {
  const rows = new Map();
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
  return {
    rows, calls,
    collection(name) {
      assert.equal(name, 'users');
      return users;
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
