import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInMemoryProgressStore, summarizeProgress } from './progressStore.js';
import { ProgressError } from './validation.js';
import { verifiedAttemptFromPitch } from './verifiedAttempt.js';

const id = 's'.repeat(43);
const attempt = (pitch = id) => verifiedAttemptFromPitch(pitch, {
  reference: 'bom:2-ne:9:1', volume: 'bom', book: '2-ne', chapter: 9, verse: 1,
  scope: { volume: 'bom', book: '2-ne' }, chosenChapter: 9, chapterCorrect: true,
}, () => Date.UTC(2026, 10, 12));

test('only verified pitches are persisted; retries remain idempotent across users', () => {
  const store = createInMemoryProgressStore();
  const first = store.recordVerifiedAttempt('alice', attempt());
  assert.equal(first.created, true);
  assert.equal(first.attempt.bookCorrect, undefined);
  assert.equal(store.recordVerifiedAttempt('alice', attempt()).created, false);
  assert.equal(store.attempts('alice').length, 1);
  assert.deepEqual(store.attempts('bob'), []);
  assert.equal(store.recordVerifiedAttempt('bob', attempt()).created, true);
  assert.throws(() => store.recordVerifiedAttempt('alice', { ...attempt(), chosenChapter: 8 }),
    (error) => error instanceof ProgressError && error.status === 409);
});

test('progress measures tested stages and distinct canonical references', () => {
  const all = [attempt(), { ...attempt('t'.repeat(43)), chapterCorrect: false, bookCorrect: false,
    verseCorrect: true }];
  assert.deepEqual(summarizeProgress(all), {
    totalAttempts: 2, uniquePassages: 1, bookCorrect: 0, chapterCorrect: 1,
    verseAttempts: 1, verseCorrect: 1,
    byVolume: [{ volume: 'bom', attempts: 2, bookCorrect: 0, chapterCorrect: 1 }],
  });
});

test('favorites, preferences and guest pitch claims stay user-scoped', () => {
  const store = createInMemoryProgressStore();
  store.setFavorites('alice', ['bom:2-ne:9:1']);
  store.setPreferences('alice', { preferredVolume: 'bom' });
  assert.deepEqual(store.favorites('bob'), []);
  assert.equal(store.preferences('bob').preferredVolume, '');
  store.stageGuestPitch(id, attempt());
  assert.equal(store.claimGuestPitch('alice', id).created, true);
  assert.equal(store.claimGuestPitch('alice', id).created, false);
  assert.throws(() => store.claimGuestPitch('bob', id), { status: 404 });
  assert.deepEqual(store.attempts('alice').map((a) => a.reference), ['bom:2-ne:9:1']);
});
