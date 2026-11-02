import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInitialPracticeState, practiceReducer } from './practiceState.js';
import { getQuestionById, gradeBookAndChapter } from '../scripture/questions.js';
import {
  ACCOUNT_IMPORT_PREFIX, DEVICE_ID_KEY, clearPendingFavorites, combineAttemptHistory, deviceId,
  finishInitialImport, getOrCreateImport, localAttemptRecords, pendingFavorites, setPendingFavorites,
  unsyncedAttempts,
} from './accountSync.js';

const uuid = '4b5a9f7c-7b2b-4a71-8b24-118c885245e7';
const user = 'b06c7540-1e57-4d0e-91d7-6c4f0f79721f';
function store() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}
function practiceWithAnswer() {
  const question = getQuestionById('2-nephi-2-25');
  return practiceReducer(createInitialPracticeState(), {
    type: 'answer', attempt: gradeBookAndChapter(question, question.bookId, question.chapter),
  });
}

test('device identity is stable across refreshes, scoped away from authentication tokens', () => {
  const storage = store();
  assert.equal(deviceId(storage, () => uuid), uuid);
  assert.equal(storage.getItem(DEVICE_ID_KEY), uuid);
  assert.equal(deviceId(storage, () => { throw Error('should not run'); }), uuid);
});

test('local saved answers get stable, scoped IDs and survive repeat-safe uploads', () => {
  const practice = practiceWithAnswer();
  const first = localAttemptRecords(practice, 'practice.user-one', uuid);
  assert.equal(first.length, 1);
  assert.equal(first[0].id, localAttemptRecords(practice, 'practice.user-one', uuid)[0].id);
  assert.notEqual(first[0].id, localAttemptRecords(practice, 'practice.user-two', uuid)[0].id);
  assert.notEqual(first[0].id, localAttemptRecords(practice, 'practice.user-one', user)[0].id);
  assert.equal(first[0].bookId, '2-nephi');
  assert.equal(first[0].chapter, 2);
  assert.equal(Object.hasOwn(first[0], 'bookCorrect'), false);
  assert.equal(unsyncedAttempts([], first).length, 1);
  assert.deepEqual(unsyncedAttempts([{ id: first[0].id }], first), []);
});

test('a failed import retries the exact same snapshot and does not skip acknowledged batches', async () => {
  const storage = store();
  const records = Array.from({ length: 207 }, (_, i) => ({
    id: `local.${i}`, questionId: 'john-3-16', bookId: 'john', chapter: 3,
  }));
  const preferences = { answerDifficulty: 'exact-verse' };
  const snapshot = getOrCreateImport(storage, user, records, ['john-3-16'], preferences, () => uuid);
  assert.equal(snapshot.batches.length, 2);
  assert.equal(snapshot.batches[0].attempts.length, 200);
  assert.equal(snapshot.batches[1].attempts.length, 7);
  let calls = [];
  await assert.rejects(finishInitialImport(storage, user, snapshot, async (batch) => {
    calls.push(batch.importId);
    if (calls.length === 2) throw Error('offline');
  }), /offline/);
  assert.equal(snapshot.completed, 1);
  const changedPractice = [{ id: 'new', questionId: 'john-3-16' }];
  const retry = getOrCreateImport(storage, user, changedPractice, [], {}, () => { throw Error('should reuse snapshot'); });
  assert.equal(retry.completed, 1);
  assert.equal(retry.batches[1].attempts.length, 7);
  await finishInitialImport(storage, user, retry, async (batch) => { calls.push(batch.importId); });
  assert.equal(calls.length, 3);
  assert.equal(calls[1], calls[2]);
  assert.equal(JSON.parse(storage.getItem(`${ACCOUNT_IMPORT_PREFIX}${user}`)).completed, 2);
  assert.deepEqual(getOrCreateImport(storage, user, [], [], {}, () => uuid).batches, snapshot.batches);
});

test('server attempts from other devices merge with local pending attempts, without duplicate grades', () => {
  const practice = practiceWithAnswer();
  const records = localAttemptRecords(practice, 'practice.user-one', uuid);
  const remote = { ...records[0], bookCorrect: true, chapterCorrect: true, answeredAt: '2026-11-05T10:00:00.000Z' };
  const other = { id: 'other-device-answer', questionId: 'john-3-16', bookCorrect: false, chapterCorrect: true,
    answeredAt: '2026-11-05T09:00:00.000Z' };
  const merged = combineAttemptHistory([remote, other], records, practice);
  assert.equal(merged.length, 2);
  assert.deepEqual(new Set(merged.map((attempt) => attempt.id)), new Set([remote.id, other.id]));
  assert.ok(merged.find((attempt) => attempt.id === remote.id).bookCorrect);
  const beforeUpload = combineAttemptHistory([other], records, practice);
  assert.equal(beforeUpload.length, 2);
  assert.equal(beforeUpload.find((attempt) => attempt.id === records[0].id).bookCorrect, true);
});

test('failed favorite replacements preserve the latest local list through refresh', () => {
  const storage = store();
  setPendingFavorites(storage, user, ['john-3-16']);
  assert.deepEqual(pendingFavorites(storage, user), ['john-3-16']);
  setPendingFavorites(storage, user, []);
  clearPendingFavorites(storage, user, ['john-3-16']);
  assert.deepEqual(pendingFavorites(storage, user), [], 'old acknowledgements must not discard newer unfavorite edits');
  clearPendingFavorites(storage, user, []);
  assert.equal(pendingFavorites(storage, user), null);
});

test('remote history is chronological even if a locally cached pitch is older', () => {
  const practice = practiceWithAnswer();
  const [local] = localAttemptRecords(practice, 'key', uuid);
  const first = { ...local, bookCorrect: true, chapterCorrect: true,
    answeredAt: '2026-11-02T09:00:00.000Z' };
  const later = { id: 'from-another-device', questionId: local.questionId, bookCorrect: false,
    chapterCorrect: true, answeredAt: '2026-11-05T12:00:00.000Z' };
  const combined = combineAttemptHistory([later, first], [local], practice);
  assert.deepEqual(combined.map((attempt) => attempt.id), [first.id, later.id]);
});
