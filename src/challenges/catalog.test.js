import assert from "node:assert/strict";
import test from "node:test";
import { ALL_QUESTIONS, SCRIPTURE_BOOKS, getQuestionVolume, gradeBookAndChapter } from "../scripture/questions.js";
import {
  CHALLENGES, filterChallenges, getChallengeQuestions, getMissedQuestionIds,
  getWeakAreaQuestionIds,
} from "./catalog.js";

function attempt(questionId, bookId, chapter) {
  const question = ALL_QUESTIONS.find((item) => item.id === questionId);
  return gradeBookAndChapter(question, bookId, chapter);
}

test("local challenge catalog only references answerable passages and books", () => {
  const ids = new Set();
  for (const question of ALL_QUESTIONS) {
    assert.ok(!ids.has(question.id), `duplicate ID ${question.id}`);
    ids.add(question.id);
    assert.ok(SCRIPTURE_BOOKS.some((book) => book.id === question.bookId));
    assert.ok(question.choices.includes(question.bookId));
    assert.equal(new Set(question.choices).size, question.choices.length);
    for (const id of question.choices) assert.ok(SCRIPTURE_BOOKS.some((book) => book.id === id));
    assert.ok(getQuestionVolume(question));
  }
  for (const item of CHALLENGES) {
    if (item.section === "personal") continue;
    assert.ok(getChallengeQuestions(item.id).length > 0, item.id);
  }
});

test("the Gospels, Isaiah, volume, and topic challenges launch focused questions", () => {
  const gospels = getChallengeQuestions("four-gospels");
  assert.equal(gospels.length, 6);
  assert.deepEqual(new Set(gospels.map((item) => item.bookId)), new Set(["matthew", "mark", "luke", "john"]));
  assert.deepEqual(getChallengeQuestions("isaiah").map((item) => item.bookId), ["isaiah", "isaiah"]);
  assert.ok(getChallengeQuestions("prayer").every((item) => ["3-nephi", "matthew", "dc"].includes(item.bookId)));
  assert.ok(getChallengeQuestions("new-testament").every((item) => getQuestionVolume(item) === "new-testament"));
  assert.ok(getChallengeQuestions("doctrinal-mastery").some((item) => item.id === "john-3-16"));
  assert.equal(getChallengeQuestions("not-a-challenge").length, 0);
});

test("volume, category and difficulty filtering can be combined and scope played passages", () => {
  const filters = { volume: "book-of-mormon", category: "doctrinal-mastery", difficulty: "standard" };
  const filtered = filterChallenges(filters);
  assert.deepEqual(filtered.map((item) => item.id), ["doctrinal-mastery"]);
  const questions = getChallengeQuestions(filtered[0].id, [], [], filters.volume);
  assert.deepEqual(questions.map((item) => item.id), ["2-nephi-2-25", "alma-32-21", "ether-12-27"]);
  assert.ok(filterChallenges({ volume: "old-testament", category: "personal", difficulty: "beginner" }).length === 0);
  assert.ok(filterChallenges({ category: "expert", difficulty: "advanced" }).some((item) => item.id === "isaiah"));
});

test("misses and weak areas use recorded answers rather than example counts", () => {
  assert.deepEqual(getChallengeQuestions("my-misses"), []);
  assert.deepEqual(getChallengeQuestions("weak-areas"), []);
  const attempts = [
    attempt("alma-32-21", "ether", 32),
    attempt("mosiah-2-17", "mosiah", 2),
    attempt("alma-37-6", "alma", 37),
  ];
  assert.deepEqual(getMissedQuestionIds(attempts), ["alma-32-21"]);
  assert.deepEqual(getChallengeQuestions("my-misses", attempts).map((q) => q.id), ["alma-32-21"]);
  assert.deepEqual(getWeakAreaQuestionIds(attempts), ["alma-32-21", "alma-37-6"]);
  assert.deepEqual(getChallengeQuestions("weak-areas", attempts).map((q) => q.id), ["alma-32-21", "alma-37-6"]);
});

test("favorites require explicit saved passages; volume filtering respects them", () => {
  assert.deepEqual(getChallengeQuestions("my-favorites", [], []), []);
  const favorites = ["matthew-5-14", "alma-32-21"];
  assert.deepEqual(getChallengeQuestions("my-favorites", [], favorites, "new-testament").map((q) => q.id), ["matthew-5-14"]);
  assert.deepEqual(getChallengeQuestions("my-favorites", [], favorites, "old-testament"), []);
});
