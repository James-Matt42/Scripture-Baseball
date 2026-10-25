/**
 * Drives the V6 paper model with exactly one animation frame at a time.
 * Separate from the drawing code so replay/pause/skip work reliably even if
 * users click quickly or a browser throttles animation in a background tab.
 */
export const MAX_FRAME_ADVANCE = 0.09; // seconds per displayed frame

export function createBookPlayback({
  duration,
  renderAt,
  onChange = () => {},
  prefersReducedMotion = () => false,
  now = () => performance.now(),
  requestFrame = (callback) => requestAnimationFrame(callback),
  cancelFrame = (id) => cancelAnimationFrame(id),
}) {
  let time = 0;
  let startTime = 0;
  let frame = null;
  let playing = false;
  let destroyed = false;

  const notify = () => {
    if (!destroyed) onChange({ playing, finished: time >= duration });
  };
  const cancelPendingFrame = () => {
    if (frame !== null) cancelFrame(frame);
    frame = null;
  };
  const draw = (value) => {
    time = Math.max(0, Math.min(duration, value));
    renderAt(time);
  };

  function tick(timestamp) {
    frame = null;
    if (destroyed || !playing) return;
    // A large frame delay (e.g. many 3D layers at 100% browser zoom) must
    // not jump over the entire page-flipping sequence in one paint. Allow
    // normal wall-clock pacing when frames arrive on time, but cap visual
    // progress to keep the paper turns observable on overloaded browsers.
    const elapsed = Math.max(0, (timestamp - startTime) / 1000);
    const capped = Math.min(elapsed, time + MAX_FRAME_ADVANCE);
    // Reset the playback clock after a stall. Otherwise subsequent frames
    // would race at up to 5x speed to catch up, hiding the turns again.
    if (capped < elapsed) startTime = timestamp - capped * 1000;
    draw(capped);
    if (time >= duration) {
      playing = false;
      notify();
    } else {
      frame = requestFrame(tick);
    }
  }

  function pause() {
    if (destroyed || !playing) return;
    cancelPendingFrame();
    playing = false;
    notify();
  }

  function seek(value) {
    if (destroyed) return;
    cancelPendingFrame();
    playing = false;
    draw(value);
    notify();
  }

  function play() {
    if (destroyed || playing) return;
    if (prefersReducedMotion()) {
      seek(duration);
      return;
    }
    if (time >= duration) draw(0);
    startTime = now() - time * 1000;
    playing = true;
    notify();
    frame = requestFrame(tick);
  }

  function replay() {
    if (destroyed) return;
    cancelPendingFrame();
    playing = false;
    draw(0);
    play();
  }

  function destroy() {
    if (destroyed) return;
    cancelPendingFrame();
    playing = false;
    destroyed = true;
  }

  return {
    play, pause, replay, seek, destroy,
    getTime: () => time,
    isPlaying: () => playing,
  };
}
