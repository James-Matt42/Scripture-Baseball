import React, { useId, useState } from "react";
import {
  formatScriptureReference,
  getBookLabel,
  gradeBookAndChapter,
  gradeExactVerse,
} from "../scripture/questions";

const primaryButton =
  "w-full cursor-pointer rounded-lg bg-scripture-green px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300 sm:w-auto disabled:cursor-not-allowed disabled:opacity-50";

// Keep the same key for a question while playing; give a new pitch a new key.
export function ScriptureQuestion({
  question,
  onAnswered,
  onNext,
  exactVerse = false,
  nextLabel = "Next Pitch",
  initialDraft = null,
  savedAttempt = null,
  onDraftChange,
}) {
  const id = useId();
  const [draft, setDraft] = useState(() => {
    const blank = {
      questionId: question.id,
      stage: "book",
      bookId: "",
      chapterInput: "",
      verseInput: "",
    };
    if (savedAttempt) {
      return {
        ...blank,
        stage: "feedback",
        bookId: savedAttempt.bookId,
        chapterInput: String(savedAttempt.chapter),
        verseInput: savedAttempt.verse === undefined ? "" : String(savedAttempt.verse),
      };
    }
    return initialDraft?.questionId === question.id ? { ...blank, ...initialDraft } : blank;
  });
  const [attempt, setAttempt] = useState(() => {
    if (savedAttempt) return savedAttempt;
    if (draft.stage === "verse") {
      return gradeBookAndChapter(question, draft.bookId, Number(draft.chapterInput));
    }
    return null;
  });
  const { stage, bookId, chapterInput, verseInput } = draft;
  const bookCorrect = bookId === question.bookId;

  function updateDraft(changes) {
    const next = { ...draft, ...changes };
    setDraft(next);
    onDraftChange?.(next);
  }

  function submitBook(event) {
    event.preventDefault();
    if (stage !== "book" || !bookId) return;
    // Show feedback and the chapter field in the same step: no Continue button.
    updateDraft({ stage: "chapter" });
  }

  function submitChapter(event) {
    event.preventDefault();
    if (stage !== "chapter") return;
    const chapter = Number(chapterInput);
    if (!Number.isSafeInteger(chapter) || chapter < 1) return;

    const result = gradeBookAndChapter(question, bookId, chapter);
    setAttempt(result);
    if (exactVerse) {
      updateDraft({ stage: "verse" });
    } else {
      setDraft({ ...draft, stage: "feedback" });
      onAnswered?.(result);
    }
  }

  function submitVerse(event) {
    event.preventDefault();
    if (stage !== "verse" || !attempt) return;
    const verse = Number(verseInput);
    if (!Number.isSafeInteger(verse) || verse < 1) return;

    const result = gradeExactVerse(question, attempt, verse);
    setAttempt(result);
    setDraft({ ...draft, stage: "feedback" });
    onAnswered?.(result);
  }

  return (
    <div>
      <h3 className="text-xl font-bold text-green-950">Where is this found?</h3>
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
                  onChange={() => updateDraft({ bookId: choice })}
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
          <div
            className={`mb-4 rounded-lg border p-3 ${bookCorrect ? "border-green-300 bg-green-50 text-green-950" : "border-amber-300 bg-amber-50 text-stone-800"}`}
            role="status"
            aria-live="polite"
          >
            <strong>Book: {bookCorrect ? "Correct!" : "Not quite."}</strong>
            {!bookCorrect && <> Correct: {getBookLabel(question.bookId)}.</>}
          </div>
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
              autoFocus
              value={chapterInput}
              onChange={(event) => updateDraft({ chapterInput: event.target.value })}
            />
            <button className={primaryButton} type="submit">Submit Chapter</button>
          </form>
        </section>
      )}

      {stage === "verse" && attempt && (
        <section aria-label="Verse question">
          <div
            className={`mb-4 rounded-lg border p-3 ${attempt.chapterCorrect ? "border-green-300 bg-green-50 text-green-950" : "border-amber-300 bg-amber-50 text-stone-800"}`}
            role="status"
            aria-live="polite"
          >
            <strong>Chapter: {attempt.chapterCorrect ? "Correct!" : "Not quite."}</strong>
            {!attempt.chapterCorrect && <> Correct: {question.chapter}.</>}
          </div>
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
              autoFocus
              value={verseInput}
              onChange={(event) => updateDraft({ verseInput: event.target.value })}
            />
            <button className={primaryButton} type="submit">Submit Verse</button>
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
              <dd className="mt-1 text-stone-800">{attempt.bookCorrect ? "Correct" : "Incorrect"}</dd>
            </div>
            <div className="rounded-lg bg-amber-50 p-4">
              <dt className="font-semibold text-green-950">Chapter</dt>
              <dd className="mt-1 text-stone-800">{attempt.chapterCorrect ? "Correct" : "Incorrect"}</dd>
            </div>
            {exactVerse && (
              <div className="rounded-lg bg-amber-50 p-4">
                <dt className="font-semibold text-green-950">Exact verse</dt>
                <dd className="mt-1 text-stone-800">{attempt.verseCorrect ? "Correct" : "Incorrect"}</dd>
              </div>
            )}
          </dl>
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
