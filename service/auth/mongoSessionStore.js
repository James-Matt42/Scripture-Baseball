import {
  SESSION_TTL_MS,
  createSessionToken,
  isValidSessionToken,
  sessionTokenDigest,
} from './sessionStore.js';

/**
 * MongoDB implementation of the sessionStore contract.
 *
 * The cookie contains a random bearer token, but MongoDB stores only its
 * SHA-256 digest. DB-01 creates a unique tokenDigest index and an expiresAt
 * TTL index. Because MongoDB TTL deletion is asynchronous, every lookup also
 * checks expiration before granting access.
 */
export function createMongoSessionStore(database, { now = Date.now } = {}) {
  const sessions = database.collection('sessions');

  return {
    async create(userId) {
      if (typeof userId !== 'string' || !userId) {
        throw new TypeError('A user ID is required to create a session');
      }
      const token = createSessionToken();
      await sessions.insertOne({
        tokenDigest: sessionTokenDigest(token),
        userId,
        // MongoDB's TTL monitor requires a BSON Date, not an epoch number.
        expiresAt: new Date(now() + SESSION_TTL_MS),
      });
      return token;
    },

    async lookup(token) {
      if (!isValidSessionToken(token)) return null;
      const record = await sessions.findOne({
        tokenDigest: sessionTokenDigest(token),
        expiresAt: { $gt: new Date(now()) },
      }, { projection: { _id: 0, userId: 1, expiresAt: 1 } });
      return record ? { userId: record.userId, expiresAt: record.expiresAt.getTime() } : null;
    },

    async revoke(token) {
      if (!isValidSessionToken(token)) return false;
      const result = await sessions.deleteOne({ tokenDigest: sessionTokenDigest(token) });
      return result.deletedCount > 0;
    },
  };
}
