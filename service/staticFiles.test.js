import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { frontendDirectory, isClientRoute } from './staticFiles.js';

test('source checkout defaults to the sibling Vite dist directory', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'scripture-baseball-assets-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const serviceDir = join(root, 'service');
  mkdirSync(serviceDir);

  assert.equal(frontendDirectory(serviceDir), resolve(root, 'dist'));
});

test('deployed public directory takes precedence over local dist', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'scripture-baseball-deployed-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const serviceDir = join(root, 'service');
  mkdirSync(join(serviceDir, 'public'), { recursive: true });
  mkdirSync(join(root, 'dist'), { recursive: true });

  assert.equal(frontendDirectory(serviceDir), resolve(serviceDir, 'public'));
});

test('only extensionless paths qualify for React Router fallback', () => {
  assert.equal(isClientRoute('/'), true);
  assert.equal(isClientRoute('/play'), true);
  assert.equal(isClientRoute('/join-game/invite'), true);
  assert.equal(isClientRoute('/assets/missing.js'), false);
  assert.equal(isClientRoute('/assets/missing'), false);
  assert.equal(isClientRoute('/api/not-found'), false);
  assert.equal(isClientRoute('/favicon.ico'), false);
  assert.equal(isClientRoute('/missing/style.css'), false);
});
