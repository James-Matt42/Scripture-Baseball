import { createHash } from 'node:crypto';
import {
  gradeAttempt,
  MAX_ATTEMPTS_PER_USER,
  MAX_IMPORTS_PER_USER,
  sameAttemptAnswers,
  summarizeProgress,
} from './progressStore.js';
import { DEFAULT_PREFERENCES, MAX_FAVORITES, ProgressError } from './validation.js';

const ATTEMPT_FIELDS = { projection: { _id: 0, userId: 0 } };
const MAX_IMPORT_TRANSACTION_RETRIES = 3;

function conflictingAttempt() {
  return new ProgressError('An attempt with this ID already has different answers', 409);
}

function ensureSameGuess(existing, attempt) {
  if (!sameAttemptAnswers(existing, attempt)) throw conflictingAttempt();
}

function importFingerprint(data) {
  // The validated, normalized request is the identity of a guest import.
  // Never store raw guest guesses or unverified timestamps in the receipt.
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function importReplay(prior, fingerprint) {
  if (prior.fingerprint !== fingerprint) {
    throw new ProgressError('This importId has already been used with different data', 409);
  }
  return { ...prior.result, replayed: true };
}

/**
 * Persistent account progress. All collections are keyed by the authenticated
 * user ID supplied by the cookie-protected routes, never by a request body.
 *
 * A guest import is a single MongoDB transaction covering its attempts,
 * favorites, preferences and final receipt. A crash or preflight conflict
 * therefore commits nothing; a retry either completes once or replays the
 * original durable receipt (even on a different server process).
 *
 * MongoDB transactions require a replica set/sharded deployment (Atlas
 * supports them). Do not silently downgrade imports to non-atomic writes.
 */
export function createMongoProgressStore(database, { now = Date.now } = {}) {
  const attemptCollection = database.collection('attempts');
  const favoriteCollection = database.collection('favorites');
  const preferenceCollection = database.collection('preferences');
  const importCollection = database.collection('guestImports');

  async function findAttempt(userId, id) {
    return attemptCollection.findOne({ userId, id }, ATTEMPT_FIELDS);
  }

  async function attempts(userId) {
    return attemptCollection.find({ userId }, ATTEMPT_FIELDS)
      .sort({ recordedAt: 1, _id: 1 }).toArray();
  }

  async function recordAttempt(userId, attempt, source = 'server') {
    const existing = await findAttempt(userId, attempt.id);
    if (existing) {
      ensureSameGuess(existing, attempt);
      return { attempt: existing, created: false };
    }
    if (await attemptCollection.countDocuments({ userId }) >= MAX_ATTEMPTS_PER_USER) {
      throw new ProgressError('Practice history limit reached for this prototype', 409);
    }

    const graded = gradeAttempt(attempt, source, now);
    try {
      await attemptCollection.insertOne({ userId, ...graded });
      return { attempt: graded, created: true };
    } catch (error) {
      // The (userId, id) unique index resolves simultaneous retry races.
      if (error?.code !== 11000) throw error;
      const winner = await findAttempt(userId, attempt.id);
      if (!winner) throw error;
      ensureSameGuess(winner, attempt);
      return { attempt: winner, created: false };
    }
  }

  async function favorites(userId) {
    const record = await favoriteCollection.findOne({ userId }, { projection: { favorites: 1 } });
    return [...(record?.favorites ?? [])];
  }

  async function setFavorites(userId, values) {
    // PUT retains its replacement semantics; an empty list clears favorites.
    await favoriteCollection.replaceOne(
      { userId }, { userId, favorites: [...values] }, { upsert: true },
    );
    return [...values];
  }

  async function preferences(userId) {
    const record = await preferenceCollection.findOne({ userId }, { projection: { values: 1 } });
    return { ...DEFAULT_PREFERENCES, ...(record?.values ?? {}) };
  }

  async function setPreferences(userId, patch) {
    // Atomic dotted updates prevent concurrent PATCH requests overwriting
    // one another's unrelated preference keys.
    const fields = Object.fromEntries(
      Object.entries(patch).map(([key, value]) => [`values.${key}`, value]),
    );
    await preferenceCollection.updateOne(
      { userId }, { $set: { ...fields, touched: true } }, { upsert: true },
    );
    return preferences(userId);
  }

  async function runImport(userId, data, fingerprint, session) {
    const options = { session };
    const prior = await importCollection.findOne(
      { userId, importId: data.importId }, options,
    );
    if (prior) return importReplay(prior, fingerprint);

    if (await importCollection.countDocuments({ userId }, options) >= MAX_IMPORTS_PER_USER) {
      throw new ProgressError('Guest import limit reached for this prototype', 409);
    }

    // Preflight the whole batch before any write. The subsequent writes and
    // receipt insertion are atomic at transaction commit.
    const saved = await attemptCollection.find({ userId }, { ...ATTEMPT_FIELDS, session })
      .sort({ recordedAt: 1, _id: 1 }).toArray();
    const byId = new Map(saved.map((attempt) => [attempt.id, attempt]));
    const missing = [];
    for (const attempt of data.attempts) {
      const existing = byId.get(attempt.id);
      if (existing) ensureSameGuess(existing, attempt);
      else missing.push(attempt);
    }
    if (saved.length + missing.length > MAX_ATTEMPTS_PER_USER) {
      throw new ProgressError('Practice history limit reached for this prototype', 409);
    }

    // MongoDB explicitly forbids parallel operations on the same transaction
    // session, so these reads must be sequential.
    const storedFavorites = await favoriteCollection.findOne({ userId }, options);
    const storedPreferences = await preferenceCollection.findOne({ userId }, options);
    const previousFavorites = storedFavorites?.favorites ?? [];
    const mergedFavorites = [...new Set([...previousFavorites, ...data.favorites])];
    if (mergedFavorites.length > MAX_FAVORITES) {
      throw new ProgressError('Too many favorites for this prototype', 409);
    }
    const importedPreferences = data.preferences !== null && !storedPreferences?.touched;

    if (missing.length > 0) {
      const documents = missing.map((attempt) => ({
        userId, ...gradeAttempt(attempt, 'guest-import', now),
      }));
      // One batch write avoids up to 200 sequential round-trips to Atlas.
      if (documents.length === 1) await attemptCollection.insertOne(documents[0], options);
      else await attemptCollection.insertMany(documents, options);
    }
    if (mergedFavorites.length !== previousFavorites.length) {
      await favoriteCollection.replaceOne(
        { userId }, { userId, favorites: mergedFavorites }, { ...options, upsert: true },
      );
    }
    if (importedPreferences) {
      await preferenceCollection.replaceOne(
        { userId }, {
          userId,
          values: { ...DEFAULT_PREFERENCES, ...(storedPreferences?.values ?? {}), ...data.preferences },
          touched: true,
        },
        { ...options, upsert: true },
      );
    }

    const result = {
      importId: data.importId,
      importedCount: missing.length,
      alreadyPresentCount: data.attempts.length - missing.length,
      favoritesAdded: mergedFavorites.length - previousFavorites.length,
      importedPreferences,
    };
    await importCollection.insertOne({
      userId,
      importId: data.importId,
      fingerprint,
      result,
      completedAt: new Date(now()),
    }, options);
    return { ...result, replayed: false };
  }

  async function importGuest(userId, data) {
    if (typeof database.client?.startSession !== 'function') {
      throw new Error('MongoDB transactions are required for durable guest imports');
    }
    const fingerprint = importFingerprint(data);
    for (let attempt = 0; attempt < MAX_IMPORT_TRANSACTION_RETRIES; attempt++) {
      const session = database.client.startSession();
      try {
        return await session.withTransaction(
          () => runImport(userId, data, fingerprint, session),
          { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
        );
      } catch (error) {
        // Concurrent identical imports can both preflight before one wins the
        // unique receipt index. Reuse the winning receipt or retry if the
        // duplicate arose from another user's simultaneous favorites/attempts.
        if (error?.code !== 11000) throw error;
        const winner = await importCollection.findOne({ userId, importId: data.importId });
        if (winner) return importReplay(winner, fingerprint);
        if (attempt === MAX_IMPORT_TRANSACTION_RETRIES - 1) throw error;
      } finally {
        await session.endSession();
      }
    }
  }

  return {
    attempts,
    async summary(userId) { return summarizeProgress(await attempts(userId)); },
    recordAttempt,
    favorites,
    setFavorites,
    preferences,
    setPreferences,
    importGuest,
  };
}
