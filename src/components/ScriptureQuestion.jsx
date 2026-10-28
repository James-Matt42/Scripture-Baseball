import React, { useEffect, useId, useState } from "react";
import {
  formatScriptureReference,
  getBookLabel,
  gradeBookAndChapter,
  gradeExactVerse,
} from "../scripture/questions";
import { restoredStageRequest, toPracticeAttempt } from "../api/scriptureApi.js";

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
  checkAnswer,
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
  const isRemote = typeof checkAnswer === "function";
  const [attempt, setAttempt] = useState(() => {
    if (savedAttempt) return savedAttempt;
    if (!isRemote && draft.stage === "verse") {
      return gradeBookAndChapter(question, draft.bookId, Number(draft.chapterInput));
    }
    return null;
  });
  const [bookResult, setBookResult] = useState(null);
  const [chapterResult, setChapterResult] = useState(null);
  const [correctReference, setCorrectReference] = useState(() =>
    isRemote ? "" : formatScriptureReference(question));
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(() => isRemote && draft.stage !== "book");
  const [error, setError] = useState("");
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [restoreSequence, setRestoreSequence] = useState(0);
  const { stage, bookId, chapterInput, verseInput } = draft;
  const bookCorrect = bookResult?.bookCorrect ?? (!isRemote && bookId === question.bookId);

  function updateDraft(changes) {
    const next = { ...draft, ...changes };
    setDraft(next);
    onDraftChange?.(next);
  }

  function checkLocally(payload) {
    const { stage: answerStage, bookId: chosenBookId } = payload;
    if (answerStage === "book") {
      return {
        bookCorrect: chosenBookId === question.bookId,
        correctBookId: question.bookId,
        correctBookLabel: getBookLabel(question.bookId),
      };
    }
    const base = gradeBookAndChapter(question, chosenBookId, payload.chapter);
    if (answerStage === "chapter") {
      return {
        ...base,
        correctBookId: question.bookId,
        correctChapter: question.chapter,
        ...(payload.exactVerse ? {} : { correctReference: formatScriptureReference(question) }),
      };
    }
    return {
      ...gradeExactVerse(question, base, payload.verse),
      correctBookId: question.bookId,
      correctChapter: question.chapter,
      correctReference: formatScriptureReference(question),
    };
  }

  // Saved guesses are kept locally for interruptible solo play, but the server
  // must restore the stage's feedback: public question payloads have no key.
  // Do not advance a staged guess on a failed request.
  useEffect(() => {
    if (!isRemote) return;
    // Only rehydrate the stage that existed on mount. Later stage changes in
    // this instance already contain verified feedback from their POST request.
    const initialStage = savedAttempt ? "feedback" : initialDraft?.questionId === question.id
      ? initialDraft.stage : "book";
    if (initialStage === "book") return;
    const chosenBook = savedAttempt?.bookId ?? initialDraft.bookId;
    const chosenChapter = savedAttempt?.chapter ?? Number(initialDraft.chapterInput);
    const chosenVerse = savedAttempt?.verse ?? Number(initialDraft.verseInput);
    let active = true;
    setRestoring(true);
    setError("");
    setRestoreFailed(false);
    const payload = restoredStageRequest(initialStage, {
      bookId: chosenBook, chapter: chosenChapter, verse: chosenVerse, exactVerse,
    });
    checkAnswer(question.id, payload).then((result) => {
      if (!active) return;
      setBookResult(result);
      if (payload.stage !== "book") {
        setChapterResult(result);
        setAttempt(toPracticeAttempt(result));
      }
      if (result.correctReference) setCorrectReference(result.correctReference);
    }).catch((cause) => {
      if (active) {
        setRestoreFailed(true);
        setError(cause?.message || "Could not restore your answer. Try again.");
      }
    }).finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
    // Only restart for the original saved state or the explicit Retry button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id, checkAnswer, restoreSequence]);

  async function verify(payload, onSuccess) {
    if (busy || restoring) return;
    setBusy(true);
    setError("");
    setRestoreFailed(false);
    try {
      const result = isRemote ? await checkAnswer(question.id, payload) : checkLocally(payload);
      onSuccess(result);
    } catch (cause) {
      setError(cause?.message || "Unable to check your answer. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function submitBook(event) {
    event.preventDefault();
    if (stage !== "book" || !bookId) return;
    void verify({ stage: "book", bookId }, (result) => {
      setBookResult(result);
      updateDraft({ stage: "chapter" });
    });
  }

  function submitChapter(event) {
    event.preventDefault();
    if (stage !== "chapter") return;
    const chapter = Number(chapterInput);
    if (!Number.isSafeInteger(chapter) || chapter < 1 || chapter > 9999) return;
    void verify({ stage: "chapter", bookId, chapter, exactVerse }, (result) => {
      const verified = toPracticeAttempt(result);
      setChapterResult(result);
      setAttempt(verified);
      if (exactVerse) {
        updateDraft({ stage: "verse" });
      } else {
        setCorrectReference(result.correctReference);
        setDraft({ ...draft, stage: "feedback" });
        onAnswered?.(verified);
      }
    });
  }

  function submitVerse(event) {
    event.preventDefault();
    if (stage !== "verse" || !attempt) return;
    const verse = Number(verseInput);
    if (!Number.isSafeInteger(verse) || verse < 1 || verse > 9999) return;
    void verify({ stage: "verse", bookId, chapter: Number(chapterInput), verse }, (result) => {
      const verified = toPracticeAttempt(result);
      setAttempt(verified);
      setCorrectReference(result.correctReference);
      setDraft({ ...draft, stage: "feedback" });
      onAnswered?.(verified);
    });
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
                  disabled={busy || restoring}
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
          <button className={`mt-4 ${primaryButton}`} type="submit" disabled={!bookId || busy || restoring}>
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
            <strong>Book: {restoring ? "Checking…" : !bookResult && isRemote ? "Unavailable" : bookCorrect ? "Correct!" : "Not quite."}</strong>
            {!restoring && !bookCorrect && (bookResult || !isRemote) && <> Correct: {bookResult?.correctBookLabel ?? getBookLabel(bookResult?.correctBookId ?? question.bookId)}.</>}
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
              max="9999"
              step="1"
              required
              autoFocus
              disabled={busy || restoring}
              value={chapterInput}
              onChange={(event) => updateDraft({ chapterInput: event.target.value })}
            />
            <button className={primaryButton} type="submit" disabled={busy || restoring || (isRemote && !bookResult)}>Submit Chapter</button>
          </form>
        </section>
      )}

      {stage === "verse" && !attempt && restoring && <p role="status">Restoring chapter feedback…</p>}
      {stage === "verse" && attempt && (
        <section aria-label="Verse question">
          <div
            className={`mb-4 rounded-lg border p-3 ${attempt.chapterCorrect ? "border-green-300 bg-green-50 text-green-950" : "border-amber-300 bg-amber-50 text-stone-800"}`}
            role="status"
            aria-live="polite"
          >
            <strong>Chapter: {attempt.chapterCorrect ? "Correct!" : "Not quite."}</strong>
            {!attempt.chapterCorrect && <> Correct: {chapterResult?.correctChapter ?? question.chapter}.</>}
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
              max="9999"
              step="1"
              required
              autoFocus
              disabled={busy || restoring}
              value={verseInput}
              onChange={(event) => updateDraft({ verseInput: event.target.value })}
            />
            <button className={primaryButton} type="submit" disabled={busy || restoring}>Submit Verse</button>
          </form>
        </section>
      )}

      {stage === "feedback" && attempt && (
        <section aria-label="Answer feedback" aria-live="polite">
          <h3 className="text-xl font-bold text-green-950">
            {correctReference ? `Correct reference: ${correctReference}` : "Restoring correct reference…"}
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
            <button className={`mt-4 ${primaryButton}`} type="button" onClick={onNext} disabled={restoring || !correctReference}>
              {nextLabel}
            </button>
          )}
        </section>
      )}

      {busy && <p className="mt-3 text-sm text-stone-600" role="status">Checking your answer…</p>}
      {error && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-red-900" role="alert">
          <p>{error}</p>
          {restoreFailed && (
            <button className="mt-2 font-semibold underline" type="button" onClick={() => setRestoreSequence((value) => value + 1)}>
              Retry restoring answer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
