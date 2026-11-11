import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPracticeSessionEngine, PracticeError } from './practiceSession.js';
import { fixtureCorpus, sharedVerse, otherVerse } from './practiceFixtures.testSupport.js';

function engine(corpus, overrides = {}) {
  let sequence = 0;
  return createPracticeSessionEngine({ corpus, random: () => 0,
    tokenGenerator: () => `${String(++sequence).padStart(32, '0')}opaque_token`, ...overrides });
}

function expectStatus(callback, status) {
  assert.throws(callback, (reason) => reason instanceof PracticeError && reason.status === status);
}

test('a pitch uses an opaque temporary token and no reference or answer fields before grading', async (t) => {
  const api = engine(await fixtureCorpus(t));
  const pitch = api.createPitch({ scope: { volume: 'bom', book: '2-ne' } });
  assert.equal(pitch.stage, 'chapter');
  assert.equal(pitch.passage, sharedVerse);
  assert.deepEqual(pitch.choices, []);
  assert.deepEqual(pitch.scope, { volume: 'bom', book: '2-ne' });
  assert.match(pitch.pitchId, /^[A-Za-z0-9_-]{32,128}$/u);
  assert.ok(!pitch.pitchId.includes('2-ne'));
  assert.equal(Object.hasOwn(pitch, 'reference'), false);
  assert.equal(Object.hasOwn(pitch, 'correctChapter'), false);
  assert.equal(Object.hasOwn(pitch, 'correctReference'), false);
  expectStatus(() => api.getCompletedAttempt(pitch.pitchId), 409);
  assert.deepEqual(api.getPitch(pitch.pitchId), pitch);
  const answer = api.submitAnswer(pitch.pitchId, { stage: 'chapter', chapter: 9 });
  assert.equal(answer.chapterCorrect, true);
  assert.equal(answer.correctReference, '2 Nephi 9:1');
  assert.equal(api.getCompletedAttempt(pitch.pitchId).reference, 'bom:2-ne:9:1');
  assert.equal(api.getCompletedAttempt(pitch.pitchId).bookCorrect, undefined);
  assert.equal(api.getPitch(pitch.pitchId).stage, 'complete');
});

test('exact duplicates are ambiguous only when their competing locations are in scope', async (t) => {
  const corpus = await fixtureCorpus(t);
  const api = engine(corpus);
  const all = corpus.getScopedPool({ testedStages: ['book', 'chapter'] });
  assert.ok(all.ambiguous.some((row) => row.reference === 'bom:2-ne:9:1'));
  assert.ok(all.ambiguous.some((row) => row.reference === 'ot:isa:53:1'));
  const allPitch = api.createPitch();
  assert.notEqual(allPitch.passage, sharedVerse);
  const bom = corpus.getScopedPool({ volume: 'bom', testedStages: ['book', 'chapter'] });
  assert.ok(bom.eligible.some((row) => row.reference === 'bom:2-ne:9:1'));
  const bomPitch = api.createPitch({ scope: { volume: 'bom', book: '2-ne' } });
  assert.equal(bomPitch.passage, sharedVerse);
  assert.equal(bomPitch.stage, 'chapter');
});

test('same-chapter repeated text remains playable for chapter-only but not exact-verse questions', async (t) => {
  const corpus = await fixtureCorpus(t);
  const chapterOnly = corpus.getScopedPool({ volume: 'bom', book: 'alma', testedStages: ['chapter'] });
  assert.equal(chapterOnly.repeatedSameAnswer.length, 1);
  const exact = corpus.getScopedPool({ volume: 'bom', book: 'alma', testedStages: ['chapter', 'verse'] });
  assert.equal(exact.ambiguous.length, 2);
  assert.equal(exact.eligible.length, 1);
  const api = engine(corpus);
  const pitch = api.createPitch({ scope: { volume: 'bom', book: 'alma' }, exactVerse: true });
  assert.equal(pitch.stage, 'chapter');
  assert.notEqual(pitch.passage, otherVerse);
});

