import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBookPlayback, MAX_FRAME_ADVANCE } from './bookPlayback.js';

function harness(reducedMotion = false) {
  let clock = 0;
  let next = 0;
  const pending = new Map();
  const draws = [];
  const changes = [];
  const playback = createBookPlayback({
    duration: 5.85,
    renderAt: (time) => draws.push(time),
    onChange: (state) => changes.push(state),
    prefersReducedMotion: () => reducedMotion,
    now: () => clock,
    requestFrame: (fn) => {
      const id = ++next;
      pending.set(id, fn);
      return id;
    },
    cancelFrame: (id) => pending.delete(id),
  });
  const tick = (ms) => {
    clock += ms;
    const frames = [...pending.values()];
    pending.clear();
    for (const frame of frames) frame(clock);
  };
  return { playback, draws, changes, pending, tick };
}

test('replay while playing cancels the old frame and starts at zero', () => {
  const h = harness();
  h.playback.replay();
  h.tick(400);
  assert.equal(h.playback.getTime(), MAX_FRAME_ADVANCE);
  h.playback.replay();
  h.playback.replay();
  assert.equal(h.playback.getTime(), 0);
  assert.equal(h.pending.size, 1);
  h.tick(200);
  assert.equal(h.playback.getTime(), MAX_FRAME_ADVANCE);
  assert.equal(h.pending.size, 1);
});

test('pause and resume preserve progress without duplicate frames', () => {
  const h = harness();
  h.playback.replay();
  h.tick(750);
  h.playback.pause();
  assert.equal(h.pending.size, 0);
  h.tick(3500);
  assert.equal(h.playback.getTime(), MAX_FRAME_ADVANCE);
  h.playback.play();
  h.tick(250);
  assert.equal(h.playback.getTime(), MAX_FRAME_ADVANCE * 2);
  assert.equal(h.pending.size, 1);
});

test('late frames never jump over the entire 42-leaf page-turn sequence', () => {
  const h = harness();
  h.playback.replay();
  h.tick(7000);
  // Previously a single delayed frame jumped from closed to finished,
  // so none of the paper turns was ever rendered at full browser zoom.
  assert.equal(h.playback.getTime(), MAX_FRAME_ADVANCE);
  assert.equal(h.playback.isPlaying(), true);
  assert.equal(h.pending.size, 1);
  for (let i = 0; i < 11; i += 1) h.tick(1000);
  assert.ok(h.playback.getTime() > 1.04); // first leaf has begun turning
  assert.ok(h.playback.getTime() < 4.39); // subsequent turns still visible
  while (h.playback.isPlaying()) h.tick(1000);
  assert.equal(h.playback.getTime(), 5.85);
  assert.equal(h.pending.size, 0);
  assert.equal(h.changes.at(-1).finished, true);
});

test('normal pacing resumes after a long stall rather than racing to catch up', () => {
  const h = harness();
  h.playback.replay();
  h.tick(4000);
  assert.equal(h.playback.getTime(), MAX_FRAME_ADVANCE);
  h.tick(16);
  assert.ok(Math.abs(h.playback.getTime() - (MAX_FRAME_ADVANCE + .016)) < 1e-8);
});

test('normal frame cadence follows real time without stretching the animation', () => {
  const h = harness();
  h.playback.replay();
  for (let i = 0; i < 200; i += 1) h.tick(16);
  assert.ok(Math.abs(h.playback.getTime() - 3.2) < 1e-8);
});

test('skipping and unmounting cancel all scheduled frames', () => {
  const h = harness();
  h.playback.replay();
  h.playback.seek(5.85);
  assert.equal(h.pending.size, 0);
  assert.equal(h.playback.getTime(), 5.85);
  h.playback.replay();
  assert.equal(h.pending.size, 1);
  h.playback.destroy();
  assert.equal(h.pending.size, 0);
  h.playback.replay();
  assert.equal(h.pending.size, 0);
});

test('reduced motion never schedules an animation frame, including replay', () => {
  const h = harness(true);
  h.playback.replay();
  assert.equal(h.playback.getTime(), 5.85);
  assert.equal(h.playback.isPlaying(), false);
  assert.equal(h.pending.size, 0);
  h.playback.replay();
  assert.equal(h.playback.getTime(), 5.85);
  assert.equal(h.pending.size, 0);
});
