import React from 'react';
import { BibleTranslationComparison } from '../translation/BibleTranslationComparison.jsx';
import { useCorpusPractice } from '../play/CorpusPracticeContext.jsx';
import { finalStageSubmission } from '../play/corpusState.js';

const button = 'rounded-lg bg-scripture-green px-5 py-3 font-semibold text-white hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-50';
const secondary = 'rounded-lg border border-green-800 px-5 py-3 font-semibold text-green-900 hover:bg-green-50 disabled:opacity-50';

/** No bundled scripture answers or local grading; every stage goes to Express. */
export function CorpusQuestion({ compact = false }) {
  const { state, pitch, busy, pitchLoading, pitchError, answer, nextPitch, createPitch,
    setDraft, toggleFavorite } = useCorpusPractice();
  const { draft } = state;
  const feedback = pitch?.verseFeedback ?? pitch?.chapterFeedback;
  const completed = pitch?.stage === 'complete' && feedback?.reference;
  const chosenReference = completed ? feedback.reference : null;
  const pendingConfirmation = completed && pitchError && finalStageSubmission(pitch);

  function submit(event, field) {
    event.preventDefault();
    const body = field === 'book' ? { stage: field, bookId: draft.bookId } :
      { stage: field, [field]: Number(draft[field]) };
    void answer(body).catch(() => {});
  }

  if (!pitch) return (
    <div className="rounded-xl bg-amber-50 p-5" role="status">
      {pitchLoading ? <p>Restoring the scripture pitch…</p> : <>
        <p>{pitchError || 'Ready for a scripture pitch.'}</p>
        <button className={`${button} mt-3`} disabled={busy} onClick={() => void createPitch().catch(() => {})}>
          Play ball
        </button>
      </>}
    </div>
  );

  return <div className={compact ? 'space-y-4' : 'space-y-5'}>
    <blockquote className="rounded-xl bg-amber-50 p-5 text-xl leading-relaxed text-stone-800">
      “{pitch.passage}”
    </blockquote>

    {pitchError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-900" role="alert">{pitchError}</p>}

    {pitch.stage === 'book' && <form onSubmit={(event) => submit(event, 'book')} className="space-y-3">
      <fieldset className="grid gap-3">
        <legend className="mb-3 font-semibold text-green-950">1. Choose the book</legend>
        {pitch.choices.map((choice) => (
          <label key={choice.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-200 bg-white p-3 hover:border-green-700">
            <input type="radio" name={`book-${pitch.pitchId}`} checked={draft.bookId === choice.id}
              onChange={() => setDraft({ bookId: choice.id })} disabled={busy}/>
            <span>{choice.label}</span>
          </label>
        ))}
      </fieldset>
      <button className={button} disabled={!draft.bookId || busy}>Submit book</button>
    </form>}

    {pitch.stage === 'chapter' && <div className="space-y-3">
      {pitch.bookFeedback ? <p className="rounded-lg bg-amber-50 p-3" role="status">
        Book: <strong>{pitch.bookFeedback.bookCorrect ? 'Correct!' : `Not quite — ${pitch.bookFeedback.correctBookLabel}`}</strong>
      </p> : <p className="text-sm text-stone-600">Book provided by your selected practice scope; chapter is the first graded stage.</p>}
      <form onSubmit={(event) => submit(event, 'chapter')} className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 font-semibold text-green-950">
          Which chapter?
          <input type="number" min="1" max="9999" required step="1" inputMode="numeric"
            className="w-32 rounded-lg border border-stone-300 p-3 text-stone-950"
            value={draft.chapter} onChange={(event) => setDraft({ chapter: event.target.value })} disabled={busy}/>
        </label>
        <button className={button} disabled={!/^[1-9]\d{0,3}$/.test(draft.chapter) || busy}>Submit chapter</button>
      </form>
    </div>}

    {pitch.stage === 'verse' && <div className="space-y-3">
      <p className="rounded-lg bg-amber-50 p-3" role="status">
        Chapter: <strong>{pitch.chapterFeedback?.chapterCorrect ? 'Correct!' :
          `Not quite — chapter ${pitch.chapterFeedback?.correctChapter}`}</strong>
      </p>
      <form onSubmit={(event) => submit(event, 'verse')} className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 font-semibold text-green-950">
          Which exact verse?
          <input type="number" min="1" max="9999" required step="1" inputMode="numeric"
            className="w-32 rounded-lg border border-stone-300 p-3 text-stone-950"
            value={draft.verse} onChange={(event) => setDraft({ verse: event.target.value })} disabled={busy}/>
        </label>
        <button className={button} disabled={!/^[1-9]\d{0,3}$/.test(draft.verse) || busy}>Submit verse</button>
      </form>
    </div>}

    {completed && <section className="space-y-4" aria-label="Answer feedback" aria-live="polite">
      <h3 className="text-xl font-bold text-green-950">Correct reference: {feedback.correctReference}</h3>
      <dl className="grid gap-3 sm:grid-cols-3">
        {typeof feedback.answers.bookCorrect === 'boolean' && <div className="rounded-lg bg-amber-50 p-3">
          <dt className="font-semibold">Book</dt>
          <dd>{feedback.answers.bookCorrect ? 'Correct' : 'Incorrect'}</dd>
        </div>}
        <div className="rounded-lg bg-amber-50 p-3">
          <dt className="font-semibold">Chapter</dt>
          <dd>{feedback.answers.chapterCorrect ? 'Correct' : 'Incorrect'}</dd>
        </div>
        {typeof feedback.answers.verseCorrect === 'boolean' && <div className="rounded-lg bg-amber-50 p-3">
          <dt className="font-semibold">Verse</dt>
          <dd>{feedback.answers.verseCorrect ? 'Correct' : 'Incorrect'}</dd>
        </div>}
      </dl>
      <div className="flex flex-wrap gap-3">
        <button className={secondary} type="button" aria-pressed={state.favorites.includes(chosenReference)}
          onClick={() => toggleFavorite(chosenReference)}>
          {state.favorites.includes(chosenReference) ? '★ Saved to favorites' : '☆ Save passage'}
        </button>
        {pendingConfirmation && <button className={secondary} type="button" disabled={busy || pitchLoading}
          onClick={() => void answer(pendingConfirmation).catch(() => {})}>Retry saving pitch</button>}
        <button className={button} type="button" disabled={busy || pitchLoading || !!pendingConfirmation}
          onClick={() => void nextPitch().catch(() => {})}>Next pitch</button>
      </div>
      <BibleTranslationComparison reference={feedback.correctReference}/>
    </section>}
  </div>;
}
