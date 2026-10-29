import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { once } from 'node:events';
import { test } from 'node:test';
import { createInMemoryUserStore } from '../auth/userStore.js';
import { createApp } from '../index.js';

async function withService(t, userStore = createInMemoryUserStore()) {
  const server = createApp({ userStore }).listen(0);
  t.after(() => new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve())));
  await once(server, 'listening');
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, userStore };
}

const requestRegistration = (baseUrl, fields) => fetch(`${baseUrl}/api/auth/register`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(fields),
});

const validUser = {
  displayName: 'Reader',
  email: ' READER@EXAMPLE.COM ',
  password: 'example-secret-passphrase',
};

test('HTTP registration creates a BCrypt-hashed account and returns no credentials', async (t) => {
  const { baseUrl, userStore } = await withService(t);
  const response = await requestRegistration(baseUrl, validUser);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['user']);
  assert.deepEqual(Object.keys(body.user).sort(), ['createdAt', 'displayName', 'email', 'id']);
  assert.equal(body.user.email, 'reader@example.com');
  assert.equal(response.headers.get('set-cookie'), null); // Registration does not auto-login.
  assert.ok(!JSON.stringify(body).includes('example-secret-passphrase'));

  const record = userStore.findByEmail('reader@example.com');
  assert.equal(record.email, body.user.email);
  assert.equal(Object.hasOwn(record, 'password'), false);
  assert.notEqual(record.passwordHash, validUser.password);
  assert.match(record.passwordHash, /^\$2[aby]\$12\$/u);
  assert.equal(bcrypt.getRounds(record.passwordHash), 12);
  assert.equal(await bcrypt.compare(validUser.password, record.passwordHash), true);
  assert.equal(await bcrypt.compare('wrong-password', record.passwordHash), false);
});

test('HTTP registration validates inputs and rejects duplicate normalized emails', async (t) => {
  const { baseUrl } = await withService(t);
  const invalid = await requestRegistration(baseUrl, { ...validUser, password: 'short' });
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error, /password/i);

  const first = await requestRegistration(baseUrl, validUser);
  assert.equal(first.status, 201);
  const duplicate = await requestRegistration(baseUrl, { ...validUser, email: 'reader@example.com' });
  assert.equal(duplicate.status, 409);
  assert.deepEqual(await duplicate.json(), { error: 'An account with this email already exists' });

  const malformed = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{',
  });
  assert.equal(malformed.status, 400);
  assert.match(malformed.headers.get('content-type') ?? '', /application\/json/);
});

function requestLogin(baseUrl, fields = validUser, cookie) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(fields),
  });
}

function cookiePair(response) {
  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie, 'expected a server-set session cookie');
  return setCookie.split(';')[0];
}

test('HTTP login provides HttpOnly cookie, restored session and protected account', async (t) => {
  const { baseUrl } = await withService(t);
  await requestRegistration(baseUrl, validUser);

  const unauthorized = await fetch(`${baseUrl}/api/account/me`);
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(await unauthorized.json(), { error: 'Authentication required' });
  assert.equal(unauthorized.headers.get('cache-control'), 'no-store');

  const beforeLogin = await fetch(`${baseUrl}/api/auth/session`);
  assert.equal(beforeLogin.status, 200);
  assert.deepEqual(await beforeLogin.json(), { user: null });

  const response = await requestLogin(baseUrl, validUser);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const user = (await response.json()).user;
  assert.deepEqual(Object.keys(user).sort(), ['createdAt', 'displayName', 'email', 'id']);
  assert.equal(user.email, 'reader@example.com');
  const setCookie = response.headers.get('set-cookie');
  assert.match(setCookie, /^sb_session=[A-Za-z0-9_-]{43};/u);
  assert.match(setCookie, /HttpOnly/iu);
  assert.match(setCookie, /SameSite=Lax/iu);
  assert.match(setCookie, /Max-Age=604800/iu);
  assert.match(setCookie, /Path=\//iu);
  assert.doesNotMatch(setCookie, /Secure/iu); // Local HTTP development only.
  assert.doesNotMatch(JSON.stringify(user), /password|hash|session|token/iu);

  const cookie = cookiePair(response);
  const session = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie } });
  assert.equal(session.status, 200);
  assert.deepEqual(await session.json(), { user });

  const account = await fetch(`${baseUrl}/api/account/me`, { headers: { cookie } });
  assert.equal(account.status, 200);
  assert.equal(account.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await account.json(), { user });

  const forged = await fetch(`${baseUrl}/api/account/me`, {
    headers: { cookie: 'sb_session=not-a-valid-token' },
  });
  assert.equal(forged.status, 401);
});

