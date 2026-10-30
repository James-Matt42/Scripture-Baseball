import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInMemoryProgressStore, summarizeProgress } from './progressStore.js';
import { ProgressError, validateAttempt, validateGuestImport } from './validation.js';

const guess = (overrides = {}) => validateAttempt({
  id: 'pitch-1', questionId: '2-nephi-2-25', bookId: 'alma', chapter: 2,
  challengeId: 'todays-lineup', bookCorrect: true, chapterCorrect: false,
  ...overrides,
});

test('server independently grades book, chapter and optional verse, not browser flags', () => {
  const store = createInMemoryProgressStore({ now: () => Date.UTC(2026, 10, 5) });
  const first = store.recordAttempt('user-1', guess());
  assert.equal(first.created, true);
  assert.equal(first.attempt.bookCorrect, false);
  assert.equal(first.attempt.chapterCorrect, true);
  assert.equal(first.attempt.verseCorrect, undefined);
  assert.equal(first.attempt.source, 'server');
  assert.equal(first.attempt.answeredAt, '2026-11-05T00:00:00.000Z');
  const second = store.recordAttempt('user-1', guess({ id: 'pitch-2', bookId: '2-nephi', verse: 12 }));
  assert.equal(second.attempt.bookCorrect, true);
  assert.equal(second.attempt.chapterCorrect, true);
  assert.equal(second.attempt.verseCorrect, false);
  assert.deepEqual(store.summary('user-1'), {
    totalAttempts: 2, uniquePassages: 1, bookCorrect: 1, chapterCorrect: 2,
    verseAttempts: 1, verseCorrect: 0,
    byVolume: [{ volume: 'book-of-mormon', attempts: 2, bookCorrect: 1, chapterCorrect: 2 }],
  });
  assert.deepEqual(summarizeProgress([]), {
    totalAttempts: 0, uniquePassages: 0, bookCorrect: 0, chapterCorrect: 0,
    verseAttempts: 0, verseCorrect: 0, byVolume: [],
  });
});

test('attempt IDs deduplicate retries but conflict on changed guesses', () => {
  const store = createInMemoryProgressStore();
  assert.equal(store.recordAttempt('user-1', guess()).created, true);
  assert.equal(store.recordAttempt('user-1', guess()).created, false);
  assert.equal(store.attempts('user-1').length, 1);
  assert.throws(() => store.recordAttempt('user-1', guess({ chapter: 3 })),
    { name: 'ProgressError', status: 409 });
});

test('attempts, favorites and preferences are isolated by verified user ID and copied', () => {
  const store = createInMemoryProgressStore();
  store.recordAttempt('user-a', guess());
  const snapshot = store.attempts('user-a');
  snapshot[0].bookCorrect = true;
  assert.equal(store.attempts('user-a')[0].bookCorrect, false);
  assert.equal(store.attempts('user-b').length, 0);
  store.setFavorites('user-a', ['alma-32-21']);
  store.setPreferences('user-a', { preferredVolume: 'book-of-mormon' });
  assert.deepEqual(store.favorites('user-b'), []);
  assert.equal(store.preferences('user-b').preferredVolume, '');
  assert.deepEqual(store.favorites('user-a'), ['alma-32-21']);
  assert.equal(store.preferences('user-a').preferredVolume, 'book-of-mormon');
});

test('guest import is idempotent, recalculated, merged and never overwrites updated preferences', () => {
  const store = createInMemoryProgressStore();
  const input = validateGuestImport({
    importId: 'guest-import:1', attempts: [{ ...guess(), answeredAt: '2026-10-01T05:00:00.000Z' }],
    favorites: ['alma-32-21'], preferences: { answerDifficulty: 'exact-verse' },
  });
  const initial = store.importGuest('user-a', input);
  assert.deepEqual(initial, {
    importId: 'guest-import:1', importedCount: 1, alreadyPresentCount: 0,
    favoritesAdded: 1, importedPreferences: true, replayed: false,
  });
  assert.equal(store.attempts('user-a')[0].bookCorrect, false);
  assert.equal(store.attempts('user-a')[0].source, 'guest-import');
  assert.equal(store.attempts('user-a')[0].answeredAt, '2026-10-01T05:00:00.000Z');
  assert.equal(store.preferences('user-a').answerDifficulty, 'exact-verse');
  assert.equal(store.importGuest('user-a', input).replayed, true);
  assert.equal(store.attempts('user-a').length, 1);
  store.setPreferences('user-a', { answerDifficulty: 'book-chapter' });
  const later = validateGuestImport({
    importId: 'guest-import:2', attempts: [{ ...guess(), id: 'pitch-2' }],
    preferences: { answerDifficulty: 'exact-verse' }, favorites: ['alma-32-21', '2-nephi-2-25'],
  });
  assert.equal(store.importGuest('user-a', later).importedPreferences, false);
  assert.equal(store.preferences('user-a').answerDifficulty, 'book-chapter');
  assert.deepEqual(store.favorites('user-a'), ['alma-32-21', '2-nephi-2-25']);
  assert.equal(store.attempts('user-a').length, 2);
});

test('guest import preflights conflicts so no partial attempts or favorites are saved', () => {
  const store = createInMemoryProgressStore();
  store.recordAttempt('user-a', guess({ id: 'pitch-1' }));
  const importData = validateGuestImport({
    importId: 'batch-one',
    attempts: [
      { ...guess({ id: 'new-1' }) },
      { ...guess({ id: 'pitch-1', chapter: 3 }) },
    ],
    favorites: ['alma-32-21'],
  });
  assert.throws(() => store.importGuest('user-a', importData), ProgressError);
  assert.equal(store.attempts('user-a').length, 1);
  assert.deepEqual(store.favorites('user-a'), []);
});

test('an importId reused with different data returns 409, not an accidental merge', () => {
  const store = createInMemoryProgressStore();
  store.importGuest('user-a', validateGuestImport({ importId: 'one', attempts: [guess()] }));
  assert.throws(() => store.importGuest('user-a', validateGuestImport({
    importId: 'one', attempts: [guess({ id: 'pitch-2' })],
  })), { status: 409 });
  assert.equal(store.attempts('user-a').length, 1);
});
