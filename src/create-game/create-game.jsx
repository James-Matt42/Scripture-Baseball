import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAccount } from "../account/AccountContext";
import { getChallengeById } from "../challenges/catalog.js";
import { RoomInvitation } from "../rooms/RoomInvitation";
import { useRooms } from "../rooms/RoomContext";
import { ROOM_CHALLENGES } from "../rooms/roomState.js";

const panel = "grid gap-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6";
const action = "inline-flex w-fit cursor-pointer items-center justify-center rounded-lg bg-scripture-green px-6 py-3 font-semibold text-white hover:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300";

function RadioChoice({ name, value, label, checked, onChange }) {
  const id = `${name}-${value}`;
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-200 bg-amber-50 p-3" htmlFor={id}>
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="size-4 accent-scripture-green"
      />
      <span className="font-semibold text-stone-700">{label}</span>
    </label>
  );
}

const INITIAL_SETTINGS = {
  challengeId: "book-of-mormon",
  format: "live",
  difficulty: "standard",
  length: 10,
  maxPlayers: 4,
  exactVerse: false,
  name: "",
  hostName: "",
};

export function CreateGame() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeProfile } = useAccount();
  const { createRoom, findRoom, isSaved } = useRooms();
  const [form, setForm] = useState(INITIAL_SETTINGS);
  const [error, setError] = useState("");
  const createdRoom = findRoom(searchParams.get("code"));

  function update(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
    setError("");
  }

  function handleCreateGame(event) {
    event.preventDefault();
    const result = createRoom({
      ...form,
      hostName: activeProfile?.displayName ?? form.hostName,
    }, activeProfile?.id ?? null);
    if (result.error) {
      setError(result.error);
      return;
    }
    navigate(`/create-game?code=${encodeURIComponent(result.room.code)}`);
  }

  if (createdRoom) {
    const challenge = getChallengeById(createdRoom.settings.challengeId);
    return (
      <main className="mx-auto w-full max-w-[1000px] space-y-6 px-4 py-6 sm:px-6 md:py-8">
        <header className={panel}>
          <h1 className="text-3xl font-bold text-green-950">Room created!</h1>
          <p className="text-lg font-semibold text-stone-800">{createdRoom.name}</p>
          <p className="text-stone-700">Hosted by {createdRoom.hostName} · {challenge?.title} · {createdRoom.settings.length} pitches</p>
          <p className="text-stone-700">
            {createdRoom.settings.format === "live" ? "Live match" : "Friend challenge"} · {createdRoom.settings.difficulty} · {createdRoom.settings.maxPlayers} players maximum
            {createdRoom.settings.exactVerse ? " · Exact verse enabled" : ""}
          </p>
          {isSaved === false && (
            <p role="alert" className="rounded-lg bg-amber-50 p-3 text-stone-800">
              Browser storage is unavailable. This room will disappear after a refresh.
            </p>
          )}
        </header>
        <RoomInvitation code={createdRoom.code} />
        <div className="flex flex-wrap items-center gap-4">
          <Link to={`/game?code=${encodeURIComponent(createdRoom.code)}`} className={action}>View Room</Link>
          <Link to="/create-game" className="font-semibold text-green-800 underline hover:text-green-950">Create another game</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1000px] space-y-6 px-4 py-6 sm:px-6 md:py-8">
      <header className={panel}>
        <h1 className="text-3xl font-bold text-green-950">Create a Private Game</h1>
        <p className="text-stone-700">Choose your settings, then share a room code.</p>
        {searchParams.has("code") && (
          <p role="alert" className="text-red-800">This room isn't saved in this browser. Create a new one.</p>
        )}
      </header>

      <form className="grid gap-5" onSubmit={handleCreateGame}>
        <section className={panel} aria-labelledby="challenge-heading">
          <h2 className="text-xl font-bold text-green-950" id="challenge-heading">Challenge</h2>
          <label className="font-semibold text-stone-700" htmlFor="challenge">Choose a challenge</label>
          <select
            id="challenge"
            name="challenge"
            className="w-full"
            value={form.challengeId}
            onChange={(event) => update("challengeId", event.target.value)}
            required
          >
            {ROOM_CHALLENGES.map((challenge) => (
              <option key={challenge.id} value={challenge.id}>{challenge.title}</option>
            ))}
          </select>
          <Link className="w-fit font-semibold text-green-800 underline hover:text-green-950" to="/challenges">Browse challenges</Link>
        </section>

        <section className={panel} aria-labelledby="format-heading">
          <h2 className="text-xl font-bold text-green-950" id="format-heading">Game format</h2>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Game format</legend>
            <RadioChoice name="format" value="live" label="Live private match" checked={form.format === "live"} onChange={(value) => update("format", value)} />
            <RadioChoice name="format" value="async" label="Friend challenge" checked={form.format === "async"} onChange={(value) => update("format", value)} />
          </fieldset>
        </section>

        <section className={panel} aria-labelledby="difficulty-heading">
          <h2 className="text-xl font-bold text-green-950" id="difficulty-heading">Difficulty</h2>
          <fieldset className="grid gap-2 sm:grid-cols-3">
            <legend className="sr-only">Difficulty</legend>
            <RadioChoice name="difficulty" value="beginner" label="Beginner" checked={form.difficulty === "beginner"} onChange={(value) => update("difficulty", value)} />
            <RadioChoice name="difficulty" value="standard" label="Standard" checked={form.difficulty === "standard"} onChange={(value) => update("difficulty", value)} />
            <RadioChoice name="difficulty" value="expert" label="Expert" checked={form.difficulty === "expert"} onChange={(value) => update("difficulty", value)} />
          </fieldset>
        </section>

        <section className={panel} aria-labelledby="length-heading">
          <h2 className="text-xl font-bold text-green-950" id="length-heading">Game length</h2>
          <fieldset className="grid gap-2 sm:grid-cols-3">
            <legend className="sr-only">Number of pitches</legend>
            {[5, 10, 20].map((length) => (
              <RadioChoice key={length} name="length" value={length} label={`${length} pitches`} checked={form.length === length} onChange={(value) => update("length", value)} />
            ))}
          </fieldset>
          <p className="text-sm text-stone-600">Longer games may reuse passages from the starter collection.</p>
        </section>

        <section className={panel} aria-labelledby="room-settings-heading">
          <h2 className="text-xl font-bold text-green-950" id="room-settings-heading">Room settings</h2>
          <label className="flex cursor-pointer items-center gap-3 font-semibold text-stone-700" htmlFor="exact-verse">
            <input
              id="exact-verse"
              name="exact-verse"
              type="checkbox"
              checked={form.exactVerse}
              onChange={(event) => update("exactVerse", event.target.checked)}
              className="size-4 accent-scripture-green"
            />
            Require the exact verse
          </label>
          <label className="grid gap-2 font-semibold text-stone-700" htmlFor="game-name">
            Game name (optional)
            <input
              id="game-name"
              name="game-name"
              type="text"
              maxLength={60}
              placeholder="Saturday Scripture Game"
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              className="font-normal"
            />
          </label>
          {activeProfile ? (
            <p className="font-semibold text-stone-700">Host: {activeProfile.displayName}</p>
          ) : (
            <label className="grid gap-2 font-semibold text-stone-700" htmlFor="host-name">
              Your display name
              <input
                id="host-name"
                name="host-name"
                type="text"
                autoComplete="nickname"
                maxLength={40}
                value={form.hostName}
                onChange={(event) => update("hostName", event.target.value)}
                placeholder="Your name"
                required
                className="font-normal"
              />
            </label>
          )}
          <label className="grid gap-2 font-semibold text-stone-700" htmlFor="max-players">
            Maximum players
            <select
              id="max-players"
              name="max-players"
              value={form.maxPlayers}
              onChange={(event) => update("maxPlayers", Number(event.target.value))}
              className="w-full font-normal"
            >
              {[2, 4, 8, 12].map((capacity) => (
                <option key={capacity} value={capacity}>{capacity} players</option>
              ))}
            </select>
          </label>
        </section>

        {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-900">{error}</p>}
        <button className={action} type="submit">Create Game</button>
        <p className="text-sm text-stone-600">
          Local demo: room settings and invitations are saved in this browser only.
        </p>
      </form>
    </main>
  );
}