test('HTTP login uses generic errors for absent users and wrong passwords', async (t) => {
  const { baseUrl } = await withService(t);
  await requestRegistration(baseUrl, validUser);
  const errors = [];
  for (const fields of [
    { ...validUser, email: 'notfound@example.com' },
    { ...validUser, password: 'wrong-password' },
  ]) {
    const response = await requestLogin(baseUrl, fields);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    errors.push(await response.json());
  }
  assert.deepEqual(errors, [
    { error: 'Invalid email or password' },
    { error: 'Invalid email or password' },
  ]);

  const badBody = await requestLogin(baseUrl, { email: validUser.email, password: '' });
  assert.equal(badBody.status, 400);
  assert.equal(badBody.headers.get('set-cookie'), null);
});

test('HTTP login rotates old browser sessions; logout revokes tokens and clears cookie', async (t) => {
  const { baseUrl } = await withService(t);
  await requestRegistration(baseUrl, validUser);
  const first = cookiePair(await requestLogin(baseUrl));
  const secondResponse = await requestLogin(baseUrl, validUser, first);
  assert.equal(secondResponse.status, 200);
  const second = cookiePair(secondResponse);
  assert.notEqual(first, second);
  assert.equal((await fetch(`${baseUrl}/api/account/me`, { headers: { cookie: first } })).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/account/me`, { headers: { cookie: second } })).status, 200);

  const logout = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST', headers: { cookie: second },
  });
  assert.equal(logout.status, 204);
  assert.equal(logout.headers.get('cache-control'), 'no-store');
  assert.match(logout.headers.get('set-cookie'), /sb_session=;/u);
  assert.match(logout.headers.get('set-cookie'), /HttpOnly/iu);
  assert.match(logout.headers.get('set-cookie'), /SameSite=Lax/iu);
  assert.equal((await fetch(`${baseUrl}/api/account/me`, { headers: { cookie: second } })).status, 401);
  assert.deepEqual(await (await fetch(`${baseUrl}/api/auth/session`, {
    headers: { cookie: second },
  })).json(), { user: null });
  assert.equal((await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' })).status, 204);
});

test('HTTPS production mode marks session and logout cookies Secure', async (t) => {
  const userStore = createInMemoryUserStore();
  const server = createApp({ userStore, secureCookies: true }).listen(0);
  t.after(() => new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve())));
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  await requestRegistration(baseUrl, validUser);
  const login = await requestLogin(baseUrl);
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie'), /; Secure(?:;|$)/iu);
  const logout = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST', headers: { cookie: cookiePair(login) },
  });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie'), /; Secure(?:;|$)/iu);
});

test('expired sessions lose access to the HTTP account endpoint', async (t) => {
  let now = 10_000;
  const { createInMemorySessionStore, SESSION_TTL_MS } = await import('../auth/sessionStore.js');
  const sessionStore = createInMemorySessionStore({ now: () => now });
  const server = createApp({ sessionStore }).listen(0);
  t.after(() => new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve())));
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  await requestRegistration(baseUrl, validUser);
  const cookie = cookiePair(await requestLogin(baseUrl));
  now += SESSION_TTL_MS;
  assert.equal((await fetch(`${baseUrl}/api/account/me`, { headers: { cookie } })).status, 401);
});
