/** Requests for server-owned SQLite-backed pitches. No client answer keys. */
export class PracticeRequestError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = 'PracticeRequestError';
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, signal, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new PracticeRequestError('Practice service unavailable');
  let response;
  try {
    response = await fetchImpl(path, {
      method, credentials: 'same-origin',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new PracticeRequestError('Unable to reach the practice service. Check your connection.');
  }
  let payload;
  try { payload = await response.json(); }
  catch { throw new PracticeRequestError('The practice service returned an invalid response.', response.status); }
  if (!response.ok) throw new PracticeRequestError(payload?.error || 'Practice request failed', response.status);
  return payload;
}

export const fetchPracticeCatalog = (options = {}) => request('/api/practice/catalog', options);
export const createPracticePitch = (settings, options = {}) =>
  request('/api/practice/pitches', { ...options, method: 'POST', body: settings });
export const fetchPracticePitch = (id, options = {}) =>
  request(`/api/practice/pitches/${encodeURIComponent(id)}`, options);
export const answerPracticeStage = (id, answer, options = {}) =>
  request(`/api/practice/pitches/${encodeURIComponent(id)}/answers`, {
    ...options, method: 'POST', body: answer,
  });
export const claimGuestPitch = (id, options = {}) =>
  request(`/api/practice/pitches/${encodeURIComponent(id)}/claim`, { ...options, method: 'POST', body: {} });
export const fetchPracticeFavorites = (options = {}) => request('/api/practice/favorites', options);
export const putPracticeFavorites = (favorites, options = {}) =>
  request('/api/practice/favorites', { ...options, method: 'PUT', body: { favorites } });
