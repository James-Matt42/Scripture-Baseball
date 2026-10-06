import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { navigateWithGetForm } from '../routing';

export function JoinGame() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const invitationCode = searchParams.get("code") ?? "";
    const roomCode = invitationCode || "NEPHI7";

    function handleFindGame(event) {
      navigateWithGetForm(event, navigate, "/game");
    }

    function handleGuestJoin(event) {
      navigateWithGetForm(event, navigate, "/game");
    }

    function handleSignInJoin(event) {
      navigateWithGetForm(event, navigate, "/game", ["code"]);
    }

    return (
  <main className="mx-auto w-full max-w-[1200px] space-y-8 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
    <header className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm md:flex md:items-start md:justify-between md:gap-8">
      <h1 className="text-3xl font-bold text-green-950">Join a Private Game</h1>

      <p>
        Enter a room code or open an invitation from someone you know.
        You can join without creating an account first.
      </p>
    </header>

    <section className="grid gap-3" aria-labelledby="code-heading">
      <h2 className="text-2xl font-bold text-green-950" id="code-heading">Enter a room code</h2>

      <form className="grid max-w-xl gap-4 rounded-xl border border-stone-200 bg-white p-4 shadow-md sm:p-6" onSubmit={handleFindGame}>
        <label className="font-semibold text-stone-700" htmlFor="room-code">Room code</label>

        <input
          id="room-code"
          name="code"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck="false"
          placeholder="NEPHI7"
          defaultValue={invitationCode}
          required
        />

        <button className="w-full cursor-pointer rounded-lg bg-scripture-green sm:w-auto px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="submit">Find Game</button>
      </form>
    </section>

    {/*
      In the finished application, this room preview will appear after a
      valid invitation link or room code has been found.
    */}
    <section className="grid gap-3" aria-labelledby="preview-heading">
      <h2 className="text-2xl font-bold text-green-950" id="preview-heading">Example room invitation</h2>

      <article className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-bold text-green-950">Book of Mormon Baseball</h3>

        <p>
          <strong>[HOST NAME]</strong> invited you to a private game.
        </p>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-amber-50 p-4">
            <dt>Challenge</dt>
            <dd>Book of Mormon</dd>
          </div>

          <div className="rounded-lg bg-amber-50 p-4">
            <dt>Difficulty</dt>
            <dd>Standard</dd>
          </div>

          <div className="rounded-lg bg-amber-50 p-4">
            <dt>Game length</dt>
            <dd>10 pitches</dd>
          </div>

          <div className="rounded-lg bg-amber-50 p-4">
            <dt>Players</dt>
            <dd>2 of 4 joined</dd>
          </div>
        </dl>
      </article>
    </section>

    <section className="grid gap-5 md:grid-cols-2 [&>h2]:md:col-span-2" aria-labelledby="identity-heading">
      <h2 className="text-2xl font-bold text-green-950" id="identity-heading">How would you like to join?</h2>

      <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="guest-heading">
        <h3 className="text-xl font-bold text-green-950" id="guest-heading">Continue as a guest</h3>

        <p>
          Choose a display name and join the room without creating an
          account.
        </p>

        <form className="mt-4 grid gap-4" onSubmit={handleGuestJoin}>
          <label className="font-semibold text-stone-700" htmlFor="guest-name">Display name</label>

          <input
            id="guest-name"
            name="display-name"
            type="text"
            autoComplete="nickname"
            placeholder="Your name"
            required
          />

          <input
            type="hidden"
            name="code"
            defaultValue={roomCode}
          />

          <button className="w-full cursor-pointer rounded-lg bg-scripture-green sm:w-auto px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="submit">Continue as Guest</button>
        </form>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="sign-in-heading">
        <h3 className="text-xl font-bold text-green-950" id="sign-in-heading">Sign in</h3>

        <p>
          Sign in to keep your game result and add it to your learning
          history.
        </p>

        <form className="mt-4 grid gap-4" onSubmit={handleSignInJoin}>
          <div className="grid gap-2">
            <label className="font-semibold text-stone-700" htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>

          <div className="grid gap-2">
            <label className="font-semibold text-stone-700" htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          <input
            type="hidden"
            name="code"
            defaultValue={roomCode}
          />

          <button className="w-full cursor-pointer rounded-lg bg-scripture-green sm:w-auto px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="submit">Sign In and Join</button>
        </form>

        <p>
          <Link className="font-semibold text-green-800 hover:text-green-950" to={`/account?code=${encodeURIComponent(roomCode)}`}>
            Need an account? Create one without losing this room.
          </Link>
        </p>
      </section>
    </section>

    <section className="rounded-xl bg-green-50 p-6" aria-labelledby="state-heading">
      <h2 className="text-2xl font-bold text-green-950" id="state-heading">Your place in the game is preserved</h2>

      <p>
        In the finished application, joining creates a temporary player
        identity for this room. If you sign in or create an account, your
        room membership and game activity stay attached to the same player.
      </p>
    </section>
  </main>
    );
}