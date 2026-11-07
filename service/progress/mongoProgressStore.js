import { createHash } from 'node:crypto';
import {
  createInMemoryProgressStore,
  gradeAttempt,
  MAX_ATTEMPTS_PER_USER,
  MAX_IMPORTS_PER_USER,
  sameAttemptAnswers,
  summarizeProgress,
} from './progressStore.js';
import { MAX_FAVORITES, ProgressError } from './validation.js';

const ATTEMPT_FIELDS = { projection: { _id: 0, userId: 0 } };

function conflict() {
  return new ProgressError('An attempt with this ID already has different answers', 409);
}

function ensureSameGuess(existing, attempt) {
  if (!sameAttemptAnswers(existing, attempt)) throw conflict();
}

function importFingerprint(data) {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

/**
 * DB-04 transitional progress store: every graded attempt (including guest
 * attempts) is stored in MongoDB. Favorites, preferences and import receipts
 * intentionally remain process-local until DB-05 migrates those collections.
 *
 * The database's unique (userId, id) index is the final arbiter of concurrent
 * retries. The server grades the validated guess; client flags never get saved.
 */
export function createMongoProgressStore(database, {
  now = Date.now,
  temporaryStore = createInMemoryProgressStore({ now }),
} = {}) {
  const collection = database.collection('attempts');
  const importReceipts = new Map();

  async function findAttempt(userId, id) {
    return collection.findOne({ userId, id }, ATTEMPT_FIELDS);
  }

  async function attempts(userId) {
    return collection.find({ userId }, ATTEMPT_FIELDS)
      .sort({ recordedAt: 1, _id: 1 }).toArray();
  }

  async function recordAttempt(userId, attempt, source = 'server', { batchChecked = false } = {}) {
    const existing = await findAttempt(userId, attempt.id);
    if (existing) {
      ensureSameGuess(existing, attempt);
      return { attempt: existing, created: false };
    }
    if (!batchChecked && await collection.countDocuments({ userId }) >= MAX_ATTEMPTS_PER_USER) {
      throw new ProgressError('Practice history limit reached for this prototype', 409);
    }

    const graded = gradeAttempt(attempt, source, now);
    try {
      await collection.insertOne({ userId, ...graded });
      return { attempt: graded, created: true };
    } catch (error) {
      // A concurrent request may have won the unique (userId, id) race.
      // A matching guess is a replay; changed answers are always a conflict.
      if (error?.code !== 11000) throw error;
      const winner = await findAttempt(userId, attempt.id);
      if (!winner) throw error;
      ensureSameGuess(winner, attempt);
      return { attempt: winner, created: false };
    }
  }

  async function importGuest(userId, data) {
    // The DB-05 migration will persist these receipts and the other guest
    // settings. For now, a restarted import safely replays stored attempts,
    // but its original importedCount/favorites/preferences receipt is not durable.
    let receipts = importReceipts.get(userId);
    if (!receipts) {
      receipts = new Map();
      importReceipts.set(userId, receipts);
    }
    const fingerprint = importFingerprint(data);
    const prior = receipts.get(data.importId);
    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        throw new ProgressError('This importId has already been used with different data', 409);
      }
      return { ...prior.result, replayed: true };
    }
    if (receipts.size >= MAX_IMPORTS_PER_USER) {
      throw new ProgressError('Guest import limit reached for this prototype', 409);
    }

    // Preflight known conflicts and limits before writing either attempts or
    // process-local favorites/preferences. This avoids predictable partial
    // imports; DB-05 adds durable batch checkpoints for interruptions/races.
    const saved = await attempts(userId);
    const savedById = new Map(saved.map((attempt) => [attempt.id, attempt]));
    let missing = 0;
    for (const attempt of data.attempts) {
      const previous = savedById.get(attempt.id);
      if (previous) ensureSameGuess(previous, attempt);
      else missing++;
    }
    if (saved.length + missing > MAX_ATTEMPTS_PER_USER) {
      throw new ProgressError('Practice history limit reached for this prototype', 409);
    }
    const favorites = temporaryStore.favorites(userId);
    if (new Set([...favorites, ...data.favorites]).size > MAX_FAVORITES) {
      throw new ProgressError('Too many favorites for this prototype', 409);
    }

    let importedCount = 0;
    for (const attempt of data.attempts) {
      const result = await recordAttempt(userId, attempt, 'guest-import', { batchChecked: true });
      if (result.created) importedCount++;
    }
    // The temporary store manages preferencesTouched and favorite merging.
    // Do not duplicate its attempts: their source of truth is MongoDB.
    const transient = temporaryStore.importGuest(userId, { ...data, attempts: [] });
    const result = {
      importId: data.importId,
      importedCount,
      alreadyPresentCount: data.attempts.length - importedCount,
      favoritesAdded: transient.favoritesAdded,
      importedPreferences: transient.importedPreferences,
    };
    receipts.set(data.importId, { fingerprint, result });
    return { ...result, replayed: false };
  }

  return {
    attempts,
    async summary(userId) {
      return summarizeProgress(await attempts(userId));
    },
    recordAttempt,
    favorites: (userId) => temporaryStore.favorites(userId),
    setFavorites: (userId, favorites) => temporaryStore.setFavorites(userId, favorites),
    preferences: (userId) => temporaryStore.preferences(userId),
    setPreferences: (userId, patch) => temporaryStore.setPreferences(userId, patch),
    importGuest,
  };
}
