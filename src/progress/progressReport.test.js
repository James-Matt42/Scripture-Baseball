import assert from "node:assert/strict";
import test from "node:test";
import { getRecordedAttempts, createInitialPracticeState, practiceReducer } from "../play/practiceState.js";
import { getChallengeQuestions } from "../challenges/catalog.js";
import { getQuestionById, gradeBookAndChapter, gradeExactVerse } from "../scripture/questions.js";
import { getProgressReport } from "./progressReport.js";

const now = new Date(2026, 9, 21, 12, 0);
const question = (id) => getQuestionById(id);
const right = (id) => {
  const q = question(id);
  return gradeBookAndChapter(q, q.bookId, q.chapter);
};
const wrongBook = (id) => {
  const q = question(id);
  return gradeBookAndChapter(q, q.choices.find((book) => book !== q.bookId), q.chapter);
};
const wrongChapter = (id) => {
  const q = question(id);
  return gradeBookAndChapter(q, q.bookId, q.chapter + 1);
};
const inning = (id, attempts, date, challengeId = "todays-lineup", questionIds = attempts.map((attempt) => attempt.questionId)) => ({
  id: `inning-${id}`, inning: id, questionIds, attempts, challengeId,
  exactVerse: attempts.some((attempt) => typeof attempt.verseCorrect === "boolean"),
  finishedAt: date.toISOString(),
});
const localDate = (day, hour = 12) => new Date(2026, 9, day, hour);

const report = (attempts, history = []) => getProgressReport({ attempts, history, now });

test("no practice yields real zeroes, absent percentages, and unearned milestones", () => {
  const result = report([]);
  assert.equal(result.pitches, 0);
  assert.equal(result.bookAccuracy, null);
  assert.equal(result.chapterAccuracy, null);
  assert.equal(result.practiceDays, 0);
  assert.equal(result.recentInnings.length, 0);
  assert.equal(result.weakBooks.length, 0);
  assert.equal(result.strongPassages.length, 0);
  assert.equal(result.comebacks.length, 0);
  assert.equal(result.volumes.length, 5);
  assert.ok(result.volumes.every((volume) => volume.pitches === 0 && volume.bookAccuracy === null));
  assert.ok(result.achievements.every((achievement) => achievement.earned === false));
});

test("book and chapter accuracy are independent and grouped by correct scripture volume", () => {
  const attempts = [
    wrongBook("2-nephi-2-25"),
    wrongChapter("alma-32-21"),
    right("john-3-16"),
    right("genesis-1-1"),
    right("moses-1-39"),
    right("dc-18-10"),
  ];
  const result = report(attempts);
  assert.equal(result.pitches, 6);
  assert.equal(result.bookCorrect, 5);
  assert.equal(result.chapterCorrect, 5);
  assert.equal(result.bookAccuracy, 83);
  assert.equal(result.chapterAccuracy, 83);
  const volumes = Object.fromEntries(result.volumes.map((volume) => [volume.id, volume]));
  assert.equal(volumes["book-of-mormon"].pitches, 2);
  assert.equal(volumes["book-of-mormon"].bookAccuracy, 50);
  assert.equal(volumes["book-of-mormon"].chapterAccuracy, 50);
  for (const volume of ["new-testament", "old-testament", "pearl-of-great-price", "doctrine-and-covenants"]) {
    assert.equal(volumes[volume].bookAccuracy, 100);
  }
  assert.equal(result.achievements.find((item) => item.id === "volume-explorer").earned, true);
  assert.equal(result.weakBooks.find((book) => book.bookId === "2-nephi").needsReview, 1);
});

test("strong requires two correct recalls; comeback requires an earlier miss and latest success", () => {
  const id = "alma-32-21";
  assert.equal(report([right(id)]).strongPassages.length, 0);
  let attempts = [wrongBook(id), right(id)];
  let result = report(attempts);
  assert.equal(result.comebacks.length, 1);
  assert.equal(result.strongPassages.length, 0);
  assert.equal(result.learningPassages.length, 1);
  assert.equal(result.needsReview.length, 0);
  attempts = [...attempts, right(id)];
  result = report(attempts);
  assert.equal(result.strongPassages.length, 1);
  assert.equal(result.comebacks.length, 1);
  assert.equal(result.volumes.find((volume) => volume.id === "book-of-mormon").strongPassages, 1);
  result = report([...attempts, wrongChapter(id)]);
  assert.equal(result.strongPassages.length, 0);
  assert.equal(result.comebacks.length, 0);
  assert.equal(result.needsReview.length, 1);
});

