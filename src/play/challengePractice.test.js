import assert from "node:assert/strict";
import test from "node:test";
import { gradeBookAndChapter } from "../scripture/questions.js";
import { getChallengeQuestions } from "../challenges/catalog.js";
import { getPracticeStats } from "./session.js";
import {
  createInitialPracticeState, getRecordedAttempts, getSessionQuestions, loadPracticeState,
  normalizePracticeState, practiceReducer, savePracticeState,
} from "./practiceState.js";

const timestamp = "2026-10-21T14:00:00.000Z";
const send = (state, type, extra = {}) => practiceReducer(state, { type, timestamp, ...extra });
const inStorage = (state) => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  assert.equal(savePracticeState(storage, state), true);
  return loadPracticeState(storage);
};
const choose = (state, id, volume = "") => send(state, "start-challenge", {
  challengeId: id,
  questionIds: getChallengeQuestions(id, getRecordedAttempts(state), state.favorites, volume).map((q) => q.id),
});

test("a selected challenge persists its pitch list and chapter draft", () => {
  let state = choose(createInitialPracticeState(), "four-gospels");
  assert.equal(state.session.inning, 1, "choosing before practice doesn't inflate the inning count");
  assert.equal(state.session.challengeId, "four-gospels");
  assert.equal(state.session.questionIds.length, 6);
  const first = getSessionQuestions(state.session)[0];
  assert.equal(first.bookId, "matthew");
  state = send(state, "set-draft", { draft: {
    questionId: first.id, stage: "chapter", bookId: "mark", chapterInput: "5", verseInput: "",
  } });
  state = inStorage(state);
  assert.equal(state.session.draft.bookId, "mark");
  assert.equal(state.session.draft.stage, "chapter");
  assert.equal(state.session.questionIds[0], first.id);
  state = send(state, "answer", { attempt: gradeBookAndChapter(first, "mark", 5) });
  assert.equal(getPracticeStats(state.session.attempts, 6).earnedPoints, 1);
  state = send(state, "next");
  assert.equal(getSessionQuestions(state.session)[state.session.pitchIndex].bookId, "mark");
});

test("switching challenges archives partial scores, then restores both across refresh", () => {
  let state = choose(createInitialPracticeState(), "four-gospels");
  const first = getSessionQuestions(state.session)[0];
  state = send(state, "answer", { attempt: gradeBookAndChapter(first, first.bookId, first.chapter) });
  state = choose(state, "isaiah");
  assert.equal(state.session.challengeId, "isaiah");
  assert.equal(state.session.inning, 2);
  assert.equal(state.session.questionIds.length, 2);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].earnedPoints, 2);
  assert.equal(state.history[0].challengeId, "four-gospels");
  state = inStorage(state);
  assert.equal(state.history[0].questionIds[0], first.id);
  assert.equal(getRecordedAttempts(state).length, 1);
  assert.equal(state.session.questionIds.length, 2);
});

test("a filtered challenge only plays its selected volume and scores correctly", () => {
  const state = choose(createInitialPracticeState(), "doctrinal-mastery", "book-of-mormon");
  assert.deepEqual(state.session.questionIds, ["2-nephi-2-25", "alma-32-21", "ether-12-27"]);
  assert.equal(getPracticeStats(state.session.attempts, state.session.questionIds.length).possiblePoints, 6);
});

test("personal misses and favorites are based on attempts and profile-local storage", () => {
  let state = createInitialPracticeState();
  assert.strictEqual(choose(state, "my-misses"), state);
  const [question] = getSessionQuestions(state.session);
  state = send(state, "toggle-favorite", { questionId: question.id });
  assert.deepEqual(state.favorites, [question.id]);
  state = choose(state, "my-favorites");
  assert.deepEqual(state.session.questionIds, [question.id]);
  state = send(state, "answer", { attempt: gradeBookAndChapter(question, "alma", 99) });
  state = choose(state, "my-misses");
  assert.deepEqual(state.session.questionIds, [question.id]);
  assert.equal(state.history.length, 1);
  state = inStorage(state);
  assert.deepEqual(state.favorites, [question.id]);
  state = send(state, "toggle-favorite", { questionId: question.id });
  assert.deepEqual(state.favorites, []);
});

test("legacy Step 4 data loads with the original lineup and supports new challenges", () => {
  const original = createInitialPracticeState();
  delete original.favorites;
  delete original.session.challengeId;
  delete original.session.questionIds;
  const loaded = normalizePracticeState(original);
  assert.equal(loaded.session.questionIds.length, 6);
  assert.deepEqual(loaded.favorites, []);
  assert.equal(choose(loaded, "isaiah").session.questionIds.length, 2);
});

test("corrupted question IDs and attempts cannot inject custom questions or grades", () => {
  const state = createInitialPracticeState();
  state.session.questionIds = ["john-14-6", "nonsense", "john-14-6"];
  state.session.attempts = [{ questionId: "john-14-6", bookId: "john", chapter: 14, bookCorrect: false }];
  const loaded = normalizePracticeState(state);
  assert.deepEqual(loaded.session.questionIds, ["john-14-6"]);
  assert.equal(loaded.session.attempts[0].bookCorrect, true);
  assert.equal(loaded.session.attempts[0].chapterCorrect, true);
});
