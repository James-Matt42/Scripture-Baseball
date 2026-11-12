import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../index.js';

async function server(t) {
  const listener = createApp().listen(0);
  t.after(() => new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve())));
  await once(listener, 'listening');
  return `http://127.0.0.1:${listener.address().port}`;
}
async function account(base) {
  const body = { displayName: 'Reader', email: 'reader@example.com', password: 'Test-Only-Passphrase-123' };
  const options = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  assert.equal((await fetch(`${base}/api/auth/register`, options)).status, 201);
  const login = await fetch(`${base}/api/auth/login`, options);
  assert.equal(login.status, 200);
  return login.headers.get('set-cookie').split(';')[0];
}

test('progress and preference APIs require a cookie-authenticated user', async (t) => {
  const base = await server(t);
  for (const path of ['/api/account/progress', '/api/account/preferences']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const cookie = await account(base);
  const result = await fetch(`${base}/api/account/progress`, { headers: { cookie } });
  assert.equal(result.status, 200);
  assert.deepEqual((await result.json()).attempts, []);
  const patch = await fetch(`${base}/api/account/preferences`, {
    method: 'PATCH', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ preferredVolume: 'bom', answerDifficulty: 'exact-verse' }),
  });
  assert.equal(patch.status, 200);
  assert.equal((await patch.json()).preferences.preferredVolume, 'bom');
  const invalid = await fetch(`${base}/api/account/preferences`, {
    method: 'PATCH', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ preferredVolume: 'book-of-mormon' }),
  });
  assert.equal(invalid.status, 400);
});

test('obsolete example-question, import and personal-deck routes are absent', async (t) => {
  const base = await server(t);
  const cookie = await account(base);
  for (const path of ['/api/challenges', '/api/scripture/books', '/api/scripture/questions/2-nephi-2-25',
    '/api/account/challenges/my-misses/questions', '/api/account/import', '/api/account/attempts']) {
    const response = await fetch(`${base}${path}`, { headers: { cookie } });
    assert.equal(response.status, 404, path);
  }
});
