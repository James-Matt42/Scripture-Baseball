import { createHash, randomBytes } from 'node:crypto';

// Sessions are intentionally process-local until the Database deliverable.
// Keep only a digest of the bearer token in memory, not the token itself.
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

function validToken(token) {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

function digest(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createInMemorySessionStore({ now = Date.now } = {}) {
  const sessionsByDigest = new Map();

  return {
    create(userId) {
      if (typeof userId !== 'string' || !userId) {
        throw new TypeError('A user ID is required to create a session');
      }
      const issuedAt = now();
      for (const [key, session] of sessionsByDigest) {
        if (session.expiresAt <= issuedAt) sessionsByDigest.delete(key);
      }
      const token = randomBytes(TOKEN_BYTES).toString('base64url');
      sessionsByDigest.set(digest(token), {
        userId,
        expiresAt: issuedAt + SESSION_TTL_MS,
      });
      return token;
    },
    lookup(token) {
      if (!validToken(token)) return null;
      const key = digest(token);
      const session = sessionsByDigest.get(key);
      if (!session) return null;
      if (session.expiresAt <= now()) {
        sessionsByDigest.delete(key);
        return null;
      }
      return { ...session };
    },
    revoke(token) {
      return validToken(token) ? sessionsByDigest.delete(digest(token)) : false;
    },
  };
}
