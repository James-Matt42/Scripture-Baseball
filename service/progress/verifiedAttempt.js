/**
 * The completed pitch engine is the only caller that can construct these
 * records. Browser submissions contain just a stage and a guess; neither
 * references nor correctness flags are accepted by this persistence boundary.
 */
import { ProgressError } from './validation.js';

const REFERENCE = /^([a-z]+):([a-z0-9-]+):([1-9]\d{0,3}):([1-9]\d{0,3})$/u;
const PITCH_ID = /^[A-Za-z0-9_-]{32,128}$/u;

export function verifiedAttemptFromPitch(pitchId, completed, now = Date.now) {
  const parts = typeof completed?.reference === 'string' ? REFERENCE.exec(completed.reference) : null;
  if (!PITCH_ID.test(pitchId) || !parts ||
      parts[1] !== completed.volume || parts[2] !== completed.book ||
      Number(parts[3]) !== completed.chapter || Number(parts[4]) !== completed.verse ||
      !Number.isSafeInteger(completed.chosenChapter) || completed.chosenChapter < 1 ||
      typeof completed.chapterCorrect !== 'boolean' ||
      (completed.chosenBook !== undefined &&
        (typeof completed.chosenBook !== 'string' || typeof completed.bookCorrect !== 'boolean')) ||
      (completed.chosenVerse !== undefined &&
        (!Number.isSafeInteger(completed.chosenVerse) || completed.chosenVerse < 1 ||
          typeof completed.verseCorrect !== 'boolean'))) {
    throw new ProgressError('The completed practice result is not valid');
  }
  const recordedAt = new Date(now()).toISOString();
  return {
    id: pitchId,
    reference: completed.reference,
    volume: completed.volume,
    book: completed.book,
    chapter: completed.chapter,
    verse: completed.verse,
    scope: { volume: completed.scope?.volume ?? null, book: completed.scope?.book ?? null },
    ...(completed.chosenBook === undefined ? {} : {
      chosenBook: completed.chosenBook, bookCorrect: completed.bookCorrect,
    }),
    chosenChapter: completed.chosenChapter,
    chapterCorrect: completed.chapterCorrect,
    ...(completed.chosenVerse === undefined ? {} : {
      chosenVerse: completed.chosenVerse, verseCorrect: completed.verseCorrect,
    }),
    source: 'verified-pitch',
    answeredAt: recordedAt,
    recordedAt,
  };
}

export function sameVerifiedAttempt(a, b) {
  const fields = ['id', 'reference', 'chosenBook', 'chosenChapter', 'chosenVerse',
    'bookCorrect', 'chapterCorrect', 'verseCorrect'];
  return fields.every((field) => a[field] === b[field]);
}
