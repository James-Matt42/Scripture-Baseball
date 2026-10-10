import React, { useState } from "react";
import { ScriptureQuestion } from "../components/ScriptureQuestion";
import { SAMPLE_QUESTIONS } from "../scripture/questions";
import { getPracticeStats, getResumePitchIndex } from "./session";

const primaryButton =
  "w-full cursor-pointer rounded-lg bg-scripture-green px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300 sm:w-auto";
const secondaryButton =
  "w-full cursor-pointer rounded-lg border border-scripture-green bg-white px-6 py-3 font-semibold text-scripture-green transition hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300 sm:w-auto";

export function Play() {
  const [pitchIndex, setPitchIndex] = useState(0);
  const [attempts, setAttempts] = useState([]);
  const [exactVerse, setExactVerse] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [inning, setInning] = useState(1);
  const [questionReset, setQuestionReset] = useState(0);

  const currentQuestion = SAMPLE_QUESTIONS[pitchIndex];
  const stats = getPracticeStats(attempts, SAMPLE_QUESTIONS.length, exactVerse);
  const answeredCurrent = attempts.some((attempt) => attempt.questionId === currentQuestion.id);
  const allAnswered = stats.completed === stats.totalPitches;

  function handleAnswered(attempt) {
    // Ignore duplicate submissions (for example, a rapid double-click).
    setAttempts((previous) =>
      previous.some((item) => item.questionId === attempt.questionId)
        ? previous
        : [...previous, attempt],
    );
  }

  function nextPitch() {
    if (!answeredCurrent) return;
    if (pitchIndex === SAMPLE_QUESTIONS.length - 1) {
      setIsFinished(true);
    } else {
      setPitchIndex((index) => index + 1);
    }
  }

  function startNewInning() {
    setAttempts([]);
    setPitchIndex(0);
    setQuestionReset(0);
    setInning((number) => number + 1);
    setIsFinished(false);
  }

  function keepPlaying() {
    if (allAnswered) {
      startNewInning();
      return;
    }
    const resumeIndex = getResumePitchIndex(SAMPLE_QUESTIONS, pitchIndex, attempts);
    if (resumeIndex === pitchIndex) {
      // An incomplete pitch starts over when returning from the summary.
      setQuestionReset((number) => number + 1);
    } else {
      setPitchIndex(resumeIndex);
    }
    setIsFinished(false);
  }

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
                  onChange={(event) => {
                    setExactVerse(event.target.checked);
                    setQuestionReset((number) => number + 1);
                  }}
                />
                <span>{exactVerse ? "On" : "Off"} — optional extra point</span>
              </label>
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-sm text-stone-600">
          Each correct book and chapter earns one point. With exact verse enabled, a correct verse earns one more.
          {stats.completed > 0 && " Answer format is locked for this inning."}
        </p>
      </section>

      <section className="rounded-xl border border-green-900/20 bg-green-50 p-5 shadow-sm" aria-label="Live inning score" aria-live="polite">
        <p className="text-lg font-bold text-green-950">Score: {stats.earnedPoints} / {stats.possiblePoints} points</p>
        <p className="mt-1 text-sm text-green-900">
          {stats.completed} of {stats.totalPitches} pitches completed ·
          {" "}{stats.bookCorrect} correct books · {stats.chapterCorrect} correct chapters
          {exactVerse && <> · {stats.verseCorrect} correct verses</>}
        </p>
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
              key={`${inning}-${currentQuestion.id}-${exactVerse}-${questionReset}`}
              question={currentQuestion}
              exactVerse={exactVerse}
              onAnswered={handleAnswered}
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
              You can finish early and view your results. Unfinished guesses are not scored.
              Saving progress across refreshes will be added in the next step.
            </p>
            <button className={`mt-4 ${secondaryButton}`} type="button" onClick={() => setIsFinished(true)}>
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
            {allAnswered
              ? "You answered every pitch. Keep playing to start another inning."
              : "Keep playing to resume your inning. An incomplete pitch will restart from the book guess."}
            {" "}Results are currently temporary; local saving comes in the next step.
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
