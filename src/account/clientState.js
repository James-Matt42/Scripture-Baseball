import {
  DEFAULT_PREFERENCES,
  loadAccountState,
  normalizeEmail,
  normalizePreferences,
} from './accountState.js';
import { getPracticeStorageKey, loadPracticeState, savePracticeState } from '../play/practiceState.js';

export const CLIENT_SETTINGS_KEY = 'scripture-baseball.client-settings.v1';
export const SERVER_USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function initialClientSettings(guestPreferences = DEFAULT_PREFERENCES) {
  return { version: 1, guestPreferences: normalizePreferences(guestPreferences), byUser: {} };
}

export function normalizeClientSettings(value) {
  if (!isRecord(value) || value.version !== 1) return initialClientSettings();
  const byUser = {};
  if (isRecord(value.byUser)) {
    for (const [id, preferences] of Object.entries(value.byUser).slice(0, 100)) {
      if (SERVER_USER_ID_PATTERN.test(id)) byUser[id] = normalizePreferences(preferences);
    }
  }
  return {
    version: 1,
    guestPreferences: normalizePreferences(value.guestPreferences),
    byUser,
  };
}

// The legacy account list is never accepted as evidence of authentication.
// We only carry its guest preferences forward to the new, non-credential store.
export function loadClientSettings(storage) {
  try {
    const json = storage?.getItem(CLIENT_SETTINGS_KEY);
    return json ? normalizeClientSettings(JSON.parse(json))
      : initialClientSettings(loadAccountState(storage).guestPreferences);
  } catch {
    return initialClientSettings();
  }
}

export function saveClientSettings(storage, state) {
  try {
    if (!storage) return false;
    storage.setItem(CLIENT_SETTINGS_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function getClientPreferences(state, userId = null) {
  return (userId && state.byUser[userId]) || state.guestPreferences;
}

// A legacy browser profile can be used only as a *local migration source*,
// and only once the server has verified ownership of the same email account.
export function getMatchingLegacyProfile(storage, user) {
  if (!SERVER_USER_ID_PATTERN.test(user?.id ?? '')) return null;
  return loadAccountState(storage).profiles.find(
    (profile) => profile.email === normalizeEmail(user.email),
  ) ?? null;
}

// A newly verified server account may inherit old *local preferences* for the
// same email. The old email-only profile is never used for signing in.
export function ensureUserPreferences(state, user, storage) {
  if (!SERVER_USER_ID_PATTERN.test(user?.id ?? '') || state.byUser[user.id]) return state;
  const oldProfile = getMatchingLegacyProfile(storage, user);
  return {
    ...state,
    byUser: {
      ...state.byUser,
      [user.id]: normalizePreferences(oldProfile?.preferences ?? state.guestPreferences),
    },
  };
}

export function updateClientPreferences(state, userId, changes) {
  const current = getClientPreferences(state, userId);
  const next = normalizePreferences(changes, current);
  if (JSON.stringify(current) === JSON.stringify(next)) return state;
  if (!userId) return { ...state, guestPreferences: next };
  if (!SERVER_USER_ID_PATTERN.test(userId)) return state;
  return { ...state, byUser: { ...state.byUser, [userId]: next } };
}

/**
 * After verified registration, adopt local practice without overwriting a
 * destination that already contains data. Prefer the matching legacy profile
 * when present, otherwise the guest slot. Never delete the source. Commit 8
 * will add explicit, server-validated import for durable progress.
 */
export function copyLocalPracticeOnRegistration(storage, user) {
  try {
    if (!storage || !SERVER_USER_ID_PATTERN.test(user?.id ?? '')) return false;
    const targetKey = getPracticeStorageKey(user.id);
    if (storage.getItem(targetKey) !== null) return false;
    const priorProfile = getMatchingLegacyProfile(storage, user);
    const sourceKey = priorProfile && storage.getItem(getPracticeStorageKey(priorProfile.id)) !== null
      ? getPracticeStorageKey(priorProfile.id) : getPracticeStorageKey(null);
    if (storage.getItem(sourceKey) === null) return false;
    const source = loadPracticeState(storage, sourceKey);
    if (!source.session.attempts.length && !source.history.length && !source.favorites.length &&
        !source.session.draft) return false;
    return savePracticeState(storage, source, targetKey);
  } catch {
    return false;
  }
}
