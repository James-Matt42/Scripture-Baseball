import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeMongoProgressDatabase } from './fakeMongoProgressDatabase.testSupport.js';
import { createMongoProgressStore } from './mongoProgressStore.js';
import { createInMemoryProgressStore } from './progressStore.js';
import { verifiedAttemptFromPitch } from './verifiedAttempt.js';

const token = 'a'.repeat(43);
const completed = {
  reference: 'bom:2-ne:9:1', volume: 'bom', book: '2-ne', chapter: 9, verse: 1,
  scope: { volume: 'bom', book: '2-ne' }, chosenChapter: 9, chapterCorrect: true,
};
const attempt = verifiedAttemptFromPitch(token, completed, () => Date.UTC(2026, 10, 11));

test('a server-issued completed result contains the verified reference and no invented book grade', () => {
  assert.equal(attempt.id, token);
  assert.equal(attempt.reference, 'bom:2-ne:9:1');
  assert.equal(attempt.bookCorrect, undefined);
  assert.equal(attempt.chapterCorrect, true);
  assert.equal(attempt.source, 'verified-pitch');
  assert.throws(() => verifiedAttemptFromPitch(token, { ...completed, reference: 'bom:alma:9:1' }), /not valid/);
  assert.throws(() => verifiedAttemptFromPitch(token, { ...completed, chapterCorrect: 'yes' }), /not valid/);
});

test('Mongo guest claims persist across adapters and cannot be claimed by a second account', async () => {
  const db = fakeMongoProgressDatabase();
  const first = createMongoProgressStore(db);
  await first.stageGuestPitch(token, attempt);
  await first.stageGuestPitch(token, attempt);
  assert.equal(db.rows.guestPitches.size, 1);
  const second = createMongoProgressStore(db);
  assert.equal((await second.claimGuestPitch('user-1', token)).created, true);
  assert.equal((await second.claimGuestPitch('user-1', token)).created, false);
  await assert.rejects(second.claimGuestPitch('user-2', token), (error) => error.status === 404);
  const after = await second.attempts('user-1');
  assert.equal(after.length, 1);
  assert.equal(after[0].reference, attempt.reference);
});

test('Mongo guest receipt expires and an insert failure does not falsely acknowledge it', async () => {
  let now = Date.UTC(2026, 10, 11);
  const db = fakeMongoProgressDatabase();
  const store = createMongoProgressStore(db, { now: () => now });
  db.failInsertOnce(new Error('storage offline'), 'guestPitches');
  await assert.rejects(store.stageGuestPitch(token, attempt), /storage offline/);
  assert.equal(db.rows.guestPitches.size, 0);
  await store.stageGuestPitch(token, attempt);
  now += 30 * 24 * 3600_000;
  await assert.rejects(store.claimGuestPitch('user-1', token), (error) => error.status === 404);
});

test('in-memory guest claims use the same idempotency and user-isolation contract', () => {
  const store = createInMemoryProgressStore();
  store.stageGuestPitch(token, attempt);
  assert.equal(store.claimGuestPitch('user-1', token).created, true);
  assert.equal(store.claimGuestPitch('user-1', token).created, false);
  assert.throws(() => store.claimGuestPitch('user-2', token), (error) => error.status === 404);
});
