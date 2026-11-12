/** Versioned, new-corpus-only browser state. No sample IDs or migrations. */
export const CORPUS_GUEST_KEY = 'scripture-baseball.corpus.v1.guest';
export const CORPUS_USER_PREFIX = 'scripture-baseball.corpus.v1.user.';
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/u;
const REFERENCE = /^[a-z]+:[a-z0-9-]+:[1-9]\d{0,3}:[1-9]\d{0,3}$/u;
const MAX_HISTORY = 5000;
const MAX_FAVORITES = 100;

export function corpusKey(userId) {
  return userId ? `${CORPUS_USER_PREFIX}${userId}` : CORPUS_GUEST_KEY;
}

export function initialCorpusState(exactVerse = false) {
  return {
    version: 1, inning: 1, scope: { volume: null, book: null }, exactVerse: !!exactVerse,
    pitchId: null, draft: { bookId: '', chapter: '', verse: '' }, attempts: [], history: [],
    pendingClaims: [], favorites: [], dirtyFavorites: false, paused: false,
  };
}

const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const unique = (values) => [...new Set(values)];
const validReference = (id) => typeof id === 'string' && REFERENCE.test(id);
const validToken = (id) => typeof id === 'string' && TOKEN.test(id);
const isResult = (v) => object(v) && validToken(v.id) && validReference(v.reference) &&
  typeof v.chapterCorrect === 'boolean' && (v.bookCorrect === undefined || typeof v.bookCorrect === 'boolean') &&
  (v.verseCorrect === undefined || typeof v.verseCorrect === 'boolean');

export function normalizeCorpusState(value, defaultExactVerse = false) {
  if (!object(value) || value.version !== 1) return initialCorpusState(defaultExactVerse);
  const base = initialCorpusState(defaultExactVerse);
  const scope = object(value.scope) &&
    (value.scope.volume === null || typeof value.scope.volume === 'string') &&
    (value.scope.book === null || typeof value.scope.book === 'string')
    ? { volume: value.scope.volume ?? null, book: value.scope.book ?? null } : base.scope;
  const history = Array.isArray(value.history) ? value.history.filter(isResult).slice(-MAX_HISTORY) : [];
  const attempts = Array.isArray(value.attempts) ? value.attempts.filter(isResult).slice(-200) : [];
  const draft = object(value.draft) ? {
    bookId: typeof value.draft.bookId === 'string' ? value.draft.bookId : '',
    chapter: typeof value.draft.chapter === 'string' ? value.draft.chapter.slice(0, 4) : '',
    verse: typeof value.draft.verse === 'string' ? value.draft.verse.slice(0, 4) : '',
  } : base.draft;
  return {
    ...base, inning: Number.isSafeInteger(value.inning) && value.inning > 0 ? value.inning : 1,
    scope, exactVerse: value.exactVerse === true,
    pitchId: validToken(value.pitchId) ? value.pitchId : null,
    draft, attempts, history,
    pendingClaims: Array.isArray(value.pendingClaims) ? unique(value.pendingClaims.filter(validToken)).slice(-MAX_HISTORY) : [],
    favorites: Array.isArray(value.favorites) ? unique(value.favorites.filter(validReference)).slice(0, MAX_FAVORITES) : [],
    dirtyFavorites: value.dirtyFavorites === true, paused: value.paused === true,
  };
}

export function loadCorpusState(storage, key, defaultExactVerse = false) {
  try {
    const raw = storage?.getItem(key);
    return raw ? normalizeCorpusState(JSON.parse(raw), defaultExactVerse) : initialCorpusState(defaultExactVerse);
  } catch { return initialCorpusState(defaultExactVerse); }
}

export function saveCorpusState(storage, key, state) {
  try { if (!storage) return false; storage.setItem(key, JSON.stringify(state)); return true; }
  catch { return false; }
}

/** A locally displayed result is never accepted as server-grading evidence. */
export function completedLocalResult(pitch, feedback, answeredAt = new Date().toISOString()) {
  if (feedback?.nextStage !== 'complete' || !validReference(feedback.reference)) {
    throw new TypeError('A completed server response is required');
  }
  return {
    id: pitch.pitchId, reference: feedback.reference,
    volume: feedback.reference.split(':')[0],
    ...(feedback.answers?.bookId !== undefined ? { chosenBook: feedback.answers.bookId,
      bookCorrect: feedback.answers.bookCorrect } : {}),
    chosenChapter: feedback.answers?.chapter,
    chapterCorrect: feedback.answers?.chapterCorrect,
    ...(feedback.answers?.verse !== undefined ? { chosenVerse: feedback.answers.verse,
      verseCorrect: feedback.answers.verseCorrect } : {}),
    correctReference: feedback.correctReference, answeredAt,
  };
}

export function addCompletedPitch(state, result, { guest = false } = {}) {
  if (!isResult(result)) throw new TypeError('Invalid server-graded result');
  if (state.history.some((item) => item.id === result.id)) return state;
  return {
    ...state,
    attempts: [...state.attempts, result].slice(-200),
    history: [...state.history, result].slice(-MAX_HISTORY),
    pendingClaims: guest ? unique([...state.pendingClaims, result.id]) : state.pendingClaims,
  };
}

export function uniqueAttemptHistory(serverAttempts, localHistory) {
  const verified = [...(serverAttempts ?? []), ...(localHistory ?? [])];
  const byId = new Map();
  for (const item of verified) {
    if (!isResult(item)) continue;
    const previous = byId.get(item.id);
    // Prefer the account's durable record to a local history entry.
    if (!previous || item.source === 'verified-pitch') byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) =>
    String(a.answeredAt ?? '').localeCompare(String(b.answeredAt ?? '')));
}

export function corpusPracticeStats(attempts) {
  const count = attempts.length;
  const bookAttempts = attempts.filter((item) => typeof item.bookCorrect === 'boolean').length;
  const bookCorrect = attempts.filter((item) => item.bookCorrect === true).length;
  const chapterCorrect = attempts.filter((item) => item.chapterCorrect === true).length;
  const verseAttempts = attempts.filter((item) => typeof item.verseCorrect === 'boolean').length;
  const verseCorrect = attempts.filter((item) => item.verseCorrect === true).length;
  return { count, bookAttempts, bookCorrect, chapterCorrect, verseAttempts, verseCorrect,
    earnedPoints: bookCorrect + chapterCorrect + verseCorrect,
    possiblePoints: bookAttempts + count + verseAttempts };
}
