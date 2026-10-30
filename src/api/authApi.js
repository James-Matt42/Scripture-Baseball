/**
 * Same-origin authentication client. The server owns the session in an
 * HttpOnly cookie; the browser never reads or stores a bearer token.
 */
export class AuthRequestError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = 'AuthRequestError';
    this.status = status;
  }
}

async function authRequest(path, { method = 'GET', body, signal, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new AuthRequestError('Your browser cannot connect to the account service.');
  }

  let response;
  try {
    response = await fetchImpl(path, {
      method,
      credentials: 'same-origin',
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new AuthRequestError('Unable to reach the account service. Check your connection and try again.');
  }

  // Logout intentionally returns HTTP 204 with an empty body.
  if (response.ok && response.status === 204) return null;

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new AuthRequestError(
      response.ok ? 'The account service returned an invalid response.' : 'The account service is temporarily unavailable.',
      response.status,
    );
  }

  if (!response.ok) {
    throw new AuthRequestError(
      typeof payload?.error === 'string' ? payload.error : 'The account request failed.',
      response.status,
    );
  }
  return payload;
}

function requireUser(payload) {
  const user = payload?.user;
  if (!user || typeof user.id !== 'string' || typeof user.email !== 'string' ||
      typeof user.displayName !== 'string') {
    throw new AuthRequestError('The account service returned an invalid user.');
  }
  return user;
}

export async function restoreAccountSession(options = {}) {
  const payload = await authRequest('/api/auth/session', options);
  return payload?.user === null ? null : requireUser(payload);
}

export async function registerAccount(fields, options = {}) {
  return requireUser(await authRequest('/api/auth/register', { ...options, method: 'POST', body: fields }));
}

export async function loginAccount(fields, options = {}) {
  return requireUser(await authRequest('/api/auth/login', { ...options, method: 'POST', body: fields }));
}

export async function logoutAccount(options = {}) {
  return authRequest('/api/auth/logout', { ...options, method: 'POST' });
}
