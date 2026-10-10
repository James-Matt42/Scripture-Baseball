import React, { useId, useState } from "react";
import {
  formatScriptureReference,
  getBookLabel,
  gradeBookAndChapter,
  gradeExactVerse,
} from "../scripture/questions";

const primaryButton =
  "w-full cursor-pointer rounded-lg bg-scripture-green px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300 sm:w-auto disabled:cursor-not-allowed disabled:opacity-50";

// Each mounted question owns its form state. Key this component by question.id
// (and session/mode) when moving to a new pitch so previous answers are cleared.
export function ScriptureQuestion({
  question,
  onAnswered,
  onNext,
  exactVerse = false,
  nextLabel = "Next Pitch",
}) {
  const id = useId();
  const [stage, setStage] = useState("book");
  const [bookId, setBookId] = useState("");
  const [chapterInput, setChapterInput] = useState("");
  const [verseInput, setVerseInput] = useState("");
  const [attempt, setAttempt] = useState(null);
  const bookCorrect = bookId === question.bookId;

  function submitBook(event) {
    event.preventDefault();
    if (stage !== "book" || !bookId) return;
    // Show the result before presenting the chapter form.
    setStage("book-feedback");
  }

  function submitChapter(event) {
    event.preventDefault();
    if (stage !== "chapter") return;
    const chapter = Number(chapterInput);
    if (!Number.isInteger(chapter) || chapter < 1) return;

    const result = gradeBookAndChapter(question, bookId, chapter);
    setAttempt(result);
    if (exactVerse) {
      // Do not reveal the full reference before the optional verse guess.
      setStage("chapter-feedback");
    } else {
      setStage("feedback");
      onAnswered?.(result);
    }
  }

  function submitVerse(event) {
    event.preventDefault();
    if (stage !== "verse" || !attempt) return;
    const verse = Number(verseInput);
    if (!Number.isInteger(verse) || verse < 1) return;

    const result = gradeExactVerse(question, attempt, verse);
    setAttempt(result);
    setStage("feedback");
    onAnswered?.(result);
  }

  return (
    <div>
      <h3 className="text-xl font-bold text-green-950">Where is this found?</h3>
      <p className="mt-2 text-sm text-stone-600">
        Guess the book, then the chapter{exactVerse ? ", then the exact verse" : ""}.
        Each answer is scored independently.
      </p>

      <blockquote className="my-6 rounded-xl bg-amber-50 p-6 text-xl leading-relaxed text-stone-800">
        <p>“{question.passage}”</p>
      </blockquote>

      {stage === "book" && (
        <form onSubmit={submitBook}>
          <fieldset className="grid gap-3 rounded-xl border border-amber-200 p-5">
            <legend className="px-2 font-semibold text-green-900">1. Choose a book</legend>
            {question.choices.map((choice) => (
              <div className="relative" key={choice}>
                <input
                  type="radio"
                  className="peer sr-only"
                  id={`${id}-${choice}`}
                  name={`${id}-book`}
                  value={choice}
                  checked={bookId === choice}
                  onChange={() => setBookId(choice)}
                />
                <label
                  className="block min-h-12 w-full cursor-pointer rounded-xl border border-stone-200 bg-white px-5 py-4 text-center font-semibold text-stone-800 shadow-sm transition hover:-translate-y-0.5 hover:border-green-700 hover:bg-green-50 hover:text-green-900 hover:shadow-md peer-focus-visible:ring-2 peer-focus-visible:ring-green-300 peer-checked:border-green-900 peer-checked:bg-green-700 peer-checked:text-white"
                  htmlFor={`${id}-${choice}`}
                >
                  {getBookLabel(choice)}
                </label>
              </div>
            ))}
          </fieldset>
          <button className={`mt-4 ${primaryButton}`} type="submit" disabled={!bookId}>
            Submit Book
          </button>
        </form>
      )}

      {stage === "book-feedback" && (
        <section aria-label="Book feedback" aria-live="polite">
          <div
            className={`rounded-xl border p-4 ${bookCorrect ? "border-green-300 bg-green-50 text-green-950" : "border-amber-300 bg-amber-50 text-stone-800"}`}
            role="status"
          >
            <h4 className="text-lg font-bold">Book: {bookCorrect ? "Correct!" : "Not quite."}</h4>
            <p className="mt-1">You chose {getBookLabel(bookId)}.</p>
            {!bookCorrect && <p>The correct book is {getBookLabel(question.bookId)}.</p>}
            <p className="mt-2 text-sm">Your chapter guess will count independently of your book answer.</p>
          </div>
          <button className={`mt-4 ${primaryButton}`} type="button" onClick={() => setStage("chapter")}>
            Continue to Chapter
          </button>
        </section>
      )}

      {stage === "chapter" && (
        <section aria-label="Chapter question">
          <p className="mb-3 rounded-lg bg-green-50 p-3 text-green-900">
            Book answer locked: {getBookLabel(bookId)}.
          </p>
          <form className="grid max-w-sm gap-3" onSubmit={submitChapter}>
            <label className="font-semibold text-stone-700" htmlFor={`${id}-chapter`}>
              2. Which chapter?
            </label>
            <input
              id={`${id}-chapter`}
              name="chapter"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              required
              value={chapterInput}
              onChange={(event) => setChapterInput(event.target.value)}
            />
            <button className={primaryButton} type="submit">
              Submit Chapter
            </button>
          </form>
        </section>
      )}

      {stage === "chapter-feedback" && attempt && (
        <section aria-label="Chapter feedback" aria-live="polite">
          <div
            className={`rounded-xl border p-4 ${attempt.chapterCorrect ? "border-green-300 bg-green-50 text-green-950" : "border-amber-300 bg-amber-50 text-stone-800"}`}
            role="status"
          >
            <h4 className="text-lg font-bold">Chapter: {attempt.chapterCorrect ? "Correct!" : "Not quite."}</h4>
            <p className="mt-1">You entered chapter {attempt.chapter}.</p>
            {!attempt.chapterCorrect && <p>The correct chapter is {question.chapter}.</p>}
          </div>
          <button className={`mt-4 ${primaryButton}`} type="button" onClick={() => setStage("verse")}>
            Continue to Exact Verse
          </button>
        </section>
      )}

      {stage === "verse" && (
        <section aria-label="Verse question">
          <form className="grid max-w-sm gap-3" onSubmit={submitVerse}>
            <label className="font-semibold text-stone-700" htmlFor={`${id}-verse`}>
              3. Which exact verse?
            </label>
            <input
              id={`${id}-verse`}
              name="verse"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              required
              value={verseInput}
              onChange={(event) => setVerseInput(event.target.value)}
            />
            <button className={primaryButton} type="submit">
              Submit Verse
            </button>
          </form>
        </section>
      )}

      {stage === "feedback" && attempt && (
        <section aria-label="Answer feedback" aria-live="polite">
          <h3 className="text-xl font-bold text-green-950">
            Correct reference: {formatScriptureReference(question)}
          </h3>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-amber-50 p-4">
              <dt className="font-semibold text-green-950">Book</dt>
              <dd className="mt-1 text-stone-800">
                {attempt.bookCorrect ? "Correct!" : "Not quite."} You chose {getBookLabel(attempt.bookId)}.
              </dd>
            </div>
            <div className="rounded-lg bg-amber-50 p-4">
              <dt className="font-semibold text-green-950">Chapter</dt>
              <dd className="mt-1 text-stone-800">
                {attempt.chapterCorrect ? "Correct!" : "Not quite."} You entered {attempt.chapter}.
              </dd>
            </div>
            {exactVerse && (
              <div className="rounded-lg bg-amber-50 p-4">
                <dt className="font-semibold text-green-950">Exact verse</dt>
                <dd className="mt-1 text-stone-800">
                  {attempt.verseCorrect ? "Correct!" : "Not quite."} You entered {attempt.verse}.
                </dd>
              </div>
            )}
          </dl>
          <p className="mt-4 text-stone-600">
            Each correct answer earns one point. Review the reference, then continue.
          </p>
          {onNext && (
            <button className={`mt-4 ${primaryButton}`} type="button" onClick={onNext}>
              {nextLabel}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
