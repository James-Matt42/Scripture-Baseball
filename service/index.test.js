import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApp } from './index.js';

async function startFixtureServer(t) {
  const staticDirectory = await mkdtemp(join(tmpdir(), 'scripture-baseball-www-'));
  await mkdir(join(staticDirectory, 'assets'));
  await writeFile(join(staticDirectory, 'index.html'), '<!doctype html><title>Scripture Baseball</title>');
  await writeFile(join(staticDirectory, 'assets', 'app.js'), 'window.SCRIPTURE_BASEBALL = true;');
  t.after(() => rm(staticDirectory, { recursive: true, force: true }));

  const server = createApp({ staticDirectory }).listen(0);
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  await once(server, 'listening');
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

test('the service exposes an HTTP health endpoint', async (t) => {
  const baseUrl = await startFixtureServer(t);
  const response = await fetch(`${baseUrl}/api/health`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('Express serves index.html and compiled static assets', async (t) => {
  const baseUrl = await startFixtureServer(t);
  const homepage = await fetch(`${baseUrl}/`);
  const asset = await fetch(`${baseUrl}/assets/app.js`);

  assert.equal(homepage.status, 200);
  assert.match(homepage.headers.get('content-type') ?? '', /text\/html/);
  assert.match(await homepage.text(), /Scripture Baseball/);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type') ?? '', /javascript/);
  assert.match(await asset.text(), /SCRIPTURE_BASEBALL/);
});

test('direct React Router navigation returns the application shell', async (t) => {
  const baseUrl = await startFixtureServer(t);
  const response = await fetch(`${baseUrl}/join-game?room=NEPHI7`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  assert.match(await response.text(), /Scripture Baseball/);
});

test('missing API routes return a JSON 404 instead of HTML', async (t) => {
  const baseUrl = await startFixtureServer(t);
  const response = await fetch(`${baseUrl}/api/does-not-exist`);

  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  assert.deepEqual(await response.json(), { error: 'API endpoint not found' });
});

test('missing static assets and unsupported methods do not return the app shell', async (t) => {
  const baseUrl = await startFixtureServer(t);
  const missingAsset = await fetch(`${baseUrl}/assets/missing.js`);
  const missingExtensionlessAsset = await fetch(`${baseUrl}/assets/missing`);
  const invalidMethod = await fetch(`${baseUrl}/play`, { method: 'POST' });

  assert.equal(missingAsset.status, 404);
  assert.equal(missingExtensionlessAsset.status, 404);
  assert.equal(invalidMethod.status, 404);
  assert.match(missingAsset.headers.get('content-type') ?? '', /application\/json/);
  assert.match(invalidMethod.headers.get('content-type') ?? '', /application\/json/);
});
