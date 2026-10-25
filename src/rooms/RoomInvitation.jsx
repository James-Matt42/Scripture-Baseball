import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { InvitationQR } from '../qr/InvitationQR.jsx';
import { DEFAULT_INVITATION_QR_PRESET, INVITATION_QR_PRESETS } from '../qr/invitationQr.js';
import { getInvitationPath, getInvitationUrl } from './roomState.js';
import { ScriptureBaseballBookIntro } from './ScriptureBaseballBookIntro.jsx';

export function RoomInvitation({ code }) {
  const path = getInvitationPath(code);
  const url = getInvitationUrl(code, typeof window === 'undefined' ? '' : window.location.origin);
  const [copyMessage, setCopyMessage] = useState('');
  const [presetId, setPresetId] = useState(DEFAULT_INVITATION_QR_PRESET);
  const [showBook, setShowBook] = useState(true);

  useEffect(() => setCopyMessage(''), [url]);

  async function copyInvitation() {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(url);
      setCopyMessage('Invitation link copied.');
    } catch {
      setCopyMessage('Automatic copy is not available. Select the link above to copy it.');
    }
  }

  return (
    <section className="grid gap-5 rounded-xl border border-stone-200 bg-white p-5 shadow-sm" aria-label="Invite players">
      <h2 className="text-xl font-bold text-green-950">Invite players</h2>
      <div className="grid items-start gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(190px,230px)]">
        <div className="grid min-w-0 gap-4">
          <div>
            <p className="text-sm font-semibold text-stone-700">Room code</p>
            <p className="font-mono text-2xl font-bold tracking-widest text-green-950">{code}</p>
          </div>
          <label className="grid min-w-0 gap-2 font-semibold text-stone-700" htmlFor={`invitation-${code}`}>
            Invitation link
            <input
              className="w-full min-w-0 font-normal"
              id={`invitation-${code}`}
              readOnly
              value={url}
              onFocus={(event) => event.currentTarget.select()}
              onClick={(event) => event.currentTarget.select()}
            />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <button
              className="cursor-pointer rounded-lg bg-scripture-green px-5 py-2 font-semibold text-white hover:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300"
              type="button"
              onClick={copyInvitation}
            >
              Copy Invitation Link
            </button>
            <Link className="font-semibold text-green-800 underline hover:text-green-950" to={path}>
              Open invitation
            </Link>
          </div>
          <p aria-live="polite" className="text-sm text-stone-700" role="status">{copyMessage}</p>
          <label htmlFor={`qr-preset-${code}`} className="grid max-w-xs gap-2 text-sm font-semibold text-stone-700">
            QR appearance
            <select id={`qr-preset-${code}`} value={presetId} onChange={(event) => setPresetId(event.target.value)}>
              {INVITATION_QR_PRESETS.map((preset) => (
                <option value={preset.id} key={preset.id}>{preset.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid justify-items-center gap-2">
          <div className="w-full max-w-[230px] rounded-lg border border-stone-200 bg-white p-2">
            <InvitationQR url={url} presetId={presetId} className="block w-full" />
          </div>
          <p className="text-center text-xs text-stone-700">Scan to open this invitation</p>
        </div>
      </div>
      <div className="grid gap-3 border-t border-stone-200 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-green-950">Your book invitation</p>
          <button
            type="button"
            aria-expanded={showBook}
            onClick={() => setShowBook((previous) => !previous)}
            className="rounded-lg border border-green-800 px-4 py-2 font-semibold text-green-900 hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300"
          >
            {showBook ? 'Hide book' : 'Show book'}
          </button>
        </div>
        {showBook && (
          <ScriptureBaseballBookIntro joinUrl={url} joinCode={code} presetId={presetId} />
        )}
      </div>
      <p className="text-sm text-stone-600">
        These are local mock rooms stored in this browser. The QR and link open the correct join URL,
        but players on other devices cannot join until the server-backed multiplayer phase.
      </p>
    </section>
  );
}
