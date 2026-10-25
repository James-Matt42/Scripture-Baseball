import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { InvitationQR } from '../qr/InvitationQR.jsx';
import { BOOK_DURATION, BOOK_LEAVES, BOOK_SEGMENTS, buildBookTurns } from './bookMotion.js';
import { createBookPlayback } from './bookPlayback.js';
import { startBookWhenVisible } from './bookVisibility.js';
import './invitationBook.css';

// Preserve the physical animation from the supplied V6 prototype:
// 42 overlapping leaves, each made from 12 rotating ribbon faces. These
// separate strips bend, flutter, and settle; they are not flat hinged pages.
const PAGE_WIDTH = 421;
const SCENE_WIDTH = 1000;
const SCENE_HEIGHT = 560;

const clamp = (n) => Math.min(1, Math.max(0, n));
const smooth = (t) => { const x = clamp(t); return x * x * (3 - 2 * x); };
const linear = (t, a, b) => clamp((t - a) / (b - a));
const mix = (a, b, t) => a + (b - a) * t;

const TURNS = buildBookTurns();
const LAST_TURN = TURNS.at(-1).end;
const LEAVES = Array.from({ length: BOOK_LEAVES }, (_, i) => i);
const STRIPS = Array.from({ length: BOOK_SEGMENTS }, (_, i) => i);

function PageLeaf({ index }) {
  const width = PAGE_WIDTH / BOOK_SEGMENTS;
  return (
    <div className={`leaf variant${index % 4}`} data-leaf={index}>
      {STRIPS.map((j) => (
        <div className="sheet-strip" key={j} style={{ width: `${(width + 1.05).toFixed(3)}px` }}>
          <div className="sheet-face sheet-front" style={{ backgroundPosition: `${(-j * width).toFixed(3)}px 0` }} />
          <div className="sheet-face sheet-back" style={{ backgroundPosition: `${(-(BOOK_SEGMENTS - 1 - j) * width).toFixed(3)}px 0` }} />
        </div>
      ))}
    </div>
  );
}

/**
 * Inline, app-native invitation book. The original standalone V6 HTML is kept
 * under tools/book-reference for comparison, never loaded as an iframe.
 * The QR comes from the same small preset-powered renderer used by RoomInvitation.
 */
