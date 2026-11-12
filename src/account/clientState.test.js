import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CORPUS_GUEST_KEY, corpusKey } from '../play/corpusState.js';
import {
  CLIENT_SETTINGS_KEY, SERVER_USER_ID_PATTERN, acceptServerPreferences, confirmServerPreferences,
  ensureUserPreferences, getClientPreferences, initialClientSettings, loadClientSettings,
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
test('verified users have independent, new-corpus-only practice keys', () => {
  assert.equal(SERVER_USER_ID_PATTERN.test(uuid), true);
  assert.notEqual(corpusKey(uuid), CORPUS_GUEST_KEY);
  assert.notEqual(corpusKey(uuid), corpusKey(otherId));
  assert.equal(corpusKey(null), CORPUS_GUEST_KEY);
});

test('old browser-only profiles are not consulted or copied into new settings', () => {
  const store = storage();
  store.setItem('scripture-baseball.accounts.v1', JSON.stringify({
    version: 1, activeProfileId: 'account-1', profiles: [{ id: 'account-1', email: 'old@example.com' }],
  }));
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
    answerDifficulty: 'book-chapter', preferredVolume: 'ot',
  });
  assert.equal(getClientPreferences(updated, null).answerDifficulty, 'exact-verse');
  assert.equal(getClientPreferences(updated, user.id).preferredVolume, 'ot');
  assert.equal(getClientPreferences(updated, otherId).preferredVolume, '');
  assert.strictEqual(updateClientPreferences(updated, user.id, { preferredVolume: 'ot' }), updated);
  assert.ok(!JSON.stringify(updated).includes('token'));
  assert.ok(!JSON.stringify(updated).includes('password'));
});

test('server-verified account inherits guest preferences without browser-only identity lookup', () => {
  const store = storage();
  store.setItem('scripture-baseball.accounts.v1', '{not a valid account object}');
  const guest = updateClientPreferences(initialClientSettings(), null, { answerDifficulty: 'exact-verse' });
  const next = ensureUserPreferences(guest, user, store);
  assert.equal(getClientPreferences(next, user.id).answerDifficulty, 'exact-verse');
  assert.strictEqual(ensureUserPreferences(next, user, store), next);
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
  state = updateClientPreferences(state, uuid, { preferredVolume: 'nt' });
  assert.strictEqual(confirmServerPreferences(state, uuid, pending, pending), state,
    'an earlier request must not clear a newer edit');
  const final = state.pendingByUser[uuid];
  state = confirmServerPreferences(state, uuid, final, final);
  assert.equal(state.pendingByUser[uuid], undefined);
  state = acceptServerPreferences(state, uuid, { ...final, preferredVolume: 'ot' });
  assert.equal(state.byUser[uuid].preferredVolume, 'ot');
  assert.equal(state.guestPreferences.preferredVolume, '');
});

test('malformed pending preference IDs are ignored without leaking across accounts', () => {
  const state = normalizeClientSettings({ version: 1, pendingByUser: {
    'not-a-user': { answerDifficulty: 'exact-verse' }, [uuid]: { preferredVolume: 'ot' },
  } });
  assert.deepEqual(Object.keys(state.pendingByUser), [uuid]);
  assert.equal(state.pendingByUser[uuid].preferredVolume, 'ot');
});
