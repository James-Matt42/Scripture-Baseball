/**
 * Browser-facing API client. Use same-origin paths so Vite can proxy /api in
 * development and Express can serve both UI and API after deployment.
 * Never silently fall back to browser-held answer keys when the API fails.
 */
export class ScriptureRequestError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = 'ScriptureRequestError';
    this.status = status;
  }
}

async function requestJson(path, { method = 'GET', body, signal, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new ScriptureRequestError('The browser cannot connect to the scripture service.');
  }

  let response;
  try {
    response = await fetchImpl(path, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ScriptureRequestError('Unable to reach the scripture service. Check your connection and try again.');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ScriptureRequestError(
      response.ok ? 'The scripture service returned an invalid response.' : 'The scripture service is temporarily unavailable.',
      response.status,
    );
  }

  if (!response.ok) {
    throw new ScriptureRequestError(
      typeof payload?.error === 'string' ? payload.error : 'The scripture request failed.',
      response.status,
    );
  }
  return payload;
}

function queryString(filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '' && value !== undefined && value !== null) params.set(key, value);
  }
  const result = params.toString();
  return result ? `?${result}` : '';
}

export function fetchScriptureBooks(options = {}) {
  return requestJson('/api/scripture/books', options);
}

export function fetchChallenges(filters = {}, options = {}) {
  return requestJson(`/api/challenges${queryString(filters)}`, options);
}

export function fetchChallengeQuestions(id, filters = {}, options = {}) {
  return requestJson(`/api/challenges/${encodeURIComponent(id)}/questions${queryString(filters)}`, options);
}

export function fetchScriptureQuestion(id, options = {}) {
  return requestJson(`/api/scripture/questions/${encodeURIComponent(id)}`, options);
}

export function checkScriptureAnswer(id, answer, options = {}) {
  return requestJson(`/api/scripture/questions/${encodeURIComponent(id)}/answer`, {
    ...options,
    method: 'POST',
    body: answer,
  });
}

/** Keep only fields the local practice reducer expects. Server verification is
 * the source of the correctness flags shown by the UI. The current local store
 * will migrate to authenticated attempts in the subsequent service commits.
 */
export function toPracticeAttempt(answer) {
  return {
    questionId: answer.questionId,
    bookId: answer.bookId,
    chapter: answer.chapter,
    ...(answer.verse === undefined ? {} : { verse: answer.verse }),
    bookCorrect: answer.bookCorrect,
    chapterCorrect: answer.chapterCorrect,
    ...(answer.verseCorrect === undefined ? {} : { verseCorrect: answer.verseCorrect }),
  };
}

/** Recheck only the stages already committed before a local draft was saved. */
export function restoredStageRequest(stage, { bookId, chapter, verse, exactVerse }) {
  if (stage === 'chapter') return { stage: 'book', bookId };
  if (stage === 'verse') return { stage: 'chapter', bookId, chapter, exactVerse: true };
  if (stage === 'feedback' && exactVerse) return { stage: 'verse', bookId, chapter, verse };
  if (stage === 'feedback') return { stage: 'chapter', bookId, chapter, exactVerse: false };
  return null;
}
