import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { navigateWithGetForm } from '../routing';

export function CreateGame() {
    const navigate = useNavigate();

    function handleCreateGame(event) {
      navigateWithGetForm(event, navigate, "/game");
    }

    return (
  <main className="mx-auto w-full max-w-[1200px] space-y-8 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
    <header className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm md:flex md:items-start md:justify-between md:gap-8">
      <h1 className="text-3xl font-bold text-green-950">Create a Private Game</h1>

      <p>
        Choose a challenge and a few game settings, then invite your
        friends or family to join.
      </p>
    </header>

    <form className="grid gap-5 rounded-xl border border-stone-200 bg-white p-4 shadow-md sm:p-6" onSubmit={handleCreateGame}>
      <section className="grid gap-3" aria-labelledby="challenge-heading">
        <h2 className="text-xl font-bold text-green-950" id="challenge-heading">Choose a challenge</h2>

        <label className="font-semibold text-stone-700" htmlFor="challenge">Challenge</label>
        <select className="w-full" id="challenge" name="challenge">
          <option value="book-of-mormon">Book of Mormon</option>
          <option value="doctrinal-mastery">Doctrinal Mastery</option>
          <option value="four-gospels">Four Gospels</option>
          <option value="new-testament">New Testament</option>
          <option value="faith">Faith</option>
          <option value="conference">Frequently Cited in Conference</option>
          <option value="obscure">Obscure Scriptures</option>
        </select>

        <p>
          <Link className="font-semibold text-green-800 hover:text-green-950" to="/challenges">Browse all challenges</Link>
        </p>
      </section>

      <section className="grid gap-3" aria-labelledby="format-heading">
        <h2 className="text-xl font-bold text-green-950" id="format-heading">Game format</h2>

        <fieldset className="grid gap-4 rounded-lg border border-stone-200 bg-amber-50 p-4 [&>div]:grid [&>div]:grid-cols-[auto_1fr] [&>div]:items-start [&>div]:gap-x-3 [&>div>p]:col-start-2 [&>div>p]:text-sm [&>div>p]:text-muted">
          <legend>How will this game be played?</legend>

          <div>
            <input
              type="radio"
              className="mt-1 size-4 accent-scripture-green"
              id="format-live"
              name="format"
              value="live"
              defaultChecked
            />
            <label className="font-semibold text-stone-700" htmlFor="format-live">Live private match</label>
            <p>
              Everyone plays together in the same room.
            </p>
          </div>

          <div>
            <input
              type="radio"
              className="mt-1 size-4 accent-scripture-green"
              id="format-async"
              name="format"
              value="async"
            />
            <label className="font-semibold text-stone-700" htmlFor="format-async">Friend challenge</label>
            <p>
              Send the same set of pitches to friends to complete later.
            </p>
          </div>
        </fieldset>
      </section>

      <section className="grid gap-3" aria-labelledby="difficulty-heading">
        <h2 className="text-xl font-bold text-green-950" id="difficulty-heading">Difficulty</h2>

        <fieldset className="grid gap-4 rounded-lg border border-stone-200 bg-amber-50 p-4 [&>div]:grid [&>div]:grid-cols-[auto_1fr] [&>div]:items-start [&>div]:gap-x-3 [&>div>p]:col-start-2 [&>div>p]:text-sm [&>div>p]:text-muted">
          <legend>Choose a difficulty level</legend>

          <div>
            <input
              type="radio"
              className="mt-1 size-4 accent-scripture-green"
              id="difficulty-beginner"
              name="difficulty"
              value="beginner"
            />
            <label className="font-semibold text-stone-700" htmlFor="difficulty-beginner">Beginner</label>
            <p>
              More answer choices and stronger hints.
            </p>
          </div>

          <div>
            <input
              type="radio"
              className="mt-1 size-4 accent-scripture-green"
              id="difficulty-standard"
              name="difficulty"
              value="standard"
              defaultChecked
            />
            <label className="font-semibold text-stone-700" htmlFor="difficulty-standard">Standard</label>
            <p>
              Identify the book first, then the chapter.
            </p>
          </div>

          <div>
            <input
              type="radio"
              className="mt-1 size-4 accent-scripture-green"
              id="difficulty-expert"
              name="difficulty"
              value="expert"
            />
            <label className="font-semibold text-stone-700" htmlFor="difficulty-expert">Expert</label>
            <p>
              Fewer cues and more difficult passages.
            </p>
          </div>
        </fieldset>
      </section>

      <section className="grid gap-3" aria-labelledby="length-heading">
        <h2 className="text-xl font-bold text-green-950" id="length-heading">Game length</h2>

        <fieldset className="grid gap-4 rounded-lg border border-stone-200 bg-amber-50 p-4 [&>div]:grid [&>div]:grid-cols-[auto_1fr] [&>div]:items-start [&>div]:gap-x-3 [&>div>p]:col-start-2 [&>div>p]:text-sm [&>div>p]:text-muted">
          <legend>Number of pitches</legend>

          <div>
            <input
              type="radio"
              className="mt-1 size-4 accent-scripture-green"
              id="length-5"
              name="length"
              value="5"
            />
            <label className="font-semibold text-stone-700" htmlFor="length-5">5 pitches</label>
          </div>

          <div>
            <input
              type="radio"
              className="mt-1 size-4 accent-scripture-green"
              id="length-10"
              name="length"
              value="10"
              defaultChecked
            />
            <label className="font-semibold text-stone-700" htmlFor="length-10">10 pitches</label>
          </div>

          <div>
            <input
              type="radio"
              className="mt-1 size-4 accent-scripture-green"
              id="length-20"
              name="length"
              value="20"
            />
            <label className="font-semibold text-stone-700" htmlFor="length-20">20 pitches</label>
          </div>
        </fieldset>
      </section>

      <section className="grid gap-3" aria-labelledby="answer-settings-heading">
        <h2 className="text-xl font-bold text-green-950" id="answer-settings-heading">Answer settings</h2>

        <p>
          Players normally identify the book first and then the chapter.
        </p>

        <div className="grid grid-cols-[auto_1fr] items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-scripture-green"
            id="exact-verse"
            name="exact-verse"
            value="yes"
          />
          <label className="font-semibold text-stone-700" htmlFor="exact-verse">
            Also require the exact verse
          </label>
        </div>

        <p>
          Exact verse identification adds an additional stage and is
          intended for players who want a harder challenge.
        </p>
      </section>

      <section className="grid gap-3" aria-labelledby="room-settings-heading">
        <h2 className="text-xl font-bold text-green-950" id="room-settings-heading">Room settings</h2>

        <div className="grid gap-2">
          <label className="font-semibold text-stone-700" htmlFor="game-name">Game name</label>
          <input
            id="game-name"
            name="game-name"
            type="text"
            placeholder="Saturday Scripture Game"
          />
        </div>

        <div className="grid gap-2">
          <label className="font-semibold text-stone-700" htmlFor="max-players">Maximum players</label>
          <select className="w-full" id="max-players" name="max-players" defaultValue="4">
            <option value="2">2 players</option>
            <option value="4">4 players</option>
            <option value="8">8 players</option>
            <option value="12">12 players</option>
          </select>
        </div>
      </section>

      <button className="w-full cursor-pointer rounded-lg bg-scripture-green sm:w-auto px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="submit">Create Game</button>
    </form>

    <section className="grid gap-3" aria-labelledby="after-creation-heading">
      <h2 className="text-xl font-bold text-green-950" id="after-creation-heading">After you create the game</h2>

      <p>
        A private room will be created with a short join code, invitation
        link, and QR code that you can share with other players.
      </p>

      <p>
        Invited players will be able to sign in or continue as a guest
        without losing their place in the room.
      </p>
    </section>
  </main>
    );
}