import React from "react";
import { Link } from "react-router-dom";

export function Game() {
    return (
  <main className="mx-auto w-full max-w-[1200px] space-y-8 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
    <header className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm md:flex md:items-start md:justify-between md:gap-8">
      <h1 className="text-3xl font-bold text-green-950">Book of Mormon Baseball</h1>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt>Room code</dt>
          <dd>NEPHI7</dd>
        </div>

        <div>
          <dt>Host</dt>
          <dd>[HOST NAME]</dd>
        </div>

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
      </dl>
    </header>

    {/*
      This section represents the multiplayer lobby before the host starts
      the game. Player membership will eventually update in realtime.
    */}
    <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="lobby-heading">
      <h2 className="text-2xl font-bold text-green-950" id="lobby-heading">Lobby</h2>

      <p>3 of 4 players have joined.</p>

      <ul className="my-4 list-disc space-y-1 pl-5">
        <li>[HOST NAME] — Host</li>
        <li>[PLAYER NAME]</li>
        <li>[PLAYER NAME]</li>
        <li>Waiting for player...</li>
      </ul>

      <p>
        Player joins and departures will update here in realtime using
        WebSocket communication with the server.
      </p>

      <button className="w-full cursor-pointer rounded-lg bg-scripture-green sm:w-auto px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="button">Start Game</button>
    </section>

    <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="invite-heading">
      <h2 className="text-2xl font-bold text-green-950" id="invite-heading">Invite players</h2>

      <p>
        Share the room code, invitation link, or QR code with people you
        want to play with.
      </p>

      <dl>
        <div>
          <dt>Room code</dt>
          <dd>NEPHI7</dd>
        </div>

        <div>
          <dt>Invitation link</dt>
          <dd>
            <Link className="font-semibold text-green-800 hover:text-green-950" to="/join-game?code=NEPHI7">
              /join-game?code=NEPHI7
            </Link>
          </dd>
        </div>
      </dl>

      <button className="w-full cursor-pointer rounded-lg border border-scripture-green sm:w-auto bg-white px-6 py-3 font-semibold text-scripture-green transition hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="button">Copy Invitation Link</button>

      <figure className="mt-5 rounded-xl bg-amber-50 p-5 text-center">
        <div className="font-mono text-lg font-bold text-green-950" aria-label="QR code placeholder">
          [QR CODE]
        </div>
        <figcaption>
          QR code for joining room NEPHI7
        </figcaption>
      </figure>
    </section>

    {/*
      This represents how the same page may look after the host starts
      the game. JavaScript and React will eventually switch between lobby,
      gameplay, feedback, and results states.
    */}
    <section className="space-y-4" aria-labelledby="game-heading">
      <h2 className="text-2xl font-bold text-green-950" id="game-heading">Example active game</h2>

      <p>Pitch 3 of 10</p>

      <article className="mx-auto max-w-4xl rounded-2xl border border-amber-200 bg-white p-4 shadow-lg sm:p-6" aria-labelledby="pitch-heading">
        <h3 className="text-xl font-bold text-green-950" id="pitch-heading">Where is this found?</h3>

        <blockquote className="my-6 rounded-xl bg-amber-50 p-6 text-xl leading-relaxed text-stone-800">
          <p>“Adam fell that men might be...”</p>
        </blockquote>

        <section aria-labelledby="book-heading">
          <h4 className="text-lg font-bold text-green-950" id="book-heading">1. Which book?</h4>

          <form>
            <fieldset className="mt-4 grid gap-3 rounded-xl border border-stone-200 p-5">
              <legend className="px-2 font-semibold text-green-900">Choose a book</legend>

              <div>
                <input
                  type="radio"
                  id="game-book-1-nephi"
                  className="peer sr-only"
                  name="book"
                  value="1-nephi"
                />
                <label className="block min-h-12 w-full cursor-pointer rounded-xl border border-stone-200 bg-white px-5 py-4 text-center font-semibold text-stone-800 shadow-sm transition hover:-translate-y-0.5 hover:border-green-700 hover:bg-green-50 hover:text-green-900 hover:shadow-md peer-focus-visible:ring-2 peer-focus-visible:ring-green-300 peer-checked:border-green-900 peer-checked:bg-green-700 peer-checked:text-white" htmlFor="game-book-1-nephi">1 Nephi</label>
              </div>

              <div>
                <input
                  type="radio"
                  id="game-book-2-nephi"
                  className="peer sr-only"
                  name="book"
                  value="2-nephi"
                />
                <label className="block min-h-12 w-full cursor-pointer rounded-xl border border-stone-200 bg-white px-5 py-4 text-center font-semibold text-stone-800 shadow-sm transition hover:-translate-y-0.5 hover:border-green-700 hover:bg-green-50 hover:text-green-900 hover:shadow-md peer-focus-visible:ring-2 peer-focus-visible:ring-green-300 peer-checked:border-green-900 peer-checked:bg-green-700 peer-checked:text-white" htmlFor="game-book-2-nephi">2 Nephi</label>
              </div>

              <div>
                <input
                  type="radio"
                  id="game-book-alma"
                  className="peer sr-only"
                  name="book"
                  value="alma"
                />
                <label className="block min-h-12 w-full cursor-pointer rounded-xl border border-stone-200 bg-white px-5 py-4 text-center font-semibold text-stone-800 shadow-sm transition hover:-translate-y-0.5 hover:border-green-700 hover:bg-green-50 hover:text-green-900 hover:shadow-md peer-focus-visible:ring-2 peer-focus-visible:ring-green-300 peer-checked:border-green-900 peer-checked:bg-green-700 peer-checked:text-white" htmlFor="game-book-alma">Alma</label>
              </div>

              <div>
                <input
                  type="radio"
                  id="game-book-mosiah"
                  className="peer sr-only"
                  name="book"
                  value="mosiah"
                />
                <label className="block min-h-12 w-full cursor-pointer rounded-xl border border-stone-200 bg-white px-5 py-4 text-center font-semibold text-stone-800 shadow-sm transition hover:-translate-y-0.5 hover:border-green-700 hover:bg-green-50 hover:text-green-900 hover:shadow-md peer-focus-visible:ring-2 peer-focus-visible:ring-green-300 peer-checked:border-green-900 peer-checked:bg-green-700 peer-checked:text-white" htmlFor="game-book-mosiah">Mosiah</label>
              </div>
            </fieldset>

            <button className="w-full cursor-pointer rounded-lg bg-scripture-green sm:w-auto px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="button">Submit Book</button>
          </form>
        </section>

        <details className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4" open>
          <summary className="cursor-pointer font-semibold text-green-900">2. Which chapter?</summary>

          <section aria-labelledby="game-chapter-heading">
            <h4 className="mt-4 text-lg font-bold text-green-950" id="game-chapter-heading">Enter the chapter</h4>

            <form className="mt-3 grid max-w-sm gap-3">
              <label className="font-semibold text-stone-700" htmlFor="game-chapter-answer">Chapter</label>

              <input
                id="game-chapter-answer"
                name="chapter"
                type="number"
                min="1"
                inputMode="numeric"
              />

              <button className="w-full cursor-pointer rounded-lg bg-scripture-green sm:w-auto px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="button">Submit Chapter</button>
            </form>
          </section>
        </details>
      </article>

      <details className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <summary className="cursor-pointer font-semibold text-green-900">Example answer reveal</summary>

        <section aria-labelledby="reveal-heading">
          <h3 id="reveal-heading">
            Correct reference: 2 Nephi 2:25
          </h3>

          <p>
            Each player will receive the correct reference and personal
            feedback after answering.
          </p>

          <button className="w-full cursor-pointer rounded-lg bg-scripture-green sm:w-auto px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="button">Continue</button>
        </section>
      </details>
    </section>

    <section className="rounded-xl bg-green-950 p-5 text-white shadow-md" aria-labelledby="score-heading">
      <h2 className="text-2xl font-bold" id="score-heading">Current game standings</h2>

      <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[560px] text-left [&_th]:border-b [&_th]:border-green-800 [&_th]:px-3 [&_th]:py-2 [&_td]:border-b [&_td]:border-green-900 [&_td]:px-3 [&_td]:py-2">
        <caption>
          Example scores for players in this private game
        </caption>

        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col">Correct books</th>
            <th scope="col">Correct chapters</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td>[PLAYER NAME]</td>
            <td>3</td>
            <td>2</td>
          </tr>

          <tr>
            <td>[PLAYER NAME]</td>
            <td>2</td>
            <td>2</td>
          </tr>

          <tr>
            <td>[PLAYER NAME]</td>
            <td>2</td>
            <td>1</td>
          </tr>
        </tbody>
      </table>
      </div>

      <p className="mt-4 text-green-50">
        The final scoring presentation may include lightweight baseball
        elements, while book and chapter performance remain clearly
        understandable.
      </p>
    </section>

    {/*
      WebSocket data placeholder required for the HTML deliverable.
      These events will eventually be pushed from the backend to connected
      players without requiring them to refresh the page.
    */}
    <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="activity-heading">
      <h2 className="text-2xl font-bold text-green-950" id="activity-heading">Live game activity</h2>

      <p>
        Realtime room events will appear here as they are received from
        the server.
      </p>

      <ul className="my-4 list-disc space-y-1 pl-5">
        <li>[PLAYER NAME] joined the room.</li>
        <li>[PLAYER NAME] is ready.</li>
        <li>The host started the game.</li>
        <li>All players submitted Pitch 2.</li>
      </ul>

      <p>
        <strong>Technology placeholder:</strong>
        This activity feed and multiplayer game state will be updated
        using WebSocket communication.
      </p>
    </section>

    <details className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
      <summary className="cursor-pointer font-semibold text-green-900">Example game results</summary>

      <section aria-labelledby="results-heading">
        <h2 className="mt-4 text-2xl font-bold text-green-950" id="results-heading">Game complete</h2>

        <p>You answered 8 of 10 books correctly.</p>
        <p>You answered 6 of 10 chapters correctly.</p>

        <h3>Passages to review</h3>

        <ul className="my-4 list-disc space-y-1 pl-5">
          <li>Alma 32:21</li>
          <li>Helaman 5:12</li>
        </ul>

        <p>
          Signed-in players will have their attempts and learning history
          saved to the database.
        </p>

        <Link className="mr-4 font-semibold text-green-800 hover:text-green-950" to="/play">Practice Missed Passages</Link>
        <Link className="mr-4 font-semibold text-green-800 hover:text-green-950" to="/create-game">Create Another Game</Link>
        <Link className="mr-4 font-semibold text-green-800 hover:text-green-950" to="/progress">View Progress</Link>
      </section>
    </details>
  </main>
    );
}