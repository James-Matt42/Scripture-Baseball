import React from "react";
import './play.css';

export function Play() {
    return (
  <main class="sb-main">
    <header class="sb-header">
      <h1>Today's Lineup</h1>
      <p>Ready when you are.</p>
    </header>

    <section aria-labelledby="practice-heading">
      <h2 id="practice-heading">Current practice</h2>

      <dl>
        <div>
          <dt>Challenge</dt>
          <dd>Daily Lineup</dd>
        </div>

        <div>
          <dt>Mode</dt>
          <dd>Solo practice</dd>
        </div>

        <div>
          <dt>Answer format</dt>
          <dd>Book, then chapter</dd>
        </div>

        <div>
          <dt>Exact verse</dt>
          <dd>Off — available as an advanced setting</dd>
        </div>
      </dl>
    </section>

    <article class="sb-game-card" aria-labelledby="pitch-heading">
      <header class="sb-header">
        <p>Pitch 3</p>
        <h2 id="pitch-heading">Where is this found?</h2>
      </header>

      <blockquote class="scripture-text">
        <p>“Adam fell that men might be...”</p>
      </blockquote>

      <section aria-labelledby="book-stage-heading">
        <h3 id="book-stage-heading">1. Which book?</h3>

        <form>
          <fieldset>
            <legend>Choose a book</legend>

            <div>
              <input
                type="radio"
                id="book-1-nephi"
                name="book"
                value="1-nephi"
              />
              <label class="sb-answer-label sb-answer-button" for="book-1-nephi">1 Nephi</label>
            </div>

            <div>
              <input
                type="radio"
                id="book-2-nephi"
                name="book"
                value="2-nephi"
              />
              <label class="sb-answer-label sb-answer-button" for="book-2-nephi">2 Nephi</label>
            </div>

            <div>
              <input
                type="radio"
                id="book-alma"
                name="book"
                value="alma"
              />
              <label class="sb-answer-label sb-answer-button" for="book-alma">Alma</label>
            </div>

            <div>
              <input
                type="radio"
                id="book-mosiah"
                name="book"
                value="mosiah"
              />
              <label class="sb-answer-label sb-answer-button" for="book-mosiah">Mosiah</label>
            </div>
          </fieldset>

          <button class="sb-button-primary" type="button">Submit Book</button>
        </form>
      </section>

      {/* <!--
        In the finished application, this stage appears after the player
        commits a book answer. Chapter scoring remains independent of the
        selected book.
      --> */}
      <details open>
        <summary>2. Which chapter?</summary>

        <section aria-labelledby="chapter-stage-heading">
          <h3 id="chapter-stage-heading">Enter the chapter</h3>

          <form>
            <label for="chapter-answer">Chapter</label>
            <input
              id="chapter-answer"
              name="chapter"
              type="number"
              min="1"
              inputmode="numeric"
            />

            <button class="sb-button-primary" type="button">Submit Chapter</button>
          </form>
        </section>
      </details>

      {/* <!--
        An optional third stage can be enabled in practice settings for
        players who want to identify the exact verse or verse range.
      --> */}
      <details>
        <summary>Advanced setting: exact verse</summary>

        <section aria-labelledby="verse-stage-heading">
          <h3 id="verse-stage-heading">3. Which verse?</h3>

          <p>
            Exact verse identification is optional and intended for a
            higher-difficulty practice setting.
          </p>

          <form>
            <label for="verse-answer">Verse</label>
            <input
              id="verse-answer"
              name="verse"
              type="number"
              min="1"
              inputmode="numeric"
            />

            <button class="sb-button-primary" type="button">Submit Verse</button>
          </form>
        </section>
      </details>

      {/* <!--
        JavaScript will eventually reveal this after the required answer
        stages are complete.
      --> */}
      <details>
        <summary>Example answer feedback</summary>

        <section aria-labelledby="feedback-heading">
          <h3 id="feedback-heading">Correct reference: 2 Nephi 2:25</h3>

          <dl>
            <div>
              <dt>Book</dt>
              <dd>Your book result will appear here.</dd>
            </div>

            <div>
              <dt>Chapter</dt>
              <dd>Your chapter result will appear here separately.</dd>
            </div>

            <div>
              <dt>Verse</dt>
              <dd>
                Shown when exact-verse practice is enabled.
              </dd>
            </div>
          </dl>

          <p>
            Feedback will identify what you knew correctly even when
            another part of the reference was incorrect.
          </p>

          <button class="sb-button-primary" type="button">Next Pitch</button>
        </section>

        <section aria-labelledby="translation-heading">
          <h3 id="translation-heading">Compare Bible translations</h3>

          <p>
            For Old Testament and New Testament passages, an alternate
            translation can be displayed here after the answer is revealed.
          </p>

          <p>
            Translation data will be provided by
            <a href="https://bible-api.com/">Bible API</a>.
          </p>
        </section>
      </details>
    </article>

    <section aria-labelledby="checkpoint-heading">
      <h2 id="checkpoint-heading">Current inning</h2>

      <p>3 pitches played.</p>

      <ul>
        <li>2 review passages strengthened</li>
        <li>1 new passage introduced</li>
      </ul>

      <p>
        Your progress is saved after every answer, so you can finish
        whenever you need to.
      </p>

      <button class="sb-button-secondary" type="button">Finish Here</button>
      <button class="sb-button-primary" type="button">Keep Playing</button>
    </section>
  </main>
    );
}