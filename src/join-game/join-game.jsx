import React from "react";
import './join-game.css';

export function JoinGame() {
    return (
  <main className="sb-main">
    <header className="sb-header">
      <h1>Join a Private Game</h1>

      <p>
        Enter a room code or open an invitation from someone you know.
        You can join without creating an account first.
      </p>
    </header>

    <section className="sb-form-group" aria-labelledby="code-heading">
      <h2 id="code-heading">Enter a room code</h2>

      <form className="sb-form-card" action="game.html" method="get">
        <label className="sb-form-label" htmlFor="room-code">Room code</label>

        <input
          id="room-code"
          name="code"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck="false"
          placeholder="NEPHI7"
          required
        />

        <button className="sb-button-primary" type="submit">Find Game</button>
      </form>
    </section>

    {/*
      In the finished application, this room preview will appear after a
      valid invitation link or room code has been found.
    */}
    <section className="sb-form-group" aria-labelledby="preview-heading">
      <h2 id="preview-heading">Example room invitation</h2>

      <article>
        <h3>Book of Mormon Baseball</h3>

        <p>
          <strong>[HOST NAME]</strong> invited you to a private game.
        </p>

        <dl>
          <div>
            <dt>Challenge</dt>
            <dd>Book of Mormon</dd>
          </div>

          <div>
            <dt>Difficulty</dt>
            <dd>Standard</dd>
          </div>

          <div>
            <dt>Game length</dt>
            <dd>10 pitches</dd>
          </div>

          <div>
            <dt>Players</dt>
            <dd>2 of 4 joined</dd>
          </div>
        </dl>
      </article>
    </section>

    <section className="sb-form-group" aria-labelledby="identity-heading">
      <h2 id="identity-heading">How would you like to join?</h2>

      <section className="sb-form-group" aria-labelledby="guest-heading">
        <h3 id="guest-heading">Continue as a guest</h3>

        <p>
          Choose a display name and join the room without creating an
          account.
        </p>

        <form action="game.html" method="get">
          <label className="sb-form-label" htmlFor="guest-name">Display name</label>

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
            value="NEPHI7"
          />

          <button className="sb-button-primary" type="submit">Continue as Guest</button>
        </form>
      </section>

      <section className="sb-form-group" aria-labelledby="sign-in-heading">
        <h3 id="sign-in-heading">Sign in</h3>

        <p>
          Sign in to keep your game result and add it to your learning
          history.
        </p>

        <form action="game.html" method="get">
          <div>
            <label className="sb-form-label" htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="sb-form-label" htmlFor="password">Password</label>
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
            value="NEPHI7"
          />

          <button className="sb-button-primary" type="submit">Sign In and Join</button>
        </form>

        <p>
          <a href="account.html">
            Need an account? Create one without losing this room.
          </a>
        </p>
      </section>
    </section>

    <section className="sb-form-group" aria-labelledby="state-heading">
      <h2 id="state-heading">Your place in the game is preserved</h2>

      <p>
        In the finished application, joining creates a temporary player
        identity for this room. If you sign in or create an account, your
        room membership and game activity stay attached to the same player.
      </p>
    </section>
  </main>
    );
}