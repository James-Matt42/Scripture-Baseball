import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOOK_DURATION, BOOK_LEAVES, BOOK_SEGMENTS, buildBookTurns } from './bookMotion.js';

test('the original V6 curved-sheet geometry is preserved', () => {
  assert.equal(BOOK_LEAVES, 42);
  assert.equal(BOOK_SEGMENTS, 12);
  assert.equal(BOOK_LEAVES * BOOK_SEGMENTS, 504);
});

test('the V6 page-turn timing is preserved without replacing pages with a short flat sequence', () => {
  const turns = buildBookTurns();
  assert.equal(turns.length, 42);
  assert.equal(turns[0].start, 1.04);
  assert.ok(Math.abs(turns[0].end - 1.24) < 1e-10);
  assert.ok(Math.abs(turns.at(-1).end - 4.390198716629499) < 1e-9);
  assert.equal(BOOK_DURATION, 5.85);
  assert.ok(turns.at(-1).end < BOOK_DURATION);
});

test('turns continue to overlap, but slow down toward the last page', () => {
  const turns = buildBookTurns();
  assert.ok(turns.every((t) => t.end > t.start));
  for (let i = 1; i < turns.length; i += 1) {
    assert.ok(turns[i].start > turns[i - 1].start);
    assert.ok(turns[i].start < turns[i - 1].end);
  }
  assert.ok(turns[1].start - turns[0].start < turns.at(-1).start - turns.at(-2).start);
  assert.ok(turns.at(-1).end - turns.at(-1).start > turns[0].end - turns[0].start);
});
