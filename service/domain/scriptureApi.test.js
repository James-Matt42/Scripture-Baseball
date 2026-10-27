import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SAMPLE_QUESTIONS } from './questions.js';
import {
  ScriptureApiError,
  checkAnswer,
  getPublicBooks,
  getPublicChallengeQuestions,
  getPublicQuestion,
  listPublicChallenges,
} from './scriptureApi.js';

const questionId = '2-nephi-2-25';

function assertApiError(callback, status, message) {
  assert.throws(callback, (error) =>
    error instanceof ScriptureApiError &&
    error.status === status &&
    (message ? error.message.includes(message) : true));
}

test('public book directory contains labels but no answer lookup', () => {
  const books = getPublicBooks();
  assert.ok(books.length > 10);
  assert.deepEqual(books.find((book) => book.id === '2-nephi'), {
    id: '2-nephi', label: '2 Nephi', volume: 'book-of-mormon',
  });
  assert.equal(books.some((book) => Object.hasOwn(book, 'chapter')), false);
});

test('challenge metadata includes available counts without exposing the answer deck', () => {
  const challenges = listPublicChallenges();
  assert.equal(challenges.length, 17);
  const lineup = challenges.find((item) => item.id === 'todays-lineup');
  assert.equal(lineup.questionCount, 6);
  assert.equal(lineup.personalized, false);
  assert.equal(Object.hasOwn(lineup, 'questionIds'), false);
  const personal = challenges.find((item) => item.id === 'my-misses');
  assert.equal(personal.questionCount, null);
  assert.equal(personal.personalized, true);
});

test('list filters combine volume/category/difficulty correctly', () => {
  const filtered = listPublicChallenges({
    volume: 'book-of-mormon', category: 'doctrinal-mastery', difficulty: 'standard',
  });
  assert.deepEqual(filtered.map((item) => item.id), ['doctrinal-mastery']);
  assertApiError(() => listPublicChallenges({ volume: 'mars' }), 400, 'volume');
  assertApiError(() => listPublicChallenges({ category: ['volume'] }), 400, 'category');
  assertApiError(() => listPublicChallenges({ admin: '1' }), 400, 'admin');
});

test('challenge selection returns only safe playable question data and supports volume filters', () => {
  const lineup = getPublicChallengeQuestions('todays-lineup');
  assert.equal(lineup.total, 6);
  assert.equal(lineup.challenge.id, 'todays-lineup');
  assert.deepEqual(lineup.questions.map((item) => item.id), SAMPLE_QUESTIONS.map((item) => item.id));
  for (const question of lineup.questions) {
    assert.deepEqual(Object.keys(question).sort(), ['choices', 'id', 'passage']);
    assert.ok(question.choices.length >= 3);
  }
  const mastery = getPublicChallengeQuestions('doctrinal-mastery', { volume: 'new-testament' });
  assert.deepEqual(mastery.questions.map((item) => item.id), ['john-3-16']);
  assertApiError(() => getPublicChallengeQuestions('missing'), 404);
  assertApiError(() => getPublicChallengeQuestions('four-gospels', { difficulty: 'expert' }), 400);
});

test('personal challenges stay clearly unavailable before user persistence exists', () => {
  const personal = getPublicChallengeQuestions('my-favorites');
  assert.equal(personal.total, 0);
  assert.deepEqual(personal.questions, []);
  assert.match(personal.notice, /authenticated progress/);
});

test('single question lookup omits location and never leaks a mutable live reference', () => {
  const question = getPublicQuestion(questionId);
  assert.equal(question.passage, SAMPLE_QUESTIONS[0].passage);
  assert.equal(question.id, questionId);
  assert.deepEqual(Object.keys(question).sort(), ['choices', 'id', 'passage']);
  question.choices.pop();
  assert.equal(getPublicQuestion(questionId).choices.length, SAMPLE_QUESTIONS[0].choices.length);
  assertApiError(() => getPublicQuestion('unknown'), 404);
});

test('book stage reports only committed book feedback', () => {
  const result = checkAnswer(questionId, { stage: 'book', bookId: 'alma' });
  assert.deepEqual(result, {
    questionId,
    stage: 'book',
    bookId: 'alma',
    bookCorrect: false,
    correctBookId: '2-nephi',
    correctBookLabel: '2 Nephi',
  });
  assert.equal(Object.hasOwn(result, 'correctChapter'), false);
  assert.equal(Object.hasOwn(result, 'correctReference'), false);
});

test('chapter stage independently grades chapter even when the book is wrong', () => {
  const standard = checkAnswer(questionId, {
    stage: 'chapter', bookId: 'alma', chapter: '2',
  });
  assert.equal(standard.bookCorrect, false);
  assert.equal(standard.chapterCorrect, true);
  assert.equal(standard.chapter, 2);
  assert.equal(standard.correctChapter, 2);
  assert.equal(standard.correctReference, '2 Nephi 2:25');

  const withVerse = checkAnswer(questionId, {
    stage: 'chapter', bookId: '2-nephi', chapter: 3, exactVerse: true,
  });
  assert.equal(withVerse.bookCorrect, true);
  assert.equal(withVerse.chapterCorrect, false);
  assert.equal(Object.hasOwn(withVerse, 'correctReference'), false);
  assert.equal(Object.hasOwn(withVerse, 'correctVerse'), false);
});

test('optional exact verse is separately graded and final feedback reveals the reference', () => {
  const answer = checkAnswer(questionId, {
    stage: 'verse', bookId: 'alma', chapter: 2, verse: '25',
  });
  assert.equal(answer.bookCorrect, false);
  assert.equal(answer.chapterCorrect, true);
  assert.equal(answer.verseCorrect, true);
  assert.equal(answer.verse, 25);
  assert.equal(answer.correctVerse, 25);
  assert.equal(answer.correctReference, '2 Nephi 2:25');
});

test('malformed inputs are rejected before grading', () => {
  assertApiError(() => checkAnswer(questionId, null), 400);
  assertApiError(() => checkAnswer(questionId, []), 400);
  assertApiError(() => checkAnswer(questionId, { stage: 'bonus', bookId: 'alma' }), 400);
  assertApiError(() => checkAnswer(questionId, { stage: 'book', bookId: 'unknown' }), 400);
  for (const chapter of [0, -1, 2.5, '2e0', '0', ' 2', 10000, {}, null]) {
    assertApiError(() => checkAnswer(questionId, { stage: 'chapter', bookId: 'alma', chapter }), 400);
  }
  assertApiError(() => checkAnswer(questionId, {
    stage: 'chapter', bookId: 'alma', chapter: 2, exactVerse: 'yes',
  }), 400);
  assertApiError(() => checkAnswer(questionId, {
    stage: 'verse', bookId: 'alma', chapter: 2,
  }), 400);
  assertApiError(() => checkAnswer('missing', { stage: 'book', bookId: 'alma' }), 404);
});
