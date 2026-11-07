import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInMemoryUserStore } from './userStore.js';
import { createInMemorySessionStore } from './sessionStore.js';
import { SESSION_COOKIE_NAME } from './sessionCookies.js';
import {
  InvalidCredentialsError, authenticateUser, createSessionAuth, validateLogin,
} from './authentication.js';

const input = { email: '  READER@Example.COM ', password: ' secret with spaces ' };

function fixture() {
  const store = createInMemoryUserStore();
  const user = store.create({ displayName: 'Reader', email: 'reader@example.com', passwordHash: 'hash' });
  return { store, user };
}

test('login normalizes email but preserves password bytes', () => {
  assert.deepEqual(validateLogin(input), {
    email: 'reader@example.com', password: ' secret with spaces ',
  });
  for (const invalid of [null, undefined, [], 'bad', {},
    { email: 'not-an-email', password: 'pass' },
    { email: input.email, password: '' },
    { email: input.email, password: '🔒'.repeat(19) }]) {
    assert.throws(() => validateLogin(invalid), { status: 400 });
  }
});

test('login checks a stored hash and returns only safe public account fields', async () => {
  const { store, user } = fixture();
  let checked;
  const result = await authenticateUser(input, {
    store,
    verifyPassword: async (password, hash) => {
      checked = [password, hash];
      return true;
    },
  });
  assert.deepEqual(checked, [input.password, 'hash']);
  assert.deepEqual(result, {
    id: user.id, displayName: user.displayName, email: user.email, createdAt: user.createdAt,
  });
  assert.equal(JSON.stringify(result).includes('hash'), false);
});

test('unknown email and bad password share the same generic 401 error', async () => {
  const { store } = fixture();
  let checked = 0;
  for (const email of ['reader@example.com', 'missing@example.com']) {
    await assert.rejects(() => authenticateUser({ email, password: 'wrong' }, {
      store,
      verifyPassword: async () => { checked += 1; return false; },
    }), (error) => error instanceof InvalidCredentialsError &&
      error.status === 401 && error.message === 'Invalid email or password');
  }
  assert.equal(checked, 1); // No hash exists to verify for a missing account.
});

test('session auth protects endpoints and never exposes the internal user record', async () => {
  const { store, user } = fixture();
  const sessions = createInMemorySessionStore();
  const auth = createSessionAuth({ userStore: store, sessionStore: sessions });
  assert.equal(await auth.currentUser({ headers: {} }), null);

  const token = sessions.create(user.id);
  const req = { headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` } };
  assert.deepEqual(await auth.currentUser(req), {
    id: user.id, displayName: user.displayName, email: user.email, createdAt: user.createdAt,
  });
  let nextCalls = 0;
  await auth.requireUser(req, null, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  assert.deepEqual(req.authUser, await auth.currentUser(req));

  const response = {
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; },
  };
  await auth.requireUser({ headers: {} }, response, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  assert.equal(response.code, 401);
  assert.deepEqual(response.body, { error: 'Authentication required' });

  sessions.revoke(token);
  assert.equal(await auth.currentUser(req), null);
});
