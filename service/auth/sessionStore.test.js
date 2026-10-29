import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInMemorySessionStore, SESSION_TTL_MS } from './sessionStore.js';

test('sessions are random 256-bit bearer tokens, not reusable across stores', () => {
  const sessions = createInMemorySessionStore();
  const first = sessions.create('user-1');
  const second = sessions.create('user-1');
  assert.match(first, /^[A-Za-z0-9_-]{43}$/u);
  assert.notEqual(first, second);
  assert.equal(sessions.lookup(first).userId, 'user-1');
  assert.equal(sessions.lookup(second).userId, 'user-1');
  assert.equal(createInMemorySessionStore().lookup(first), null);
});

test('forged, malformed and revoked tokens are rejected', () => {
  const sessions = createInMemorySessionStore();
  const token = sessions.create('user-1');
  for (const candidate of [null, undefined, 27, '', 'x'.repeat(43), `${token}extra`,
    `${token.slice(0, -1)}!`, 'a'.repeat(10000)]) {
    assert.equal(sessions.lookup(candidate), null);
    assert.equal(sessions.revoke(candidate), false);
  }
  assert.equal(sessions.revoke(token), true);
  assert.equal(sessions.revoke(token), false);
  assert.equal(sessions.lookup(token), null);
});

test('sessions expire after seven days and cannot be resurrected', () => {
  let clock = 1_000_000;
  const sessions = createInMemorySessionStore({ now: () => clock });
  const token = sessions.create('user-1');
  assert.equal(sessions.lookup(token).expiresAt, clock + SESSION_TTL_MS);
  clock += SESSION_TTL_MS - 1;
  assert.equal(sessions.lookup(token).userId, 'user-1');
  clock += 1;
  assert.equal(sessions.lookup(token), null);
  clock -= 1000;
  assert.equal(sessions.lookup(token), null);
});

test('session store refuses invalid user IDs and returns defensive copies', () => {
  const sessions = createInMemorySessionStore();
  for (const id of ['', null, 1]) assert.throws(() => sessions.create(id), TypeError);
  const token = sessions.create('user-1');
  sessions.lookup(token).userId = 'other';
  assert.equal(sessions.lookup(token).userId, 'user-1');
});
