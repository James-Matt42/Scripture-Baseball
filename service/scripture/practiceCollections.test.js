import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectionCandidates, validateCollection, validateGuestSelection } from './practiceCollections.js';

const eligible = [
  { reference: 'bom:2-ne:9:1', volume: 'bom', book: '2-ne' },
  { reference: 'bom:alma:1:3', volume: 'bom', book: 'alma' },
  { reference: 'ot:isa:53:1', volume: 'ot', book: 'isa' },
];
const attempts = [
  { reference: 'bom:2-ne:9:1', chapterCorrect: false },
  { reference: 'bom:alma:1:3', chapterCorrect: true },
  { reference: 'ot:isa:53:1', chapterCorrect: true },
];

test('personal collections select only from an already scope-checked eligible pool', () => {
  assert.deepEqual(collectionCandidates(eligible, 'misses', { attempts }).map((item) => item.reference),
    ['bom:2-ne:9:1']);
  assert.deepEqual(collectionCandidates(eligible, 'favorites', { favorites: ['bom:alma:1:3',
    'dc:od:1:1032101'] }).map((item) => item.reference), ['bom:alma:1:3']);
  assert.deepEqual(collectionCandidates(eligible, 'weak-areas', { attempts }).map((item) => item.book),
    ['2-ne']);
  assert.deepEqual(collectionCandidates(eligible.slice(1), 'misses', { attempts }), []);
  assert.deepEqual(collectionCandidates(eligible, 'all', {}), eligible);
});

test('weak area chooses books with demonstrated misses, not invented popularity categories', () => {
  const history = [
    ...Array.from({ length: 2 }, () => ({ reference: 'bom:alma:1:3', chapterCorrect: false })),
    ...Array.from({ length: 3 }, () => ({ reference: 'bom:2-ne:9:1', chapterCorrect: true })),
  ];
  assert.deepEqual(collectionCandidates(eligible, 'weak-areas', { attempts: history }).map((item) => item.book),
    ['alma']);
});

test('guest selection input is bounded, and only affects selection, never recorded grades', () => {
  const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
  assert.equal(validateCollection('misses', fail), 'misses');
  assert.equal(validateCollection(undefined, fail), 'all');
  assert.throws(() => validateCollection('fake-theme', fail), { status: 400 });
  const guest = { attempts: [{ reference: 'bom:2-ne:9:1', chapterCorrect: false }],
    favorites: ['bom:2-ne:9:1'] };
  assert.deepEqual(validateGuestSelection(guest, fail), guest);
  for (const bad of [null, { attempts: [{}] }, { attempts: [{ ...guest.attempts[0], score: 100 }] },
    { favorites: ['not-a-reference'] }, { favorites: Array(101).fill('bom:2-ne:9:1') }]) {
    assert.throws(() => validateGuestSelection(bad, fail), { status: 400 });
  }
});