export function ScriptureBaseballBookIntro({ joinUrl, joinCode, presetId }) {
  const sceneRef = useRef(null);
  const frameRef = useRef(null);
  const animationRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);

  // World coordinates are intentionally fixed: scaling the complete 3D model
  // uniformly preserves the original paper curvature, perspective, and seams.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const update = () => setScale(Math.max(.1, Math.min(1, frame.clientWidth / SCENE_WIDTH)));
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(update);
      observer.observe(frame);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return undefined;
    const get = (id) => scene.querySelector(`#${id}`);
    const cover = get('cover');
    const cam = get('book-camera');
    const rig = get('book-orientation');
    const left = get('left-leather');
    const opened = get('opened-left');
    const pile = get('left-stack-edges');
    const underFinal = get('under-final');
    const message = get('open-message');
    const leaves = [...scene.querySelectorAll('.leaf')].map((element) => ({
      element,
      strips: [...element.querySelectorAll('.sheet-strip')],
      lastProgress: -1,
      visible: null,
    }));

    function renderAt(t) {
      const time = Math.max(0, Math.min(BOOK_DURATION, t));
      const open = smooth(linear(time, .07, 1.00));
      cover.style.transform = `translateZ(${mix(81, 8, open).toFixed(2)}px) rotateY(${(-177 * open).toFixed(2)}deg)`;
      // Reveal the cream endpaper before the back cover. On this light page,
      // fading in the opaque dark leather first creates a gray rectangular
      // ghost that wasn't noticeable against V6's original black stage.
      opened.style.opacity = String(smooth(linear(time, .32, .50)));
      left.style.opacity = String(smooth(linear(time, .48, .56)));

      let finishedLeaves = 0;
      // Pages outside the active turn are genuinely removed from rendering, not
      // merely hidden with visibility:hidden. Hidden 3D leaves otherwise
      // retain compositor layers; at native zoom Chromium can fail to paint
      // the rapid turns while still advancing the timeline.
      const lastFinished = TURNS.findLastIndex((turn) => time >= turn.end);
      const nextUnstarted = TURNS.findIndex((turn) => time < turn.start);
      const firstVisible = Math.max(0, lastFinished - 4);
      const lastVisible = nextUnstarted < 0 ? BOOK_LEAVES - 1 : Math.min(BOOK_LEAVES - 1, nextUnstarted + 3);
      leaves.forEach((leaf, i) => {
        const visible = i >= firstVisible && i <= lastVisible;
        if (leaf.visible !== visible) {
          leaf.element.style.display = visible ? '' : 'none';
          leaf.visible = visible;
        }
        const turn = TURNS[i];
        const raw = linear(time, turn.start, turn.end);
        if (raw >= 1) finishedLeaves += 1;
        if (!visible) return;
        const wobble = i >= BOOK_LEAVES - 4 ? .010 * Math.sin(raw * 5 * Math.PI) * (1 - raw) ** 2 : 0;
        const f = clamp(smooth(raw) + wobble);
        if (Math.abs(leaf.lastProgress - f) < .00001) return;
        leaf.lastProgress = f;
        const bow = Math.sin(Math.PI * f);
        const bend = (1.08 + .15 * Math.sin(i * .71)) * bow;
        const baseDepth = mix(76 - i * .86, 18 + i * 1.67, f);
        const step = PAGE_WIDTH / BOOK_SEGMENTS;
        let px = 0;
        let pz = 0;
        leaf.strips.forEach((strip, j) => {
          const u = (j + .5) / BOOK_SEGMENTS;
          const flutter = (i < 29 ? .12 : .055) * (1 - u) ** .35 * bow * Math.sin(14 * u + 7 * f + i * .65);
          const waviness = .13 * bow * Math.sin(6.5 * u + i * .49) + flutter;
          const angle = Math.PI * f + bend * (u - .43) + waviness;
          const lift = (4.2 + 7.2 * bow) * bow * Math.sin(Math.PI * u)
            + 1.5 * bow * Math.sin(11 * u + f * 9 + i * .44);
          strip.style.transform = `translate3d(${px.toFixed(2)}px,${(-lift).toFixed(2)}px,${(pz + baseDepth).toFixed(2)}px) rotateY(${(-angle * 180 / Math.PI).toFixed(2)}deg)`;
          const lum = .81 + .26 * Math.abs(Math.cos(angle)) + .045 * Math.sin(Math.PI * u);
          // A CSS filter on a preserve-3d strip forces its two page faces
          // to flatten into one layer. On some Chromium zoom/GPU settings
          // this makes the turning paper disappear entirely. Shade each
          // face through lightweight overlays instead.
          strip.style.setProperty('--paper-shadow', Math.max(0, 1 - lum).toFixed(3));
          strip.style.setProperty('--paper-highlight', Math.max(0, lum - 1).toFixed(3));
          px += step * Math.cos(angle);
          pz += step * Math.sin(angle);
        });
      });

      const fullPile = smooth(linear(time, TURNS[0].start + .2, LAST_TURN + .12));
      pile.style.opacity = String(open * .33 * fullPile);
      const elapsed = Math.max(0, time - LAST_TURN);
      const rebound = time > LAST_TURN && elapsed < .55
        ? 2.2 * Math.sin(elapsed * 25) * Math.exp(-elapsed * 8) : 0;
      pile.style.transform = `translateZ(${(12 + finishedLeaves * .9).toFixed(2)}px) translateY(${(mix(8, 0, fullPile) + rebound).toFixed(2)}px)`;
      underFinal.style.transform = `translateZ(14px) translateY(${rebound.toFixed(2)}px)`;

      // Original cover + V6 ribbon mechanics, but without its theatrical zoom
      // and fade into a separate flat 'final page' overlay. The book stays here.
      const spread = smooth(linear(time, .12, 1.14));
      cam.style.transform = `translate(${mix(-223, 0, spread).toFixed(2)}px,${mix(8, 0, spread).toFixed(2)}px) scale(${mix(.98, 1, spread).toFixed(4)})`;
      rig.style.transform = `rotateX(${mix(13, 1.3, spread).toFixed(3)}deg) rotateZ(${mix(-5, 0, spread).toFixed(3)}deg)`;
      message.style.opacity = String(smooth(linear(time, LAST_TURN + .16, LAST_TURN + .83)));
    }

    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const playback = createBookPlayback({
      duration: BOOK_DURATION,
      renderAt,
      prefersReducedMotion: () => motionQuery?.matches === true,
      onChange: ({ playing: isPlaying, finished: isFinished }) => {
        setPlaying(isPlaying);
        setFinished(isFinished);
      },
    });
    animationRef.current = playback;
    renderAt(0);
    // The invitation book can sit below the fold. Starting before it enters
    // view spends the whole reveal off-screen, particularly on mobile.
    const stopWatching = motionQuery?.matches
      ? (() => { playback.seek(BOOK_DURATION); setStarted(true); return () => {}; })()
      : startBookWhenVisible(frameRef.current, playback, {
        duration: BOOK_DURATION,
        onStart: () => setStarted(true),
      });

    // Respect a reduced-motion preference even if it changes while the book
    // is already opening. Replaying must also respect this preference.
    const handleMotionChange = () => {
      if (motionQuery?.matches) {
        setStarted(true);
        playback.seek(BOOK_DURATION);
      }
    };
    motionQuery?.addEventListener?.('change', handleMotionChange);
    return () => {
      motionQuery?.removeEventListener?.('change', handleMotionChange);
      stopWatching();
      playback.destroy();
      if (animationRef.current === playback) animationRef.current = null;
    };
  }, []);

  const onSkip = useCallback(() => {
    setStarted(true);
    animationRef.current?.seek(BOOK_DURATION);
  }, []);
  const onReplay = useCallback(() => {
    setStarted(true);
    animationRef.current?.replay();
  }, []);
  const onPause = useCallback(() => {
    const animation = animationRef.current;
    if (!animation) return;
    if (animation.isPlaying()) animation.pause();
    else animation.play();
  }, []);

  return (
    <div className="sb-book-frame" ref={frameRef}>
      <div className="sb-book-viewport" style={{ height: `${SCENE_HEIGHT * scale}px` }}>
        <div className="sb-book-scene" ref={sceneRef} style={{ transform: `scale(${scale})` }} aria-hidden="true">
          <div id="book-camera">
            <div id="book-orientation">
              <div id="contact-shadow" />
              <div id="book-body">
                <div id="right-leather" />
                <div id="left-leather" />
                <div id="page-stack" />
                <div id="bookmark" />
                <div id="spine" />
                <div id="hinge-core" />
                <div id="opened-left" />
                <div id="left-stack-edges" />
                <div id="right-page" />
                <div id="under-final">
                  <div className="mini-top">SCRIPTURE BASEBALL</div>
                  <div className="mini-heading">Join the game</div>
                  <div className="mini-qr">
                    <InvitationQR url={joinUrl} presetId={presetId} className="block w-full h-full" />
                  </div>
                  <div className="mini-code-label">ROOM CODE</div>
                  <div className="mini-code">{joinCode}</div>
                </div>
                <div id="cover">
                  <div className="cover-face cover-front">
                    <div className="sb-book-cover-mark"><strong>Scripture<br />Baseball</strong><span>Play · Locate · Learn</span></div>
                  </div>
                  <div className="cover-face cover-inside" />
                  <div className="cover-thickness" />
                </div>
                {LEAVES.map((i) => <PageLeaf key={i} index={i} />)}
                <div id="open-message">
                  <div className="book-kicker">YOU'RE INVITED</div>
                  <div className="book-heading">Step up<br />to the plate.</div>
                  <div className="book-rule" />
                  <div className="book-caption">Every verse is a new inning.</div>
                </div>
                <div id="sewn-gutter" />
                <div id="spine-shield" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="sb-book-controls" aria-label="Invitation book animation controls">
        <button type="button" onClick={onReplay}>Replay opening</button>
        {!finished && started && <button type="button" onClick={onPause}>{playing ? 'Pause' : 'Resume'}</button>}
        {!finished && <button type="button" onClick={onSkip}>Show invitation now</button>}
      </div>
      <p className="sb-book-hint">The room link and full-size QR below remain available without the animation.</p>
    </div>
  );
}
