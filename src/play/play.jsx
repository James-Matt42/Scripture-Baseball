import React, { useEffect } from 'react';
import { CorpusQuestion } from '../components/CorpusQuestion.jsx';
import { useCorpusPractice } from './CorpusPracticeContext.jsx';

export function Play() {
  const {
    state, pitch, catalog, catalogError, retryCatalog, busy, pitchLoading,
    stats, isSaved, syncStatus, syncError, retrySync, createPitch,
    setScope, setCollection, setExactVerse, finishInning, keepPlaying,
  } = useCorpusPractice();

  useEffect(() => {
    if (!state.pitchId && !state.paused && !busy && !pitchLoading) {
      void createPitch().catch(() => {});
    }
    // Start once for the current scope; errors require explicit retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.scope.volume, state.scope.book, state.collection, state.exactVerse, state.paused]);

  const volumes = catalog?.volumes ?? [];
  const volume = volumes.find((item) => item.id === state.scope.volume);

  return <main className="mx-auto w-full max-w-[1100px] space-y-6 px-4 py-7 sm:px-6">
    <header className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
      <h1 className="text-3xl font-bold text-green-950">Locate scripture</h1>
      <p className="mt-2 text-stone-700">Real passages from the English Standard Works. Practice a pitch at a time and finish whenever you wish.</p>
      <p className="mt-2 text-sm font-semibold text-green-900">Inning {state.inning}</p>
    </header>

    <section className="rounded-xl border border-stone-200 bg-white p-5" aria-label="Practice settings">
      <h2 className="mb-3 text-lg font-bold text-green-950">Choose your practice scope</h2>
      {catalogError && <div role="alert" className="mb-3 text-red-800">
        {catalogError} <button type="button" className="underline" onClick={retryCatalog}>Retry</button>
      </div>}
      <div className="grid gap-4 sm:grid-cols-4">
        <label className="grid gap-1 font-medium text-green-950">
          Standard Work
          <select className="rounded-lg border border-stone-300 p-3" disabled={busy} value={state.scope.volume ?? ''}
            onChange={(event) => setScope({ volume: event.target.value || null })}>
            <option value="">All Standard Works</option>
            {volumes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 font-medium text-green-950">
          Book
          <select className="rounded-lg border border-stone-300 p-3" value={state.scope.book ?? ''}
            disabled={!volume || busy} onChange={(event) => setScope({ volume: state.scope.volume, book: event.target.value || null })}>
            <option value="">All books in scope</option>
            {(volume?.books ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 font-medium text-green-950">
          Collection
          <select className="rounded-lg border border-stone-300 p-3" disabled={busy} value={state.collection}
            onChange={(event) => setCollection(event.target.value)}>
            {(catalog?.collections ?? [{ id: 'all', title: 'Mixed practice' }]).map((item) =>
              <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-3 font-medium text-green-950">
          <input type="checkbox" checked={state.exactVerse} disabled={busy}
            onChange={(event) => setExactVerse(event.target.checked)}/>
          Identify exact verse too
        </label>
      </div>
      <p className="mt-3 text-sm text-stone-600">
        Personal collections use saved account history or this device's guest history. Empty selections display a clear message rather than changing modes.{' '}
        Selecting one book makes book identification unnecessary; chapter remains graded.
        Changing the scope starts a fresh inning.
      </p>
    </section>

    <section className="rounded-xl border border-green-900/20 bg-green-50 p-5" aria-label="Inning score" aria-live="polite">
      <h2 className="text-lg font-bold text-green-950">Score: {stats.earnedPoints} / {stats.possiblePoints} earned points</h2>
      <p className="mt-1 text-sm text-green-950">{stats.count} completed pitches · {stats.bookCorrect}/{stats.bookAttempts} books · {stats.chapterCorrect}/{stats.count} chapters
        {stats.verseAttempts > 0 && <> · {stats.verseCorrect}/{stats.verseAttempts} verses</>}</p>
      {isSaved === false && <p role="alert" className="mt-2 text-sm">Local browser storage unavailable; leaving the page may lose guest progress.</p>}
      {syncStatus === 'syncing' && <p className="mt-2 text-sm">Syncing your account history…</p>}
      {syncStatus === 'error' && <p className="mt-2 text-sm text-red-900" role="alert">
        Account sync needs attention: {syncError} <button type="button" className="underline" onClick={retrySync}>Retry</button>
      </p>}
    </section>

    {state.paused ? <section className="rounded-xl border border-amber-200 bg-white p-6">
      <h2 className="text-xl font-bold text-green-950">Inning paused</h2>
      <p className="my-3">Your completed pitches are saved. Resume when you're ready.</p>
      <button className="rounded-lg bg-scripture-green px-5 py-3 font-bold text-white" onClick={keepPlaying}>Keep playing</button>
    </section> : <section className="rounded-xl border border-amber-200 bg-white p-6 shadow-md">
      <h2 className="mb-4 text-xl font-bold text-green-950">Pitch {stats.count + (pitch?.stage === 'complete' ? 0 : 1)}</h2>
      <CorpusQuestion/>
      <button type="button" className="mt-6 rounded-lg border border-green-800 px-4 py-2 font-semibold text-green-900 hover:bg-green-50" onClick={finishInning}>
        Finish here
      </button>
    </section>}
  </main>;
}
