import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getChallengeById } from "../challenges/catalog.js";
import { useRooms } from "../rooms/RoomContext";
import { RoomInvitation } from "../rooms/RoomInvitation";

const panel = "rounded-xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6";

export function Game() {
  const [searchParams] = useSearchParams();
  const { findRoom, isSaved } = useRooms();
  const room = findRoom(searchParams.get("code"));

  if (!room) {
    return (
      <main className="mx-auto w-full max-w-[900px] space-y-5 px-4 py-8 sm:px-6">
        <section className={panel}>
          <h1 className="text-3xl font-bold text-green-950">Room not found</h1>
          <p className="my-4 text-stone-700">No room with that code is saved in this browser.</p>
          <div className="flex flex-wrap gap-5">
            <Link className="font-semibold text-green-800 underline" to="/create-game">Create a game</Link>
            <Link className="font-semibold text-green-800 underline" to="/join-game">Join a game</Link>
          </div>
        </section>
      </main>
    );
  }

  const settings = room.settings;
  const challenge = getChallengeById(settings.challengeId);
  return (
    <main className="mx-auto w-full max-w-[1000px] space-y-6 px-4 py-6 sm:px-6 md:py-8">
      <header className={panel}>
        <h1 className="text-3xl font-bold text-green-950">{room.name}</h1>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-sm text-stone-600">Room code</dt><dd className="font-mono text-lg font-bold">{room.code}</dd></div>
          <div><dt className="text-sm text-stone-600">Host</dt><dd className="font-semibold">{room.hostName}</dd></div>
          <div><dt className="text-sm text-stone-600">Challenge</dt><dd className="font-semibold">{challenge?.title}</dd></div>
          <div><dt className="text-sm text-stone-600">Format</dt><dd>{settings.format === "live" ? "Live match" : "Friend challenge"}</dd></div>
          <div><dt className="text-sm text-stone-600">Difficulty</dt><dd className="capitalize">{settings.difficulty}</dd></div>
          <div><dt className="text-sm text-stone-600">Length</dt><dd>{settings.length} pitches{settings.exactVerse ? " · Exact verse" : ""}</dd></div>
        </dl>
        {isSaved === false && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3">Browser storage is unavailable. This room won't survive a refresh.</p>}
      </header>

      <section className={panel} aria-labelledby="lobby-heading">
        <h2 className="text-2xl font-bold text-green-950" id="lobby-heading">Lobby</h2>
        <p className="mt-2 text-stone-700">{room.players.length} of {settings.maxPlayers} players</p>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          {room.players.map((player) => (
            <li key={player.id}>{player.displayName}{player.role === "host" ? " — Host" : ""}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-stone-600">
          Joining and starting rounds are coming in the next implementation steps.
        </p>
      </section>

      <RoomInvitation code={room.code} />
      <Link to="/create-game" className="inline-block font-semibold text-green-800 underline hover:text-green-950">Create another game</Link>
    </main>
  );
}
