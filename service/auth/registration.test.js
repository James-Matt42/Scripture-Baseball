import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInMemoryUserStore } from './userStore.js';
import { registerUser } from './registration.js';
import { DuplicateEmailError } from './validation.js';

const input = {
  displayName: '  Scripture Learner ',
  email: ' PLAYER@EXAMPLE.COM ',
  password: 'example-password',
};

test('registration persists only a hash and returns a safe public user object', async () => {
  const store = createInMemoryUserStore();
  const hashedInputs = [];
  const user = await registerUser(input, {
    store,
    hashPassword: async (password) => {
      hashedInputs.push(password);
      return 'mock-hash-only';
    },
  });

  assert.deepEqual(hashedInputs, ['example-password']);
  assert.deepEqual(Object.keys(user).sort(), ['createdAt', 'displayName', 'email', 'id']);
  assert.equal(user.email, 'player@example.com');
  assert.equal(user.displayName, 'Scripture Learner');
  assert.match(user.id, /^[0-9a-f-]{36}$/i);
  assert.ok(!Number.isNaN(Date.parse(user.createdAt)));

  const stored = store.findByEmail('player@example.com');
  assert.equal(stored.passwordHash, 'mock-hash-only');
  assert.equal(Object.hasOwn(stored, 'password'), false);
  assert.deepEqual(store.findById(user.id), stored);

  stored.displayName = 'tampered';
  assert.equal(store.findById(user.id).displayName, 'Scripture Learner');
});

test('duplicate email checks are case-insensitive and avoid unnecessary hashing', async () => {
  const store = createInMemoryUserStore();
  await registerUser(input, { store, hashPassword: async () => 'hash' });
  let repeatedHash = false;
  await assert.rejects(() => registerUser({ ...input, email: 'player@example.com' }, {
    store,
    hashPassword: async () => {
      repeatedHash = true;
      return 'hash';
    },
  }), (error) => error instanceof DuplicateEmailError && error.status === 409);
  assert.equal(repeatedHash, false);
});

test('store uniqueness is atomic even when two BCrypt operations finish together', async () => {
  const store = createInMemoryUserStore();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const args = { store, hashPassword: async () => { await gate; return 'hash'; } };
  const jobs = [registerUser(input, args), registerUser({ ...input, email: input.email.toLowerCase() }, args)];
  release();
  const results = await Promise.allSettled(jobs);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.ok(rejected.reason instanceof DuplicateEmailError);
  assert.equal(store.findByEmail('player@example.com').passwordHash, 'hash');
});

test('separate application stores do not share registered accounts', async () => {
  const storeA = createInMemoryUserStore();
  const storeB = createInMemoryUserStore();
  await registerUser(input, { store: storeA, hashPassword: async () => 'hash' });
  assert.equal(storeB.findByEmail('player@example.com'), null);
});
