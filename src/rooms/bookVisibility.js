import { BOOK_DURATION } from './bookMotion.js';

/** Defer the book's expensive page animation until the invitation is visible. */
export function startBookWhenVisible(element, playback, {
  Observer = globalThis.IntersectionObserver,
  onStart = () => {},
  duration = BOOK_DURATION,
} = {}) {
  let disposed = false;
  let started = false;
  let observer;
  const start = () => {
    if (disposed || started || playback.getTime() >= duration || playback.isPlaying()) return;
    started = true;
    observer?.disconnect();
    onStart();
    playback.replay();
  };

  if (!element || typeof Observer !== 'function') {
    start();
  } else {
    // The book is large relative to many browser viewports. Requiring 20% of
    // the *entire frame* to intersect can prevent autoplay at 100% browser
    // zoom, even when several inches of the book are visible. A smaller
    // threshold keeps the reveal lazy, but independent of typical zoom/layout.
    const visibleFraction = 0.05;
    observer = new Observer((entries) => {
      if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= visibleFraction)) start();
    }, { threshold: [0, visibleFraction] });
    observer.observe(element);
  }
  return () => {
    disposed = true;
    observer?.disconnect();
  };
}
