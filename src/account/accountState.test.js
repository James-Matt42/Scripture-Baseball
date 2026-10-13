import assert from "node:assert/strict";
import test from "node:test";
import { SAMPLE_QUESTIONS, gradeBookAndChapter } from "../scripture/questions.js";
import {
  createInitialPracticeState,
  getPracticeStorageKey,
  loadPracticeState,
  practiceReducer,
  savePracticeState,
} from "../play/practiceState.js";
import {
  ACCOUNTS_STORAGE_KEY,
  DEFAULT_PREFERENCES,
  accountReducer,
  copyGuestPracticeToProfile,
  createInitialAccountState,
  getActiveProfile,
  getPreferences,
  loadAccountState,
  nextProfileId,
  normalizeAccountState,
  saveAccountState,
  validateProfile,
} from "./accountState.js";

const storage = () => {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
};
const createProfile = (state, name, email, timestamp = "2026-10-21T12:00:00.000Z") =>
  accountReducer(state, { type: "create", displayName: name, email, createdAt: timestamp });

test("guests get sensible default preferences", () => {
  const state = createInitialAccountState();
  assert.equal(getActiveProfile(state), null);
  assert.deepEqual(getPreferences(state), DEFAULT_PREFERENCES);
  assert.equal(nextProfileId(state), "account-1");
});

test("creating a local profile normalizes email, sets date, and never stores credentials", () => {
  const state = createProfile(createInitialAccountState(), "  Matt ", " MATT@Example.COM ");
  assert.deepEqual(state.profiles.map(({ id, displayName, email }) => ({ id, displayName, email })), [
    { id: "account-1", displayName: "Matt", email: "matt@example.com" },
  ]);
  assert.equal(getActiveProfile(state).createdAt, "2026-10-21T12:00:00.000Z");
  assert.equal(JSON.stringify(state).includes("password"), false);
  assert.equal(getPreferences(state).answerDifficulty, "book-chapter");
});

test("invalid and duplicate accounts are not added", () => {
  let state = createProfile(createInitialAccountState(), "Name", "one@example.com");
  assert.strictEqual(createProfile(state, "Other", "ONE@EXAMPLE.COM"), state);
  assert.strictEqual(createProfile(state, "", "new@example.com"), state);
  assert.strictEqual(createProfile(state, "Somebody", "not-an-email"), state);
  assert.ok(validateProfile("a".repeat(41), "a@example.com"));
  assert.ok(validateProfile("Valid", "bad.email"));
  assert.equal(state.profiles.length, 1);
});

test("sign out and sign in restore a profile without losing guest settings", () => {
  let state = accountReducer(createInitialAccountState(), { type: "update-preferences", changes: { answerDifficulty: "exact-verse" } });
  state = createProfile(state, "Matt", "matt@example.com");
  assert.equal(getPreferences(state).answerDifficulty, "exact-verse", "new accounts inherit guest choices");
  state = accountReducer(state, { type: "sign-out" });
  assert.equal(getActiveProfile(state), null);
  assert.equal(getPreferences(state).answerDifficulty, "exact-verse");
  state = accountReducer(state, { type: "sign-in", email: "  MATT@EXAMPLE.com  " });
  assert.equal(getActiveProfile(state).displayName, "Matt");
  assert.strictEqual(accountReducer(state, { type: "sign-in", email: "unknown@example.com" }), state);
});

test("profile preferences are independent of guest and other profiles", () => {
  let state = createProfile(createInitialAccountState(), "One", "one@example.com");
  state = accountReducer(state, { type: "update-preferences", changes: {
    answerDifficulty: "exact-verse", preferredVolume: "old-testament", practiceReminders: true,
  } });
  state = accountReducer(state, { type: "sign-out" });
  assert.equal(getPreferences(state).preferredVolume, "");
  state = createProfile(state, "Two", "two@example.com");
  assert.equal(getPreferences(state).answerDifficulty, "book-chapter");
  state = accountReducer(state, { type: "update-preferences", changes: { gameNotifications: false } });
  state = accountReducer(state, { type: "sign-in", email: "one@example.com" });
  assert.equal(getPreferences(state).preferredVolume, "old-testament");
  assert.equal(getPreferences(state).practiceReminders, true);
  assert.equal(getPreferences(state).gameNotifications, true);
  assert.equal(nextProfileId(state), "account-3");
});

test("only valid preferences survive malformed or tampered localStorage", () => {
  const raw = createProfile(createInitialAccountState(), "Matt", "matt@example.com");
  raw.profiles[0].preferences = {
    answerDifficulty: "unavailable", preferredVolume: "unknown", practiceReminders: "yes", gameNotifications: false,
  };
  const normalized = normalizeAccountState(raw);
  assert.deepEqual(getPreferences(normalized), { ...DEFAULT_PREFERENCES, gameNotifications: false });
  assert.deepEqual(normalizeAccountState({ profiles: [] }), createInitialAccountState());
  const corrupted = storage();
  corrupted.setItem(ACCOUNTS_STORAGE_KEY, "{not valid json");
  assert.deepEqual(loadAccountState(corrupted), createInitialAccountState());
});

test("account details, active login, and settings survive storage round trip", () => {
  const state = accountReducer(
    createProfile(createInitialAccountState(), "Matt", "matt@example.com"),
    { type: "update-preferences", changes: { preferredVolume: "new-testament", gameNotifications: false } },
  );
  const browserStorage = storage();
  assert.equal(saveAccountState(browserStorage, state), true);
  assert.deepEqual(loadAccountState(browserStorage), state);
});

test("migration copies existing Step 3 guest attempts to a new profile without deleting guest data", () => {
  const browserStorage = storage();
  const question = SAMPLE_QUESTIONS[0];
  const guestState = practiceReducer(createInitialPracticeState(), {
    type: "answer", attempt: gradeBookAndChapter(question, question.bookId, question.chapter),
  });
  savePracticeState(browserStorage, guestState);
  assert.equal(copyGuestPracticeToProfile(browserStorage, "account-1"), true);
  assert.equal(loadPracticeState(browserStorage, getPracticeStorageKey("account-1")).session.attempts.length, 1);
  assert.deepEqual(loadPracticeState(browserStorage), guestState);
  assert.equal(copyGuestPracticeToProfile(browserStorage, "account-1"), false, "never overwrite a saved profile");
});

test("practice slots for different profiles are independent", () => {
  const browserStorage = storage();
  const firstKey = getPracticeStorageKey("account-1");
  const secondKey = getPracticeStorageKey("account-2");
  savePracticeState(browserStorage, createInitialPracticeState(true), firstKey);
  savePracticeState(browserStorage, createInitialPracticeState(false), secondKey);
  assert.equal(loadPracticeState(browserStorage, firstKey).session.exactVerse, true);
  assert.equal(loadPracticeState(browserStorage, secondKey).session.exactVerse, false);
  assert.notEqual(firstKey, secondKey);
  assert.notEqual(firstKey, getPracticeStorageKey(null));
});

test("blocked storage does not break local account actions", () => {
  const blocked = { getItem: () => { throw Error("blocked"); }, setItem: () => { throw Error("blocked"); } };
  assert.deepEqual(loadAccountState(blocked), createInitialAccountState());
  assert.equal(saveAccountState(blocked, createInitialAccountState()), false);
  assert.equal(copyGuestPracticeToProfile(blocked, "account-1"), false);
});
