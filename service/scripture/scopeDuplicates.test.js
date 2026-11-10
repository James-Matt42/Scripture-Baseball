import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePassageText, partitionScopedPassages } from './scopeDuplicates.js';

const candidates = [
  { volume: 'ot', book: 'isa', chapter: 53, verse: 5, text: ' A familiar repeated verse! ' },
  { volume: 'bom', book: '2-ne', chapter: 9, verse: 4, text: 'A familiar repeated verse.' },
  { volume: 'nt', book: 'matt', chapter: 6, verse: 10, text: 'Another repeated passage.' },
  { volume: 'bom', book: '3-ne', chapter: 13, verse: 10, text: 'Another repeated passage!' },
  { volume: 'bom', book: 'alma', chapter: 5, verse: 4, text: 'A unique verse.' },
];

test('normalization ignores punctuation, case, and whitespace without editing source', () => {
  assert.equal(normalizePassageText('  Joy—PEACE; and  HOPE! '), 'joy peace and hope');
  assert.equal(normalizePassageText(null), '');
});

test('cross-volume repeats remain eligible in a Book of Mormon-only round', () => {
  const result = partitionScopedPassages(candidates, { volume: 'bom' });
  assert.equal(result.ambiguous.length, 0);
  assert.deepEqual(result.eligible.map((item) => item.book), ['2-ne', '3-ne', 'alma']);
});

test('cross-volume repeats are excluded when both source references are in scope', () => {
  const result = partitionScopedPassages(candidates);
  assert.equal(result.ambiguous.length, 4);
  assert.deepEqual(result.eligible.map((item) => item.book), ['alma']);
});

test('within-book repeated words are ambiguous for chapter but not book-only grading', () => {
  const rows = [
    { volume: 'bom', book: 'alma', chapter: 1, verse: 1, text: 'Repeated text' },
    { volume: 'bom', book: 'alma', chapter: 2, verse: 5, text: 'Repeated text!' },
  ];
  assert.equal(partitionScopedPassages(rows, { volume: 'bom', book: 'alma', testedStages: ['chapter'] }).ambiguous.length, 2);
  const bookOnly = partitionScopedPassages(rows, { volume: 'bom', testedStages: ['book'] });
  assert.equal(bookOnly.eligible.length, 1);
  assert.equal(bookOnly.repeatedSameAnswer.length, 1);
});

test('verse-stage grading distinguishes repeated text in the same chapter', () => {
  const rows = [
    { volume: 'bom', book: 'alma', chapter: 1, verse: 2, text: 'Repeated text' },
    { volume: 'bom', book: 'alma', chapter: 1, verse: 3, text: 'Repeated text' },
  ];
  assert.equal(partitionScopedPassages(rows, { testedStages: ['book', 'chapter'] }).ambiguous.length, 0);
  assert.equal(partitionScopedPassages(rows, { testedStages: ['book', 'chapter', 'verse'] }).ambiguous.length, 2);
});

test('invalid scopes and stages are rejected', () => {
  assert.throws(() => partitionScopedPassages(candidates, { book: 'alma' }), /volume/);
  assert.throws(() => partitionScopedPassages(candidates, { testedStages: ['questionId'] }), /valid/);
});
