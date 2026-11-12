import React from 'react';
import { Link } from 'react-router-dom';
import { useAccount } from '../account/AccountContext.jsx';
import { useCorpusPractice } from '../play/CorpusPracticeContext.jsx';
import { corpusPracticeStats } from '../play/corpusState.js';

export function Progress() {
  const { activeProfile } = useAccount();
  const { recordedAttempts, catalog, syncStatus, syncError, retrySync } = useCorpusPractice();
  const total = corpusPracticeStats(recordedAttempts);
  const volumes = catalog?.volumes ?? [];
  const recent = recordedAttempts.slice(-10).reverse();
  return <main className="mx-auto w-full max-w-[1100px] space-y-6 px-4 py-7 sm:px-6">
    <header className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
      <h1 className="text-3xl font-bold text-green-950">Your scripture progress</h1>
      <p className="mt-2 text-stone-700">{activeProfile
        ? 'Verified practice records from your account and this device.'
        : 'Guest practice saved on this device. Sign in to keep your verified results across devices.'}</p>
      <Link to="/play" className="mt-3 inline-block font-semibold text-green-800 underline">Practice now</Link>
    </header>
    {syncStatus === 'syncing' && <p role="status">Loading verified account history…</p>}
    {syncStatus === 'error' && <p role="alert">Could not sync account history: {syncError}{' '}
      <button className="font-semibold underline" onClick={retrySync}>Retry</button></p>}
    <section className="grid gap-3 sm:grid-cols-3" aria-label="Practice accuracy">
      {[
        ['Pitches', String(total.count)],
        ['Books', `${total.bookCorrect} / ${total.bookAttempts}`],
        ['Chapters', `${total.chapterCorrect} / ${total.count}`],
        ...(total.verseAttempts ? [['Verses', `${total.verseCorrect} / ${total.verseAttempts}`]] : []),
      ].map(([name, count]) => <div key={name} className="rounded-xl bg-amber-50 p-5">
        <h2 className="text-sm font-bold text-green-900">{name}</h2>
        <p className="mt-2 text-2xl font-bold text-green-950">{count}</p>
      </div>)}
    </section>
    <section className="rounded-xl border border-stone-200 bg-white p-6">
      <h2 className="text-xl font-bold text-green-950">By Standard Work</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {volumes.map((volume) => {
          const attempts = recordedAttempts.filter((item) => item.volume === volume.id);
          const stats = corpusPracticeStats(attempts);
          return <div key={volume.id} className="rounded-lg bg-stone-50 p-4">
            <h3 className="font-semibold text-green-950">{volume.name}</h3>
            <p className="mt-1 text-sm">{stats.count} pitches · {stats.chapterCorrect} chapters correct
              {stats.bookAttempts > 0 && <> · {stats.bookCorrect} books correct</>}</p>
          </div>;
        })}
      </div>
    </section>
    <section className="rounded-xl border border-stone-200 bg-white p-6">
      <h2 className="text-xl font-bold text-green-950">Recent passages</h2>
      {!recent.length ? <p className="mt-2 text-stone-600">No completed scripture pitches yet.</p> :
        <ul className="mt-3 space-y-2">
          {recent.map((item) => <li key={item.id} className="flex flex-wrap justify-between gap-2 border-b border-stone-100 pb-2">
            <span>{item.correctReference ?? item.reference}</span>
            <span className="text-sm text-stone-600">{item.chapterCorrect ? 'Chapter correct' : 'Review chapter'}
              {item.verseCorrect === false && ' · Review verse'}</span>
          </li>)}
        </ul>}
    </section>
  </main>;
}
