import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAccount } from "../account/AccountContext";
import { getChallengeById } from "../challenges/catalog.js";
import { useRooms } from "../rooms/RoomContext";
import { getInvitationPath, parseRoomInvitation } from "../rooms/roomState.js";

const panel = "rounded-xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6";
const buttonClass = "w-full cursor-pointer rounded-lg bg-scripture-green px-6 py-3 font-semibold text-white hover:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300 sm:w-auto";

export function JoinGame() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeProfile } = useAccount();
  const { findRoom, findMyRoomPlayer, findGuestRoomPlayer, joinRoom, isSaved } = useRooms();
  const invitationCode = searchParams.get("code") ?? "";
  const [codeInput, setCodeInput] = useState(invitationCode);
  const [guestName, setGuestName] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setCodeInput(invitationCode);
    setFormError("");
  }, [invitationCode]);

  const code = parseRoomInvitation(invitationCode);
  const room = code ? findRoom(code) : null;
  const myPlayer = room ? findMyRoomPlayer(code) : null;
  const guestPlayer = room ? findGuestRoomPlayer(code) : null;
  const roomFull = room && room.players.length >= room.settings.maxPlayers;
  const roomClosed = room && room.status !== "lobby";
  const lookupError = invitationCode && !code
    ? "Enter a six-character room code or invitation link."
    : invitationCode && !room
      ? "Room not found on this device. Ask the host to open it in this browser."
      : "";

  function handleFindGame(event) {
    event.preventDefault();
    const entered = parseRoomInvitation(codeInput);
    if (!entered) {
      setFormError("Enter a six-character room code or invitation link.");
      return;
    }
    setFormError("");
    navigate(getInvitationPath(entered));
  }

  function handleJoin(event) {
    event.preventDefault();
    if (!room) return;
    const result = joinRoom(room.code, guestName);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    setFormError("");
    navigate(`/game?code=${encodeURIComponent(result.room.code)}`);
  }

  return (
    <main className="mx-auto w-full max-w-[1100px] space-y-7 px-4 py-6 sm:px-6 md:py-8">
      <header className={panel}>
        <h1 className="text-3xl font-bold text-green-950">Join a Private Game</h1>
        <p className="mt-2 text-stone-700">Enter a code or open an invitation link.</p>
      </header>

      <section className={panel} aria-labelledby="code-heading">
        <h2 className="mb-4 text-xl font-bold text-green-950" id="code-heading">Find a room</h2>
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleFindGame}>
          <label className="grid flex-1 gap-2 font-semibold text-stone-700" htmlFor="room-code">
            Room code or invitation link
            <input
              id="room-code" name="code" type="text" maxLength={2048} autoComplete="off"
              autoCapitalize="off" spellCheck="false" placeholder="ABC234"
              value={codeInput} onChange={(event) => { setCodeInput(event.target.value); setFormError(""); }}
              required
            />
          </label>
          <button className={buttonClass} type="submit">Find Game</button>
        </form>
        {(formError || lookupError) && (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-red-900" role="alert">{formError || lookupError}</p>
        )}
      </section>

      {room && !formError && (
        <>
          <section className={panel} aria-labelledby="preview-heading">
            <h2 className="text-2xl font-bold text-green-950" id="preview-heading">{room.name}</h2>
            <p className="mt-2 text-stone-700">Hosted by <strong>{room.hostName}</strong></p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Room code", room.code],
                ["Challenge", getChallengeById(room.settings.challengeId)?.title ?? "Scripture challenge"],
                ["Format", room.settings.format === "live" ? "Live match" : "Friend challenge"],
                ["Difficulty", room.settings.difficulty],
                ["Length", `${room.settings.length} pitches${room.settings.exactVerse ? " · Exact verse" : ""}`],
                ["Players", `${room.players.length} of ${room.settings.maxPlayers}`],
              ].map(([label, value]) => (
                <div className="rounded-lg bg-amber-50 p-3" key={label}>
                  <dt className="text-sm font-semibold text-stone-600">{label}</dt>
                  <dd className="font-semibold text-stone-800">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {myPlayer ? (
            <section className={panel} aria-live="polite">
              <h2 className="text-xl font-bold text-green-950">You're in!</h2>
              <p className="my-3">Joining as <strong>{myPlayer.displayName}</strong>.</p>
              <Link className="font-semibold text-green-800 underline" to={`/game?code=${room.code}`}>View Room</Link>
            </section>
          ) : (
            <section className={panel} aria-labelledby="join-heading">
              <h2 className="mb-3 text-xl font-bold text-green-950" id="join-heading">Join this room</h2>
              {roomClosed && !(activeProfile && guestPlayer) ? (
                <p role="status">This game has already started or finished. It is no longer accepting players.</p>
              ) : roomFull && !guestPlayer ? (
                <p role="status">This room is full.</p>
              ) : activeProfile ? (
                <form onSubmit={handleJoin} className="space-y-3">
                  <p>Join as <strong>{activeProfile.displayName}</strong>
                    {guestPlayer ? " (keep your existing guest seat)" : ""}.
                  </p>
                  <button className={buttonClass} type="submit">Join as {activeProfile.displayName}</button>
                </form>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2">
                  <form className="grid content-start gap-3" onSubmit={handleJoin}>
                    <label className="grid gap-2 font-semibold text-stone-700" htmlFor="guest-name">
                      Guest display name
                      <input
                        id="guest-name" type="text" maxLength={40} autoComplete="nickname"
                        placeholder="Your name" value={guestName}
                        onChange={(event) => { setGuestName(event.target.value); setFormError(""); }}
                        required
                      />
                    </label>
                    <button className={buttonClass} type="submit">Join as Guest</button>
                  </form>
                  <div className="space-y-3 rounded-lg bg-amber-50 p-4">
                    <p className="font-semibold text-stone-800">Want to use a local profile?</p>
                    <Link className="font-semibold text-green-800 underline" to={`/account?code=${encodeURIComponent(room.code)}`}>
                      Sign in or create a profile
                    </Link>
                    <p className="text-sm text-stone-600">You'll return to this invitation afterward.</p>
                  </div>
                </div>
              )}
            </section>
          )}
          {isSaved === false && (
            <p className="rounded-lg bg-amber-50 p-3 text-stone-700" role="alert">
              Browser storage is unavailable. Your room membership may not survive a refresh.
            </p>
          )}
        </>
      )}
      <p className="text-sm text-stone-600">
        Demo rooms and memberships are stored in this browser only. Invite links cannot connect different devices yet.
      </p>
    </main>
  );
}
