import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readSessionCookie, SESSION_COOKIE_NAME, sessionCookieOptions } from './sessionCookies.js';
import { SESSION_TTL_MS } from './sessionStore.js';

test('session cookie reader ignores unrelated cookies and rejects duplicates', () => {
  const cookie = `${SESSION_COOKIE_NAME}=abc_123`;
  assert.equal(readSessionCookie(`theme=dark; ${cookie}; guest=yes`), 'abc_123');
  assert.equal(readSessionCookie(`${cookie}; sb_session=other`), null);
  assert.equal(readSessionCookie('sb_session=; sb_session=other'), null);
  assert.equal(readSessionCookie('not_sb_session=bad; theme=dark'), null);
  assert.equal(readSessionCookie('sb_session='), null);
  assert.equal(readSessionCookie(undefined), null);
});

test('cookie options restrict script access, cross-site requests and duration', () => {
  assert.deepEqual(sessionCookieOptions(), {
    httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: SESSION_TTL_MS,
  });
  assert.deepEqual(sessionCookieOptions({ secure: true, withExpiry: false }), {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/',
  });
});
