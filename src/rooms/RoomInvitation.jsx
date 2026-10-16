import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getInvitationPath, getInvitationUrl } from "./roomState.js";

export function RoomInvitation({ code }) {
  const path = getInvitationPath(code);
  const url = getInvitationUrl(code, typeof window === "undefined" ? "" : window.location.origin);
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => setCopyMessage(""), [url]);

  async function copyInvitation() {
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(url);
      setCopyMessage("Invitation link copied.");
    } catch {
      setCopyMessage("Automatic copy isn't available. Select the link above to copy it.");
    }
  }

  return (
    <section className="grid gap-3 rounded-xl border border-stone-200 bg-white p-5 shadow-sm" aria-label="Invite players">
      <h2 className="text-xl font-bold text-green-950">Invite players</h2>
      <div>
        <p className="text-sm font-semibold text-stone-700">Room code</p>
        <p className="font-mono text-2xl font-bold tracking-widest text-green-950">{code}</p>
      </div>
      <label className="grid gap-2 font-semibold text-stone-700" htmlFor={`invitation-${code}`}>
        Invitation link
        <input
          className="w-full font-normal"
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
      <p className="text-sm text-stone-600">
        Mock rooms are stored only in this browser. Invitations cannot connect players on other devices yet.
      </p>
    </section>
  );
}
