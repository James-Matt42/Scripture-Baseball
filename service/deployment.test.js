import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, cp, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
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
  assert.match(remoteScript, /NODE_ENV=production node --env-file=\.env/u);
  assert.match(remoteScript, /--update-env/u);
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
  await executable(join(bin, 'ssh'), `#!/bin/sh
case "$*" in
  *'umask 077; cat >'*) umask 077; cat > "$MOCK_DEPLOY_DEST/.env" ;;
  *) cat >/dev/null ;;
esac
`);
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
  assert.equal(await readFile(join(captured, '.env'), 'utf8'), 'PRIVATE_KEY=do-not-deploy');
  assert.equal((await stat(join(captured, '.env'))).mode & 0o777, 0o600,
    'the streamed .env must be private even when local source permissions are broad');
  await assert.rejects(access(join(captured, 'public', '.env')), { code: 'ENOENT' });
  assert.ok(!result.stdout.includes('PRIVATE_KEY'), 'never print secret content');

  for (const excluded of ['index.test.js', 'content/local/scriptures.json']) {
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
  await executable(join(bin, 'pm2'), `#!/bin/sh
printf '%s|%s|%s|%s\n' "$MONGODB_URI" "$MONGODB_DB_NAME" "$MONGODB_REQUIRED" "$NODE_ENV" >> "$MOCK_PM2_ENV_LOG"
[ "\${MOCK_PM2_FAIL:-0}" != 1 ]
`);
  await executable(join(bin, 'curl'), `#!/bin/sh
case "$*" in
  *--write-out*)
    case "$*" in
      */api/health*) printf '200' ;;
      */api/practice/catalog*) printf '503' ;;
    esac
    exit 0
    ;;
esac
[ "\${MOCK_HEALTH_FAIL:-0}" != 1 ]
`);
  await executable(join(bin, 'sleep'), '#!/bin/sh\nexit 0\n');
  // Remote deployment launches interactive shells to resolve ubuntu's PM2
  // environment; give them a deterministic fake npm/PM2 binary search path.
  await writeFile(join(home, '.bashrc'), `export PATH="${bin}:$PATH"\n`);
  await writeFile(join(target, 'index.js'), 'old server');
  await writeFile(join(target, '.env'), 'MONGODB_URI=mongodb://old:secret@localhost\nMONGODB_DB_NAME=old_database\nMONGODB_REQUIRED=true\n', { mode: 0o644 });
  const pm2Log = join(sandbox, 'pm2-env.log');
  await writeFile(join(target, 'private', 'scriptures-eng.sqlite'), 'previous corpus');
  const remoteScript = await readFile(join(projectRoot, 'tools', 'deploy-remote-startup.sh'), 'utf8');

  async function staged(code = 'new server', includeNewCorpus = false, newEnv = null) {
    await mkdir(stage, { recursive: true });
    await writeFile(join(stage, 'index.js'), code);
    if (includeNewCorpus) {
      await mkdir(join(stage, 'private'), { recursive: true });
      await writeFile(join(stage, 'private', 'scriptures-eng.sqlite'), 'new corpus');
    }
    if (newEnv !== null) await writeFile(join(stage, '.env'), newEnv, { mode: 0o644 });
  }
  function deploy(flags = {}) {
    return spawnSync('bash', ['-se', '--', stage, backup, 'startup'], {
      cwd: sandbox, input: remoteScript, encoding: 'utf8',
      env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`,
        MOCK_PM2_ENV_LOG: pm2Log, ...flags },
    });
  }

  await staged();
  const first = deploy();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(await readFile(join(target, 'index.js'), 'utf8'), 'new server');
  assert.equal(await readFile(join(target, 'private', 'scriptures-eng.sqlite'), 'utf8'), 'previous corpus');
  assert.equal(await readFile(join(target, '.env'), 'utf8'),
    'MONGODB_URI=mongodb://old:secret@localhost\nMONGODB_DB_NAME=old_database\nMONGODB_REQUIRED=true\n');
  assert.equal((await stat(join(target, '.env'))).mode & 0o777, 0o600);
  assert.match(await readFile(pm2Log, 'utf8'), /mongodb:\/\/old:secret@localhost\|old_database\|true\|production/u);
  await assert.rejects(access(backup), { code: 'ENOENT' });

  // DB12's first deployment may replace a pre-.env release. If the new app
  // fails readiness, rollback must restart that old release without trying to
  // read a .env file that it never had.
  await rm(join(target, '.env'));
  await staged('failed new server', false,
    'MONGODB_URI=mongodb://new:secret@localhost\nMONGODB_DB_NAME=new_database\nMONGODB_REQUIRED=true\n');
  const legacyRollback = deploy({ MOCK_HEALTH_FAIL: '1' });
  assert.notEqual(legacyRollback.status, 0);
  assert.equal(await readFile(join(target, 'index.js'), 'utf8'), 'new server');
  await assert.rejects(access(join(target, '.env')), { code: 'ENOENT' });
  assert.match(legacyRollback.stderr, /Previous release has no \.env/u);
  assert.match(legacyRollback.stderr, /Endpoint results before rollback/u);
  assert.match(legacyRollback.stderr, /\/api\/health: HTTP 200/u);
  assert.match(legacyRollback.stderr, /\/api\/practice\/catalog: HTTP 503/u);
  assert.doesNotMatch(legacyRollback.stderr, /node: \.env: not found/u);
  await assert.rejects(access(backup), { code: 'ENOENT' });
  await writeFile(join(target, '.env'),
    'MONGODB_URI=mongodb://old:secret@localhost\nMONGODB_DB_NAME=old_database\nMONGODB_REQUIRED=true\n',
    { mode: 0o600 });

  await staged('second server');
  const failedInstall = deploy({ MOCK_NPM_FAIL: '1' });
  assert.notEqual(failedInstall.status, 0);
  assert.equal(await readFile(join(target, 'index.js'), 'utf8'), 'new server');
  await assert.rejects(access(stage), { code: 'ENOENT' },
    'failed installs should not leave a staged copy of the credentials');

  await staged('third server', true,
    'MONGODB_URI="mongodb+srv://new:password@new.mongo.example/newdb?retryWrites=true"\nMONGODB_DB_NAME=new_database\nMONGODB_REQUIRED=true\n');
  const failedRestart = deploy({ MOCK_PM2_FAIL: '1', MONGODB_URI: 'mongodb://stale-remote-env' });
  assert.notEqual(failedRestart.status, 0);
  assert.equal(await readFile(join(target, 'index.js'), 'utf8'), 'new server');
  assert.equal(await readFile(join(target, 'private', 'scriptures-eng.sqlite'), 'utf8'), 'previous corpus');
  assert.match(await readFile(join(target, '.env'), 'utf8'), /mongodb:\/\/old:secret/u,
    'failed restart must restore the previous credentials');
  assert.match(await readFile(pm2Log, 'utf8'), /mongodb\+srv:\/\/new:password@new\.mongo\.example\/newdb\?retryWrites=true\|new_database\|true\|production/u,
    'new MongoDB credentials must reach the PM2 process, not just disk');
  assert.doesNotMatch(failedRestart.stdout + failedRestart.stderr, /new:password/u,
    'deployment output must not expose the new MongoDB password');
  await assert.rejects(access(backup), { code: 'ENOENT' });

  await staged('invalid environment', false, 'MONGODB_DB_NAME=missing_uri\n');
  const noMongo = deploy();
  assert.notEqual(noMongo.status, 0);
  assert.match(noMongo.stderr, /Missing MONGODB_URI/u);
  assert.equal(await readFile(join(target, 'index.js'), 'utf8'), 'new server');
  await assert.rejects(access(stage), { code: 'ENOENT' },
    'invalid settings must not leave a staged copy of the credentials');

  await staged('unhealthy server');
  const failedHealth = deploy({ MOCK_HEALTH_FAIL: '1' });
  assert.notEqual(failedHealth.status, 0);
  assert.equal(await readFile(join(target, 'index.js'), 'utf8'), 'new server');
  await assert.rejects(access(backup), { code: 'ENOENT' });

  await staged('fourth server', true,
    'MONGODB_URI="mongodb+srv://new:password@new.mongo.example/newdb?retryWrites=true"\nMONGODB_DB_NAME=new_database\nMONGODB_REQUIRED=true\n');
  const deployedNewCorpus = deploy({ MONGODB_URI: 'mongodb://stale-remote-env' });
  assert.equal(deployedNewCorpus.status, 0, deployedNewCorpus.stderr);
  assert.equal(await readFile(join(target, 'private', 'scriptures-eng.sqlite'), 'utf8'), 'new corpus');
  assert.match(await readFile(join(target, '.env'), 'utf8'), /mongodb\+srv:\/\/new:password/u);
  assert.equal((await stat(join(target, '.env'))).mode & 0o777, 0o600);
  assert.match(await readFile(pm2Log, 'utf8'), /mongodb\+srv:\/\/new:password@new\.mongo\.example\/newdb\?retryWrites=true\|new_database\|true\|production/u);
  assert.doesNotMatch(deployedNewCorpus.stdout + deployedNewCorpus.stderr, /new:password/u);

  // A first deployment without local or pre-existing credentials should
  // leave the running release untouched rather than silently use memory.
  await rm(join(target, '.env'));
  await staged('missing config server');
  const missingFile = deploy();
  assert.notEqual(missingFile.status, 0);
  assert.match(missingFile.stderr, /Missing MongoDB configuration/u);
  assert.equal(await readFile(join(target, 'index.js'), 'utf8'), 'fourth server');
  await assert.rejects(access(stage), { code: 'ENOENT' });

  // Refuse a release missing the corpus *before* replacing a running app;
  // otherwise /api/practice/catalog cannot pass the readiness check.
  await rm(join(target, 'private'), { recursive: true, force: true });
  await staged('missing corpus server', false,
    'MONGODB_URI=mongodb://new:secret@localhost\nMONGODB_REQUIRED=true\n');
  const missingCorpus = deploy();
  assert.notEqual(missingCorpus.status, 0);
  assert.match(missingCorpus.stderr, /Missing private scripture SQLite corpus/u);
  assert.equal(await readFile(join(target, 'index.js'), 'utf8'), 'fourth server');
  await assert.rejects(access(stage), { code: 'ENOENT' });
});
