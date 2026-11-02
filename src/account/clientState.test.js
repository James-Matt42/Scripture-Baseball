import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SAMPLE_QUESTIONS, gradeBookAndChapter } from '../scripture/questions.js';
import {
  createInitialPracticeState, getPracticeStorageKey, loadPracticeState, practiceReducer, savePracticeState,
} from '../play/practiceState.js';
import { ACCOUNTS_STORAGE_KEY, accountReducer, createInitialAccountState, saveAccountState } from './accountState.js';
import {
  CLIENT_SETTINGS_KEY, SERVER_USER_ID_PATTERN, acceptServerPreferences, confirmServerPreferences, copyLocalPracticeOnRegistration,
  ensureUserPreferences, getMatchingLegacyProfile, getClientPreferences, initialClientSettings, loadClientSettings,
  normalizeClientSettings, saveClientSettings, updateClientPreferences,
} from './clientState.js';

const uuid = '4b5a9f7c-7b2b-4a71-8b24-118c885245e7';
const otherId = 'b06c7540-1e57-4d0e-91d7-6c4f0f79721f';
const user = { id: uuid, email: 'casey@example.com', displayName: 'Casey' };

function storage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}
function guestWithAnswer() {
  const question = SAMPLE_QUESTIONS[0];
  return practiceReducer(createInitialPracticeState(), {
    type: 'answer', attempt: gradeBookAndChapter(question, question.bookId, question.chapter),
  });
}

test('authenticated identities use distinct practice keys without touching the guest key', () => {
  assert.equal(SERVER_USER_ID_PATTERN.test(uuid), true);
  assert.equal(getPracticeStorageKey(uuid), `scripture-baseball.practice.v1.user-${uuid}`);
  assert.notEqual(getPracticeStorageKey(uuid), getPracticeStorageKey(otherId));
  assert.notEqual(getPracticeStorageKey(uuid), getPracticeStorageKey(null));
  assert.equal(getPracticeStorageKey('bad-identifier'), getPracticeStorageKey(null));
});

test('old browser-only profiles cannot restore authentication in new settings', () => {
  const store = storage();
  const legacy = accountReducer(createInitialAccountState(), {
    type: 'create', displayName: 'Casey', email: 'casey@example.com', createdAt: '2026-11-05T00:00:00Z',
  });
  assert.equal(saveAccountState(store, legacy), true);
  assert.ok(store.getItem(ACCOUNTS_STORAGE_KEY));
  const prefs = loadClientSettings(store);
  assert.deepEqual(Object.keys(prefs), ['version', 'guestPreferences', 'byUser', 'pendingByUser']);
  assert.deepEqual(prefs.byUser, {});
  assert.equal(JSON.stringify(prefs).includes('activeProfileId'), false);
  assert.equal(saveClientSettings(store, prefs), true);
  assert.ok(store.getItem(CLIENT_SETTINGS_KEY));
  assert.deepEqual(loadClientSettings(store), prefs);
});

test('preferences stay locally scoped by verified user ID; never store passwords or sessions', () => {
  const guest = updateClientPreferences(initialClientSettings(), null, { answerDifficulty: 'exact-verse' });
  const forUser = ensureUserPreferences(guest, user, storage());
  assert.equal(getClientPreferences(forUser, user.id).answerDifficulty, 'exact-verse');
  const updated = updateClientPreferences(forUser, user.id, {
    answerDifficulty: 'book-chapter', preferredVolume: 'old-testament',
  });
  assert.equal(getClientPreferences(updated, null).answerDifficulty, 'exact-verse');
  assert.equal(getClientPreferences(updated, user.id).preferredVolume, 'old-testament');
  assert.equal(getClientPreferences(updated, otherId).preferredVolume, '');
  assert.strictEqual(updateClientPreferences(updated, user.id, { preferredVolume: 'old-testament' }), updated);
  assert.ok(!JSON.stringify(updated).includes('token'));
  assert.ok(!JSON.stringify(updated).includes('password'));
});

test('matching legacy profile preferences are carried forward only after a verified login', () => {
  const store = storage();
  let legacy = accountReducer(createInitialAccountState(), {
    type: 'create', displayName: 'Casey', email: 'CASEY@EXAMPLE.COM', createdAt: '2026-11-05T00:00:00Z',
  });
  legacy = accountReducer(legacy, { type: 'update-preferences', changes: { preferredVolume: 'new-testament' } });
  saveAccountState(store, legacy);
  const next = ensureUserPreferences(initialClientSettings(), user, store);
  assert.equal(getClientPreferences(next, user.id).preferredVolume, 'new-testament');
  assert.strictEqual(ensureUserPreferences(next, user, store), next);
});

