/** Authenticated application-data client. All calls use the server's HttpOnly
 * same-origin session cookie; no user IDs or credentials are sent by callers. */
export class ProgressRequestError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = 'ProgressRequestError';
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, signal, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new ProgressRequestError('The practice service is unavailable.');
  let response;
  try {
    response = await fetchImpl(path, {
      method, credentials: 'same-origin',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ProgressRequestError('Could not contact the practice service. Your local work is still saved.');
  }
  let payload;
  try { payload = await response.json(); } catch {
    throw new ProgressRequestError('The practice service returned an invalid response.', response.status);
  }
  if (!response.ok) throw new ProgressRequestError(
    typeof payload?.error === 'string' ? payload.error : 'The practice request failed.', response.status,
  );
  return payload;
}

export const fetchAccountProgress = (options = {}) => request('/api/account/progress', options);
export const fetchAccountPreferences = (options = {}) => request('/api/account/preferences', options);
export const patchAccountPreferences = (preferences, options = {}) => request('/api/account/preferences', {
  ...options, method: 'PATCH', body: preferences,
});
