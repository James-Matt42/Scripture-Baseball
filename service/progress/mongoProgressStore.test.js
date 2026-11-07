import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMongoProgressStore } from './mongoProgressStore.js';
import { ProgressError, validateAttempt, validateGuestImport } from './validation.js';

// A minimal MongoDB-collection fake: it enforces the (userId, id) unique
// index, supports fresh adapter instances, and honors projection/sort.
// Live MongoDB restart and index tests are still necessary before release.
function fakeAttemptsDatabase() {
  const rows = new Map();
  const calls = [];
  let failNextInsert = null;
  let failRead = null;
  let nextId = 1;
  const key = (userId, id) => JSON.stringify([userId, id]);
  const copy = (row) => {
    if (!row) return null;
    const { _id, userId, ...attempt } = row;
    return { ...attempt };
  };
  const collection = {
    async findOne(query, options) {
      calls.push(['findOne', query, options]);
      if (failRead) throw failRead;
      return copy(rows.get(key(query.userId, query.id)));
    },
    find(query, options) {
      calls.push(['find', query, options]);
      return {
        sort(sortBy) {
          assert.deepEqual(sortBy, { recordedAt: 1, _id: 1 });
          return {
            async toArray() {
              if (failRead) throw failRead;
              return [...rows.values()].filter((row) => row.userId === query.userId)
                .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a._id - b._id)
                .map(copy);
            },
          };
        },
      };
    },
    async countDocuments(query) {
      calls.push(['countDocuments', query]);
      if (failRead) throw failRead;
      return [...rows.values()].filter((row) => row.userId === query.userId).length;
    },
    async insertOne(document) {
      calls.push(['insertOne', document]);
      if (failNextInsert) {
        const error = failNextInsert;
        failNextInsert = null;
        throw error;
      }
      const rowKey = key(document.userId, document.id);
      if (rows.has(rowKey)) {
        const error = new Error('E11000 duplicate key');
        error.code = 11000;
        throw error;
      }
      const id = nextId++;
      rows.set(rowKey, { ...document, _id: id });
      return { insertedId: id };
    },
  };
  return {
    rows, calls,
    collection(name) {
      assert.equal(name, 'attempts');
      return collection;
    },
    failInsertOnce(error) { failNextInsert = error; },
    failReads(error) { failRead = error; },
  };
}

const guess = (changes = {}) => validateAttempt({
  id: 'pitch-1', questionId: '2-nephi-2-25', bookId: 'alma', chapter: 2,
  challengeId: 'todays-lineup', bookCorrect: true, chapterCorrect: false,
  ...changes,
});
const guestData = (changes = {}) => validateGuestImport({
  importId: 'guest-import:1',
  attempts: [{ ...guess(), answeredAt: '2026-10-01T01:00:00.000Z' }],
  favorites: ['alma-32-21'], preferences: { answerDifficulty: 'exact-verse' },
  ...changes,
});

test('Mongo attempts are server-graded and isolated by the authenticated user ID', async () => {
  const database = fakeAttemptsDatabase();
  const store = createMongoProgressStore(database, { now: () => Date.UTC(2026, 10, 8) });
  const first = await store.recordAttempt('alice', guess());
  assert.equal(first.created, true);
  assert.equal(first.attempt.source, 'server');
  assert.equal(first.attempt.bookCorrect, false);
  assert.equal(first.attempt.chapterCorrect, true);
  assert.equal(first.attempt.recordedAt, '2026-11-08T00:00:00.000Z');
  assert.equal(first.attempt.earnedPoints, undefined);
  assert.equal(first.attempt.userId, undefined);
  assert.equal(database.rows.size, 1);
  const document = [...database.rows.values()][0];
  assert.equal(document.userId, 'alice');
  assert.equal(document.bookCorrect, false);
  assert.equal(document.chapterCorrect, true);
  assert.deepEqual(await store.attempts('bob'), []);
  assert.deepEqual(await store.summary('bob'), {
    totalAttempts: 0, uniquePassages: 0, bookCorrect: 0, chapterCorrect: 0,
    verseAttempts: 0, verseCorrect: 0, byVolume: [],
  });
  const verse = await store.recordAttempt('alice', guess({ id: 'pitch-2', bookId: '2-nephi', verse: 25 }));
  assert.equal(verse.attempt.verseCorrect, true);
  assert.deepEqual(await store.summary('alice'), {
    totalAttempts: 2, uniquePassages: 1, bookCorrect: 1, chapterCorrect: 2,
    verseAttempts: 1, verseCorrect: 1,
    byVolume: [{ volume: 'book-of-mormon', attempts: 2, bookCorrect: 1, chapterCorrect: 2 }],
  });
  assert.equal(await store.recordAttempt('bob', guess()).then((result) => result.created), true);
  assert.equal((await store.attempts('bob')).length, 1);
  assert.deepEqual(database.calls.find(([method]) => method === 'find')[1], { userId: 'bob' });
});

