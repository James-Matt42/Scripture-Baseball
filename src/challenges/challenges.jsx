import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchChallengeQuestions, fetchChallenges } from "../api/scriptureApi.js";
import { VOLUME_OPTIONS } from "../account/accountState.js";
import { useAccount } from "../account/AccountContext";
import { usePractice } from "../play/PracticeContext";
import { getChallengeQuestions } from "./catalog.js";

const cardClass = "flex h-full flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:shadow-md";
const actionClass = "inline-flex w-fit items-center rounded-lg bg-scripture-green px-4 py-2 font-semibold text-white hover:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300 disabled:cursor-wait disabled:opacity-50";

function ChallengeCard({ challenge, attempts, favorites, onStart, startingId, volume = "" }) {
  // The authenticated application-data API has not been built yet. Retain the
  // existing device-local personal collections without claiming they are server
  // collections; public challenge metadata and decks come from the API.
  const localQuestions = challenge.personalized
    ? getChallengeQuestions(challenge.id, attempts, favorites, volume) : null;
  const count = challenge.personalized ? localQuestions.length : challenge.questionCount;
  const disabled = count === 0;
  const starting = startingId === challenge.id;
  return (
    <article className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-lg font-bold text-green-950">{challenge.title}</h3>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-green-900">
          {volume && !challenge.personalized ? "Up to " : ""}{count ?? "—"} {count === 1 ? "pitch" : "pitches"}
        </span>
      </div>
      <p className="flex-1 leading-6 text-stone-700">{challenge.description}</p>
      <p className="text-sm capitalize text-stone-600">{challenge.difficulty} difficulty{challenge.personalized ? " · saved on this device" : ""}</p>
      {disabled ? (
        <p className="text-sm font-medium text-stone-600" role="status">
          {challenge.id === "my-favorites" ? "Bookmark a passage while playing to build this set."
            : challenge.id === "my-misses" || challenge.id === "weak-areas"
              ? "Practice a few pitches first to unlock this set."
              : "No passages available for this selection."}
        </p>
      ) : (
        <button className={actionClass} type="button" disabled={!!startingId} onClick={() => onStart(challenge, volume)}>
          {starting ? "Loading pitches…" : "Start challenge"}
        </button>
      )}
    </article>
  );
}

export function Challenges() {
  const navigate = useNavigate();
  const { preferences } = useAccount();
  const { recordedAttempts, favorites, startChallenge } = usePractice();
  const [filters, setFilters] = useState(() => ({
    volume: preferences.preferredVolume || "", category: "", difficulty: "",
  }));
  const [catalog, setCatalog] = useState({ items: [], loading: true, error: "" });
  const [filtered, setFiltered] = useState({ items: [], loading: true, error: "" });
  const [retryKey, setRetryKey] = useState(0);
  const [startingId, setStartingId] = useState("");
  const [startError, setStartError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setCatalog((state) => ({ ...state, loading: true, error: "" }));
    fetchChallenges({}, { signal: controller.signal }).then((items) => {
      if (!controller.signal.aborted) setCatalog({ items, loading: false, error: "" });
    }).catch((error) => {
      if (!controller.signal.aborted) setCatalog({ items: [], loading: false, error: error.message });
    });
    return () => controller.abort();
  }, [retryKey]);

  useEffect(() => {
    const controller = new AbortController();
    setFiltered((state) => ({ ...state, loading: true, error: "" }));
    fetchChallenges(filters, { signal: controller.signal }).then((items) => {
      if (!controller.signal.aborted) setFiltered({ items, loading: false, error: "" });
    }).catch((error) => {
      if (!controller.signal.aborted) setFiltered({ items: [], loading: false, error: error.message });
    });
    return () => controller.abort();
  }, [filters, retryKey]);

  async function launchChallenge(challenge, volume = "") {
    if (startingId) return;
    setStartingId(challenge.id);
    setStartError("");
    try {
      const questions = challenge.personalized
        ? getChallengeQuestions(challenge.id, recordedAttempts, favorites, volume)
        : (await fetchChallengeQuestions(challenge.id, volume ? { volume } : {})).questions;
      if (!questions.length) {
        setStartError("No playable passages are available in that challenge yet.");
        return;
      }
      startChallenge(challenge.id, questions);
      navigate("/play");
    } catch (error) {
      // Never replace a failed public deck fetch with answer-bearing local data.
      setStartError(`Could not start the challenge: ${error.message}`);
    } finally {
      setStartingId("");
    }
  }

  const groups = [
    { id: "recommended", title: "Recommended", challenges: catalog.items.filter((item) => item.section === "recommended") },
    { id: "personal", title: "Your challenges", challenges: catalog.items.filter((item) => item.section === "personal") },
  ];
  const cardProps = { attempts: recordedAttempts, favorites, onStart: launchChallenge, startingId };

  return (
    <main className="mx-auto w-full max-w-[1200px] space-y-8 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
      <header className="rounded-xl bg-white p-6 shadow-md">
        <h1 className="text-3xl font-bold text-green-950">Challenges</h1>
        <p className="mt-2 text-stone-700">Pick a set and practice it one pitch at a time.</p>
        <p className="mt-1 text-sm text-stone-500">Curated starter collection served by Scripture Baseball.</p>
      </header>

      {startError && <p className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900" role="alert">{startError}</p>}
      {catalog.loading && <p role="status">Loading challenge recommendations…</p>}
      {catalog.error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900" role="alert">
          <p>Could not load recommendations: {catalog.error}</p>
          <button type="button" className="mt-2 font-semibold underline" onClick={() => setRetryKey((key) => key + 1)}>Retry</button>
        </div>
      )}
      {!catalog.error && groups.map((group) => (
        <section key={group.id} className="space-y-4" aria-labelledby={`${group.id}-heading`}>
          <h2 className="text-2xl font-bold text-green-950" id={`${group.id}-heading`}>{group.title}</h2>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {group.challenges.map((challenge) => (
              <ChallengeCard key={challenge.id} challenge={challenge} {...cardProps} />
            ))}
          </div>
        </section>
      ))}

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm" aria-labelledby="browse-heading">
        <h2 className="text-2xl font-bold text-green-950" id="browse-heading">Browse challenges</h2>
        <p className="mt-1 text-stone-700">Filters request matching challenges from the service.</p>
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
            {filtered.loading ? "Loading matching challenges…" : `${filtered.items.length} ${filtered.items.length === 1 ? "challenge" : "challenges"} match`}
          </p>
          <button className="rounded-lg border border-stone-300 px-4 py-2 font-semibold text-green-900 hover:bg-green-50" type="button" onClick={() => setFilters({ volume: "", category: "", difficulty: "" })}>Clear filters</button>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="catalog-heading">
        <h2 className="text-2xl font-bold text-green-950" id="catalog-heading">Challenge catalog</h2>
        {filtered.error ? (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900" role="alert">
            <p>Could not load challenges: {filtered.error}</p>
            <button type="button" className="mt-2 font-semibold underline" onClick={() => setRetryKey((key) => key + 1)}>Retry</button>
          </div>
        ) : filtered.loading ? (
          <p role="status">Loading filtered challenge list…</p>
        ) : filtered.items.length ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filtered.items.map((challenge) => (
              <ChallengeCard key={challenge.id} challenge={challenge} {...cardProps} volume={filters.volume} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-amber-50 p-5 text-stone-700">No challenges match these filters. Try clearing one.</p>
        )}
      </section>
    </main>
  );
}
