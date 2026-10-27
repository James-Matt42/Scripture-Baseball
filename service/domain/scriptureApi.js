import {
  SCRIPTURE_BOOKS,
  formatScriptureReference,
  getBookLabel,
  getQuestionById,
  gradeBookAndChapter,
  gradeExactVerse,
} from './questions.js';
import {
  CHALLENGES,
  filterChallenges,
  getChallengeById,
  getChallengeQuestions,
} from './catalog.js';

export class ScriptureApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ScriptureApiError';
    this.status = status;
  }
}

const validBooks = new Set(SCRIPTURE_BOOKS.map((book) => book.id));
const validVolumes = new Set(SCRIPTURE_BOOKS.map((book) => book.volume));
const validCategories = new Set(CHALLENGES.map((challenge) => challenge.category));
const validDifficulties = new Set(CHALLENGES.map((challenge) => challenge.difficulty));

function badRequest(message) {
  throw new ScriptureApiError(400, message);
}

function notFound(message) {
  throw new ScriptureApiError(404, message);
}

function requireQuestion(id) {
  const question = typeof id === 'string' ? getQuestionById(id) : null;
  if (!question) notFound('Scripture question not found');
  return question;
}

function requireChallenge(id) {
  const challenge = typeof id === 'string' ? getChallengeById(id) : null;
  if (!challenge) notFound('Challenge not found');
  return challenge;
}

/**
 * These explicit projections prevent answer keys (bookId, chapter, verse)
 * and internal challenge question IDs from being included in the GET payload.
 * The curated starter data is public; this is not an anti-cheat mechanism.
 */
export function publicQuestion(question) {
  return {
    id: question.id,
    passage: question.passage,
    choices: [...question.choices],
  };
}

export function publicChallenge(challenge) {
  const personalized = challenge.section === 'personal';
  return {
    id: challenge.id,
    title: challenge.title,
    section: challenge.section,
    category: challenge.category,
    difficulty: challenge.difficulty,
    description: challenge.description,
    personalized,
    questionCount: personalized ? null : getChallengeQuestions(challenge.id).length,
  };
}

export function getPublicBooks() {
  return SCRIPTURE_BOOKS.map(({ id, label, volume }) => ({ id, label, volume }));
}

function validatedFilters(filters, keys) {
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
    badRequest('Query filters must be an object');
  }
  const allowed = {
    volume: validVolumes,
    category: validCategories,
    difficulty: validDifficulties,
  };
  const normalized = {};
  for (const [key, value] of Object.entries(filters)) {
    if (!keys.includes(key)) badRequest(`Unsupported filter: ${key}`);
    if (typeof value !== 'string' || !allowed[key]?.has(value)) {
      badRequest(`Invalid ${key} filter`);
    }
    normalized[key] = value;
  }
  return normalized;
}

export function listPublicChallenges(filters = {}) {
  const validated = validatedFilters(filters, ['volume', 'category', 'difficulty']);
  return filterChallenges(validated).map(publicChallenge);
}

export function getPublicChallengeQuestions(challengeId, filters = {}) {
  const challenge = requireChallenge(challengeId);
  const { volume = '' } = validatedFilters(filters, ['volume']);
  // The user-specific packs are still local until the authenticated progress
  // endpoints arrive. Never accept a client's claimed attempts as server truth.
  const personalized = challenge.section === 'personal';
  const questions = personalized ? [] : getChallengeQuestions(challengeId, [], [], volume);
  return {
    challenge: publicChallenge(challenge),
    questions: questions.map(publicQuestion),
    total: questions.length,
    ...(personalized ? { notice: 'Personal challenges need authenticated progress, not available yet.' } : {}),
  };
}

export function getPublicQuestion(questionId) {
  return publicQuestion(requireQuestion(questionId));
}

function positiveNumber(value, field) {
  // HTML number inputs produce strings, but JSON clients can send numbers.
  // Reject floats, exponent strings, zero, negatives and oversized values.
  const parsed = typeof value === 'number'
    ? value
    : (typeof value === 'string' && /^[1-9]\d{0,3}$/.test(value) ? Number(value) : NaN);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 9999) {
    badRequest(`${field} must be a positive whole number (1–9999)`);
  }
  return parsed;
}

/**
 * Stateless staged checking. Reveals the book after a committed book guess,
 * the chapter after a committed chapter guess, and the verse/reference only
 * at the final stage. A wrong book does NOT invalidate a correct chapter.
 * For future scored multiplayer, attempts need a server-owned room/session.
 */
export function checkAnswer(questionId, body) {
  const question = requireQuestion(questionId);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    badRequest('Answer must be a JSON object');
  }
  const { stage, bookId } = body;
  if (!['book', 'chapter', 'verse'].includes(stage)) badRequest('Invalid answer stage');
  if (typeof bookId !== 'string' || !validBooks.has(bookId)) badRequest('Invalid bookId');

  if (stage === 'book') {
    return {
      questionId,
      stage,
      bookId,
      bookCorrect: bookId === question.bookId,
      correctBookId: question.bookId,
      correctBookLabel: getBookLabel(question.bookId),
    };
  }

  const chapter = positiveNumber(body.chapter, 'chapter');
  const baseAttempt = gradeBookAndChapter(question, bookId, chapter);
  if (stage === 'chapter') {
    if (body.exactVerse !== undefined && typeof body.exactVerse !== 'boolean') {
      badRequest('exactVerse must be a boolean');
    }
    const needsVerse = body.exactVerse === true;
    return {
      ...baseAttempt,
      stage,
      correctBookId: question.bookId,
      correctChapter: question.chapter,
      ...(needsVerse ? {} : { correctReference: formatScriptureReference(question) }),
    };
  }

  const verse = positiveNumber(body.verse, 'verse');
  return {
    ...gradeExactVerse(question, baseAttempt, verse),
    stage,
    correctBookId: question.bookId,
    correctChapter: question.chapter,
    correctVerse: question.verse,
    correctReference: formatScriptureReference(question),
  };
}
