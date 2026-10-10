import assert from "node:assert/strict";
import test from "node:test";
import { getPracticeStats, getResumePitchIndex } from "./session.js";

const questions = [{ id: "first" }, { id: "second" }, { id: "third" }];
const attempts = [
  { questionId: "first", bookCorrect: false, chapterCorrect: true, verseCorrect: true },
  { questionId: "second", bookCorrect: true, chapterCorrect: false, verseCorrect: false },
];

test("standard innings score book and chapter independently", () => {
  assert.deepEqual(getPracticeStats(attempts, questions.length), {
    completed: 2,
    totalPitches: 3,
    bookCorrect: 1,
    chapterCorrect: 1,
    verseCorrect: 0,
    earnedPoints: 2,
    possiblePoints: 6,
  });
});

test("exact-verse mode adds a third independent scoring opportunity", () => {
  const result = getPracticeStats(attempts, questions.length, true);
  assert.equal(result.verseCorrect, 1);
  assert.equal(result.earnedPoints, 3);
  assert.equal(result.possiblePoints, 9);
});

test("a fresh inning starts at zero points", () => {
  const result = getPracticeStats([], questions.length, false);
  assert.equal(result.completed, 0);
  assert.equal(result.earnedPoints, 0);
  assert.equal(result.possiblePoints, 6);
});

test("resuming skips a graded pitch, but repeats an unfinished one", () => {
  assert.equal(getResumePitchIndex(questions, 0, attempts), 1);
  assert.equal(getResumePitchIndex(questions, 1, attempts), 2);
  assert.equal(getResumePitchIndex(questions, 2, attempts), 2);
  assert.equal(getResumePitchIndex(questions, 0, []), 0);
});
