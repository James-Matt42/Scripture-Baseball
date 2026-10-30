import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AuthRequestError, loginAccount, logoutAccount, registerAccount, restoreAccountSession,
} from './authApi.js';

const user = {
  id: '4b5a9f7c-7b2b-4a71-8b24-118c885245e7',
  displayName: 'Casey', email: 'casey@example.com', createdAt: '2026-11-05T00:00:00Z',
};
function fakeFetch(body, status = 200) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (path, options) => {
      calls.push({ path, options });
      return { ok: status >= 200 && status < 300, status, json: async () => body };
    },
  };
}

test('session restoration uses same-origin cookies, accepts anonymous visitors, and never reads local storage', async () => {
  const signedIn = fakeFetch({ user });
  assert.deepEqual(await restoreAccountSession({ fetchImpl: signedIn.fetchImpl }), user);
  assert.deepEqual(signedIn.calls, [{
    path: '/api/auth/session', options: { method: 'GET', credentials: 'same-origin' },
  }]);
  assert.equal(await restoreAccountSession({ fetchImpl: fakeFetch({ user: null }).fetchImpl }), null);
});

test('registration and login send credentials in POST bodies to the correct API routes', async () => {
  const register = fakeFetch({ user }, 201);
  const credentials = { displayName: 'Casey', email: 'casey@example.com', password: 'a-password' };
  assert.deepEqual(await registerAccount(credentials, { fetchImpl: register.fetchImpl }), user);
  assert.deepEqual(register.calls, [{
    path: '/api/auth/register',
    options: {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials),
    },
  }]);
  const login = fakeFetch({ user });
  assert.deepEqual(await loginAccount({ email: credentials.email, password: credentials.password },
    { fetchImpl: login.fetchImpl }), user);
  assert.equal(login.calls[0].path, '/api/auth/login');
  assert.equal(login.calls[0].options.credentials, 'same-origin');
  assert.equal(login.calls[0].options.method, 'POST');
});

test('logout correctly handles empty 204 response and does not require a JSON body', async () => {
  const calls = [];
  const fetchImpl = async (path, options) => {
    calls.push({ path, options });
    return { ok: true, status: 204, json: async () => { throw Error('must not parse'); } };
  };
  assert.equal(await logoutAccount({ fetchImpl }), null);
  assert.deepEqual(calls, [{
    path: '/api/auth/logout', options: { method: 'POST', credentials: 'same-origin' },
  }]);
});

test('authentication errors retain status and human-readable server messages', async () => {
  const denied = fakeFetch({ error: 'Invalid email or password' }, 401);
  await assert.rejects(loginAccount({ email: 'x', password: 'wrong' }, { fetchImpl: denied.fetchImpl }),
    (error) => error instanceof AuthRequestError && error.status === 401 &&
      error.message === 'Invalid email or password');
  await assert.rejects(registerAccount({ email: 'x' }, {
    fetchImpl: fakeFetch({ error: 'An account with this email already exists' }, 409).fetchImpl,
  }), (error) => error.status === 409 && /already exists/.test(error.message));
});

test('bad response, network problems, and aborted requests are handled safely', async () => {
  await assert.rejects(restoreAccountSession({ fetchImpl: fakeFetch({ unexpected: true }).fetchImpl }),
    /invalid user/i);
  await assert.rejects(restoreAccountSession({ fetchImpl: fakeFetch({ user: { id: 12 } }).fetchImpl }),
    /invalid user/i);
  await assert.rejects(loginAccount({}, { fetchImpl: () => { throw Error('network'); } }),
    /unable to reach the account service/i);
  await assert.rejects(restoreAccountSession({ fetchImpl: null }), /cannot connect/i);
  const aborted = new Error('cancelled');
  aborted.name = 'AbortError';
  await assert.rejects(restoreAccountSession({ fetchImpl: () => { throw aborted; } }),
    (error) => error === aborted);
  await assert.rejects(restoreAccountSession({ fetchImpl: async () => ({
    ok: true, status: 200, json: async () => { throw Error('bad json'); },
  }) }), /invalid response/i);
});
