import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMongoProgressStore } from './mongoProgressStore.js';
import { fakeMongoProgressDatabase } from './fakeMongoProgressDatabase.testSupport.js';
import { verifiedAttemptFromPitch } from './verifiedAttempt.js';

const verified = (id = 'a'.repeat(43)) => verifiedAttemptFromPitch(id, {
  reference: 'bom:2-ne:9:1', volume: 'bom', book: '2-ne', chapter: 9, verse: 1,
  scope: { volume: 'bom', book: '2-ne' }, chosenChapter: 9, chapterCorrect: true,
});

test('MongoDB stores server-verified attempts without exposing userId in history', async () => {
  const db = fakeMongoProgressDatabase();
  const store = createMongoProgressStore(db);
  assert.equal((await store.recordVerifiedAttempt('alice', verified())).created, true);
  const saved = await store.attempts('alice');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].reference, 'bom:2-ne:9:1');
  assert.equal(saved[0].userId, undefined);
  assert.equal(saved[0].bookCorrect, undefined);
  assert.deepEqual(await store.attempts('bob'), []);
  assert.equal((await store.summary('alice')).uniquePassages, 1);
});

test('attempt IDs are idempotent after reopening the adapter, and changed results conflict', async () => {
  const db = fakeMongoProgressDatabase();
  const first = createMongoProgressStore(db);
  const reopened = createMongoProgressStore(db);
  await first.recordVerifiedAttempt('alice', verified());
  assert.equal((await reopened.recordVerifiedAttempt('alice', verified())).created, false);
  await assert.rejects(reopened.recordVerifiedAttempt('alice', { ...verified(), chapterCorrect: false }),
    { status: 409 });
  assert.equal((await reopened.attempts('alice')).length, 1);
});

test('MongoDB favorites and preferences persist independently per user', async () => {
  const db = fakeMongoProgressDatabase();
  const store = createMongoProgressStore(db);
  await store.setFavorites('alice', ['bom:2-ne:9:1']);
  await store.setPreferences('alice', { preferredVolume: 'bom', practiceReminders: true });
  const reopened = createMongoProgressStore(db);
  assert.deepEqual(await reopened.favorites('alice'), ['bom:2-ne:9:1']);
  assert.equal((await reopened.preferences('alice')).preferredVolume, 'bom');
  assert.deepEqual(await reopened.favorites('bob'), []);
  assert.equal((await reopened.preferences('bob')).preferredVolume, '');
});

test('MongoDB read/write failures propagate instead of claiming success', async () => {
  const db = fakeMongoProgressDatabase();
  const store = createMongoProgressStore(db);
  db.failInsertOnce(new Error('temporary outage'));
  await assert.rejects(store.recordVerifiedAttempt('alice', verified()), /temporary outage/);
  assert.deepEqual(await store.attempts('alice'), []);
  db.failReads(new Error('temporary read outage'));
  await assert.rejects(store.attempts('alice'), /temporary read outage/);
});
