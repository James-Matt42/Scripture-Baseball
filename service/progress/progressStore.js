import { DEFAULT_PREFERENCES, MAX_FAVORITES, ProgressError } from './validation.js';
import { sameVerifiedAttempt } from './verifiedAttempt.js';

export const MAX_ATTEMPTS_PER_USER = 5000;

/** Count only stages actually tested; selecting a book never earns a free book point. */
export function summarizeProgress(attempts) {
  const byVolume = new Map();
  let bookCorrect = 0;
  let chapterCorrect = 0;
  let verseAttempts = 0;
  let verseCorrect = 0;
  for (const attempt of attempts) {
    const volume = attempt.volume;
    if (!volume) continue;
    if (!byVolume.has(volume)) byVolume.set(volume, { volume, attempts: 0, bookCorrect: 0, chapterCorrect: 0 });
    const tally = byVolume.get(volume);
    tally.attempts++;
    if (attempt.bookCorrect === true) { bookCorrect++; tally.bookCorrect++; }
    if (attempt.chapterCorrect === true) { chapterCorrect++; tally.chapterCorrect++; }
    if (typeof attempt.verseCorrect === 'boolean') {
      verseAttempts++;
      if (attempt.verseCorrect) verseCorrect++;
    }
  }
  return {
    totalAttempts: attempts.length,
    uniquePassages: new Set(attempts.map((attempt) => attempt.reference)).size,
    bookCorrect, chapterCorrect, verseAttempts, verseCorrect,
    byVolume: [...byVolume.values()],
  };
}

/** In-memory test/development adapter. Production uses the MongoDB adapter. */
export function createInMemoryProgressStore({ now = Date.now } = {}) {
  const users = new Map();
  const guestPitches = new Map();
  function get(userId) {
    if (!users.has(userId)) users.set(userId, {
      attempts: [], attemptIndex: new Map(), favorites: [],
      preferences: { ...DEFAULT_PREFERENCES },
    });
    return users.get(userId);
  }
  return {
    attempts(userId) { return get(userId).attempts.map((a) => ({ ...a })); },
    summary(userId) { return summarizeProgress(get(userId).attempts); },
    recordVerifiedAttempt(userId, attempt) {
      const record = get(userId);
      const existing = record.attemptIndex.get(attempt.id);
      if (existing) {
        if (!sameVerifiedAttempt(existing, attempt)) throw new ProgressError('Conflicting verified pitch', 409);
        return { attempt: { ...existing }, created: false };
      }
      if (record.attempts.length >= MAX_ATTEMPTS_PER_USER) throw new ProgressError('Practice history limit reached', 409);
      const stored = { ...attempt };
      record.attempts.push(stored);
      record.attemptIndex.set(attempt.id, stored);
      return { attempt: { ...stored }, created: true };
    },
    stageGuestPitch(pitchId, attempt) {
      const existing = guestPitches.get(pitchId);
      if (existing) {
        if (!sameVerifiedAttempt(existing.attempt, attempt)) throw new ProgressError('Conflicting guest pitch', 409);
        return;
      }
      guestPitches.set(pitchId, { attempt: { ...attempt }, expiresAt: now() + 30 * 24 * 3600_000,
        claimedBy: null });
    },
    claimGuestPitch(userId, pitchId) {
      const receipt = guestPitches.get(pitchId);
      if (!receipt || receipt.expiresAt <= now() || (receipt.claimedBy && receipt.claimedBy !== userId)) {
        throw new ProgressError('Guest pitch receipt not found', 404);
      }
      receipt.claimedBy = userId;
      return this.recordVerifiedAttempt(userId, receipt.attempt);
    },
    favorites(userId) { return [...get(userId).favorites]; },
    setFavorites(userId, values) {
      if (!Array.isArray(values) || values.length > MAX_FAVORITES) throw new ProgressError('Invalid favorites');
      get(userId).favorites = [...values];
      return [...values];
    },
    preferences(userId) { return { ...get(userId).preferences }; },
    setPreferences(userId, patch) {
      const record = get(userId);
      record.preferences = { ...record.preferences, ...patch };
      return { ...record.preferences };
    },
  };
}
