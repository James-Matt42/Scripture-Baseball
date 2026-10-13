import {
  getPracticeStorageKey,
  loadPracticeState,
  savePracticeState,
} from "../play/practiceState.js";

export const ACCOUNTS_STORAGE_KEY = "scripture-baseball.accounts.v1";
const VERSION = 1;

export const VOLUME_OPTIONS = [
  { value: "", label: "No preference" },
  { value: "old-testament", label: "Old Testament" },
  { value: "new-testament", label: "New Testament" },
  { value: "book-of-mormon", label: "Book of Mormon" },
  { value: "doctrine-and-covenants", label: "Doctrine and Covenants" },
  { value: "pearl-of-great-price", label: "Pearl of Great Price" },
];
const allowedVolumes = new Set(VOLUME_OPTIONS.map((option) => option.value));

export const DEFAULT_PREFERENCES = Object.freeze({
  answerDifficulty: "book-chapter",
  preferredVolume: "",
  practiceReminders: false,
  gameNotifications: true,
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function validateProfile(displayName, email) {
  const name = typeof displayName === "string" ? displayName.trim() : "";
  const normalizedEmail = normalizeEmail(email);
  if (!name || name.length > 40) return "Display name must be 1–40 characters.";
  if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return "Enter a valid email address.";
  }
  return null;
}

export function normalizePreferences(value, fallback = DEFAULT_PREFERENCES) {
  const next = isRecord(value) ? value : {};
  return {
    answerDifficulty: ["book-chapter", "exact-verse"].includes(next.answerDifficulty)
      ? next.answerDifficulty : fallback.answerDifficulty,
    preferredVolume: allowedVolumes.has(next.preferredVolume)
      ? next.preferredVolume : fallback.preferredVolume,
    practiceReminders: typeof next.practiceReminders === "boolean"
      ? next.practiceReminders : fallback.practiceReminders,
    gameNotifications: typeof next.gameNotifications === "boolean"
      ? next.gameNotifications : fallback.gameNotifications,
  };
}

export function createInitialAccountState() {
  return { version: VERSION, profiles: [], activeProfileId: null, guestPreferences: { ...DEFAULT_PREFERENCES } };
}

export function normalizeAccountState(value) {
  if (!isRecord(value) || value.version !== VERSION) return createInitialAccountState();
  const usedIds = new Set();
  const usedEmails = new Set();
  const profiles = (Array.isArray(value.profiles) ? value.profiles : []).slice(0, 100).flatMap((item) => {
    if (!isRecord(item) || !/^account-[1-9]\d*$/.test(item.id) ||
      validateProfile(item.displayName, item.email) ||
      usedIds.has(item.id) || usedEmails.has(normalizeEmail(item.email))) return [];
    usedIds.add(item.id);
    const email = normalizeEmail(item.email);
    usedEmails.add(email);
    return [{
      id: item.id,
      displayName: item.displayName.trim(),
      email,
      createdAt: typeof item.createdAt === "string" && !Number.isNaN(Date.parse(item.createdAt))
        ? item.createdAt : "",
      preferences: normalizePreferences(item.preferences),
    }];
  });
  return {
    version: VERSION,
    profiles,
    activeProfileId: profiles.some((profile) => profile.id === value.activeProfileId)
      ? value.activeProfileId : null,
    guestPreferences: normalizePreferences(value.guestPreferences),
  };
}

export function loadAccountState(storage) {
  try {
    const json = storage?.getItem(ACCOUNTS_STORAGE_KEY);
    return json ? normalizeAccountState(JSON.parse(json)) : createInitialAccountState();
  } catch {
    return createInitialAccountState();
  }
}

export function saveAccountState(storage, state) {
  try {
    if (!storage) return false;
    storage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function getActiveProfile(state) {
  return state.profiles.find((profile) => profile.id === state.activeProfileId) ?? null;
}

export function getPreferences(state) {
  return getActiveProfile(state)?.preferences ?? state.guestPreferences;
}

export function nextProfileId(state) {
  const numbers = state.profiles.map((profile) => Number(profile.id.slice(8)));
  return `account-${Math.max(0, ...numbers) + 1}`;
}

// No passwords or authentication tokens exist in this local-only demo.
export function accountReducer(state, action) {
  switch (action.type) {
    case "create": {
      const { displayName, email, createdAt } = action;
      if (validateProfile(displayName, email)) return state;
      const normalizedEmail = normalizeEmail(email);
      if (state.profiles.some((profile) => profile.email === normalizedEmail)) return state;
      const id = nextProfileId(state);
      const profile = {
        id,
        displayName: displayName.trim(),
        email: normalizedEmail,
        createdAt,
        preferences: { ...state.guestPreferences },
      };
      return { ...state, profiles: [...state.profiles, profile], activeProfileId: id };
    }
    case "sign-in": {
      const profile = state.profiles.find((item) => item.email === normalizeEmail(action.email));
      if (!profile || state.activeProfileId === profile.id) return state;
      return { ...state, activeProfileId: profile.id };
    }
    case "sign-out":
      return state.activeProfileId === null ? state : { ...state, activeProfileId: null };
    case "update-preferences": {
      const preferences = normalizePreferences(action.changes, getPreferences(state));
      if (JSON.stringify(preferences) === JSON.stringify(getPreferences(state))) return state;
      if (state.activeProfileId === null) return { ...state, guestPreferences: preferences };
      return {
        ...state,
        profiles: state.profiles.map((profile) => profile.id === state.activeProfileId
          ? { ...profile, preferences } : profile),
      };
    }
    default:
      return state;
  }
}

// On first profile creation, copy existing Step 3 guest practice to the
// profile's own storage slot. Never remove the guest copy or overwrite an
// existing profile's data if storage is unavailable or interrupted.
export function copyGuestPracticeToProfile(storage, profileId) {
  try {
    const profileKey = getPracticeStorageKey(profileId);
    if (!storage || !profileId || storage.getItem(profileKey) !== null) return false;
    return savePracticeState(storage, loadPracticeState(storage), profileKey);
  } catch {
    return false;
  }
}
