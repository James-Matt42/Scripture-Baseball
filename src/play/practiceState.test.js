import assert from "node:assert/strict";
import test from "node:test";
import { SAMPLE_QUESTIONS, gradeBookAndChapter, gradeExactVerse } from "../scripture/questions.js";
import { getPracticeStats } from "./session.js";
import {
  PRACTICE_STORAGE_KEY,
  createInitialPracticeState,
  getRecordedAttempts,
  loadPracticeState,
  normalizePracticeState,
  practiceReducer,
  savePracticeState,
} from "./practiceState.js";

const time = "2026-10-21T12:00:00.000Z";
const storage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};
const send = (state, type, other = {}) => practiceReducer(state, { type, ...other });
const correct = (index, exactVerse = false) => {
  const question = SAMPLE_QUESTIONS[index];
  const answer = gradeBookAndChapter(question, question.bookId, question.chapter);
  return exactVerse ? gradeExactVerse(question, answer, question.verse) : answer;
};

function answerAndNext(state, index) {
  const result = send(state, "answer", { attempt: correct(index, state.session.exactVerse) });
  return send(result, "next", { timestamp: time });
}

test("fresh state and a complete localStorage round trip", () => {
  const browserStorage = storage();
  const original = createInitialPracticeState();
  assert.equal(loadPracticeState(browserStorage).session.inning, 1);
  assert.equal(savePracticeState(browserStorage, original), true);
  assert.ok(browserStorage.getItem(PRACTICE_STORAGE_KEY));
  assert.deepEqual(loadPracticeState(browserStorage), original);
});

test("unsubmitted book and chapter answers are restored on refresh", () => {
  let state = createInitialPracticeState();
  state = send(state, "set-draft", { draft: {
    questionId: SAMPLE_QUESTIONS[0].id,
    stage: "chapter", bookId: "alma", chapterInput: "2", verseInput: "",
  } });
  const browserStorage = storage();
  savePracticeState(browserStorage, state);
  const restored = loadPracticeState(browserStorage);
  assert.equal(restored.session.draft.stage, "chapter");
  assert.equal(restored.session.draft.bookId, "alma");
  assert.equal(restored.session.draft.chapterInput, "2");
  assert.equal(restored.session.attempts.length, 0);
});

test("graded attempts and live scores survive navigation and refresh", () => {
  let state = createInitialPracticeState();
  state = answerAndNext(state, 0);
  assert.equal(state.session.pitchIndex, 1);
  assert.equal(state.session.attempts.length, 1);
  const browserStorage = storage();
  savePracticeState(browserStorage, state);
  const restored = loadPracticeState(browserStorage);
  assert.equal(restored.session.pitchIndex, 1);
  assert.equal(getPracticeStats(restored.session.attempts, 6).earnedPoints, 2);
  assert.equal(getRecordedAttempts(restored).length, 1);
  assert.equal(send(restored, "next").session.pitchIndex, 1, "cannot skip an unanswered pitch");
});

test("a double submission never awards duplicate points", () => {
  let state = createInitialPracticeState();
  state = send(state, "answer", { attempt: correct(0) });
  assert.strictEqual(send(state, "answer", { attempt: correct(0) }), state);
  assert.equal(state.session.attempts.length, 1);
  assert.strictEqual(send(state, "set-draft", { draft: {} }), state);
});

test("pausing and resuming preserves an uncompleted chapter guess", () => {
  let state = createInitialPracticeState();
  state = send(state, "set-draft", { draft: {
    questionId: SAMPLE_QUESTIONS[0].id, stage: "chapter", bookId: "alma",
    chapterInput: "3", verseInput: "",
  } });
  state = send(state, "finish", { timestamp: time });
  assert.equal(state.session.isFinished, true);
  assert.equal(state.history.length, 0, "paused sessions are not yet archived");
  state = loadPracticeState(storageWithState(state));
  state = send(state, "resume", { timestamp: time });
  assert.equal(state.session.isFinished, false);
  assert.equal(state.session.draft.stage, "chapter");
  assert.equal(state.session.draft.bookId, "alma");
  assert.equal(state.session.draft.chapterInput, "3");
});

