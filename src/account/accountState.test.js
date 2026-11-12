import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_PREFERENCES, VOLUME_OPTIONS, normalizePreferences } from './accountState.js';

test('local preferences match the canonical scripture volume IDs', () => {
  assert.deepEqual(VOLUME_OPTIONS.map(({ value }) => value), ['', 'ot', 'nt', 'bom', 'dc', 'pgp']);
  assert.equal(normalizePreferences({ preferredVolume: 'bom' }).preferredVolume, 'bom');
  assert.equal(normalizePreferences({ preferredVolume: 'book-of-mormon' }).preferredVolume, '');
  assert.equal(normalizePreferences({ answerDifficulty: 'exact-verse' }).answerDifficulty, 'exact-verse');
  assert.deepEqual(normalizePreferences(undefined), DEFAULT_PREFERENCES);
});