test('book, chapter and verse stages grade independently without skipping stages or early reference reveal', async (t) => {
  const api = engine(await fixtureCorpus(t));
  const pitch = api.createPitch({ scope: { volume: 'bom' }, exactVerse: true });
  assert.equal(pitch.stage, 'book');
  assert.ok(pitch.choices.length >= 2);
  const guess = pitch.choices.find((choice) => choice.id !== '2-ne');
  assert.ok(guess);
  expectStatus(() => api.submitAnswer(pitch.pitchId, { stage: 'chapter', chapter: 9 }), 409);
  expectStatus(() => api.submitAnswer(pitch.pitchId, { stage: 'book', bookId: 'isa' }), 400);
  const book = api.submitAnswer(pitch.pitchId, { stage: 'book', bookId: guess.id });
  assert.equal(book.bookCorrect, false);
  assert.equal(book.correctBookId, '2-ne');
  assert.equal(Object.hasOwn(book, 'correctChapter'), false);
  assert.deepEqual(api.submitAnswer(pitch.pitchId, { stage: 'book', bookId: guess.id }), book);
  expectStatus(() => api.submitAnswer(pitch.pitchId, { stage: 'book', bookId: '2-ne' }), 409);
  const chapter = api.submitAnswer(pitch.pitchId, { stage: 'chapter', chapter: '9' });
  assert.equal(chapter.chapterCorrect, true);
  assert.equal(chapter.nextStage, 'verse');
  assert.equal(Object.hasOwn(chapter, 'correctVerse'), false);
  assert.equal(Object.hasOwn(chapter, 'correctReference'), false);
  const verse = api.submitAnswer(pitch.pitchId, { stage: 'verse', verse: 2 });
  assert.equal(verse.verseCorrect, false);
  assert.equal(verse.correctVerse, 1);
  assert.equal(verse.correctReference, '2 Nephi 9:1');
  assert.deepEqual(verse.answers, { bookId: guess.id, bookCorrect: false,
    chapter: 9, chapterCorrect: true, verse: 2, verseCorrect: false });
  const attempt = api.getCompletedAttempt(pitch.pitchId);
  assert.equal(attempt.chapterCorrect, true);
  assert.equal(attempt.bookCorrect, false);
  assert.equal(attempt.verseCorrect, false);
  assert.deepEqual(api.submitAnswer(pitch.pitchId, { stage: 'verse', verse: '2' }), verse);
  expectStatus(() => api.submitAnswer(pitch.pitchId, { stage: 'verse', verse: 1 }), 409);
});

test('the D&C scope skips untestable book recognition and never serves declaration paragraphs', async (t) => {
  const corpus = await fixtureCorpus(t);
  const api = engine(corpus);
  const selection = api.createPitch({ scope: { volume: 'dc' } });
  assert.equal(selection.stage, 'chapter');
  assert.deepEqual(selection.choices, []);
  assert.match(selection.passage, /dispensation/);
  assert.equal(corpus.getScopedPool({ volume: 'dc' }).eligible.length, 1);
  assert.deepEqual(api.getCatalog().volumes.find((volume) => volume.id === 'dc').books
    .map((book) => book.id), ['dc']);
});

test('invalid scopes, malformed guesses and unsupported questions are rejected', async (t) => {
  const api = engine(await fixtureCorpus(t));
  for (const options of [null, [], { scope: { book: '2-ne' } },
    { scope: { volume: 'mars' } }, { scope: { volume: 'ot', book: '2-ne' } },
    { scope: { volume: 'bom', extra: 1 } }, { exactVerse: 'true' }, { bonus: 1 }]) {
    expectStatus(() => api.createPitch(options), 400);
  }
  const pitch = api.createPitch({ scope: { volume: 'bom', book: 'alma' } });
  for (const input of [null, [], { stage: 'bogus' }, { stage: 'chapter', chapter: 0 },
    { stage: 'chapter', chapter: '1e0' }, { stage: 'chapter', chapter: 1, correct: true },
    { stage: 'book', bookId: 'alma' }]) {
    const status = input?.stage === 'book' ? 409 : 400;
    expectStatus(() => api.submitAnswer(pitch.pitchId, input), status);
  }
  expectStatus(() => api.getPitch('not-a-pitch'), 404);
});

test('completed and expired pitches remain bounded, and stale guesses never become valid', async (t) => {
  let time = 1000;
  const api = engine(await fixtureCorpus(t), { now: () => time, maxPitches: 1, ttlMs: 1000 });
  const pitch = api.createPitch({ scope: { volume: 'bom', book: '2-ne' } });
  expectStatus(() => api.createPitch(), 429);
  time += 1000;
  expectStatus(() => api.submitAnswer(pitch.pitchId, { stage: 'chapter', chapter: 9 }), 410);
  const another = api.createPitch({ scope: { volume: 'bom', book: '2-ne' } });
  assert.notEqual(another.pitchId, pitch.pitchId);
  assert.equal(api.activePitches, 1);
});
