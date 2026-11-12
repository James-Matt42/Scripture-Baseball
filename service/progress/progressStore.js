import { createHash } from 'node:crypto';
import { getQuestionById, getQuestionVolume, gradeBookAndChapter, gradeExactVerse } from '../domain/questions.js';
import { DEFAULT_PREFERENCES, MAX_FAVORITES, ProgressError } from './validation.js';
import { sameVerifiedAttempt } from './verifiedAttempt.js';

export const MAX_ATTEMPTS_PER_USER = 5000;
export const MAX_IMPORTS_PER_USER = 100;

function hashContent(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function contentKey(attempt) {
  // Incoming timestamps are not proof of when a guest answered. They also
  // aren't part of a guess's stable identity, so retries can remain idempotent.
  return [attempt.questionId, attempt.bookId, attempt.chapter, attempt.verse ?? null, attempt.challengeId];
}

/** Stable guess identity, excluding unverified client timestamps and source. */
export function sameAttemptAnswers(left, right) {
  return hashContent(contentKey(left)) === hashContent(contentKey(right));
}

/** Grade a validated guess using server-owned question answers. */
export function gradeAttempt(attempt, source, now) {
  const question = getQuestionById(attempt.questionId);
  const base = gradeBookAndChapter(question, attempt.bookId, attempt.chapter);
  const grades = attempt.verse === undefined ? base : gradeExactVerse(question, base, attempt.verse);
  const recordedAt = new Date(now()).toISOString();
  return {
    id: attempt.id,
    questionId: attempt.questionId,
    bookId: attempt.bookId,
    chapter: attempt.chapter,
    ...(attempt.verse === undefined ? {} : { verse: attempt.verse }),
    challengeId: attempt.challengeId,
    bookCorrect: grades.bookCorrect,
    chapterCorrect: grades.chapterCorrect,
    ...(attempt.verse === undefined ? {} : { verseCorrect: grades.verseCorrect }),
    // Imports can only prove that submitted guesses match the known answers;
    // the server cannot prove the guest made them at the claimed time.
    source,
    answeredAt: attempt.answeredAt ?? recordedAt,
    recordedAt,
  };
}

export function summarizeProgress(attempts) {
  const byVolume = new Map();
  let bookCorrect = 0;
  let chapterCorrect = 0;
  let verseAttempts = 0;
  let verseCorrect = 0;
  for (const attempt of attempts) {
    const volume = attempt.reference ? attempt.volume : getQuestionVolume(getQuestionById(attempt.questionId));
    if (!byVolume.has(volume)) byVolume.set(volume, { volume, attempts: 0, bookCorrect: 0, chapterCorrect: 0 });
    const tally = byVolume.get(volume);
    tally.attempts++;
    if (attempt.bookCorrect) { bookCorrect++; tally.bookCorrect++; }
    if (attempt.chapterCorrect) { chapterCorrect++; tally.chapterCorrect++; }
    if (attempt.verseCorrect !== undefined) {
      verseAttempts++;
      if (attempt.verseCorrect) verseCorrect++;
    }
  }
  return {
    totalAttempts: attempts.length,
    uniquePassages: new Set(attempts.map((attempt) => attempt.reference ?? attempt.questionId)).size,
    bookCorrect,
    chapterCorrect,
    verseAttempts,
    verseCorrect,
    byVolume: [...byVolume.values()],
  };
}

/** Per-user ephemeral persistence, isolated behind a minimal adapter for MongoDB. */
export function createInMemoryProgressStore({ now = Date.now } = {}) {
  const users = new Map();
  const guestPitches = new Map();

  function get(userId) {
    let record = users.get(userId);
    if (!record) {
      record = {
        attempts: [], attemptIndex: new Map(), favorites: [],
        preferences: { ...DEFAULT_PREFERENCES }, preferencesTouched: false,
        imports: new Map(),
      };
      users.set(userId, record);
    }
    return record;
  }

  function ensureSpace(record, count) {
    if (record.attempts.length + count > MAX_ATTEMPTS_PER_USER) {
      throw new ProgressError('Practice history limit reached for this prototype', 409);
    }
  }

  function conflictingAttempt(record, attempt) {
    const existing = record.attemptIndex.get(attempt.id);
    if (existing && !sameAttemptAnswers(existing, attempt)) {
      throw new ProgressError('An attempt with this ID already has different answers', 409);
    }
    return existing;
  }

  function add(record, attempt, source) {
    const graded = gradeAttempt(attempt, source, now);
    record.attempts.push(graded);
    record.attemptIndex.set(graded.id, graded);
    return graded;
  }

  return {
    attempts(userId) {
      return get(userId).attempts.map((attempt) => ({ ...attempt }));
    },
    summary(userId) {
      return summarizeProgress(get(userId).attempts);
    },
    recordVerifiedAttempt(userId, attempt) {
      const record = get(userId);
      const existing = record.attemptIndex.get(attempt.id);
      if (existing) {
        if (!sameVerifiedAttempt(existing, attempt)) throw new ProgressError('Conflicting verified pitch', 409);
        return { attempt: { ...existing }, created: false };
      }
      ensureSpace(record, 1);
      const saved = { ...attempt };
      record.attempts.push(saved);
      record.attemptIndex.set(saved.id, saved);
      return { attempt: { ...saved }, created: true };
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
      if (!receipt || receipt.expiresAt <= now()) throw new ProgressError('Guest pitch receipt not found', 404);
      if (receipt.claimedBy && receipt.claimedBy !== userId) {
        throw new ProgressError('Guest pitch receipt not found', 404);
      }
      receipt.claimedBy = userId;
      return this.recordVerifiedAttempt(userId, receipt.attempt);
    },
    recordAttempt(userId, attempt) {
      const record = get(userId);
      const existing = conflictingAttempt(record, attempt);
      if (existing) return { attempt: { ...existing }, created: false };
      ensureSpace(record, 1);
      return { attempt: { ...add(record, attempt, 'server') }, created: true };
    },
    favorites(userId) {
      return [...get(userId).favorites];
    },
    setFavorites(userId, favorites) {
      const record = get(userId);
      record.favorites = [...favorites];
      return [...record.favorites];
    },
    preferences(userId) {
      return { ...get(userId).preferences };
    },
    setPreferences(userId, patch) {
      const record = get(userId);
      record.preferences = { ...record.preferences, ...patch };
      record.preferencesTouched = true;
      return { ...record.preferences };
    },
    importGuest(userId, data) {
      const record = get(userId);
      const fingerprint = hashContent(data);
      const previous = record.imports.get(data.importId);
      if (previous) {
        if (previous.fingerprint !== fingerprint) {
          throw new ProgressError('This importId has already been used with different data', 409);
        }
        return { ...previous.result, replayed: true };
      }
      if (record.imports.size >= MAX_IMPORTS_PER_USER) {
        throw new ProgressError('Guest import limit reached for this prototype', 409);
      }

      // Check the entire batch BEFORE mutating any state. A conflict halfway
      // through an import must not leave a partial favorites/attempt migration.
      let newCount = 0;
      for (const attempt of data.attempts) {
        if (!conflictingAttempt(record, attempt)) newCount++;
      }
      ensureSpace(record, newCount);
      const mergedFavorites = [...new Set([...record.favorites, ...data.favorites])];
      if (mergedFavorites.length > MAX_FAVORITES) {
        throw new ProgressError('Too many favorites for this prototype', 409);
      }

      for (const attempt of data.attempts) {
        if (!record.attemptIndex.has(attempt.id)) add(record, attempt, 'guest-import');
      }
      const before = new Set(record.favorites);
      record.favorites = mergedFavorites;
      const importedPreferences = data.preferences !== null && !record.preferencesTouched;
      if (importedPreferences) {
        record.preferences = { ...record.preferences, ...data.preferences };
        record.preferencesTouched = true;
      }
      const result = {
        importId: data.importId,
        importedCount: newCount,
        alreadyPresentCount: data.attempts.length - newCount,
        favoritesAdded: record.favorites.length - before.size,
        importedPreferences,
      };
      record.imports.set(data.importId, { fingerprint, result });
      return { ...result, replayed: false };
    },
  };
}
