import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getChallengeById } from "../challenges/catalog.js";
import { ScriptureQuestion } from "../components/ScriptureQuestion";
import { RoomInvitation } from "../rooms/RoomInvitation";
import { useRooms } from "../rooms/RoomContext";
import { getRoomRoundQuestion, getRoomRoundResponses, getRoomStandings } from "../rooms/roomState.js";
import { formatScriptureReference } from "../scripture/questions.js";

const panel = "rounded-xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6";
const action = "inline-flex cursor-pointer items-center justify-center rounded-lg bg-scripture-green px-5 py-3 font-semibold text-white hover:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300 disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "inline-flex cursor-pointer items-center justify-center rounded-lg border border-green-800 px-5 py-3 font-semibold text-green-900 hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300";

function PlayerList({ room, roundResponses = [], onRemoveBot }) {
  const submitted = new Set(roundResponses.map((response) => response.playerId));
  return (
    <ul className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Room players">
      {room.players.map((player) => (
        <li key={player.id} className="flex items-center justify-between gap-3 rounded-lg bg-amber-50 px-4 py-3">
          <span className="font-semibold text-stone-800">
            {player.displayName}{player.id === room.hostId ? " (Host)" : ""}
            {player.isBot && <span className="ml-1 text-xs font-normal text-stone-600">(Simulated)</span>}
          </span>
          <span className="flex items-center gap-2 text-sm text-stone-600">
            {room.status === "lobby" ? (player.ready ? "Ready" : "Not ready")
              : room.status === "active" ? (submitted.has(player.id) ? "Answered" : "Waiting")
                : "Finished"}
            {player.isBot && onRemoveBot && (
              <button className="rounded px-2 py-1 text-red-800 underline hover:bg-red-50" type="button"
                onClick={() => onRemoveBot(player.id)} aria-label={`Remove simulated player ${player.displayName}`}>
                Remove
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RoomLobby({ room, myPlayer, setMyReady, startMatch, addSimulatedPlayer, removeSimulatedPlayer, onError }) {
  const isHost = myPlayer?.id === room.hostId;
  const allReady = room.players.length > 0 && room.players.every((player) => player.ready);
  return (
    <>
      <section className={panel} aria-labelledby="lobby-heading">
        <h2 id="lobby-heading" className="text-2xl font-bold text-green-950">Lobby</h2>
        <p className="mt-2 text-stone-700">{room.players.length} / {room.settings.maxPlayers} players</p>
        <PlayerList room={room} onRemoveBot={isHost ? (botId) => {
          const result = removeSimulatedPlayer(room.code, myPlayer.id, botId);
          if (result.error) onError(result.error);
        } : null} />
        {isHost && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className={secondary} type="button" disabled={room.players.length >= room.settings.maxPlayers}
              onClick={() => {
                const result = addSimulatedPlayer(room.code, myPlayer.id);
                if (result.error) onError(result.error);
              }}>
              Add Simulated Player
            </button>
            <span className="text-sm text-stone-600">Computer players automatically answer each pitch.</span>
          </div>
        )}
        {myPlayer ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button className={secondary} type="button" onClick={() => {
              const result = setMyReady(room.code, myPlayer.id, !myPlayer.ready);
              if (result.error) onError(result.error);
            }}>
              {myPlayer.ready ? "Not Ready" : "I'm Ready"}
            </button>
            {isHost && (
              <button className={action} type="button" disabled={!allReady} onClick={() => {
                const result = startMatch(room.code, myPlayer.id);
                if (result.error) onError(result.error);
              }}>Start Game</button>
            )}
            {isHost && !allReady && (
              <span className="text-sm text-stone-600">Waiting for players to ready up.</span>
            )}
          </div>
        ) : (
          <p className="mt-4 text-stone-800">
            <Link className="font-semibold text-green-800 underline" to={`/join-game?code=${room.code}`}>Join this room</Link> to play.
          </p>
        )}
        {myPlayer?.id.startsWith("guest-") && (
          <Link className="mt-4 inline-block text-sm font-semibold text-green-800 underline" to={`/account?code=${room.code}`}>
            Link your seat to a local profile
          </Link>
        )}
      </section>
      <RoomInvitation code={room.code} />
    </>
  );
}

function Standings({ room, myPlayerId }) {
  const standings = getRoomStandings(room);
  if (!standings.length) return null;
  return (
    <section className={panel} aria-labelledby="standings-heading">
      <h2 id="standings-heading" className="text-xl font-bold text-green-950">
        {room.status === "complete" ? "Final Standings" : "Live Standings"}
      </h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <caption className="sr-only">Players ranked by points; tied scores share a place.</caption>
          <thead className="bg-green-900 text-white">
            <tr><th scope="col" className="p-3">Place</th><th scope="col" className="p-3">Player</th>
              <th scope="col" className="p-3">Answered</th><th scope="col" className="p-3">Book</th>
              <th scope="col" className="p-3">Chapter</th>
              {room.settings.exactVerse && <th scope="col" className="p-3">Verse</th>}
              <th scope="col" className="p-3">Points</th></tr>
          </thead>
          <tbody>
            {standings.map((player) => (
              <tr key={player.playerId} className={`border-b border-stone-200 ${player.playerId === myPlayerId ? "bg-green-50" : ""}`}>
                <td className="p-3">{player.rank}</td>
                <th scope="row" className="p-3 font-semibold">{player.name}{player.isBot ? " (Simulated)" : ""}{player.playerId === myPlayerId ? " (You)" : ""}</th>
                <td className="p-3">{player.answered}/{room.questionIds.length}</td>
                <td className="p-3">{player.bookCorrect}</td>
                <td className="p-3">{player.chapterCorrect}</td>
                {room.settings.exactVerse && <td className="p-3">{player.verseCorrect}</td>}
                <td className="p-3 font-semibold">{player.points}/{player.possiblePoints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {room.status === "active" && <p className="mt-2 text-sm text-stone-600">Standings update as pitches are submitted.</p>}
    </section>
  );
}

function PlayerResult({ response, question, exactVerse }) {
  const attempt = response.attempt;
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4" role="status" aria-live="polite">
      <p className="font-bold text-green-950">Pitch submitted</p>
      <p className="mt-1 text-stone-700">{formatScriptureReference(question)}</p>
      <p className="mt-2 text-stone-800">
        Book: {attempt.bookCorrect ? "Correct" : "Incorrect"} · Chapter: {attempt.chapterCorrect ? "Correct" : "Incorrect"}
        {exactVerse ? ` · Verse: ${attempt.verseCorrect ? "Correct" : "Incorrect"}` : ""}
      </p>
    </div>
  );
}

function RoomRounds({ room, myPlayer, answerRound, advanceRound, simulateOpponentAnswer, onError }) {
  const question = getRoomRoundQuestion(room);
  const roundResponses = getRoomRoundResponses(room);
  const myResponse = myPlayer && roundResponses.find((response) => response.playerId === myPlayer.id);
  const unanswered = room.players.filter((player) => !roundResponses.some((response) => response.playerId === player.id));
  const isHost = myPlayer?.id === room.hostId;
  const isLastRound = room.match.roundIndex + 1 === room.questionIds.length;
  const pendingBot = unanswered.find((player) => player.isBot);
  const pendingBotId = pendingBot?.id;
  const roundIndex = room.match.roundIndex;

  // The host's open game view drives the local simulation. Timers are scoped
  // to the round and cleared on navigation or advancement; submissions are idempotent.
  useEffect(() => {
    if (!pendingBotId || !isHost) return undefined;
    const timeout = setTimeout(() => {
      const result = simulateOpponentAnswer(room.code, pendingBotId);
      if (result.error) onError(result.error);
    }, 900);
    return () => clearTimeout(timeout);
  }, [room.code, roundIndex, pendingBotId, isHost, simulateOpponentAnswer, onError]);

  return (
    <>
      <section className={panel} aria-labelledby="round-heading">
        <h2 id="round-heading" className="text-2xl font-bold text-green-950">
          Pitch {room.match.roundIndex + 1} / {room.questionIds.length}
        </h2>
        <p className="mt-1 text-stone-700">{roundResponses.length} of {room.players.length} players answered</p>
        <PlayerList room={room} roundResponses={roundResponses} />
      </section>
      <section className={panel} aria-label="Current scripture pitch">
        {!myPlayer ? (
          <p className="text-stone-700">You aren't a player in this match.</p>
        ) : !question ? (
          <p role="alert" className="text-red-800">This pitch isn't available.</p>
        ) : myResponse ? (
          <PlayerResult response={myResponse} question={question} exactVerse={room.settings.exactVerse} />
        ) : (
          <ScriptureQuestion
            key={`${room.code}-${room.match.roundIndex}-${myPlayer.id}`}
            question={question}
            exactVerse={room.settings.exactVerse}
            onAnswered={(attempt) => {
              const result = answerRound(room.code, myPlayer.id, attempt);
              if (result.error) onError(result.error);
            }}
          />
        )}
        {isHost && myResponse && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button className={action} type="button" onClick={() => {
              const result = advanceRound(room.code, myPlayer.id, unanswered.length > 0);
              if (result.error) onError(result.error);
            }}>
              {unanswered.length > 0 ? "Skip Waiting Players" : isLastRound ? "Finish Game" : "Next Pitch"}
            </button>
            {unanswered.length > 0 && <p className="text-sm text-amber-800">Unanswered pitches will count as zero.</p>}
          </div>
        )}
        {!isHost && myResponse && <p className="mt-4 text-stone-700">Waiting for the host to advance.</p>}
      </section>
      <Standings room={room} myPlayerId={myPlayer?.id} />
    </>
  );
}

function RoomComplete({ room, myPlayer }) {
  const standings = getRoomStandings(room);
  const personal = standings.find((standing) => standing.playerId === myPlayer?.id);
  const winners = standings.filter((standing) => standing.rank === 1);
  return (
    <>
      <section className={panel} aria-labelledby="finished-heading">
        <h2 className="text-2xl font-bold text-green-950" id="finished-heading">Game complete</h2>
        <p className="mt-3 text-stone-800">
          {winners.length > 1 ? "Tied for first" : "Winner"}: {winners.map((winner) => winner.name).join(", ")}
        </p>
        {personal && <p className="mt-2 text-stone-800">
          You finished #{personal.rank} of {standings.length} with {personal.points}/{personal.possiblePoints} points
          ({personal.answered}/{room.questionIds.length} pitches answered).
        </p>}
        <p className="mt-2 text-sm text-stone-600">Results are saved in this browser's local game history.</p>
        <div className="mt-5 flex flex-wrap gap-5">
          <Link className="font-semibold text-green-800 underline" to="/progress">View progress</Link>
          <Link className="font-semibold text-green-800 underline" to="/create-game">Create another game</Link>
        </div>
      </section>
      <Standings room={room} myPlayerId={myPlayer?.id} />
    </>
  );
}

function GameRoom({ room }) {
  const { findMyRoomPlayer, isSaved, setMyReady, startMatch, answerRound, advanceRound,
    addSimulatedPlayer, removeSimulatedPlayer, simulateOpponentAnswer } = useRooms();
  const myPlayer = findMyRoomPlayer(room.code);
  const [error, setError] = useState("");

  useEffect(() => { setError(""); }, [room.code, room.status, room.match?.roundIndex]);
  const challenge = getChallengeById(room.settings.challengeId);

  return (
    <main className="mx-auto w-full max-w-[1000px] space-y-6 px-4 py-6 sm:px-6 md:py-8">
      <header className={panel}>
        <h1 className="text-3xl font-bold text-green-950">{room.name}</h1>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-sm text-stone-600">Room code</dt><dd className="font-mono text-lg font-bold">{room.code}</dd></div>
          <div><dt className="text-sm text-stone-600">Host</dt><dd className="font-semibold">{room.hostName}</dd></div>
          <div><dt className="text-sm text-stone-600">Challenge</dt><dd className="font-semibold">{challenge?.title}</dd></div>
          <div><dt className="text-sm text-stone-600">Format</dt><dd>{room.settings.format === "live" ? "Live match" : "Friend challenge"}</dd></div>
          <div><dt className="text-sm text-stone-600">Difficulty</dt><dd className="capitalize">{room.settings.difficulty}</dd></div>
          <div><dt className="text-sm text-stone-600">Length</dt><dd>{room.settings.length} pitches{room.settings.exactVerse ? " · Exact verse" : ""}</dd></div>
        </dl>
        <p className="mt-3 text-sm text-stone-600">Local-only mock: simulated players are computer-controlled, and room data stays in this browser. No online multiplayer connection.</p>
        {isSaved === false && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3">Browser storage is unavailable. This game won't survive a refresh.</p>}
      </header>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 font-semibold text-red-900">{error}</p>}
      {room.status === "lobby" ? (
        <RoomLobby room={room} myPlayer={myPlayer} setMyReady={setMyReady} startMatch={startMatch}
          addSimulatedPlayer={addSimulatedPlayer} removeSimulatedPlayer={removeSimulatedPlayer} onError={setError} />
      ) : room.status === "active" && room.match ? (
        <RoomRounds room={room} myPlayer={myPlayer} answerRound={answerRound} advanceRound={advanceRound}
          simulateOpponentAnswer={simulateOpponentAnswer} onError={setError} />
      ) : <RoomComplete room={room} myPlayer={myPlayer} />}
      <Link to="/create-game" className="inline-block font-semibold text-green-800 underline hover:text-green-950">Create another game</Link>
    </main>
  );
}

export function Game() {
  const [searchParams] = useSearchParams();
  const { findRoom } = useRooms();
  const room = findRoom(searchParams.get("code"));

  if (!room) return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-8 sm:px-6">
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
  return <GameRoom room={room} />;
}
