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
  assert.equal(response.headers.get('set-cookie'), null); // Sessions arrive in commit 6.
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
