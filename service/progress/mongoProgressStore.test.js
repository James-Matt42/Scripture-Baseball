import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMongoProgressStore } from './mongoProgressStore.js';
import { ProgressError, validateAttempt, validateGuestImport } from './validation.js';

import { fakeMongoProgressDatabase as fakeAttemptsDatabase } from './fakeMongoProgressDatabase.testSupport.js';

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
  assert.equal(database.attemptRows.size, 1);
  const document = [...database.attemptRows.values()][0];
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
  assert.deepEqual(database.calls.find(([method]) => method === 'find').slice(1), ['attempts', { userId: 'bob' }]);
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
  assert.equal(database.attemptRows.size, 1);
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
  assert.deepEqual(await store.favorites('reader'), ['alma-32-21']);
  assert.equal((await store.preferences('reader')).answerDifficulty, 'exact-verse');
  assert.deepEqual(await store.favorites('other-user'), []);

  // All account data, including the original import receipt, survives restart.
  const restarted = createMongoProgressStore(database);
  assert.equal((await restarted.attempts('reader')).length, 1);
  assert.deepEqual(await restarted.importGuest('reader', data), { ...result, replayed: true });
  assert.deepEqual(await restarted.favorites('reader'), ['alma-32-21']);
  assert.equal((await restarted.preferences('reader')).answerDifficulty, 'exact-verse');
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
  assert.deepEqual(await store.favorites('reader'), []);
  assert.equal((await store.preferences('reader')).answerDifficulty, 'book-chapter');
});

