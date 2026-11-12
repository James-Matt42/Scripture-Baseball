import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCorpusPractice } from '../play/CorpusPracticeContext.jsx';
import { useAccount } from '../account/AccountContext.jsx';

const button = 'rounded-lg bg-scripture-green px-4 py-2 font-semibold text-white hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-50';

/** A collection is a selection rule over the actual SQLite corpus, not a curated question list. */
export function Challenges() {
  const navigate = useNavigate();
  const { activeProfile } = useAccount();
  const { catalog, catalogError, retryCatalog, selectPractice, recordedAttempts, state, syncStatus } = useCorpusPractice();
  const volumes = catalog?.volumes ?? [];
  const misses = recordedAttempts.filter((item) => item.bookCorrect === false ||
    item.chapterCorrect === false || item.verseCorrect === false);
  const weakBooks = new Set(misses.map((item) => item.reference?.split(':').slice(0, 2).join(':')).filter(Boolean));
  const favorites = state.favorites.length;
  const showAccountHistory = !!activeProfile && syncStatus === 'syncing';

  function start(scope, collection = 'all') {
    selectPractice(scope, collection);
    navigate('/play');
  }

  const personal = [
    { id: 'misses', count: new Set(misses.map((item) => item.reference)).size,
      description: 'Revisit passages you previously missed.' },
    { id: 'favorites', count: favorites, description: 'Practice saved passages.' },
    { id: 'weak-areas', count: weakBooks.size, description: 'Find new passages in the books giving you trouble.' },
  ];
  return <main className="mx-auto w-full max-w-[1100px] space-y-6 px-4 py-7 sm:px-6">
    <header className="rounded-xl bg-white p-6 shadow-sm">
      <h1 className="text-3xl font-bold text-green-950">Scripture practice collections</h1>
      <p className="mt-2 text-stone-700">Every pitch is selected from the English Standard Works. No sample decks or unverified topical labels.</p>
    </header>
    {catalogError && <div role="alert" className="rounded-lg bg-red-50 p-4">
      {catalogError} <button type="button" className="underline" onClick={retryCatalog}>Retry</button>
    </div>}
    <section className="rounded-xl border border-stone-200 bg-white p-5" aria-label="All scripture">
      <h2 className="text-xl font-bold text-green-950">Quick play</h2>
      <p className="mt-1 text-stone-700">Mix eligible passages from every Standard Work.</p>
      <button className={`${button} mt-3`} onClick={() => start({}, 'all')}>Play all volumes</button>
    </section>
    <section className="space-y-3" aria-label="Personal collections">
      <h2 className="text-xl font-bold text-green-950">Your collections</h2>
      {showAccountHistory && <p role="status">Loading your saved account history…</p>}
      <div className="grid gap-3 md:grid-cols-3">
        {personal.map((item) => <article key={item.id} className="rounded-xl border border-stone-200 bg-white p-5">
          <h3 className="font-bold text-green-950">{catalog?.collections?.find((entry) => entry.id === item.id)?.title ?? item.id}</h3>
          <p className="mt-1 text-sm text-stone-700">{item.description}</p>
          <p className="mt-2 text-sm text-stone-600">{item.count} {item.id === 'weak-areas' ? 'books with misses' : item.id === 'misses' ? 'missed passages' : 'saved passages'}</p>
          <button className={`${button} mt-3`} disabled={showAccountHistory || item.count === 0}
            onClick={() => start({}, item.id)}>Practice collection</button>
          {!item.count && !showAccountHistory && <p className="mt-2 text-xs text-stone-600">
            {item.id === 'favorites' ? 'Save a passage after answering to build this collection.' :
              'Play some pitches to build this collection.'}</p>}
        </article>)}
      </div>
    </section>
    <section className="space-y-3" aria-label="Browse by scripture volume">
      <h2 className="text-xl font-bold text-green-950">Browse the Standard Works</h2>
      {volumes.map((volume) => <article key={volume.id} className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-bold text-green-950">{volume.name}</h3>
          <button className={button} onClick={() => start({ volume: volume.id }, 'all')}>Practice volume</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {volume.books.map((book) => <button key={book.id}
            className="rounded-lg border border-green-900/20 px-3 py-2 text-sm font-semibold text-green-900 hover:bg-green-50"
            onClick={() => start({ volume: volume.id, book: book.id }, 'all')}>{book.name}</button>)}
        </div>
      </article>)}
      {!catalog && !catalogError && <p role="status">Loading the scripture catalog…</p>}
    </section>
  </main>;
}
