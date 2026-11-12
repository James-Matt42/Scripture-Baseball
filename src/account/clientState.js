import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
} from './accountState.js';

export const CLIENT_SETTINGS_KEY = 'scripture-baseball.client-settings.v1';
export const SERVER_USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function initialClientSettings(guestPreferences = DEFAULT_PREFERENCES) {
  return { version: 1, guestPreferences: normalizePreferences(guestPreferences), byUser: {}, pendingByUser: {} };
}

export function normalizeClientSettings(value) {
  if (!isRecord(value) || value.version !== 1) return initialClientSettings();
  const byUser = {};
  if (isRecord(value.byUser)) {
    for (const [id, preferences] of Object.entries(value.byUser).slice(0, 100)) {
      if (SERVER_USER_ID_PATTERN.test(id)) byUser[id] = normalizePreferences(preferences);
    }
  }
  const pendingByUser = {};
  if (isRecord(value.pendingByUser)) {
    for (const [id, preferences] of Object.entries(value.pendingByUser).slice(0, 100)) {
      if (SERVER_USER_ID_PATTERN.test(id)) pendingByUser[id] = normalizePreferences(preferences);
    }
  }
  return {
    version: 1,
    guestPreferences: normalizePreferences(value.guestPreferences),
    byUser, pendingByUser,
  };
}

// Browser preferences are not authentication evidence. A valid account identity
// comes only from the protected cookie-authenticated server session.
export function loadClientSettings(storage) {
  try {
    const json = storage?.getItem(CLIENT_SETTINGS_KEY);
    return json ? normalizeClientSettings(JSON.parse(json)) : initialClientSettings();
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

/** Only verified server users acquire per-account local preferences. */
export function ensureUserPreferences(state, user) {
  if (!SERVER_USER_ID_PATTERN.test(user?.id ?? '') || state.byUser[user.id]) return state;
  return { ...state, byUser: { ...state.byUser,
    [user.id]: normalizePreferences(state.guestPreferences),
  } };
}

export function updateClientPreferences(state, userId, changes) {
  const current = getClientPreferences(state, userId);
  const next = normalizePreferences(changes, current);
  if (JSON.stringify(current) === JSON.stringify(next)) return state;
  if (!userId) return { ...state, guestPreferences: next };
  if (!SERVER_USER_ID_PATTERN.test(userId)) return state;
  return {
    ...state,
    byUser: { ...state.byUser, [userId]: next },
    pendingByUser: { ...state.pendingByUser, [userId]: next },
  };
}

// Never overwrite unsent changes with a stale server response.
export function acceptServerPreferences(state, userId, preferences) {
  if (!SERVER_USER_ID_PATTERN.test(userId) || state.pendingByUser?.[userId]) return state;
  const next = normalizePreferences(preferences);
  return { ...state, byUser: { ...state.byUser, [userId]: next } };
}

// A successful PATCH only confirms the exact version sent; a newer local edit
// stays pending and will be sent next.
export function confirmServerPreferences(state, userId, submitted, serverPreferences) {
  if (JSON.stringify(state.pendingByUser?.[userId]) !== JSON.stringify(submitted)) return state;
  const pendingByUser = { ...state.pendingByUser };
  delete pendingByUser[userId];
  return {
    ...state, pendingByUser,
    byUser: { ...state.byUser, [userId]: normalizePreferences(serverPreferences) },
  };
}
