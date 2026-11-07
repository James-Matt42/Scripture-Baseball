import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMongoSessionStore } from './mongoSessionStore.js';
import { createInMemorySessionStore, SESSION_TTL_MS, sessionTokenDigest } from './sessionStore.js';

function fakeSessionsDatabase() {
  const rows = new Map();
  const calls = [];
  const collection = {
    async insertOne(document) {
      calls.push(['insertOne', document]);
      if (rows.has(document.tokenDigest)) throw new Error('duplicate session digest');
      rows.set(document.tokenDigest, { ...document });
      return { acknowledged: true };
    },
    async findOne(filter, options) {
      calls.push(['findOne', filter, options]);
      const row = rows.get(filter.tokenDigest);
      if (!row || row.expiresAt <= filter.expiresAt.$gt) return null;
      return { userId: row.userId, expiresAt: new Date(row.expiresAt) };
    },
    async deleteOne(filter) {
      calls.push(['deleteOne', filter]);
      return { deletedCount: rows.delete(filter.tokenDigest) ? 1 : 0 };
    },
  };
  return {
    rows, calls, collection(name) {
      assert.equal(name, 'sessions');
      return collection;
    },
  };
}

test('Mongo sessions store only a SHA-256 digest and BSON expiry date', async () => {
  let clock = 1_700_000_000_000;
  const database = fakeSessionsDatabase();
  const sessions = createMongoSessionStore(database, { now: () => clock });
  const token = await sessions.create('user-1');
  assert.match(token, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(database.rows.size, 1);
  const [digest, record] = [...database.rows][0];
  assert.equal(digest, sessionTokenDigest(token));
  assert.match(digest, /^[a-f0-9]{64}$/u);
  assert.deepEqual(Object.keys(record).sort(), ['expiresAt', 'tokenDigest', 'userId']);
  assert.equal(record.userId, 'user-1');
  assert.ok(record.expiresAt instanceof Date);
  assert.equal(record.expiresAt.getTime(), clock + SESSION_TTL_MS);
  assert.equal(JSON.stringify(record).includes(token), false);
  assert.deepEqual(await sessions.lookup(token), {
    userId: 'user-1', expiresAt: clock + SESSION_TTL_MS,
  });
  assert.deepEqual(database.calls.at(-1)[2], {
    projection: { _id: 0, userId: 1, expiresAt: 1 },
  });
  const another = createMongoSessionStore(database, { now: () => clock });
  assert.deepEqual(await another.lookup(token), await sessions.lookup(token));
  assert.equal(createInMemorySessionStore().lookup(token), null);
});

test('two Mongo session-store instances can restore and revoke the same token', async () => {
  const database = fakeSessionsDatabase();
  const first = createMongoSessionStore(database);
  const second = createMongoSessionStore(database);
  const firstToken = await first.create('reader');
  const secondToken = await second.create('reader');
  assert.notEqual(firstToken, secondToken);
  assert.equal((await second.lookup(firstToken)).userId, 'reader');
  assert.equal(await second.revoke(firstToken), true);
  assert.equal(await first.lookup(firstToken), null);
  assert.equal(await first.revoke(firstToken), false);
  assert.equal((await first.lookup(secondToken)).userId, 'reader');
});

test('session lookups enforce expiry even before MongoDB TTL cleanup runs', async () => {
  let clock = 10_000;
  const database = fakeSessionsDatabase();
  const sessions = createMongoSessionStore(database, { now: () => clock });
  const token = await sessions.create('reader');
  clock += SESSION_TTL_MS - 1;
  assert.equal((await sessions.lookup(token)).userId, 'reader');
  clock += 1;
  assert.equal(await sessions.lookup(token), null);
  // MongoDB's TTL monitor can be delayed, so the record may still exist.
  assert.equal(database.rows.size, 1);
  assert.deepEqual(database.calls.at(-1)[1].expiresAt, { $gt: new Date(clock) });
});

test('invalid tokens and user IDs cannot access the database', async () => {
  const database = fakeSessionsDatabase();
  const sessions = createMongoSessionStore(database);
  for (const id of [null, '', 123]) {
    await assert.rejects(() => sessions.create(id), TypeError);
  }
  for (const token of [null, undefined, '', 123, 'not-valid', 'x'.repeat(10000)]) {
    assert.equal(await sessions.lookup(token), null);
    assert.equal(await sessions.revoke(token), false);
  }
  assert.equal(database.calls.length, 0);
});

test('unexpected MongoDB failures reject rather than grant sessions', async () => {
  const database = fakeSessionsDatabase();
  const sessions = createMongoSessionStore(database);
  const token = await sessions.create('reader');
  database.collection('sessions').findOne = async () => {
    throw new Error('private database host and credentials');
  };
  await assert.rejects(() => sessions.lookup(token), /private database host/);
  database.collection('sessions').deleteOne = async () => {
    throw new Error('database unavailable');
  };
  await assert.rejects(() => sessions.revoke(token), /database unavailable/);
  database.collection('sessions').insertOne = async () => {
    throw new Error('database unavailable');
  };
  await assert.rejects(() => sessions.create('reader'), /database unavailable/);
});