function storageWithState(state) {
  const browserStorage = storage();
  savePracticeState(browserStorage, state);
  return browserStorage;
}

test("resuming a paused inning skips a fully graded pitch", () => {
  let state = send(createInitialPracticeState(), "answer", { attempt: correct(0) });
  state = send(state, "finish", { timestamp: time });
  state = send(state, "resume", { timestamp: time });
  assert.equal(state.session.pitchIndex, 1);
  assert.equal(state.session.attempts.length, 1);
});

test("exact verse draft and scoring are restored independently", () => {
  let state = send(createInitialPracticeState(), "set-exact-verse", { enabled: true });
  state = send(state, "set-draft", { draft: {
    questionId: SAMPLE_QUESTIONS[0].id,
    stage: "verse", bookId: "alma", chapterInput: "2", verseInput: "25",
  } });
  const reloaded = loadPracticeState(storageWithState(state));
  assert.equal(reloaded.session.draft.stage, "verse");
  state = send(reloaded, "answer", {
    attempt: gradeExactVerse(SAMPLE_QUESTIONS[0], gradeBookAndChapter(SAMPLE_QUESTIONS[0], "alma", 2), 25),
  });
  assert.equal(getPracticeStats(state.session.attempts, 6, true).earnedPoints, 2);
  assert.equal(state.session.draft, null);
  assert.strictEqual(send(state, "set-exact-verse", { enabled: false }), state);
});

test("full innings enter history once, and keep playing starts a new inning", () => {
  let state = createInitialPracticeState();
  for (let index = 0; index < SAMPLE_QUESTIONS.length; index += 1) {
    state = answerAndNext(state, index);
  }
  assert.equal(state.session.isFinished, true);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].earnedPoints, 12);
  assert.equal(state.history[0].complete, true);
  assert.equal(getRecordedAttempts(state).length, SAMPLE_QUESTIONS.length);
  assert.strictEqual(send(state, "finish", { timestamp: time }), state);
  state = loadPracticeState(storageWithState(state));
  state = send(state, "resume", { timestamp: time });
  assert.equal(state.session.inning, 2);
  assert.equal(state.session.attempts.length, 0);
  assert.equal(state.history.length, 1);
  assert.equal(getRecordedAttempts(state).length, SAMPLE_QUESTIONS.length);
});

test("starting over saves points from a partial inning", () => {
  let state = send(createInitialPracticeState(), "answer", { attempt: correct(0) });
  state = send(state, "finish", { timestamp: time });
  state = send(state, "new-inning", { timestamp: time });
  assert.equal(state.session.inning, 2);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].complete, false);
  assert.equal(state.history[0].earnedPoints, 2);
  assert.equal(getRecordedAttempts(state).length, 1);
});

test("malformed or tampered storage is safe and cannot spoof scoring flags", () => {
  const corrupted = storage();
  corrupted.setItem(PRACTICE_STORAGE_KEY, "not-json");
  assert.deepEqual(loadPracticeState(corrupted), createInitialPracticeState());
  const invalid = { version: 1, session: {
    inning: 1, pitchIndex: 900, exactVerse: false,
    attempts: [
      { ...correct(0), bookId: "alma", bookCorrect: true, chapterCorrect: false },
      { ...correct(0) },
      { questionId: "bogus", bookId: "alma", chapter: 1 },
    ],
    draft: { questionId: "bogus", stage: "verse" },
  }, history: [] };
  const normalized = normalizePracticeState(invalid);
  assert.equal(normalized.session.pitchIndex, 5);
  assert.equal(normalized.session.attempts.length, 1);
  assert.equal(normalized.session.attempts[0].bookCorrect, false);
  assert.equal(normalized.session.attempts[0].chapterCorrect, true);
  assert.equal(normalized.session.draft, null);
});

test("blocked storage does not crash gameplay", () => {
  const blocked = { getItem: () => { throw Error("disabled"); }, setItem: () => { throw Error("disabled"); } };
  assert.deepEqual(loadPracticeState(blocked), createInitialPracticeState());
  assert.equal(savePracticeState(blocked, createInitialPracticeState()), false);
  assert.equal(savePracticeState(null, createInitialPracticeState()), false);
});
