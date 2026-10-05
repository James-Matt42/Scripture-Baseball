import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { navigateWithGetForm } from "../routing";

export function Home() {
  const navigate = useNavigate();

  function handleJoinGame(event) {
    navigateWithGetForm(event, navigate, "/join-game");
  }

  return (
    <main className="sb-main">
      <section className="sb-hero" id="homepage-demo" aria-labelledby="welcome-heading">
        <h1 id="welcome-heading">
          How well do you know where your favorite verses are found?
        </h1>

        <p>
          Test your scripture knowledge one passage at a time.
          Try a pitch before creating an account.
        </p>
      </section>

      <section className="sb-section" aria-labelledby="sample-heading">
        <h2 id="sample-heading">Try a pitch</h2>

        <article className="sb-pitch-card" aria-labelledby="question-heading">
          <h3 id="question-heading">Where is this found?</h3>

          <blockquote className="scripture-text">
            <p>“Adam fell that men might be...”</p>
          </blockquote>

          <form>
            <fieldset className="sb-question-fieldset">
              <legend>Choose a book</legend>

              <div className="sb-answer-list sb-answer-option">
                <input
                  type="radio"
                  id="answer-1-nephi"
                  name="book"
                  value="1-nephi"
                />
                <label className="sb-answer-label sb-answer-button" htmlFor="answer-1-nephi">1 Nephi</label>
              </div>

              <div className="sb-answer-list sb-answer-option">
                <input
                  type="radio"
                  id="answer-2-nephi"
                  name="book"
                  value="2-nephi"
                />
                <label className="sb-answer-label sb-answer-button" htmlFor="answer-2-nephi">2 Nephi</label>
              </div>

              <div className="sb-answer-list sb-answer-option">
                <input
                  type="radio"
                  id="answer-alma"
                  name="book"
                  value="alma"
                />
                <label className="sb-answer-label sb-answer-button" htmlFor="answer-alma">Alma</label>
              </div>

              <div className="sb-answer-list sb-answer-option">
                <input
                  type="radio"
                  id="answer-mosiah"
                  name="book"
                  value="mosiah"
                />
                <label className="sb-answer-label sb-answer-button" htmlFor="answer-mosiah">Mosiah</label>
              </div>
            </fieldset>

            <button className="sb-button-primary" type="button">Submit Answer</button>
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
                  className="sb-form-input sb-chapter-input"
                  id="chapter-answer"
                  name="chapter"
                  type="number"
                  min="1"
                  inputMode="numeric"
                />

                <button className="sb-button-primary" type="button">Submit Chapter</button>
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

            <button className="sb-button-primary" type="button">Next Pitch</button>
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

            <Link to="/account">Save My Progress</Link>
            <button type="button">Keep Playing as Guest</button>
          </section>
        </details>
      </section>

      <section className="sb-cta-section" aria-labelledby="join-heading">
        <h2 id="join-heading">Join a private game</h2>

        <p>
          Have an invite or room code? Join a private game without creating
          an account first.
        </p>

        <form onSubmit={handleJoinGame}>
          <label htmlFor="room-code">Room code</label>

          <input
            id="room-code"
            name="code"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck="false"
          />

          <button className="sb-button-primary" type="submit">Join Game</button>
        </form>
      </section>

      <section aria-labelledby="about-heading">
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
      <section aria-labelledby="translations-heading">
        <h2 id="translations-heading">Compare Bible translations</h2>

        <p>
          When a question comes from the Old or New Testament, you will be
          able to compare the passage with another Bible translation after
          answering.
        </p>

        <p>
          Alternate translation data will be provided by{" "}
          <a href="https://bible-api.com/">Bible API</a>.
        </p>
      </section>
    </main>
  );
}
