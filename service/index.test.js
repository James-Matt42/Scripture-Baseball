import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { app } from './index.js';

test('the service exposes an HTTP health endpoint', async (t) => {
  const server = app.listen(0);
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  await once(server, 'listening');
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  assert.deepEqual(await response.json(), { status: 'ok' });
});
