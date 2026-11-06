import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

async function executable(file, content) {
  await writeFile(file, content, { mode: 0o755 });
}

test('deployment packages frontend and nested backend files without private sources', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'scripture-baseball-deploy-test-'));
  t.after(() => rm(sandbox, { force: true, recursive: true }));

  const project = join(sandbox, 'project');
  const backend = join(project, 'service');
  const bin = join(sandbox, 'bin');
  const captured = join(sandbox, 'captured');
  await mkdir(join(backend, 'routes'), { recursive: true });
  await mkdir(join(backend, 'domain'), { recursive: true });
  await mkdir(join(backend, 'auth'), { recursive: true });
  await mkdir(join(backend, 'db'), { recursive: true });
  await mkdir(join(backend, 'progress'), { recursive: true });
  await mkdir(join(backend, 'content', 'local'), { recursive: true });
  await mkdir(bin);
  await cp(join(projectRoot, 'deployService.sh'), join(project, 'deployService.sh'));
  assert.match(await readFile(join(project, 'deployService.sh'), 'utf8'),
    /NODE_ENV=production pm2 restart \$\{service\} --update-env/u);
  await writeFile(join(project, 'package-lock.json'), '{}');
  await writeFile(join(sandbox, 'key.pem'), 'test fixture only');
  await writeFile(join(backend, 'index.js'), 'console.log("service")');
  await writeFile(join(backend, 'package.json'), '{"type":"module"}');
  await writeFile(join(backend, 'routes', 'questions.js'), 'export const questions = [];');
  await writeFile(join(backend, 'domain', 'questions.js'), 'export const sample = true;');
  await writeFile(join(backend, 'auth', 'registration.js'), 'export const registration = true;');
  await writeFile(join(backend, 'db', 'mongo.js'), 'export const database = true;');
  await writeFile(join(backend, 'progress', 'progressStore.js'), 'export const progress = true;');
  await writeFile(join(backend, 'index.test.js'), 'throw new Error("do not deploy tests")');
  await writeFile(join(backend, '.env'), 'PRIVATE_KEY=do-not-deploy');
  await writeFile(join(backend, 'content', 'local', 'scriptures.json'), '{"private":true}');

  await executable(join(bin, 'npm'), `#!/bin/sh
if [ "$1" = ci ]; then exit 0; fi
if [ "$1" = run ] && [ "$2" = build ]; then
  mkdir -p dist/assets
  printf '<!doctype html><title>Scripture Baseball</title>' > dist/index.html
  printf 'console.log("frontend")' > dist/assets/app.js
  exit 0
fi
exit 3
`);
  await executable(join(bin, 'ssh'), '#!/bin/sh\ncat >/dev/null\n');
  await executable(join(bin, 'scp'), `#!/bin/sh
for arg in "$@"; do
  case "$arg" in */.) cp -R "$arg" "$MOCK_DEPLOY_DEST"; exit $? ;; esac
done
exit 4
`);
  await mkdir(captured);

  const result = spawnSync('bash', [join(project, 'deployService.sh'),
    '-k', join(sandbox, 'key.pem'), '-h', 'example.org', '-s', 'startup'], {
    cwd: project,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, MOCK_DEPLOY_DEST: captured },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Deployment complete/);
  assert.match(await readFile(join(captured, 'public', 'index.html'), 'utf8'), /Scripture Baseball/);
  assert.match(await readFile(join(captured, 'public', 'assets', 'app.js'), 'utf8'), /frontend/);
  assert.match(await readFile(join(captured, 'index.js'), 'utf8'), /service/);
  assert.match(await readFile(join(captured, 'routes', 'questions.js'), 'utf8'), /questions/);
  assert.match(await readFile(join(captured, 'domain', 'questions.js'), 'utf8'), /sample/);
  assert.match(await readFile(join(captured, 'auth', 'registration.js'), 'utf8'), /registration/);
  assert.match(await readFile(join(captured, 'db', 'mongo.js'), 'utf8'), /database/);
  assert.match(await readFile(join(captured, 'progress', 'progressStore.js'), 'utf8'), /progress/);

  for (const excluded of ['.env', 'index.test.js', 'content/local/scriptures.json']) {
    await assert.rejects(access(join(captured, excluded)), { code: 'ENOENT' });
  }
});