test('Mongo retries work after a new store instance and conflicting guesses return 409', async () => {
  const database = fakeAttemptsDatabase();
  const first = createMongoProgressStore(database);
  const second = createMongoProgressStore(database);
  assert.equal((await first.recordAttempt('reader', guess())).created, true);
  const replay = await second.recordAttempt('reader', guess());
  assert.equal(replay.created, false);
  assert.equal(replay.attempt.source, 'server');
  await assert.rejects(second.recordAttempt('reader', guess({ chapter: 3 })),
    (error) => error instanceof ProgressError && error.status === 409);
  assert.equal((await second.attempts('reader')).length, 1);
});

test('unique Mongo index handles concurrent same-ID submissions and rejects changed answers', async () => {
  const database = fakeAttemptsDatabase();
  const first = createMongoProgressStore(database);
  const second = createMongoProgressStore(database);
  const matches = await Promise.all([
    first.recordAttempt('reader', guess()), second.recordAttempt('reader', guess()),
  ]);
  assert.deepEqual(matches.map((r) => r.created).sort(), [false, true]);
  assert.equal(database.rows.size, 1);
  const other = createMongoProgressStore(fakeAttemptsDatabase());
  const different = await Promise.allSettled([
    other.recordAttempt('reader', guess()),
    other.recordAttempt('reader', guess({ chapter: 3 })),
  ]);
  assert.equal(different.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(different.find((r) => r.status === 'rejected').reason.status, 409);
});

test('guest attempts persist, retain unverified timestamps, and never trust client grades', async () => {
  const database = fakeAttemptsDatabase();
  const store = createMongoProgressStore(database, { now: () => Date.UTC(2026, 10, 8) });
  const data = guestData();
  const result = await store.importGuest('reader', data);
  assert.deepEqual(result, {
    importId: data.importId, importedCount: 1, alreadyPresentCount: 0,
    favoritesAdded: 1, importedPreferences: true, replayed: false,
  });
  const stored = (await store.attempts('reader'))[0];
  assert.equal(stored.source, 'guest-import');
  assert.equal(stored.answeredAt, '2026-10-01T01:00:00.000Z');
  assert.equal(stored.recordedAt, '2026-11-08T00:00:00.000Z');
  assert.equal(stored.bookCorrect, false);
  assert.equal(stored.chapterCorrect, true);
  assert.equal((await store.importGuest('reader', data)).replayed, true);
  await assert.rejects(store.importGuest('reader', guestData({ favorites: ['2-nephi-2-25'] })),
    { status: 409 });
  assert.deepEqual(store.favorites('reader'), ['alma-32-21']);
  assert.equal(store.preferences('reader').answerDifficulty, 'exact-verse');
  assert.deepEqual(store.favorites('other-user'), []);

  // DB-05 still needs to persist import receipts and preferences, but DB-04
  // already recovers the attempt records from MongoDB on restart.
  const restarted = createMongoProgressStore(database);
  assert.equal((await restarted.attempts('reader')).length, 1);
  assert.equal((await restarted.importGuest('reader', data)).importedCount, 0);
  assert.equal((await restarted.attempts('reader')).length, 1);
});

test('guest import checks every attempt conflict before it changes state', async () => {
  const database = fakeAttemptsDatabase();
  const store = createMongoProgressStore(database);
  await store.recordAttempt('reader', guess());
  await assert.rejects(store.importGuest('reader', guestData({
    attempts: [
      { ...guess({ id: 'new-pitch' }) },
      { ...guess({ chapter: 3 }) },
    ],
  })), { status: 409 });
  assert.equal((await store.attempts('reader')).length, 1);
  assert.deepEqual(store.favorites('reader'), []);
  assert.equal(store.preferences('reader').answerDifficulty, 'book-chapter');
});

test('failed Mongo inserts do not acknowledge attempts or change guest preferences', async () => {
  const database = fakeAttemptsDatabase();
  const store = createMongoProgressStore(database);
  database.failInsertOnce(new Error('private-host: secret'));
  await assert.rejects(store.recordAttempt('reader', guess()), /private-host/);
  assert.deepEqual(await store.attempts('reader'), []);
  database.failInsertOnce(new Error('database unavailable'));
  await assert.rejects(store.importGuest('reader', guestData()), /database unavailable/);
  assert.deepEqual(store.favorites('reader'), []);
  assert.equal(store.preferences('reader').answerDifficulty, 'book-chapter');
  assert.equal((await store.importGuest('reader', guestData())).importedCount, 1);
});

test('read errors propagate instead of returning empty history or false success', async () => {
  const database = fakeAttemptsDatabase();
  const store = createMongoProgressStore(database);
  database.failReads(new Error('private-host: read failure'));
  await assert.rejects(store.attempts('reader'), /private-host/);
  await assert.rejects(store.recordAttempt('reader', guess()), /private-host/);
  await assert.rejects(store.importGuest('reader', guestData()), /private-host/);
});
