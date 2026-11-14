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
  await mkdir(join(backend, 'scripture'), { recursive: true });
  await mkdir(join(backend, 'private'), { recursive: true });
  await mkdir(join(backend, 'auth'), { recursive: true });
  await mkdir(join(backend, 'db'), { recursive: true });
  await mkdir(join(backend, 'progress'), { recursive: true });
  await mkdir(join(backend, 'content', 'local'), { recursive: true });
  await mkdir(bin);
  await cp(join(projectRoot, 'deployService.sh'), join(project, 'deployService.sh'));
  await mkdir(join(project, 'tools'));
  await cp(join(projectRoot, 'tools', 'deploy-remote-startup.sh'),
    join(project, 'tools', 'deploy-remote-startup.sh'));
  const script = await readFile(join(project, 'deployService.sh'), 'utf8');
  const remoteScript = await readFile(join(projectRoot, 'tools', 'deploy-remote-startup.sh'), 'utf8');
  assert.match(remoteScript, /NODE_ENV=production pm2 restart.*--update-env/u);
  assert.ok(remoteScript.includes('cp -an "$target/private/." "$stage/private/"'));
  assert.ok(remoteScript.includes('mv "$stage" "$target"'));
  assert.ok(!script.includes('rm -rf services/${service}'),
    'do not destroy the old live release before an upload succeeds');
  await writeFile(join(project, 'package-lock.json'), '{}');
  await writeFile(join(sandbox, 'key.pem'), 'test fixture only');
  await writeFile(join(backend, 'index.js'), 'console.log("service")');
  await writeFile(join(backend, 'package.json'), '{"type":"module"}');
  await writeFile(join(backend, 'routes', 'questions.js'), 'export const questions = [];');
  await writeFile(join(backend, 'scripture', 'corpus.js'), 'export const corpus = true;');
  await writeFile(join(backend, 'scripture', 'practiceCollections.js'), 'export const collections = true;');
  await writeFile(join(backend, 'private', 'scriptures-eng.sqlite'), 'immutable test fixture');
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
  assert.match(await readFile(join(captured, 'scripture', 'corpus.js'), 'utf8'), /corpus/);
  assert.match(await readFile(join(captured, 'scripture', 'practiceCollections.js'), 'utf8'), /collections/);
  assert.match(await readFile(join(captured, 'private', 'scriptures-eng.sqlite'), 'utf8'), /immutable/);
  await assert.rejects(access(join(captured, 'public', 'scriptures-eng.sqlite')), { code: 'ENOENT' });
  assert.match(await readFile(join(captured, 'auth', 'registration.js'), 'utf8'), /registration/);
  assert.match(await readFile(join(captured, 'db', 'mongo.js'), 'utf8'), /database/);
  assert.match(await readFile(join(captured, 'progress', 'progressStore.js'), 'utf8'), /progress/);

  for (const excluded of ['.env', 'index.test.js', 'content/local/scriptures.json']) {
    await assert.rejects(access(join(captured, excluded)), { code: 'ENOENT' });
  }
});


test('staged deployment retains private data and rolls back on install/restart failures', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'scripture-baseball-remote-deploy-'));
  t.after(() => rm(sandbox, { force: true, recursive: true }));
  const bin = join(sandbox, 'bin');
  const home = join(sandbox, 'home');
  const services = join(sandbox, 'services');
  const target = join(services, 'startup');
  const stage = join(services, '.stage');
  const backup = join(services, '.backup');
  await mkdir(join(target, 'private'), { recursive: true });
  await mkdir(bin);
  await mkdir(home);
  await executable(join(bin, 'npm'), '#!/bin/sh\n[ "${MOCK_NPM_FAIL:-0}" != 1 ]\n');
  await executable(join(bin, 'pm2'), '#!/bin/sh\n[ "${MOCK_PM2_FAIL:-0}" != 1 ]\n');
  await executable(join(bin, 'curl'), '#!/bin/sh\n[ "${MOCK_HEALTH_FAIL:-0}" != 1 ]\n');
  await executable(join(bin, 'sleep'), '#!/bin/sh\nexit 0\n');
  // Remote deployment launches interactive shells to resolve ubuntu's PM2
  // environment; give them a deterministic fake npm/PM2 binary search path.
  await writeFile(join(home, '.bashrc'), `export PATH="${bin}:$PATH"\n`);
  await writeFile(join(target, 'index.js'), 'old server');
  await writeFile(join(target, '.env'), 'MONGODB_URI=secret-do-not-ship');
  await writeFile(join(target, 'private', 'scriptures-eng.sqlite'), 'previous corpus');
  const remoteScript = await readFile(join(projectRoot, 'tools', 'deploy-remote-startup.sh'), 'utf8');

  async function staged(code = 'new server', includeNewCorpus = false) {
    await mkdir(stage, { recursive: true });
    await writeFile(join(stage, 'index.js'), code);
    if (includeNewCorpus) {
      await mkdir(join(stage, 'private'), { recursive: true });
      await writeFile(join(stage, 'private', 'scriptures-eng.sqlite'), 'new corpus');
    }
  }
  function deploy(flags = {}) {
    return spawnSync('bash', ['-se', '--', stage, backup, 'startup'], {
      cwd: sandbox, input: remoteScript, encoding: 'utf8',
      env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`,
        ...flags },
    });
  }

  await staged();
  const first = deploy();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(await readFile(join(target, 'index.js'), 'utf8'), 'new server');
  assert.equal(await readFile(join(target, 'private', 'scriptures-eng.sqlite'), 'utf8'), 'previous corpus');
  assert.equal(await readFile(join(target, '.env'), 'utf8'), 'MONGODB_URI=secret-do-not-ship');
  await assert.rejects(access(backup), { code: 'ENOENT' });

  await staged('second server');
  const failedInstall = deploy({ MOCK_NPM_FAIL: '1' });
  assert.notEqual(failedInstall.status, 0);
  assert.equal(await readFile(join(target, 'index.js'), 'utf8'), 'new server');
  // Cleanup the unsuccessful staging directory before trying another release.
  await rm(stage, { force: true, recursive: true });

  await staged('third server', true);
  const failedRestart = deploy({ MOCK_PM2_FAIL: '1' });
  assert.notEqual(failedRestart.status, 0);
  assert.equal(await readFile(join(target, 'index.js'), 'utf8'), 'new server');
  assert.equal(await readFile(join(target, 'private', 'scriptures-eng.sqlite'), 'utf8'), 'previous corpus');
  await assert.rejects(access(backup), { code: 'ENOENT' });

  await staged('unhealthy server');
  const failedHealth = deploy({ MOCK_HEALTH_FAIL: '1' });
  assert.notEqual(failedHealth.status, 0);
  assert.equal(await readFile(join(target, 'index.js'), 'utf8'), 'new server');
  await assert.rejects(access(backup), { code: 'ENOENT' });

  await staged('fourth server', true);
  const deployedNewCorpus = deploy();
  assert.equal(deployedNewCorpus.status, 0, deployedNewCorpus.stderr);
  assert.equal(await readFile(join(target, 'private', 'scriptures-eng.sqlite'), 'utf8'), 'new corpus');
});
