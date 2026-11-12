import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCorpusPractice } from '../play/CorpusPracticeContext.jsx';

/** DB-09 stops offering invented topical sets. DB-10 adds corpus-backed
 * personal collections and richer browsing filters. */
export function Challenges() {
  const navigate = useNavigate();
  const { catalog, catalogError, retryCatalog, setScope } = useCorpusPractice();
  const volumes = catalog?.volumes ?? [];
  function start(scope) {
    setScope(scope);
    navigate('/play');
  }
  return <main className="mx-auto w-full max-w-[1100px] space-y-6 px-4 py-7 sm:px-6">
    <header className="rounded-xl bg-white p-6 shadow-sm">
      <h1 className="text-3xl font-bold text-green-950">Practice collections</h1>
      <p className="mt-2 text-stone-700">Choose real books and volumes from the English Standard Works, not example question sets.</p>
    </header>
    {catalogError && <div role="alert" className="rounded-lg bg-red-50 p-4">
      {catalogError} <button type="button" className="underline" onClick={retryCatalog}>Retry</button>
    </div>}
    <button className="rounded-lg bg-scripture-green px-5 py-3 font-semibold text-white" onClick={() => start({})}>
      Mixed Standard Works
    </button>
    {volumes.map((volume) => <section key={volume.id} className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-green-950">{volume.name}</h2>
        <button className="rounded-lg bg-scripture-green px-4 py-2 font-semibold text-white"
          onClick={() => start({ volume: volume.id })}>Practice volume</button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {volume.books.map((book) => <button key={book.id}
          className="rounded-lg border border-green-900/20 px-3 py-2 text-sm font-semibold text-green-900 hover:bg-green-50"
          onClick={() => start({ volume: volume.id, book: book.id })}>{book.name}</button>)}
      </div>
    </section>)}
    {!catalog && !catalogError && <p role="status">Loading available scripture books…</p>}
  </main>;
}
