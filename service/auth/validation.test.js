import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RegistrationError, validateRegistration } from './validation.js';

const valid = () => ({
  displayName: '  Jordan  ',
  email: '  Reader+Test@Example.COM ',
  password: ' Passphrase 123 ',
});

test('registration normalizes identifiers, not password bytes', () => {
  assert.deepEqual(validateRegistration(valid()), {
    displayName: 'Jordan',
    email: 'reader+test@example.com',
    password: ' Passphrase 123 ',
  });
});

test('registration rejects non-object bodies and invalid display names', () => {
  for (const value of [undefined, null, [], 'text']) {
    assert.throws(() => validateRegistration(value), { name: 'RegistrationError', status: 400 });
  }
  for (const displayName of ['', '   ', 'a'.repeat(41), 'Reader\nName', 12]) {
    assert.throws(() => validateRegistration({ ...valid(), displayName }), RegistrationError);
  }
});

test('registration requires a plausible, bounded email address', () => {
  for (const email of ['', 'reader', 'reader@example', 'reader @example.com',
    'reader@@example.com', 'a'.repeat(251) + '@example.com', null]) {
    assert.throws(() => validateRegistration({ ...valid(), email }), RegistrationError);
  }
});

test('password checks 8 characters and BCrypt 72-byte limit', () => {
  for (const password of ['short', '          ', 'x'.repeat(73), '🔒'.repeat(19), null]) {
    assert.throws(() => validateRegistration({ ...valid(), password }), RegistrationError);
  }
  assert.equal(validateRegistration({ ...valid(), password: 'a'.repeat(72) }).password.length, 72);
  assert.equal(validateRegistration({ ...valid(), password: '🔒'.repeat(18) }).password,
    '🔒'.repeat(18));
});
