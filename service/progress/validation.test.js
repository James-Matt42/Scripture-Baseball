import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_PREFERENCES, ProgressError, validatePreferencesPatch } from './validation.js';

test('preferences use canonical volume slugs from the SQLite corpus', () => {
  assert.equal(DEFAULT_PREFERENCES.preferredVolume, '');
  for (const preferredVolume of ['', 'ot', 'nt', 'bom', 'dc', 'pgp']) {
    assert.deepEqual(validatePreferencesPatch({ preferredVolume }), { preferredVolume });
  }
  for (const value of [null, [], { preferredVolume: 'book-of-mormon' },
    { answerDifficulty: 'expert' }, { practiceReminders: 'yes' }, { role: 'admin' }]) {
    assert.throws(() => validatePreferencesPatch(value), ProgressError);
  }
  assert.deepEqual(validatePreferencesPatch({ answerDifficulty: 'exact-verse' }),
    { answerDifficulty: 'exact-verse' });
});
