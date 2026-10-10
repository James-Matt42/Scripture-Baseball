import React, { useId, useState } from "react";
import {
  formatScriptureReference,
  getBookLabel,
  gradeBookAndChapter,
} from "../scripture/questions";

const primaryButton =
  "w-full cursor-pointer rounded-lg bg-scripture-green px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300 sm:w-auto disabled:cursor-not-allowed disabled:opacity-50";

// Each mounted question owns its form state. Key this component by question.id
// when moving to a new pitch so answers from the previous one are cleared.
export function ScriptureQuestion({ question, onAnswered, onNext }) {
  const id = useId();
  const [stage, setStage] = useState("book");
  const [bookId, setBookId] = useState("");
  const [chapterInput, setChapterInput] = useState("");
  const [attempt, setAttempt] = useState(null);

  function submitBook(event) {
    event.preventDefault();
    if (!bookId) return;
    setStage("chapter");
  }

  function submitChapter(event) {
    event.preventDefault();
    const chapter = Number(chapterInput);
    if (!Number.isInteger(chapter) || chapter < 1) return;

    const result = gradeBookAndChapter(question, bookId, chapter);
    setAttempt(result);
    setStage("feedback");
    onAnswered?.(result);
  }

  return (
    <div>
      <h3 className="text-xl font-bold text-green-950">Where is this found?</h3>
      <p className="mt-2 text-sm text-stone-600">
        Guess the book, then the chapter. Both are scored separately.
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

      {stage === "chapter" && (
        <section aria-label="Chapter question">
          <p className="mb-3 rounded-lg bg-green-50 p-3 text-green-900" role="status">
            Book answer locked: {getBookLabel(bookId)}. Now guess the chapter.
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
          </dl>
          <p className="mt-4 text-stone-600">
            Review the reference above, then try another passage.
          </p>
          {onNext && (
            <button className={`mt-4 ${primaryButton}`} type="button" onClick={onNext}>
              Next Pitch
            </button>
          )}
        </section>
      )}
    </div>
  );
}
