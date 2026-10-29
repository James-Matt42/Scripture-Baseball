import { SESSION_TTL_MS } from './sessionStore.js';

export const SESSION_COOKIE_NAME = 'sb_session';

/** Read only our cookie; ambiguous duplicate session cookies are not trusted. */
export function readSessionCookie(cookieHeader) {
  if (typeof cookieHeader !== 'string') return null;
  let found = null;
  let count = 0;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== SESSION_COOKIE_NAME) continue;
    count += 1;
    if (count > 1) return null;
    found = part.slice(separator + 1).trim();
  }
  return found || null;
}

export function sessionCookieOptions({ secure = false, withExpiry = true } = {}) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    ...(withExpiry ? { maxAge: SESSION_TTL_MS } : {}),
  };
}
