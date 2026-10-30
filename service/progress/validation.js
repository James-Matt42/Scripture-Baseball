import { randomUUID } from 'node:crypto';
import { SCRIPTURE_BOOKS, getQuestionById } from '../domain/questions.js';
import { getChallengeById } from '../domain/catalog.js';

export class ProgressError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ProgressError';
    this.status = status;
  }
}

export const DEFAULT_PREFERENCES = Object.freeze({
  answerDifficulty: 'book-chapter',
  preferredVolume: '',
  practiceReminders: false,
  gameNotifications: true,
});

export const MAX_FAVORITES = 100;
export const MAX_IMPORT_ATTEMPTS = 200;

const volumes = new Set(['', ...SCRIPTURE_BOOKS.map((book) => book.volume)]);
const books = new Set(SCRIPTURE_BOOKS.map((book) => book.id));
const attemptIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/u;
const importIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/u;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalid(message) {
  throw new ProgressError(message);
}

function wholeNumber(value, name) {
  // A finite, bounded integer, never a fractional number or an exponent string.
  const result = typeof value === 'number' ? value
    : (typeof value === 'string' && /^[1-9]\d{0,3}$/u.test(value) ? Number(value) : NaN);
  if (!Number.isSafeInteger(result) || result < 1 || result > 9999) {
    invalid(`${name} must be a whole number from 1 to 9999`);
  }
  return result;
}

function validateId(value, pattern, field) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    invalid(`${field} must be a nonempty stable identifier (at most 120 characters)`);
  }
  return value;
}

function parseAnsweredAt(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT/u.test(value)) {
    invalid('answeredAt must be an ISO timestamp');
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time < Date.UTC(2000, 0, 1) || time > Date.now() + 5 * 60_000) {
    invalid('answeredAt must be a valid historical timestamp, not a future date');
  }
  return new Date(time).toISOString();
}

/**
 * Only accept *guesses*; never accept browser-supplied grading flags or points.
 * The server regrades this data in progressStore.js against its own catalog.
 */
export function validateAttempt(input, { imported = false } = {}) {
  if (!isRecord(input)) invalid('Attempt must be a JSON object');
  const question = typeof input.questionId === 'string' ? getQuestionById(input.questionId) : null;
  if (!question) invalid('Unknown scripture question');
  if (typeof input.bookId !== 'string' || !books.has(input.bookId) ||
      !question.choices.includes(input.bookId)) {
    invalid('bookId must be one of the question choices');
  }
  const chapter = wholeNumber(input.chapter, 'chapter');
  const verse = input.verse === undefined || input.verse === null
    ? undefined : wholeNumber(input.verse, 'verse');
  const challengeId = input.challengeId === undefined || input.challengeId === null
    ? null : input.challengeId;
  if (challengeId !== null && (typeof challengeId !== 'string' || !getChallengeById(challengeId))) {
    invalid('Unknown challenge');
  }
  const id = input.id === undefined && !imported ? randomUUID()
    : validateId(input.id, attemptIdPattern, 'Attempt id');
  const answeredAt = imported ? parseAnsweredAt(input.answeredAt) : undefined;
  return {
    id,
    questionId: question.id,
    bookId: input.bookId,
    chapter,
    ...(verse === undefined ? {} : { verse }),
    challengeId,
    ...(answeredAt ? { answeredAt } : {}),
  };
}

export function validateFavorites(input) {
  if (!Array.isArray(input) || input.length > MAX_FAVORITES) {
    invalid(`favorites must be an array with at most ${MAX_FAVORITES} question IDs`);
  }
  if (input.some((id) => typeof id !== 'string' || !getQuestionById(id))) {
    invalid('favorites contain an unknown question ID');
  }
  return [...new Set(input)];
}

export function validatePreferencesPatch(input) {
  if (!isRecord(input)) invalid('preferences must be a JSON object');
  const allowed = Object.keys(DEFAULT_PREFERENCES);
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.includes(key)) invalid(`Unknown preference: ${key}`);
    if (key === 'answerDifficulty' && !['book-chapter', 'exact-verse'].includes(value)) {
      invalid('Invalid answerDifficulty');
    }
    if (key === 'preferredVolume' && !volumes.has(value)) {
      invalid('Invalid preferredVolume');
    }
    if (['practiceReminders', 'gameNotifications'].includes(key) && typeof value !== 'boolean') {
      invalid(`Invalid ${key}`);
    }
  }
  return { ...input };
}

export function validateGuestImport(input) {
  if (!isRecord(input)) invalid('Import must be a JSON object');
  const importId = validateId(input.importId, importIdPattern, 'importId');
  if (!Array.isArray(input.attempts) || input.attempts.length > MAX_IMPORT_ATTEMPTS) {
    invalid(`attempts must be an array with at most ${MAX_IMPORT_ATTEMPTS} entries`);
  }
  const attempts = input.attempts.map((attempt) => validateAttempt(attempt, { imported: true }));
  if (new Set(attempts.map((attempt) => attempt.id)).size !== attempts.length) {
    invalid('Import contains repeated attempt IDs');
  }
  const favorites = input.favorites === undefined ? [] : validateFavorites(input.favorites);
  const preferences = input.preferences === undefined ? null : validatePreferencesPatch(input.preferences);
  return { importId, attempts, favorites, preferences };
}
