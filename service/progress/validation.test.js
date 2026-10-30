import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_PREFERENCES, ProgressError, validateAttempt, validateFavorites,
  validateGuestImport, validatePreferencesPatch,
} from './validation.js';

const basic = () => ({
  id: 'guest-inning-1:0', questionId: '2-nephi-2-25', bookId: 'alma',
  chapter: 2, challengeId: 'todays-lineup',
  bookCorrect: true, chapterCorrect: false, earnedPoints: 9999,
});

test('attempt normalization retains guesses but drops client-supplied scores', () => {
  assert.deepEqual(validateAttempt(basic()), {
    id: 'guest-inning-1:0', questionId: '2-nephi-2-25', bookId: 'alma',
    chapter: 2, challengeId: 'todays-lineup',
  });
  const automatic = validateAttempt({ ...basic(), id: undefined });
  assert.match(automatic.id, /^[0-9a-f-]{36}$/u);
  assert.equal(automatic.bookCorrect, undefined);
});

test('attempts validate question, offered book choice, numeric guesses and stable IDs', () => {
  for (const invalid of [
    null, [], 'text',
    { ...basic(), questionId: 'unknown' },
    { ...basic(), bookId: 'john' },
    { ...basic(), bookId: '__proto__' },
    { ...basic(), chapter: 0 },
    { ...basic(), chapter: '1e3' },
    { ...basic(), chapter: 2.5 },
    { ...basic(), chapter: 10000 },
    { ...basic(), verse: -3 },
    { ...basic(), challengeId: 'not-real' },
    { ...basic(), id: 'invalid id' },
    { ...basic(), id: '../danger' },
  ]) assert.throws(() => validateAttempt(invalid), ProgressError);
  assert.deepEqual(validateAttempt({ ...basic(), chapter: '2', verse: '25' }).verse, 25);
});

test('favorites reject unknown passages and return a unique list', () => {
  assert.deepEqual(validateFavorites(['alma-32-21', 'alma-32-21', '2-nephi-2-25']),
    ['alma-32-21', '2-nephi-2-25']);
  for (const bad of [null, {}, ['unknown'], Array(101).fill('alma-32-21')]) {
    assert.throws(() => validateFavorites(bad), ProgressError);
  }
});

test('preferences validate all four supported options and preserve partial patches', () => {
  assert.deepEqual(DEFAULT_PREFERENCES, {
    answerDifficulty: 'book-chapter', preferredVolume: '',
    practiceReminders: false, gameNotifications: true,
  });
  assert.deepEqual(validatePreferencesPatch({ answerDifficulty: 'exact-verse', practiceReminders: true }),
    { answerDifficulty: 'exact-verse', practiceReminders: true });
  assert.deepEqual(validatePreferencesPatch({ preferredVolume: 'book-of-mormon' }),
    { preferredVolume: 'book-of-mormon' });
  for (const bad of [null, [], { answerDifficulty: 'free-text' },
    { preferredVolume: 'bad-volume' }, { practiceReminders: 'yes' }, { isAdmin: true }]) {
    assert.throws(() => validatePreferencesPatch(bad), ProgressError);
  }
});

test('guest imports require stable IDs and valid source guesses, never client verdicts', () => {
  const result = validateGuestImport({
    importId: 'guest-2026:batch-01',
    attempts: [{ ...basic(), answeredAt: '2026-10-01T10:20:30.000Z' }],
    favorites: ['alma-32-21'], preferences: { gameNotifications: false },
  });
  assert.equal(result.importId, 'guest-2026:batch-01');
  assert.equal(result.attempts[0].answeredAt, '2026-10-01T10:20:30.000Z');
  assert.equal(result.attempts[0].bookCorrect, undefined);
  for (const bad of [
    { importId: '', attempts: [] },
    { importId: 'valid', attempts: 'not array' },
    { importId: 'valid', attempts: Array(201).fill(basic()) },
    { importId: 'valid', attempts: [basic(), basic()] },
    { importId: 'valid', attempts: [{ ...basic(), id: undefined }] },
    { importId: 'valid', attempts: [{ ...basic(), answeredAt: '2099-01-01T00:00:00.000Z' }] },
    { importId: 'valid', attempts: [], favorites: ['unknown'] },
  ]) assert.throws(() => validateGuestImport(bad), ProgressError);
});
