import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { getChallengeQuestions } from "../challenges/catalog.js";
import { usePractice } from "../play/PracticeContext";
import { useRooms } from "../rooms/RoomContext";
import { formatScriptureReference } from "../scripture/questions.js";
import { getProgressReport } from "./progressReport.js";

const panel = "rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6";
const actionLink = "inline-flex w-fit rounded-lg bg-scripture-green px-4 py-2 font-semibold text-white hover:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300";

function Percent({ value }) {
  return value === null ? "—" : `${value}%`;
}

function Metric({ title, value, detail }) {
  return (
    <div className={`${panel} text-center`}>
      <dt className="text-sm font-semibold text-stone-600">{title}</dt>
      <dd className="mt-2 text-3xl font-bold text-green-950">{value}</dd>
      <p className="mt-2 text-xs text-stone-600">{detail}</p>
    </div>
  );
}

function VolumeCard({ volume }) {
  const hasPractice = volume.pitches > 0;
  return (
    <article className={panel}>
      <h3 className="text-lg font-bold text-green-950">{volume.label}</h3>
      <p className="mt-1 text-sm text-stone-600">
        {hasPractice ? `${volume.pitches} recorded ${volume.pitches === 1 ? "pitch" : "pitches"}` : "Not practiced yet"}
      </p>
      {hasPractice && (
        <>
          <p className="mt-2 text-sm font-semibold text-green-900">{volume.strongPassages} strong {volume.strongPassages === 1 ? "passage" : "passages"}</p>
          <dl className="mt-4 space-y-4">
          {[
            { label: "Book accuracy", correct: volume.bookCorrect, percent: volume.bookAccuracy },
            { label: "Chapter accuracy", correct: volume.chapterCorrect, percent: volume.chapterAccuracy },
          ].map(({ label, correct, percent }) => (
            <div key={label}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <dt className="font-semibold text-stone-700">{label}</dt>
                <dd className="font-semibold text-green-950">{percent}% ({correct}/{volume.pitches})</dd>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-label={`${volume.label} ${label.toLowerCase()}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                <div className="h-full rounded-full bg-green-800" style={{ width: `${percent}%` }} />
              </div>
            </div>
          ))}
          </dl>
        </>
      )}
    </article>
  );
}

function PassageList({ passages, empty }) {
  return passages.length ? (
    <ul className="mt-3 list-disc space-y-2 pl-5 text-stone-700">
      {passages.slice(0, 8).map(({ question, attempts }) => (
        <li key={question.id}>{formatScriptureReference(question)} <span className="text-sm text-stone-500">({attempts} {attempts === 1 ? "try" : "tries"})</span></li>
      ))}
    </ul>
  ) : <p className="mt-3 text-sm text-stone-600">{empty}</p>;
}

export function Progress() {
  const { recordedAttempts, history, favorites, startChallenge } = usePractice();
  const { completedGames } = useRooms();
  const progress = useMemo(
    () => getProgressReport({ attempts: recordedAttempts, history }),
    [recordedAttempts, history],
  );
  const hasPractice = progress.pitches > 0;

  function practiceWeakBook(area) {
    const available = getChallengeQuestions("my-misses", recordedAttempts, favorites);
    const requested = new Set(area.questionIds);
    startChallenge("my-misses", available.filter(({ id }) => requested.has(id)));
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] space-y-8 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
      <header className={`${panel} md:flex md:items-start md:justify-between md:gap-6`}>
        <div>
          <h1 className="text-3xl font-bold text-green-950">Your Progress</h1>
          <p className="mt-2 text-stone-700">Your saved solo practice, including pitches from the current inning.</p>
        </div>
        <Link to="/play" className={`${actionLink} mt-4 shrink-0 md:mt-0`}>Practice now</Link>
      </header>

      {!hasPractice && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5" role="status">
          <h2 className="text-lg font-bold text-green-950">No practice recorded yet</h2>
          <p className="mt-2 text-stone-700">Answer a few pitches to start tracking book and chapter accuracy.</p>
          <Link to="/challenges" className="mt-3 inline-block font-semibold text-green-800 underline hover:text-green-950">Choose a challenge</Link>
        </section>
      )}

      <section className="space-y-4" aria-labelledby="overview-heading">
        <h2 id="overview-heading" className="text-2xl font-bold text-green-950">Learning overview</h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric title="Pitches recorded" value={progress.pitches} detail="Across saved solo sessions" />
          <Metric title="Book accuracy" value={<Percent value={progress.bookAccuracy} />} detail={`${progress.bookCorrect} correct of ${progress.pitches}`} />
          <Metric title="Chapter accuracy" value={<Percent value={progress.chapterAccuracy} />} detail={`${progress.chapterCorrect} correct of ${progress.pitches}`} />
          <Metric title="Strong passages" value={progress.strongPassages.length} detail="Two consecutive fully correct recalls" />
        </dl>
        <div className="rounded-xl border border-green-900/20 bg-green-50 p-5 text-sm text-green-950">
          <strong>This week:</strong> {progress.practiceDays} {progress.practiceDays === 1 ? "day" : "days"} with a finished inning · {progress.strengthenedThisWeek.length} recovered {progress.strengthenedThisWeek.length === 1 ? "passage" : "passages"} in finished innings
          {progress.versePitches > 0 && <span> · Exact verses: {progress.verseCorrect}/{progress.versePitches} correct</span>}
          <p className="mt-2 text-xs text-stone-600">Weekly activity counts finished innings only; unfinished pitches still count toward accuracy.</p>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="volume-heading">
        <h2 id="volume-heading" className="text-2xl font-bold text-green-950">Accuracy by standard work</h2>
        <p className="text-sm text-stone-600">Percentages reflect passages you have practiced, not the entire standard work.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {progress.volumes.map((volume) => <VolumeCard key={volume.id} volume={volume} />)}
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2" aria-label="Passage knowledge">
        <article className={panel}>
          <h2 className="text-xl font-bold text-green-950">Strong passages ({progress.strongPassages.length})</h2>
          <p className="mt-1 text-sm text-stone-600">Book and chapter correct twice in a row, plus the verse when attempted. {progress.learningPassages.length} other practiced {progress.learningPassages.length === 1 ? "passage is" : "passages are"} still learning.</p>
          <PassageList passages={progress.strongPassages} empty="No passages strong yet. Revisit a passage to build your streak." />
        </article>
        <article className={panel}>
          <h2 className="text-xl font-bold text-green-950">Needs review ({progress.needsReview.length})</h2>
          <p className="mt-1 text-sm text-stone-600">Passages with an incorrect answer on the latest attempt.</p>
          <PassageList passages={progress.needsReview} empty={hasPractice ? "No recent misses among your recorded passages." : "Your missed passages will appear here."} />
        </article>
      </section>

      <section className="space-y-4" aria-labelledby="weak-heading">
        <h2 id="weak-heading" className="text-2xl font-bold text-green-950">Areas to strengthen</h2>
        {progress.weakBooks.length ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {progress.weakBooks.slice(0, 6).map((area) => (
              <article key={area.bookId} className={panel}>
                <h3 className="text-lg font-bold text-green-950">{area.label}</h3>
                <p className="mt-2 text-sm text-stone-700">{area.needsReview} {area.needsReview === 1 ? "passage needs" : "passages need"} review.</p>
                <p className="mt-2 text-sm text-stone-600">Book {area.bookAccuracy}% · Chapter {area.chapterAccuracy}%</p>
                <Link to="/play" className={`${actionLink} mt-4`} onClick={() => practiceWeakBook(area)}>Practice these passages</Link>
              </article>
            ))}
          </div>
        ) : (
          <p className={`${panel} text-stone-600`}>{hasPractice ? "No passages currently need review." : "Areas to strengthen will appear after you practice."}</p>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="text-2xl font-bold text-green-950">Recent solo innings</h2>
        {progress.recentInnings.length ? (
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
            <table className="w-full min-w-[650px] text-left text-sm [&_th]:bg-green-900 [&_th]:px-4 [&_th]:py-3 [&_th]:text-white [&_td]:border-b [&_td]:border-stone-200 [&_td]:px-4 [&_td]:py-3">
              <caption className="sr-only">Your ten most recently saved solo innings</caption>
              <thead><tr><th scope="col">Finished</th><th scope="col">Challenge</th><th scope="col">Pitches</th><th scope="col">Book</th><th scope="col">Chapter</th><th scope="col">Points</th></tr></thead>
              <tbody>
                {progress.recentInnings.map((inning, index) => (
                  <tr key={`${inning.id ?? "inning"}-${index}`}>
                    <td>{inning.finishedAt ? inning.finishedAt.toLocaleDateString() : "Date unavailable"}</td>
                    <td>{inning.challenge}</td>
                    <td>{inning.completed}/{inning.totalPitches}{!inning.complete && <span className="text-stone-500"> (ended early)</span>}</td>
                    <td><Percent value={inning.bookAccuracy} /></td>
                    <td><Percent value={inning.chapterAccuracy} /></td>
                    <td>{inning.earnedPoints}/{inning.possiblePoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className={`${panel} text-stone-600`}>No finished innings yet. Your current practice still counts toward the overview above.</p>}
      </section>

      <section className="space-y-4" aria-labelledby="multiplayer-history-heading">
        <h2 id="multiplayer-history-heading" className="text-2xl font-bold text-green-950">Recent multiplayer games</h2>
        <p className="text-sm text-stone-600">Finished games for this local profile or guest seat, including simulated opponents.</p>
        {completedGames.length ? (
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
            <table className="w-full min-w-[550px] text-left text-sm [&_th]:bg-green-900 [&_th]:px-4 [&_th]:py-3 [&_th]:text-white [&_td]:border-b [&_td]:border-stone-200 [&_td]:px-4 [&_td]:py-3">
              <caption className="sr-only">Ten most recently completed local multiplayer games</caption>
              <thead><tr><th scope="col">Finished</th><th scope="col">Game</th><th scope="col">Place</th><th scope="col">Pitches</th><th scope="col">Points</th></tr></thead>
              <tbody>
                {completedGames.map((game) => (
                  <tr key={game.code}>
                    <td>{new Date(game.finishedAt).toLocaleDateString()}</td>
                    <td><Link className="font-semibold text-green-800 underline" to={`/game?code=${game.code}`}>{game.name}</Link></td>
                    <td>#{game.rank} of {game.playerCount}</td>
                    <td>{game.answered}/{game.pitches}</td>
                    <td>{game.points}/{game.possiblePoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className={`${panel} text-stone-600`}>No completed multiplayer games yet. <Link className="font-semibold text-green-800 underline" to="/create-game">Create a game</Link> to try a local match.</p>}
      </section>

      <section className="grid gap-5 md:grid-cols-2" aria-label="Improvements and milestones">
        <article className={panel}>
          <h2 className="text-xl font-bold text-green-950">Comeback passages ({progress.comebacks.length})</h2>
          <p className="mt-1 text-sm text-stone-600">Previously missed, then correct on the latest try.</p>
          <PassageList passages={progress.comebacks} empty="No comeback passages yet." />
          <Link to="/challenges" className="mt-4 inline-block font-semibold text-green-800 underline hover:text-green-950">Browse challenges</Link>
        </article>
        <article className={panel}>
          <h2 className="text-xl font-bold text-green-950">Milestones</h2>
          <ul className="mt-4 space-y-3">
            {progress.achievements.map((achievement) => (
              <li key={achievement.id} className="flex items-center justify-between gap-3 rounded-lg bg-amber-50 p-3">
                <div>
                  <p className="font-semibold text-green-950">{achievement.label}</p>
                  <p className="text-xs text-stone-600">{achievement.detail}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-green-900">{achievement.earned ? "Earned" : "Not yet"}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <p className="text-sm text-stone-600">Practice and multiplayer results are stored locally for this browser's active profile or guest. Multiplayer history is retained while its room records remain saved.</p>
    </main>
  );
}
