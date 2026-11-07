import { createHash, randomBytes } from 'node:crypto';

// Shared token rules for both the test-only in-memory store and MongoDB.
// Keep only a digest of each bearer token in persistent storage.
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export function isValidSessionToken(token) {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

export function sessionTokenDigest(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function createSessionToken() {
  return randomBytes(TOKEN_BYTES).toString('base64url');
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
      const token = createSessionToken();
      sessionsByDigest.set(sessionTokenDigest(token), {
        userId,
        expiresAt: issuedAt + SESSION_TTL_MS,
      });
      return token;
    },
    lookup(token) {
      if (!isValidSessionToken(token)) return null;
      const key = sessionTokenDigest(token);
      const session = sessionsByDigest.get(key);
      if (!session) return null;
      if (session.expiresAt <= now()) {
        sessionsByDigest.delete(key);
        return null;
      }
      return { ...session };
    },
    revoke(token) {
      return isValidSessionToken(token) ? sessionsByDigest.delete(sessionTokenDigest(token)) : false;
    },
  };
}
