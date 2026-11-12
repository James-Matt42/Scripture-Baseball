import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../index.js';
import { createPracticeSessionEngine } from '../scripture/practiceSession.js';
import { fixtureCorpus } from '../scripture/practiceFixtures.testSupport.js';

async function fixture(t) {
  const corpus = await fixtureCorpus(t);
  const engine = createPracticeSessionEngine({ corpus, random: () => 0 });
  const server = createApp({ practiceEngine: engine }).listen(0);
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = async (path, body, cookie) => {
    const response = await fetch(`${base}${path}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body) });
    return { response, data: await response.json() };
  };
  const register = async (email = 'reader@example.com') => {
    const fields = { email, password: 'long-example-password', displayName: 'Reader' };
    assert.equal((await req('/api/auth/register', fields)).response.status, 201);
    const login = await req('/api/auth/login', fields);
    assert.equal(login.response.status, 200);
    return login.response.headers.get('set-cookie').split(';')[0];
  };
  const pitch = async (cookie) => {
    const created = await req('/api/practice/pitches', { scope: { volume: 'bom', book: '2-ne' } }, cookie);
    assert.equal(created.response.status, 201);
    return created.data.pitchId;
  };
  const finish = (id, cookie) => req(`/api/practice/pitches/${id}/answers`, { stage: 'chapter', chapter: 9 }, cookie);
  return { base, req, register, pitch, finish };
}

test('signed-in completed pitch persists from the server-verified record, not browser grades', async (t) => {
  const api = await fixture(t);
  const cookie = await api.register();
  const id = await api.pitch(cookie);
  const forged = await api.req(`/api/practice/pitches/${id}/answers`, { stage: 'chapter', chapter: 9, chapterCorrect: true }, cookie);
  assert.equal(forged.response.status, 400);
  const done = await api.finish(id, cookie);
  assert.equal(done.response.status, 200);
  assert.equal(done.data.savedToAccount, true);
  const progress = await fetch(`${api.base}/api/account/progress`, { headers: { cookie } });
  const { attempts, summary } = await progress.json();
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].id, id);
  assert.equal(attempts[0].reference, 'bom:2-ne:9:1');
  assert.equal(attempts[0].chapterCorrect, true);
  assert.equal(attempts[0].chosenChapter, 9);
  assert.equal(attempts[0].bookCorrect, undefined, 'book choice was disclosed by scope');
  assert.equal(summary.totalAttempts, 1);
  assert.equal(summary.uniquePassages, 1);
  assert.equal(summary.byVolume[0].volume, 'bom');
  const repeated = await api.finish(id, cookie);
  assert.equal(repeated.response.status, 200);
  const again = await (await fetch(`${api.base}/api/account/progress`, { headers: { cookie } })).json();
  assert.equal(again.attempts.length, 1);
});

test('guest receives a verified claim receipt and signup preserves the exact answer', async (t) => {
  const api = await fixture(t);
  const id = await api.pitch();
  const done = await api.finish(id);
  assert.equal(done.response.status, 200);
  assert.equal(done.data.guestClaimable, true);
  assert.equal(done.data.savedToAccount, false);
  assert.equal((await api.req(`/api/practice/pitches/${id}/claim`, {})).response.status, 401);
  const cookie = await api.register();
  const cannotForge = await api.req(`/api/practice/pitches/${id}/claim`, { chapterCorrect: true }, cookie);
  assert.equal(cannotForge.response.status, 400);
  const claimed = await api.req(`/api/practice/pitches/${id}/claim`, {}, cookie);
  assert.equal(claimed.response.status, 200);
  assert.equal(claimed.data.attempt.reference, 'bom:2-ne:9:1');
  assert.equal(claimed.data.attempt.chapterCorrect, true);
  assert.equal(claimed.data.created, true);
  const replayed = await api.req(`/api/practice/pitches/${id}/claim`, {}, cookie);
  assert.equal(replayed.response.status, 200);
  assert.equal(replayed.data.created, false);
  const other = await api.register('other@example.com');
  const stolen = await api.req(`/api/practice/pitches/${id}/claim`, {}, other);
  assert.equal(stolen.response.status, 404);
  const otherProgress = await (await fetch(`${api.base}/api/account/progress`, { headers: { cookie: other } })).json();
  assert.deepEqual(otherProgress.attempts, []);
});

test('only known corpus references can be stored as account favorites', async (t) => {
  const api = await fixture(t);
  const cookie = await api.register();
  const put = async (favorites) => {
    const response = await fetch(`${api.base}/api/practice/favorites`, {
      method: 'PUT', headers: { cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorites }),
    });
    return { response, data: await response.json() };
  };
  assert.equal((await put(['bom:2-ne:9:1'])).response.status, 200);
  assert.deepEqual((await (await fetch(`${api.base}/api/practice/favorites`, { headers: { cookie } })).json()).favorites,
    ['bom:2-ne:9:1']);
  assert.equal((await put(['bom:2-ne:9:999'])).response.status, 400);
  assert.equal((await put(['not-a-reference'])).response.status, 400);
  assert.equal((await fetch(`${api.base}/api/practice/favorites`)).status, 401);
});
