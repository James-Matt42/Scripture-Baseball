import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CorpusQuestion } from '../components/CorpusQuestion.jsx';
import { useCorpusPractice } from '../play/CorpusPracticeContext.jsx';

export function Home() {
  const { state, pitch, busy, pitchLoading, createPitch, recordedAttempts, isSaved } = useCorpusPractice();

  useEffect(() => {
    if (!state.pitchId && !state.paused && !busy && !pitchLoading) {
      void createPitch().catch(() => {});
    }
    // First render starts real practice; failed requests show a retry button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pitchId, state.paused]);

  return <main className="mx-auto w-full max-w-[1100px] space-y-8 px-4 py-7 sm:px-6">
    <section className="rounded-xl bg-parchment p-6 md:p-8">
      <h1 className="text-4xl font-bold leading-tight text-green-950">How well can you locate scripture passages?</h1>
      <p className="mt-3 text-lg text-stone-700">Try a real pitch before creating an account. Book, then chapter, with optional exact verse.</p>
    </section>
    <section className="rounded-xl border border-amber-200 bg-white p-6 shadow-md">
      <h2 className="mb-4 text-2xl font-bold text-green-950">Try a pitch</h2>
      {state.paused ? <div>
        <p>Solo practice is paused.</p>
        <Link className="mt-3 inline-block font-semibold underline" to="/play">Continue practice</Link>
      </div> : <CorpusQuestion compact/>}
      <div className="mt-5 flex flex-wrap gap-4 text-sm">
        <Link to="/play" className="font-semibold text-green-800 underline">Practice by volume or book</Link>
        <Link to="/account" className="font-semibold text-green-800 underline">Save progress to an account</Link>
      </div>
    </section>
    {recordedAttempts.length > 0 && <section className="rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="text-lg font-bold text-green-950">Practice so far</h2>
      <p className="mt-2">{recordedAttempts.length} real pitches completed.</p>
      {isSaved === false && <p role="alert">Browser storage is unavailable; guest progress may not survive refresh.</p>}
    </section>}
    <section className="rounded-xl bg-green-900 p-6 text-white">
      <h2 className="text-xl font-semibold">Find your next scripture challenge</h2>
      <p className="my-3">Choose a book, a volume, or practice passages from your saved progress.</p>
      <Link to="/challenges" className="inline-block rounded-lg bg-scripture-green px-5 py-3 font-bold text-white">Browse practice collections</Link>
    </section>
    <section className="rounded-xl bg-white p-6">
      <h2 className="text-xl font-semibold text-green-950">Learn with real scripture</h2>
      <p className="mt-2 text-stone-700">Every Locate pitch comes from the English scripture corpus and is checked by the Scripture Baseball service. Your answers are graded independently at each stage.</p>
    </section>
  </main>;
}
