import React, { useEffect, useRef, useState } from 'react';
import {
  BIBLE_API_HOME,
  COMPARISON_TRANSLATION,
  eligibleBibleReference,
  fetchBibleComparison,
} from './bibleApi.js';

const actionClass = 'mt-3 cursor-pointer rounded-lg border border-green-800 bg-white px-4 py-2 text-sm font-semibold text-green-900 transition hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300 disabled:cursor-not-allowed disabled:opacity-50';

/** Deliberately opt-in: no third-party request until a player asks to compare. */
export function BibleTranslationComparison({ reference }) {
  const eligibleReference = eligibleBibleReference(reference);
  const [state, setState] = useState({ status: 'idle', result: null, error: '' });
  const activeRequest = useRef(null);

  useEffect(() => {
    setState({ status: 'idle', result: null, error: '' });
    return () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [eligibleReference]);

  if (!eligibleReference) return null;

  async function loadComparison() {
    if (state.status === 'loading') return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setState({ status: 'loading', result: null, error: '' });
    try {
      const result = await fetchBibleComparison(eligibleReference, { signal: controller.signal });
      if (!controller.signal.aborted) setState({ status: 'success', result, error: '' });
    } catch (error) {
      if (!controller.signal.aborted) {
        setState({ status: 'error', result: null, error: error?.message || 'Translation comparison is unavailable.' });
      }
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }

  return (
    <aside className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4" aria-label="Optional Bible translation comparison">
      <h4 className="font-semibold text-green-950">Compare Bible translations</h4>
      <p className="mt-1 text-sm text-stone-700">
        Read {eligibleReference} in the {COMPARISON_TRANSLATION}. This is optional and does not affect your score.
      </p>
      {state.status === 'idle' && (
        <button className={actionClass} type="button" onClick={loadComparison}>
          Show alternate translation
        </button>
      )}
      {state.status === 'loading' && <p className="mt-3 text-sm text-stone-600" role="status">Loading alternate translation…</p>}
      {state.status === 'error' && (
        <div className="mt-3 text-sm text-stone-700" role="alert">
          <p>{state.error}</p>
          <button className={actionClass} type="button" onClick={loadComparison}>Retry translation</button>
        </div>
      )}
      {state.status === 'success' && state.result && (
        <div className="mt-3">
          <blockquote className="whitespace-pre-line rounded-lg bg-white p-4 leading-relaxed text-stone-800">
            {state.result.text}
          </blockquote>
          <p className="mt-2 text-xs text-stone-600">
            {state.result.translation} · Retrieved from{' '}
            <a className="font-semibold text-green-800 underline hover:text-green-950" href={BIBLE_API_HOME} target="_blank" rel="noopener noreferrer">Bible API</a>.
            {' '}Supplemental reading, not the source used to grade answers.
          </p>
        </div>
      )}
    </aside>
  );
}
