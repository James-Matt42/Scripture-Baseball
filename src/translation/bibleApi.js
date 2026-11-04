/**
 * Optional, browser-only Bible translation enrichment. The scripture service
 * remains authoritative for questions, grading, and learning progress.
 * bible-api.com supports direct cross-origin GET requests without credentials.
 */
import { SCRIPTURE_BOOKS } from '../scripture/questions.js';

export const BIBLE_API_HOME = 'https://bible-api.com/';
export const COMPARISON_TRANSLATION = 'World English Bible (WEB)';

// Identify eligible references only from the already-revealed answer. Never
// infer a reference from an unanswered question ID or its multiple choices.
const bibleBookLabels = new Set(SCRIPTURE_BOOKS
  .filter(({ volume }) => volume === 'old-testament' || volume === 'new-testament')
  .map(({ label }) => label));

export function eligibleBibleReference(reference) {
  if (typeof reference !== 'string') return null;
  const match = /^(.+?)\s+([1-9]\d{0,2}):([1-9]\d{0,2})(?:-([1-9]\d{0,2}))?$/.exec(reference.trim());
  if (!match || !bibleBookLabels.has(match[1])) return null;
  const [, book, chapter, firstVerse, lastVerse] = match;
  if (lastVerse && Number(lastVerse) < Number(firstVerse)) return null;
  return `${book} ${Number(chapter)}:${Number(firstVerse)}${lastVerse ? `-${Number(lastVerse)}` : ''}`;
}

export function bibleApiUrl(reference) {
  const eligible = eligibleBibleReference(reference);
  return eligible ? `${BIBLE_API_HOME}${encodeURIComponent(eligible)}?translation=web` : null;
}

export class BibleComparisonError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BibleComparisonError';
  }
}

/** Fetch *only* a publicly revealed Bible reference, never account/user data. */
export async function fetchBibleComparison(reference, { signal, fetchImpl = globalThis.fetch } = {}) {
  const url = bibleApiUrl(reference);
  if (!url) throw new BibleComparisonError('Translation comparison is available for Bible passages only.');
  if (typeof fetchImpl !== 'function') throw new BibleComparisonError('Your browser cannot retrieve Bible translations.');

  let response;
  try {
    response = await fetchImpl(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new BibleComparisonError('Could not reach Bible API. Check your connection and try again.');
  }

  if (!response?.ok) {
    if (response?.status === 404) throw new BibleComparisonError('No alternate translation was found for this passage.');
    if (response?.status === 429) throw new BibleComparisonError('Bible API is receiving too many requests. Try again later.');
    throw new BibleComparisonError('Bible API is temporarily unavailable. Your game is unaffected.');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new BibleComparisonError('Bible API returned an unreadable response.');
  }
  const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
  if (!text || (payload.translation_id !== undefined &&
      (typeof payload.translation_id !== 'string' || payload.translation_id.toLowerCase() !== 'web'))) {
    throw new BibleComparisonError('Bible API did not return a World English Bible passage.');
  }
  return { reference: eligibleBibleReference(reference), text, translation: COMPARISON_TRANSLATION, sourceUrl: BIBLE_API_HOME };
}
