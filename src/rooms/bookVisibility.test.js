import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startBookWhenVisible } from './bookVisibility.js';

function observerHarness() {
  const calls = { start: 0, disconnect: 0, observe: 0, observeElement: null };
  let callback;
  class Observer {
    constructor(fn) { callback = fn; }
    observe(el) { calls.observe++; calls.observeElement = el; }
    disconnect() { calls.disconnect++; }
  }
  let time = 0;
  let playing = false;
  const playback = {
    getTime: () => time,
    isPlaying: () => playing,
    replay: () => { calls.start++; playing = true; },
    seek: (t) => { time = t; playing = false; },
  };
  return { Observer, playback, calls, fire: (ratio) => callback([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]) };
}

test('opening starts when 5% of the frame becomes visible, not 20%', () => {
  const h = observerHarness();
  const target = {};
  const disconnect = startBookWhenVisible(target, h.playback, { Observer: h.Observer });
  assert.equal(h.calls.observeElement, target);
  h.fire(0);
  h.fire(.03);
  assert.equal(h.calls.start, 0);
  // At full browser zoom, only 12.9% may be visible; shrinking the page
  // to 90% can increase this beyond the old 20% minimum. Both should start.
  h.fire(.129);
  h.fire(.305);
  assert.equal(h.calls.start, 1);
  assert.equal(h.calls.disconnect, 1);
  disconnect();
});

test('a skipped or already-running book must not unexpectedly replay', () => {
  const h = observerHarness();
  const disconnect = startBookWhenVisible({}, h.playback, { Observer: h.Observer });
  h.playback.seek(5.85);
  h.fire(.5);
  assert.equal(h.calls.start, 0);
  disconnect();
});

test('fallback starts without IntersectionObserver and cleanup prevents future callbacks', () => {
  const h = observerHarness();
  const disconnect = startBookWhenVisible({}, h.playback, { Observer: null });
  assert.equal(h.calls.start, 1);
  disconnect();
  const other = observerHarness();
  const stop = startBookWhenVisible({}, other.playback, { Observer: other.Observer });
  stop();
  other.fire(.7);
  assert.equal(other.calls.start, 0);
});
