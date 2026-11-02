/** Pure local-to-server practice migration helpers. These IDs describe
 * anonymous activity on a device; they are NOT proof of identity or skill. */
export const DEVICE_ID_KEY = 'scripture-baseball.device-id.v1';
export const ACCOUNT_IMPORT_PREFIX = 'scripture-baseball.account-import.v1.';
const MAX_IMPORT_ATTEMPTS = 200;
const PENDING_FAVORITES_PREFIX = 'scripture-baseball.pending-favorites.v1.';

export function pendingFavorites(storage, userId) {
  try {
    const value = JSON.parse(storage?.getItem(`${PENDING_FAVORITES_PREFIX}${userId}`) ?? 'null');
    return Array.isArray(value) ? value : null;
  } catch { return null; }
}

export function setPendingFavorites(storage, userId, favorites) {
  try { storage?.setItem(`${PENDING_FAVORITES_PREFIX}${userId}`, JSON.stringify(favorites)); }
  catch { /* The UI separately warns when localStorage is unavailable. */ }
}

export function clearPendingFavorites(storage, userId, acknowledged) {
  try {
    if (JSON.stringify(pendingFavorites(storage, userId)) === JSON.stringify(acknowledged)) {
      storage?.removeItem(`${PENDING_FAVORITES_PREFIX}${userId}`);
    }
  } catch { /* best effort */ }
}

function stableHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function deviceId(storage, makeId = () => globalThis.crypto.randomUUID()) {
  try {
    const stored = storage?.getItem(DEVICE_ID_KEY);
    if (stored && /^[0-9a-f-]{36}$/i.test(stored)) return stored;
    const fresh = makeId();
    storage?.setItem(DEVICE_ID_KEY, fresh);
    return fresh;
  } catch {
    // Without browser storage we can still attempt the HTTP write, but cannot
    // promise retry durability after a reload. The UI reports this separately.
    return makeId();
  }
}

export function localAttemptRecords(practice, storageKey, id) {
  const scope = stableHash(storageKey);
  const records = [];
  function append(session, answeredAt) {
    for (const attempt of session.attempts ?? []) {
      records.push({
        id: `local.${id}.${scope}.${session.inning}.${attempt.questionId}`,
        questionId: attempt.questionId,
        bookId: attempt.bookId,
        chapter: attempt.chapter,
        ...(attempt.verse === undefined ? {} : { verse: attempt.verse }),
        challengeId: session.challengeId ?? null,
        ...(answeredAt ? { answeredAt } : {}),
      });
    }
  }
  for (const inning of practice.history ?? []) append(inning, inning.finishedAt);
  if (!practice.session.archived) append(practice.session);
  return records;
}

/** Include server-verified answers once, then locally saved/unsent guesses.
 * The complete local inbox survives failures; never discard it after a fetch. */
export function combineAttemptHistory(serverAttempts, localRecords, localPractice) {
  const byId = new Map(localRecords.map((attempt) => [attempt.id, attempt]));
  // Preserve each local inning's natural ordering for the existing report.
  const serverById = new Map(serverAttempts.map((attempt) => [attempt.id, attempt]));
  const originalLocal = [...(localPractice.history ?? []).flatMap((entry) => entry.attempts),
    ...(localPractice.session.archived ? [] : localPractice.session.attempts)];
  const local = localRecords.map((record, index) => serverById.get(record.id) ?? { ...originalLocal[index], ...record });
  const merged = [...serverAttempts.filter((attempt) => !byId.has(attempt.id)), ...local];
  // A server attempt from another device may have occurred later than an
  // archived local pitch. Preserve true chronology for streaks and My Misses;
  // undated current-inning guesses come last.
  const time = (attempt) => {
    const value = Date.parse(attempt.answeredAt ?? attempt.recordedAt ?? '');
    return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
  };
  return merged.sort((a, b) => time(a) - time(b));
}

/** Snapshot the first migration *before* sending it. Retry exactly the same
 * importId + body after a timeout, not a changed payload under the same ID. */
export function getOrCreateImport(storage, userId, records, favorites, preferences, makeId = () => globalThis.crypto.randomUUID()) {
  const key = `${ACCOUNT_IMPORT_PREFIX}${userId}`;
  try {
    const existing = JSON.parse(storage?.getItem(key) ?? 'null');
    if (existing?.version === 1 && Array.isArray(existing.batches) &&
        Number.isInteger(existing.completed) && existing.completed >= 0 &&
        existing.completed <= existing.batches.length) return existing;
  } catch { /* invalid cache; begin a new snapshot */ }
  const batches = [];
  const batchKey = makeId();
  for (let start = 0; start < Math.max(1, records.length); start += MAX_IMPORT_ATTEMPTS) {
    const index = batches.length;
    batches.push({
      importId: `migrate.${batchKey}.${index}`,
      attempts: records.slice(start, start + MAX_IMPORT_ATTEMPTS),
      favorites: index === 0 ? [...favorites] : [],
      ...(index === 0 ? { preferences } : {}),
    });
  }
  const snapshot = { version: 1, completed: 0, batches };
  try { storage?.setItem(key, JSON.stringify(snapshot)); } catch { /* retry is session-only */ }
  return snapshot;
}

export async function finishInitialImport(storage, userId, snapshot, send) {
  const key = `${ACCOUNT_IMPORT_PREFIX}${userId}`;
  for (let index = snapshot.completed; index < snapshot.batches.length; index++) {
    await send(snapshot.batches[index]);
    snapshot.completed = index + 1;
    try { storage?.setItem(key, JSON.stringify(snapshot)); } catch { /* best effort */ }
  }
  return snapshot;
}

export function unsyncedAttempts(serverAttempts, localRecords) {
  const present = new Set(serverAttempts.map((attempt) => attempt.id));
  return localRecords.filter((attempt) => !present.has(attempt.id));
}