test("exact-verse attempts are tracked separately and a missed verse needs review", () => {
  const q = question("ether-12-27");
  const base = right(q.id);
  const attempts = [base, gradeExactVerse(q, base, q.verse + 1), gradeExactVerse(q, base, q.verse)];
  const result = report(attempts);
  assert.equal(result.pitches, 3);
  assert.equal(result.bookAccuracy, 100);
  assert.equal(result.chapterAccuracy, 100);
  assert.equal(result.versePitches, 2);
  assert.equal(result.verseCorrect, 1);
  assert.equal(result.verseAccuracy, 50);
  assert.equal(result.strongPassages.length, 0, "verse miss breaks a consecutive-correct streak");
  assert.equal(result.comebacks.length, 1);
  assert.equal(report(attempts.slice(0, 2)).needsReview.length, 1);
});

test("weekly activity uses only finished-inning dates, not current undated pitches", () => {
  const id = "john-14-6";
  const past = inning(1, [wrongChapter(id)], localDate(18)); // Sunday, previous week
  const monday = inning(2, [wrongChapter(id)], localDate(19));
  const wednesday = inning(3, [right(id)], localDate(21));
  const future = inning(4, [right("genesis-1-1")], localDate(22));
  const saved = [past, monday, wednesday, future].flatMap((entry) => entry.attempts);
  const result = report([...saved, wrongChapter("alma-32-21")], [past, monday, wednesday, future]);
  assert.equal(result.practiceDays, 2, "the unfinished pitch and tomorrow do not count as practiced days");
  assert.equal(result.strengthenedThisWeek.length, 1);
  assert.equal(result.strengthenedThisWeek[0].question.id, id);
  assert.equal(result.pitches, 5, "live pitches still affect accuracy");
});

test("recent finished innings display actual challenge, mode, length, score, and latest-first order", () => {
  const full = inning(1, [right("john-3-16")], localDate(19), "four-gospels");
  const partial = inning(2, [wrongBook("2-nephi-2-25")], localDate(21), "todays-lineup", ["2-nephi-2-25", "alma-32-21"]);
  const result = report([...full.attempts, ...partial.attempts], [full, partial]);
  assert.equal(result.recentInnings.length, 2);
  assert.equal(result.recentInnings[0].challenge, "Today's Lineup");
  assert.equal(result.recentInnings[0].complete, false);
  assert.equal(result.recentInnings[0].completed, 1);
  assert.equal(result.recentInnings[0].totalPitches, 2);
  assert.equal(result.recentInnings[0].earnedPoints, 1);
  assert.equal(result.recentInnings[0].possiblePoints, 4);
  assert.equal(result.recentInnings[0].bookAccuracy, 0);
  assert.equal(result.recentInnings[0].chapterAccuracy, 100);
  assert.equal(result.recentInnings[1].challenge, "Four Gospels");
  assert.equal(result.recentInnings[1].complete, true);
  assert.equal(result.achievements.find((item) => item.id === "first-inning").earned, true);
});

test("archived current innings count exactly once in the shared practice history", () => {
  const when = "2026-10-21T12:00:00.000Z";
  let state = createInitialPracticeState();
  state = practiceReducer(state, { type: "answer", attempt: wrongBook("2-nephi-2-25") });
  state = practiceReducer(state, { type: "new-inning", timestamp: when });
  const first = getProgressReport({ attempts: getRecordedAttempts(state), history: state.history, now });
  assert.equal(first.pitches, 1);
  assert.equal(first.recentInnings.length, 1);
  assert.equal(first.weakBooks.length, 1);

  const missed = getChallengeQuestions("my-misses", getRecordedAttempts(state), state.favorites)
    .filter((item) => first.weakBooks[0].questionIds.includes(item.id));
  assert.equal(missed.length, 1);
  const next = practiceReducer(state, {
    type: "start-challenge", challengeId: "my-misses", questionIds: missed.map((item) => item.id), timestamp: when,
  });
  assert.deepEqual(next.session.questionIds, ["2-nephi-2-25"]);
});
