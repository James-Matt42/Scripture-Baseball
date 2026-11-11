import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startServer } from '../index.js';
import { fixtureCorpus } from './practiceFixtures.testSupport.js';

function fakeMongo() {
  let closed = false;
  return {
    connect: async () => null,
    close: async () => { closed = true; },
    get closed() { return closed; },
  };
}

test('missing mandatory private SQLite refuses HTTP startup and closes Mongo connection', async () => {
  const mongo = fakeMongo();
  await assert.rejects(startServer({ port: 0, mongo, loadCorpus: true,
    corpusPath: '/path/to/a/missing/private/scriptures.sqlite' }),
  /Private scripture SQLite database is missing/);
  assert.equal(mongo.closed, true);
});

test('startup mounts real SQLite practice endpoints while retaining the standard health API', async (t) => {
  const corpus = await fixtureCorpus(t);
  const mongo = fakeMongo();
  const { server } = await startServer({ port: 0, mongo, loadCorpus: true, scriptureCorpus: corpus });
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    await mongo.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  const selected = await fetch(`${base}/api/practice/pitches`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scope: { volume: 'bom', book: '2-ne' } }),
  });
  assert.equal(selected.status, 201);
  const pitch = await selected.json();
  assert.equal(pitch.stage, 'chapter');
  assert.equal(pitch.choices.length, 0);
  assert.match(pitch.passage, /courageous/);
});
