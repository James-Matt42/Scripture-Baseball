import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { VOLUME_OPTIONS } from "../account/accountState.js";
import { useAccount } from "../account/AccountContext";
import { usePractice } from "../play/PracticeContext";
import { CHALLENGES, filterChallenges, getChallengeQuestions } from "./catalog.js";

const cardClass = "flex h-full flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:shadow-md";
const actionClass = "inline-flex w-fit items-center rounded-lg bg-scripture-green px-4 py-2 font-semibold text-white hover:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300";

function ChallengeCard({ challenge, attempts, favorites, startChallenge, volume = "" }) {
  const questions = getChallengeQuestions(challenge.id, attempts, favorites, volume);
  const disabled = questions.length === 0;
  return (
    <article className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-lg font-bold text-green-950">{challenge.title}</h3>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-green-900">
          {questions.length} {questions.length === 1 ? "pitch" : "pitches"}
        </span>
      </div>
      <p className="flex-1 leading-6 text-stone-700">{challenge.description}</p>
      <p className="text-sm capitalize text-stone-600">{challenge.difficulty} difficulty</p>
      {disabled ? (
        <p className="text-sm font-medium text-stone-600" role="status">
          {challenge.id === "my-favorites" ? "Bookmark a passage while playing to build this set."
            : challenge.id === "my-misses" || challenge.id === "weak-areas"
              ? "Practice a few pitches first to unlock this set."
              : "No passages available for this selection."}
        </p>
      ) : (
        <Link className={actionClass} to="/play" onClick={() => startChallenge(challenge.id, questions)}>
          Start challenge
        </Link>
      )}
    </article>
  );
}

export function Challenges() {
  const { preferences } = useAccount();
  const { recordedAttempts, favorites, startChallenge } = usePractice();
  const [filters, setFilters] = useState(() => ({
    volume: preferences.preferredVolume || "", category: "", difficulty: "",
  }));
  const matches = useMemo(
    () => filterChallenges(filters, recordedAttempts, favorites),
    [filters, recordedAttempts, favorites],
  );
  const groups = [
    { id: "recommended", title: "Recommended", challenges: CHALLENGES.filter((challenge) => challenge.section === "recommended") },
    { id: "personal", title: "Your challenges", challenges: CHALLENGES.filter((challenge) => challenge.section === "personal") },
  ];

  return (
    <main className="mx-auto w-full max-w-[1200px] space-y-8 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
      <header className="rounded-xl bg-white p-6 shadow-md">
        <h1 className="text-3xl font-bold text-green-950">Challenges</h1>
        <p className="mt-2 text-stone-700">Pick a set and practice it one pitch at a time.</p>
        <p className="mt-1 text-sm text-stone-500">Local starter collection — more passages can be added later.</p>
      </header>

      {groups.map((group) => (
        <section key={group.id} className="space-y-4" aria-labelledby={`${group.id}-heading`}>
          <h2 className="text-2xl font-bold text-green-950" id={`${group.id}-heading`}>{group.title}</h2>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {group.challenges.map((challenge) => (
              <ChallengeCard
                key={challenge.id}
                challenge={challenge}
                attempts={recordedAttempts}
                favorites={favorites}
                startChallenge={startChallenge}
              />
            ))}
          </div>
        </section>
      ))}

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm" aria-labelledby="browse-heading">
        <h2 className="text-2xl font-bold text-green-950" id="browse-heading">Browse challenges</h2>
        <p className="mt-1 text-stone-700">Filters update the available challenges and passages immediately.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <label className="font-semibold text-stone-700" htmlFor="volume-filter">Standard work</label>
            <select id="volume-filter" value={filters.volume} onChange={(event) => setFilters((current) => ({ ...current, volume: event.target.value }))}>
              <option value="">All standard works</option>
              {VOLUME_OPTIONS.filter((option) => option.value).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <label className="font-semibold text-stone-700" htmlFor="category-filter">Category</label>
            <select id="category-filter" value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
              <option value="">All categories</option>
              <option value="volume">Books and volumes</option>
              <option value="doctrinal-mastery">Doctrinal mastery</option>
              <option value="topic">Topics</option>
              <option value="conference">Familiar quotes</option>
              <option value="personal">Personal collections</option>
              <option value="expert">Expert challenges</option>
            </select>
          </div>
          <div className="grid gap-2">
            <label className="font-semibold text-stone-700" htmlFor="difficulty-filter">Difficulty</label>
            <select id="difficulty-filter" value={filters.difficulty} onChange={(event) => setFilters((current) => ({ ...current, difficulty: event.target.value }))}>
              <option value="">Any difficulty</option>
              <option value="beginner">Beginner</option>
              <option value="standard">Standard</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-stone-700" role="status" aria-live="polite">
            {matches.length} {matches.length === 1 ? "challenge" : "challenges"} match
          </p>
          <button className="rounded-lg border border-stone-300 px-4 py-2 font-semibold text-green-900 hover:bg-green-50" type="button" onClick={() => setFilters({ volume: "", category: "", difficulty: "" })}>Clear filters</button>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="catalog-heading">
        <h2 className="text-2xl font-bold text-green-950" id="catalog-heading">Challenge catalog</h2>
        {matches.length ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {matches.map((challenge) => (
              <ChallengeCard
                key={challenge.id}
                challenge={challenge}
                attempts={recordedAttempts}
                favorites={favorites}
                startChallenge={startChallenge}
                volume={filters.volume}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-amber-50 p-5 text-stone-700">No challenges match these filters. Try clearing one.</p>
        )}
      </section>
    </main>
  );
}
