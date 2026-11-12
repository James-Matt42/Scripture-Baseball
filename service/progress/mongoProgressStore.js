import { MAX_ATTEMPTS_PER_USER, summarizeProgress } from './progressStore.js';
import { DEFAULT_PREFERENCES, MAX_FAVORITES, ProgressError } from './validation.js';
import { sameVerifiedAttempt } from './verifiedAttempt.js';

const ATTEMPT_FIELDS = { projection: { _id: 0, userId: 0 } };

/**
 * Persistent account progress. All collections are keyed by the authenticated
 * user ID supplied by the cookie-protected routes, never by a request body.
 *
 * Only verified results from the pitch engine can enter the attempts collection.
 * Guest results are staged by opaque claim token and later attached to a user.
 */
export function createMongoProgressStore(database, { now = Date.now } = {}) {
  const attemptCollection = database.collection('attempts');
  const favoriteCollection = database.collection('favorites');
  const preferenceCollection = database.collection('preferences');
  const guestPitchCollection = database.collection('guestPitches');

  async function findAttempt(userId, id) {
    return attemptCollection.findOne({ userId, id }, ATTEMPT_FIELDS);
  }

  async function attempts(userId) {
    return attemptCollection.find({ userId }, ATTEMPT_FIELDS)
      .sort({ recordedAt: 1, _id: 1 }).toArray();
  }

  async function recordVerifiedAttempt(userId, attempt) {
    const existing = await findAttempt(userId, attempt.id);
    if (existing) {
      if (!sameVerifiedAttempt(existing, attempt)) throw new ProgressError('Conflicting verified pitch', 409);
      return { attempt: existing, created: false };
    }
    if (await attemptCollection.countDocuments({ userId }) >= MAX_ATTEMPTS_PER_USER) {
      throw new ProgressError('Practice history limit reached for this prototype', 409);
    }
    try {
      await attemptCollection.insertOne({ userId, ...attempt });
      return { attempt: { ...attempt }, created: true };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const winner = await findAttempt(userId, attempt.id);
      if (!winner || !sameVerifiedAttempt(winner, attempt)) {
        throw new ProgressError('Conflicting verified pitch', 409);
      }
      return { attempt: winner, created: false };
    }
  }

  async function stageGuestPitch(pitchId, attempt) {
    const existing = await guestPitchCollection.findOne({ pitchId });
    if (existing) {
      if (!sameVerifiedAttempt(existing.attempt, attempt)) throw new ProgressError('Conflicting guest pitch', 409);
      return;
    }
    try {
      await guestPitchCollection.insertOne({ pitchId, attempt,
        expiresAt: new Date(now() + 30 * 24 * 3600_000) });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const winner = await guestPitchCollection.findOne({ pitchId });
      if (!winner || !sameVerifiedAttempt(winner.attempt, attempt)) {
        throw new ProgressError('Conflicting guest pitch', 409);
      }
    }
  }

  async function claimGuestPitch(userId, pitchId) {
    // The opaque 256-bit pitch token is the guest's bearer claim credential.
    // Atomic ownership prevents a second account from claiming the same work.
    const receipt = await guestPitchCollection.findOneAndUpdate({
      pitchId, expiresAt: { $gt: new Date(now()) },
      $or: [{ claimedBy: { $exists: false } }, { claimedBy: userId }],
    }, { $set: { claimedBy: userId } }, { returnDocument: 'after' });
    if (!receipt) throw new ProgressError('Guest pitch receipt unavailable or already claimed', 404);
    return recordVerifiedAttempt(userId, receipt.attempt);
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

  return {
    attempts,
    async summary(userId) { return summarizeProgress(await attempts(userId)); },
    recordVerifiedAttempt,
    stageGuestPitch,
    claimGuestPitch,
    favorites,
    setFavorites,
    preferences,
    setPreferences,
  };
}