test('new account adopts guest attempts locally without deleting or overwriting originals', () => {
  const store = storage();
  const guestPractice = guestWithAnswer();
  assert.equal(savePracticeState(store, guestPractice), true);
  assert.equal(copyLocalPracticeOnRegistration(store, user), true);
  assert.equal(loadPracticeState(store, getPracticeStorageKey(uuid)).session.attempts.length, 1);
  assert.deepEqual(loadPracticeState(store), guestPractice);
  assert.equal(copyLocalPracticeOnRegistration(store, user), false);
});

test('matching legacy profile history is chosen over unrelated guest history', () => {
  const store = storage();
  const legacy = accountReducer(createInitialAccountState(), {
    type: 'create', displayName: 'Casey', email: 'casey@example.com', createdAt: '2026-11-05T00:00:00Z',
  });
  saveAccountState(store, legacy);
  savePracticeState(store, createInitialPracticeState());
  const oldPractice = guestWithAnswer();
  savePracticeState(store, oldPractice, getPracticeStorageKey('account-1'));
  assert.equal(copyLocalPracticeOnRegistration(store, user), true);
  assert.deepEqual(loadPracticeState(store, getPracticeStorageKey(uuid)), oldPractice);
});

test('empty, invalid, or tampered preference storage fails safely', () => {
  assert.deepEqual(normalizeClientSettings({ version: 50 }), initialClientSettings());
  const stored = normalizeClientSettings({ version: 1, guestPreferences: {
    answerDifficulty: 'wrong', gameNotifications: false,
  }, byUser: { unknown: { practiceReminders: true }, [uuid]: { practiceReminders: true } } });
  assert.deepEqual(Object.keys(stored.byUser), [uuid]);
  assert.equal(stored.guestPreferences.gameNotifications, false);
  assert.equal(stored.byUser[uuid].practiceReminders, true);
  const store = storage();
  store.setItem(CLIENT_SETTINGS_KEY, '{invalid json');
  assert.deepEqual(loadClientSettings(store), initialClientSettings());
  assert.equal(copyLocalPracticeOnRegistration(store, { id: 'not-a-uuid', email: user.email }), false);
  assert.equal(copyLocalPracticeOnRegistration(store, user), false);
});

test('legacy account matching requires a validated server ID and an exact normalized email', () => {
  const store = storage();
  const legacy = accountReducer(createInitialAccountState(), {
    type: 'create', displayName: 'Casey', email: 'CASEY@example.com', createdAt: '2026-11-05T00:00:00Z',
  });
  saveAccountState(store, legacy);
  assert.equal(getMatchingLegacyProfile(store, user).id, 'account-1');
  assert.equal(getMatchingLegacyProfile(store, { ...user, id: 'fake-id' }), null);
  assert.equal(getMatchingLegacyProfile(store, { ...user, email: 'other@example.com' }), null);
});

test('unsent signed-in preference edits survive reloads and supersede stale server settings', () => {
  const store = storage();
  let state = ensureUserPreferences(initialClientSettings(), user, store);
  state = updateClientPreferences(state, uuid, { answerDifficulty: 'exact-verse' });
  const pending = state.pendingByUser[uuid];
  assert.equal(pending.answerDifficulty, 'exact-verse');
  assert.equal(saveClientSettings(store, state), true);
  state = loadClientSettings(store);
  assert.strictEqual(acceptServerPreferences(state, uuid, { answerDifficulty: 'book-chapter' }), state);
  state = updateClientPreferences(state, uuid, { preferredVolume: 'new-testament' });
  assert.strictEqual(confirmServerPreferences(state, uuid, pending, pending), state,
    'an earlier request must not clear a newer edit');
  const final = state.pendingByUser[uuid];
  state = confirmServerPreferences(state, uuid, final, final);
  assert.equal(state.pendingByUser[uuid], undefined);
  state = acceptServerPreferences(state, uuid, { ...final, preferredVolume: 'old-testament' });
  assert.equal(state.byUser[uuid].preferredVolume, 'old-testament');
  assert.equal(state.guestPreferences.preferredVolume, '');
});

test('malformed pending preference IDs are ignored without leaking across accounts', () => {
  const state = normalizeClientSettings({ version: 1, pendingByUser: {
    'not-a-user': { answerDifficulty: 'exact-verse' }, [uuid]: { preferredVolume: 'old-testament' },
  } });
  assert.deepEqual(Object.keys(state.pendingByUser), [uuid]);
  assert.equal(state.pendingByUser[uuid].preferredVolume, 'old-testament');
});
