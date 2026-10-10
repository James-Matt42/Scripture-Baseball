import React from "react";
import { ScriptureQuestion } from "../components/ScriptureQuestion";
import { SAMPLE_QUESTIONS } from "../scripture/questions";
import { getPracticeStats } from "./session";
import { usePractice } from "./PracticeContext";

const primaryButton =
  "w-full cursor-pointer rounded-lg bg-scripture-green px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300 sm:w-auto";
const secondaryButton =
  "w-full cursor-pointer rounded-lg border border-scripture-green bg-white px-6 py-3 font-semibold text-scripture-green transition hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300 sm:w-auto";

export function Play() {
  const {
    session: { inning, pitchIndex, attempts, exactVerse, isFinished, draft },
    history,
    isSaved,
    saveDraft,
    setExactVerse,
    answerPitch,
    nextPitch,
    finishInning,
    keepPlaying,
    startNewInning,
  } = usePractice();

  const currentQuestion = SAMPLE_QUESTIONS[pitchIndex];
  const stats = getPracticeStats(attempts, SAMPLE_QUESTIONS.length, exactVerse);
  const savedAttempt = attempts.find((attempt) => attempt.questionId === currentQuestion.id) ?? null;
  const allAnswered = stats.completed === stats.totalPitches;

  return (
    <main className="mx-auto w-full max-w-[1200px] space-y-8 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
      <header className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm md:flex md:items-start md:justify-between md:gap-8">
        <div>
          <h1 className="text-3xl font-bold text-green-950">Today's Lineup</h1>
          <p className="mt-2 text-stone-700">Six Book of Mormon passages, one pitch at a time.</p>
        </div>
        <p className="mt-3 font-semibold text-green-950 md:mt-0">Inning {inning}</p>
      </header>

      <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="practice-heading">
        <h2 className="text-2xl font-bold text-green-950" id="practice-heading">Current practice</h2>
        <dl className="mt-4 grid gap-3 md:grid-cols-2 [&>div]:rounded-lg [&>div]:bg-amber-50 [&>div]:p-4 [&_dt]:text-sm [&_dt]:font-semibold [&_dt]:uppercase [&_dt]:tracking-wide [&_dt]:text-stone-500 [&_dd]:mt-1 [&_dd]:font-medium [&_dd]:text-green-900">
          <div>
            <dt>Challenge</dt>
            <dd>Starter lineup ({stats.totalPitches} pitches)</dd>
          </div>
          <div>
            <dt>Mode</dt>
            <dd>Solo practice</dd>
          </div>
          <div>
            <dt>Answer format</dt>
            <dd>Book, then chapter{exactVerse ? ", then verse" : ""}</dd>
          </div>
          <div>
            <dt>Exact verse</dt>
            <dd>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={exactVerse}
                  disabled={stats.completed > 0}
                  onChange={(event) => setExactVerse(event.target.checked)}
                />
                <span>{exactVerse ? "On" : "Off"} — optional extra point</span>
              </label>
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-stone-600">
          One point per correct answer.{stats.completed > 0 && " Mode locked for this inning."}
        </p>
      </section>

      <section className="rounded-xl border border-green-900/20 bg-green-50 p-5 shadow-sm" aria-label="Live inning score" aria-live="polite">
        <p className="text-lg font-bold text-green-950">Score: {stats.earnedPoints} / {stats.possiblePoints} points</p>
        <p className="mt-1 text-sm text-green-900">
          {stats.completed} of {stats.totalPitches} pitches completed ·
          {" "}{stats.bookCorrect} correct books · {stats.chapterCorrect} correct chapters
          {exactVerse && <> · {stats.verseCorrect} correct verses</>}
        </p>
        {isSaved !== null && (
          <p className="mt-2 text-xs text-green-900">
            {isSaved ? "Saved on this device" : "Browser storage unavailable — scores may be lost on refresh"}
            {history.length > 0 && ` · ${history.length} previous ${history.length === 1 ? "inning" : "innings"}`}
          </p>
        )}
      </section>

      {!isFinished ? (
        <>
          <article className="mx-auto max-w-4xl rounded-2xl border border-amber-200 bg-white p-4 shadow-lg sm:p-6" aria-labelledby="pitch-heading">
            <header className="mb-4 border-b border-stone-200 pb-4">
              <h2 className="text-xl font-bold text-green-950" id="pitch-heading">
                Pitch {pitchIndex + 1} of {stats.totalPitches}
              </h2>
            </header>
            <ScriptureQuestion
              key={`${inning}-${currentQuestion.id}-${exactVerse}`}
              question={currentQuestion}
              exactVerse={exactVerse}
              savedAttempt={savedAttempt}
              initialDraft={draft}
              onDraftChange={saveDraft}
              onAnswered={answerPitch}
              onNext={nextPitch}
              nextLabel={pitchIndex === SAMPLE_QUESTIONS.length - 1 ? "See Inning Results" : "Next Pitch"}
            />
          </article>

          <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="checkpoint-heading">
            <h2 className="text-2xl font-bold text-green-950" id="checkpoint-heading">Current inning</h2>
            <p className="mt-2 text-stone-700">
              {stats.completed === 0
                ? "No pitches completed yet."
                : `${stats.completed} ${stats.completed === 1 ? "pitch" : "pitches"} scored so far.`}
            </p>
            <p className="mt-2 text-sm text-stone-600">
              You can pause and resume this inning later.
            </p>
            <button className={`mt-4 ${secondaryButton}`} type="button" onClick={finishInning}>
              Finish Here
            </button>
          </section>
        </>
      ) : (
        <section className="mx-auto max-w-4xl rounded-2xl border border-amber-200 bg-white p-6 shadow-lg" aria-labelledby="results-heading">
          <h2 className="text-2xl font-bold text-green-950" id="results-heading">
            {allAnswered ? "Inning complete!" : "Inning paused"}
          </h2>
          <p className="mt-3 text-lg text-stone-800">
            You earned <strong>{stats.earnedPoints} of {stats.possiblePoints} possible points</strong> across
            {" "}{stats.completed} completed {stats.completed === 1 ? "pitch" : "pitches"}.
          </p>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 [&>div]:rounded-xl [&>div]:bg-amber-50 [&>div]:p-4">
            <div>
              <dt className="font-semibold text-green-950">Books</dt>
              <dd>{stats.bookCorrect} / {stats.completed} correct</dd>
            </div>
            <div>
              <dt className="font-semibold text-green-950">Chapters</dt>
              <dd>{stats.chapterCorrect} / {stats.completed} correct</dd>
            </div>
            {exactVerse && (
              <div>
                <dt className="font-semibold text-green-950">Exact verses</dt>
                <dd>{stats.verseCorrect} / {stats.completed} correct</dd>
              </div>
            )}
          </dl>
          <p className="mt-4 text-sm text-stone-600">
            {allAnswered ? "Keep playing to start another inning." : "Keep playing to resume where you left off."}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className={primaryButton} type="button" onClick={keepPlaying}>
              Keep Playing
            </button>
            {!allAnswered && (
              <button className={secondaryButton} type="button" onClick={startNewInning}>
                Start New Inning
              </button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