test('failed Mongo inserts do not acknowledge attempts or change guest preferences', async () => {
  const database = fakeAttemptsDatabase();
  const store = createMongoProgressStore(database);
  database.failInsertOnce(new Error('private-host: secret'));
  await assert.rejects(store.recordAttempt('reader', guess()), /private-host/);
  assert.deepEqual(await store.attempts('reader'), []);
  database.failInsertOnce(new Error('database unavailable'));
  await assert.rejects(store.importGuest('reader', guestData()), /database unavailable/);
  assert.deepEqual(await store.favorites('reader'), []);
  assert.equal((await store.preferences('reader')).answerDifficulty, 'book-chapter');
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

test('Mongo favorites and preferences persist across store instances and remain user-scoped', async () => {
  const database = fakeAttemptsDatabase();
  const first = createMongoProgressStore(database);
  assert.deepEqual(await first.favorites('reader'), []);
  assert.deepEqual(await first.preferences('reader'), {
    answerDifficulty: 'book-chapter', preferredVolume: '',
    practiceReminders: false, gameNotifications: true,
  });
  assert.deepEqual(await first.setFavorites('reader', ['alma-32-21', '2-nephi-2-25']),
    ['alma-32-21', '2-nephi-2-25']);
  await first.setPreferences('reader', { preferredVolume: 'book-of-mormon', practiceReminders: true });
  await first.setPreferences('reader', { answerDifficulty: 'exact-verse' });
  const restarted = createMongoProgressStore(database);
  assert.deepEqual(await restarted.favorites('reader'), ['alma-32-21', '2-nephi-2-25']);
  assert.deepEqual(await restarted.preferences('reader'), {
    answerDifficulty: 'exact-verse', preferredVolume: 'book-of-mormon',
    practiceReminders: true, gameNotifications: true,
  });
  assert.deepEqual(await restarted.favorites('stranger'), []);
  assert.equal((await restarted.preferences('stranger')).answerDifficulty, 'book-chapter');
  await restarted.setFavorites('reader', []);
  assert.deepEqual(await first.favorites('reader'), []);
  assert.equal(database.rows.favorites.size, 1);
  assert.equal(database.rows.preferences.size, 1);
});

test('Mongo guest receipt stays identical across restarts and does not reveal import input', async () => {
  const database = fakeAttemptsDatabase();
  const first = createMongoProgressStore(database, { now: () => Date.UTC(2026, 10, 8) });
  const payload = guestData();
  const initial = await first.importGuest('reader', payload);
  assert.equal(initial.replayed, false);
  assert.equal(initial.importedCount, 1);
  assert.equal(initial.favoritesAdded, 1);
  const receipt = [...database.rows.guestImports.values()][0];
  assert.equal(receipt.userId, 'reader');
  assert.equal(receipt.importId, payload.importId);
  assert.match(receipt.fingerprint, /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(receipt).includes('2026-10-01'), false);
  assert.ok(receipt.completedAt instanceof Date);
  assert.equal(receipt.result.importedCount, 1);
  const restarted = createMongoProgressStore(database);
  assert.deepEqual(await restarted.importGuest('reader', payload), { ...initial, replayed: true });
  await assert.rejects(restarted.importGuest('reader', guestData({ favorites: ['2-nephi-2-25'] })),
    (error) => error instanceof ProgressError && error.status === 409);
  assert.equal(database.rows.guestImports.size, 1);
  assert.equal(database.rows.attempts.size, 1);
});

test('later imports merge favorites but do not overwrite touched preferences', async () => {
  const database = fakeAttemptsDatabase();
  const store = createMongoProgressStore(database);
  await store.importGuest('reader', guestData());
  await store.setPreferences('reader', { answerDifficulty: 'book-chapter' });
  const later = guestData({
    importId: 'second', attempts: [{ ...guess({ id: 'pitch-2' }) }],
    favorites: ['2-nephi-2-25', 'alma-32-21'],
  });
  const outcome = await store.importGuest('reader', later);
  assert.deepEqual({ added: outcome.favoritesAdded, imported: outcome.importedPreferences },
    { added: 1, imported: false });
  assert.equal((await store.preferences('reader')).answerDifficulty, 'book-chapter');
  assert.deepEqual(await store.favorites('reader'), ['alma-32-21', '2-nephi-2-25']);
  assert.equal((await store.attempts('reader')).length, 2);
});

test('explicitly edited preferences are never replaced by a guest import', async () => {
  const database = fakeAttemptsDatabase();
  const store = createMongoProgressStore(database);
  await store.setPreferences('reader', {});
  const result = await store.importGuest('reader', guestData());
  assert.equal(result.importedPreferences, false);
  assert.equal((await store.preferences('reader')).answerDifficulty, 'book-chapter');
});

test('failed attempt writes roll back an entire multi-attempt guest import', async () => {
  const database = fakeAttemptsDatabase();
  const store = createMongoProgressStore(database);
  const data = guestData({ attempts: [guess(), guess({ id: 'pitch-2' })] });
  database.failInsertOnce(new Error('temporary failure'));
  await assert.rejects(store.importGuest('reader', data), /temporary failure/);
  assert.equal(database.rows.attempts.size, 0);
  assert.equal(database.rows.favorites.size, 0);
  assert.equal(database.rows.preferences.size, 0);
  assert.equal(database.rows.guestImports.size, 0);
  assert.equal((await store.importGuest('reader', data)).importedCount, 2);
  assert.equal(database.rows.attempts.size, 2);
  assert.ok(database.calls.some(([method, collection]) =>
    method === 'insertMany' && collection === 'attempts'));
});

test('failure writing the receipt rolls back attempts, favorites and preferences', async () => {
  const database = fakeAttemptsDatabase();
  const store = createMongoProgressStore(database);
  database.failInsertOnce(new Error('receipt unavailable'), 'guestImports');
  await assert.rejects(store.importGuest('reader', guestData()), /receipt unavailable/);
  assert.deepEqual(await store.attempts('reader'), []);
  assert.deepEqual(await store.favorites('reader'), []);
  assert.equal((await store.preferences('reader')).answerDifficulty, 'book-chapter');
  assert.equal(database.rows.guestImports.size, 0);
  const completed = await store.importGuest('reader', guestData());
  assert.equal(completed.importedCount, 1);
  assert.equal(completed.importedPreferences, true);
});

test('concurrent imports preserve all distinct attempts and favorites without duplicate receipts', async () => {
  const database = fakeAttemptsDatabase();
  const first = createMongoProgressStore(database);
  const second = createMongoProgressStore(database);
  const initial = guestData();
  const simultaneous = await Promise.all([
    first.importGuest('reader', initial), second.importGuest('reader', initial),
  ]);
  assert.deepEqual(simultaneous.map((entry) => entry.replayed).sort(), [false, true]);
  assert.equal(database.rows.attempts.size, 1);
  assert.equal(database.rows.guestImports.size, 1);
  const next = await Promise.all([
    first.importGuest('reader', guestData({
      importId: 'different:1', attempts: [guess({ id: 'pitch-two' })],
      favorites: ['2-nephi-2-25'],
    })),
    second.importGuest('reader', guestData({
      importId: 'different:2', attempts: [guess({ id: 'pitch-three' })],
      favorites: ['2-nephi-2-25'],
    })),
  ]);
  assert.deepEqual(next.map((x) => x.importedCount), [1, 1]);
  assert.equal(database.rows.attempts.size, 3);
  assert.equal(database.rows.guestImports.size, 3);
  assert.deepEqual(await first.favorites('reader'), ['alma-32-21', '2-nephi-2-25']);
});

test('guest import fails rather than writing partial state without transaction support', async () => {
  const database = fakeAttemptsDatabase();
  delete database.client;
  const store = createMongoProgressStore(database);
  await assert.rejects(store.importGuest('reader', guestData()), /transactions are required/u);
  assert.equal(database.rows.attempts.size, 0);
  assert.equal(database.rows.guestImports.size, 0);
});

test('favorites and preferences surface database failures without returning false success', async () => {
  const database = fakeAttemptsDatabase();
  const store = createMongoProgressStore(database);
  database.failInsertOnce(new Error('private-store unavailable'), 'favorites', 'replaceOne');
  await assert.rejects(store.setFavorites('reader', ['alma-32-21']), /private-store unavailable/);
  assert.deepEqual(await store.favorites('reader'), []);
  database.failInsertOnce(new Error('write error'), 'preferences', 'updateOne');
  await assert.rejects(store.setPreferences('reader', { preferredVolume: 'new-testament' }), /write error/);
  assert.equal((await store.preferences('reader')).preferredVolume, '');
  database.failReads(new Error('read failed'));
  await assert.rejects(store.favorites('reader'), /read failed/);
  await assert.rejects(store.preferences('reader'), /read failed/);
});
