import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { navigateWithGetForm } from "../routing";

export function Home() {
  const navigate = useNavigate();

  function handleJoinGame(event) {
    navigateWithGetForm(event, navigate, "/join-game");
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] space-y-8 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
      <section className="grid gap-6 rounded-xl bg-parchment p-6 md:p-8 lg:grid-cols-2 lg:items-center" id="homepage-demo" aria-labelledby="welcome-heading">
        <h1 className="text-4xl leading-tight text-green-950 md:text-5xl" id="welcome-heading">
          How well do you know where your favorite verses are found?
        </h1>

        <p className="text-lg leading-relaxed text-stone-700">
          Test your scripture knowledge one passage at a time.
          Try a pitch before creating an account.
        </p>
      </section>

      <section className="py-4 md:py-8" aria-labelledby="sample-heading">
        <h2 className="mb-4 text-2xl font-bold text-green-950" id="sample-heading">Try a pitch</h2>

        <article className="rounded-xl border border-amber-200 bg-white p-4 shadow-md sm:p-6" aria-labelledby="question-heading">
          <h3 id="question-heading">Where is this found?</h3>

          <blockquote className="my-6 rounded-lg bg-amber-50 p-6 text-xl leading-relaxed text-stone-800">
            <p>“Adam fell that men might be...”</p>
          </blockquote>

          <form>
            <fieldset className="grid gap-4 rounded-xl border border-amber-200 bg-white p-6">
              <legend>Choose a book</legend>

              <div className="relative">
                <input
                  type="radio"
                  id="answer-1-nephi"
                  className="peer sr-only"
                  name="book"
                  value="1-nephi"
                />
                <label className="block min-h-12 w-full cursor-pointer rounded-xl border border-stone-200 bg-white px-5 py-4 text-center font-semibold text-stone-800 shadow-sm transition hover:-translate-y-0.5 hover:border-green-700 hover:bg-green-50 hover:text-green-900 hover:shadow-md peer-focus-visible:ring-2 peer-focus-visible:ring-green-300 peer-checked:border-green-900 peer-checked:bg-green-700 peer-checked:text-white" htmlFor="answer-1-nephi">1 Nephi</label>
              </div>

              <div className="relative">
                <input
                  type="radio"
                  id="answer-2-nephi"
                  className="peer sr-only"
                  name="book"
                  value="2-nephi"
                />
                <label className="block min-h-12 w-full cursor-pointer rounded-xl border border-stone-200 bg-white px-5 py-4 text-center font-semibold text-stone-800 shadow-sm transition hover:-translate-y-0.5 hover:border-green-700 hover:bg-green-50 hover:text-green-900 hover:shadow-md peer-focus-visible:ring-2 peer-focus-visible:ring-green-300 peer-checked:border-green-900 peer-checked:bg-green-700 peer-checked:text-white" htmlFor="answer-2-nephi">2 Nephi</label>
              </div>

              <div className="relative">
                <input
                  type="radio"
                  id="answer-alma"
                  className="peer sr-only"
                  name="book"
                  value="alma"
                />
                <label className="block min-h-12 w-full cursor-pointer rounded-xl border border-stone-200 bg-white px-5 py-4 text-center font-semibold text-stone-800 shadow-sm transition hover:-translate-y-0.5 hover:border-green-700 hover:bg-green-50 hover:text-green-900 hover:shadow-md peer-focus-visible:ring-2 peer-focus-visible:ring-green-300 peer-checked:border-green-900 peer-checked:bg-green-700 peer-checked:text-white" htmlFor="answer-alma">Alma</label>
              </div>

              <div className="relative">
                <input
                  type="radio"
                  id="answer-mosiah"
                  className="peer sr-only"
                  name="book"
                  value="mosiah"
                />
                <label className="block min-h-12 w-full cursor-pointer rounded-xl border border-stone-200 bg-white px-5 py-4 text-center font-semibold text-stone-800 shadow-sm transition hover:-translate-y-0.5 hover:border-green-700 hover:bg-green-50 hover:text-green-900 hover:shadow-md peer-focus-visible:ring-2 peer-focus-visible:ring-green-300 peer-checked:border-green-900 peer-checked:bg-green-700 peer-checked:text-white" htmlFor="answer-mosiah">Mosiah</label>
              </div>
            </fieldset>

            <button className="w-full cursor-pointer rounded-lg bg-scripture-green sm:w-auto px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="button">Submit Answer</button>
          </form>

          <details>
            <summary>Example next stage</summary>

            <section aria-labelledby="chapter-heading">
              <h3 id="chapter-heading">Which chapter?</h3>

              <p>
                Your chapter answer is recorded separately from your book answer.
              </p>

              <form>
                <label htmlFor="chapter-answer">Chapter</label>
                <input
                  className="mt-2 w-full max-w-xs"
                  id="chapter-answer"
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

        {/*
          JavaScript will eventually show feedback after the player answers.
          The details element keeps the future state represented in the
          prototype without pretending that the game works yet.
        */}
        <details id="sample-feedback">
          <summary>Example answer feedback</summary>

          <section aria-labelledby="feedback-heading">
            <h3 id="feedback-heading">Correct — 2 Nephi 2:25</h3>

            <p>
              After each pitch, the player will see the correct scripture
              reference and useful learning feedback.
            </p>

            <button className="w-full cursor-pointer rounded-lg bg-scripture-green sm:w-auto px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="button">Next Pitch</button>
          </section>
        </details>

        {/* Shown after several guest pitches in the finished application. */}
        <details>
          <summary>Example guest progress</summary>

          <section aria-labelledby="guest-summary-heading">
            <h3 id="guest-summary-heading">You went 4 / 5.</h3>

            <p>
              Create a free account to save your progress, learn which books
              you know best, and get personalized practice.
            </p>

            <Link className="font-semibold text-green-800 hover:text-green-950" to="/account">Save My Progress</Link>
            <button className="w-full cursor-pointer rounded-lg border border-scripture-green sm:w-auto bg-white px-6 py-3 font-semibold text-scripture-green transition hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="button">Keep Playing as Guest</button>
          </section>
        </details>
      </section>

      <section className="rounded-xl bg-green-900 p-6 text-white shadow-md" aria-labelledby="join-heading">
        <h2 id="join-heading">Join a private game</h2>

        <p>
          Have an invite or room code? Join a private game without creating
          an account first.
        </p>

        <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleJoinGame}>
          <label className="font-semibold" htmlFor="room-code">Room code</label>

          <input
            id="room-code"
            name="code"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck="false"
          />

          <button className="w-full cursor-pointer rounded-lg bg-scripture-green sm:w-auto px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="submit">Join Game</button>
        </form>
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm" aria-labelledby="about-heading">
        <h2 id="about-heading">Learn by locating scripture passages</h2>

        <p>
          Scripture Baseball uses retrieval practice to help you learn where
          scripture passages are found. Make an attempt, see the correct
          reference, and keep playing at your own pace.
        </p>

        <p>
          Practice on your own, explore different scripture challenges, or
          play private games with friends and family.
        </p>
      </section>

      {/*
        Bible API will later provide optional alternate translations for
        Old Testament and New Testament passages.
      */}
      <section className="rounded-xl bg-white p-6 shadow-sm" aria-labelledby="translations-heading">
        <h2 id="translations-heading">Compare Bible translations</h2>

        <p>
          When a question comes from the Old or New Testament, you will be
          able to compare the passage with another Bible translation after
          answering.
        </p>

        <p>
          Alternate translation data will be provided by{" "}
          <a className="font-semibold text-green-800 hover:text-green-950" href="https://bible-api.com/">Bible API</a>.
        </p>
      </section>
    </main>
  );
}
