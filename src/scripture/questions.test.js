import assert from "node:assert/strict";
import test from "node:test";
import {
  SAMPLE_QUESTIONS,
  SCRIPTURE_BOOKS,
  formatScriptureReference,
  gradeBookAndChapter,
  gradeExactVerse,
} from "./questions.js";

test("every sample question has a valid book and answer choices", () => {
  const bookIds = new Set(SCRIPTURE_BOOKS.map((book) => book.id));
  const questionIds = new Set();

  for (const question of SAMPLE_QUESTIONS) {
    assert.ok(!questionIds.has(question.id), `duplicate question: ${question.id}`);
    questionIds.add(question.id);
    assert.ok(bookIds.has(question.bookId));
    assert.ok(question.choices.includes(question.bookId));
    assert.equal(new Set(question.choices).size, question.choices.length);
    assert.ok(question.choices.every((choice) => bookIds.has(choice)));
    assert.ok(Number.isInteger(question.chapter) && question.chapter > 0);
    assert.ok(Number.isInteger(question.verse) && question.verse > 0);
    assert.ok(question.passage.length > 0);
  }
});

test("reference formatting returns the book, chapter, and verse", () => {
  assert.equal(formatScriptureReference(SAMPLE_QUESTIONS[0]), "2 Nephi 2:25");
});

test("book and chapter answers are scored independently", () => {
  const question = SAMPLE_QUESTIONS[0];
  const wrongBook = gradeBookAndChapter(question, "alma", 2);
  assert.equal(wrongBook.bookCorrect, false);
  assert.equal(wrongBook.chapterCorrect, true);

  const wrongChapter = gradeBookAndChapter(question, "2-nephi", 3);
  assert.equal(wrongChapter.bookCorrect, true);
  assert.equal(wrongChapter.chapterCorrect, false);

  const correct = gradeBookAndChapter(question, "2-nephi", 2);
  assert.equal(correct.bookCorrect, true);
  assert.equal(correct.chapterCorrect, true);
});

test("exact verse adds independently scored feedback without altering book and chapter", () => {
  const question = SAMPLE_QUESTIONS[0];
  const bookAndChapter = gradeBookAndChapter(question, "alma", 2);
  const rightVerse = gradeExactVerse(question, bookAndChapter, 25);
  assert.equal(rightVerse.bookCorrect, false);
  assert.equal(rightVerse.chapterCorrect, true);
  assert.equal(rightVerse.verseCorrect, true);
  assert.equal(rightVerse.verse, 25);

  const wrongVerse = gradeExactVerse(question, bookAndChapter, 7);
  assert.equal(wrongVerse.verseCorrect, false);
  assert.equal(wrongVerse.verse, 7);
  assert.equal(Object.hasOwn(bookAndChapter, "verseCorrect"), false);
});
