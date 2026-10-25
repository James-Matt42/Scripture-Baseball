import React, { useCallback, useEffect, useRef } from 'react';

const BOOK_URL = '/scripture_baseball_book_v6.html';

/**
 * Loaded only on the host's request. The book is a local, same-origin iframe,
 * so its large artwork and animation aren't required for ordinary invites.
 * It receives the exact SVG visible in the invitation card, not a separate QR.
 */
export function ScriptureBaseballBookIntro({ joinUrl, joinCode, qrRef, presetId }) {
  const iframeRef = useRef(null);
  const sendJoinDetails = useCallback(() => {
    if (typeof window === 'undefined' || !iframeRef.current?.contentWindow || !qrRef.current) return;
    iframeRef.current.contentWindow.postMessage({
      type: 'SCRIPTURE_BASEBALL_JOIN',
      joinUrl,
      joinCode,
      qrSvg: qrRef.current.outerHTML,
    }, window.location.origin);
  }, [joinUrl, joinCode, qrRef, presetId]);

  // When the user selects a preset after opening the book, update both QRs.
  useEffect(() => { sendJoinDetails(); }, [sendJoinDetails]);

  return (
    <iframe
      ref={iframeRef}
      title="Animated scripture book revealing your room's invitation QR code"
      src={BOOK_URL}
      onLoad={sendJoinDetails}
      loading="lazy"
      allowFullScreen
      className="block w-full overflow-hidden rounded-xl border border-stone-200 bg-stone-950"
      style={{ aspectRatio: '16 / 9' }}
    />
  );
}
