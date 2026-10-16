import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { navigateWithGetForm } from "../routing";
import { ScriptureQuestion } from "../components/ScriptureQuestion";
import { SAMPLE_QUESTIONS } from "../scripture/questions";

export function Home() {
  const navigate = useNavigate();
  const [questionIndex, setQuestionIndex] = useState(0);
  const [guestAttempts, setGuestAttempts] = useState([]);
  const currentQuestion = SAMPLE_QUESTIONS[questionIndex];
  const correctBooks = guestAttempts.filter((attempt) => attempt.bookCorrect).length;
  const correctChapters = guestAttempts.filter((attempt) => attempt.chapterCorrect).length;

  function nextPitch() {
    setQuestionIndex((index) => (index + 1) % SAMPLE_QUESTIONS.length);
  }

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

        <article className="rounded-xl border border-amber-200 bg-white p-4 shadow-md sm:p-6">
          <p className="mb-4 text-sm font-semibold text-green-900">
            Guest demo · Passage {questionIndex + 1} of {SAMPLE_QUESTIONS.length}
          </p>
          <ScriptureQuestion
            key={currentQuestion.id}
            question={currentQuestion}
            onAnswered={(attempt) => setGuestAttempts((attempts) => [...attempts, attempt])}
            onNext={nextPitch}
          />
        </article>

        {guestAttempts.length > 0 && (
          <section className="mt-4 rounded-xl border border-amber-200 bg-white p-5 shadow-sm" aria-labelledby="guest-summary-heading">
            <h3 className="text-lg font-bold text-green-950" id="guest-summary-heading">Your guest scoreboard</h3>
            <p className="mt-2 text-stone-700">
              {guestAttempts.length} {guestAttempts.length === 1 ? "pitch" : "pitches"} completed ·
              {" "}{correctBooks} correct {correctBooks === 1 ? "book" : "books"} ·
              {" "}{correctChapters} correct {correctChapters === 1 ? "chapter" : "chapters"}
            </p>
            <p className="mt-2 text-sm text-stone-600">
              Demo scores are temporary. Solo practice saves on this device.
            </p>
            <Link className="mt-3 inline-block font-semibold text-green-800 hover:text-green-950" to="/account">
              Explore accounts
            </Link>
          </section>
        )}
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
            placeholder="ABC234"
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
