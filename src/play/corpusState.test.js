import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CORPUS_GUEST_KEY, addCompletedPitch, completedLocalResult, corpusKey, corpusPracticeStats,
  initialCorpusState, loadCorpusState, saveCorpusState, uniqueAttemptHistory,
} from './corpusState.js';

const id = 'x'.repeat(43);
const pitch = { pitchId: id };
const final = {
  nextStage: 'complete', reference: 'bom:2-ne:9:1', correctReference: '2 Nephi 9:1',
  answers: { chapter: 9, chapterCorrect: true },
};
const result = completedLocalResult(pitch, final, '2026-11-11T12:00:00.000Z');

function store() {
  const map = new Map();
  return {
    getItem(key) { return map.get(key) ?? null; },
    setItem(key, value) { map.set(key, value); },
  };
}

test('the new practice key is separate from all old sample-question browser state', () => {
  assert.equal(corpusKey(null), CORPUS_GUEST_KEY);
  assert.ok(!corpusKey(null).includes('practice.v1'));
  assert.notEqual(corpusKey('user-1'), corpusKey('user-2'));
  assert.notEqual(corpusKey(null), corpusKey('user-1'));
});

test('the browser saves only pitch tokens, guess drafts, and server-reported results', () => {
  const local = store();
  const key = CORPUS_GUEST_KEY;
  const state = { ...initialCorpusState(true), pitchId: id,
    draft: { bookId: '', chapter: '9', verse: '1' },
    // A previous sample question must never be restored into this state.
    questionIds: ['2-nephi-2-25'] };
  assert.equal(saveCorpusState(local, key, state), true);
  const loaded = loadCorpusState(local, key);
  assert.equal(loaded.pitchId, id);
  assert.equal(loaded.draft.chapter, '9');
  assert.equal(loaded.exactVerse, true);
  assert.equal(loaded.questionIds, undefined);
  assert.deepEqual(loadCorpusState(store(), key), initialCorpusState());
  local.setItem(key, '{not json');
  assert.deepEqual(loadCorpusState(local, key), initialCorpusState());
});

test('completed guest pitch is stored once and its opaque token remains claimable', () => {
  let state = addCompletedPitch(initialCorpusState(), result, { guest: true });
  assert.deepEqual(state.pendingClaims, [id]);
  assert.equal(state.history.length, 1);
  assert.equal(state.attempts[0].chapterCorrect, true);
  assert.equal(state.history[0].bookCorrect, undefined);
  state = addCompletedPitch(state, result, { guest: true });
  assert.equal(state.history.length, 1);
  assert.deepEqual(state.pendingClaims, [id]);
  assert.equal(corpusPracticeStats(state.attempts).earnedPoints, 1);
  assert.equal(corpusPracticeStats(state.attempts).possiblePoints, 1);
});

test('account records take precedence over local copies, and graded stages are independent', () => {
  const server = { ...result, source: 'verified-pitch', recordedAt: '2026-11-11T12:00:01.000Z' };
  const merged = uniqueAttemptHistory([server], [result]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, 'verified-pitch');
  const rich = { ...result, id: 'z'.repeat(43), bookCorrect: false,
    verseCorrect: true, chapterCorrect: true };
  const stats = corpusPracticeStats([result, rich]);
  assert.equal(stats.count, 2);
  assert.equal(stats.bookAttempts, 1);
  assert.equal(stats.bookCorrect, 0);
  assert.equal(stats.chapterCorrect, 2);
  assert.equal(stats.verseAttempts, 1);
  assert.equal(stats.verseCorrect, 1);
});

test('incomplete or forged feedback is not accepted as a local completed pitch', () => {
  assert.throws(() => completedLocalResult(pitch, { ...final, reference: undefined }), TypeError);
  assert.throws(() => addCompletedPitch(initialCorpusState(), { ...result, chapterCorrect: 'yes' }), TypeError);
});
