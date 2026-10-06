import React from "react";

export function Play() {
    return (
  <main className="mx-auto w-full max-w-[1200px] space-y-8 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
    <header className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm md:flex md:items-start md:justify-between md:gap-8">
      <h1 className="text-3xl font-bold text-green-950">Today's Lineup</h1>
      <p>Ready when you are.</p>
    </header>

    <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="practice-heading">
      <h2 className="text-2xl font-bold text-green-950" id="practice-heading">Current practice</h2>

      <dl className="mt-4 grid gap-3 md:grid-cols-2 [&>div]:rounded-lg [&>div]:bg-amber-50 [&>div]:p-4 [&_dt]:text-sm [&_dt]:font-semibold [&_dt]:uppercase [&_dt]:tracking-wide [&_dt]:text-stone-500 [&_dd]:mt-1 [&_dd]:font-medium [&_dd]:text-green-900">
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

    <article className="mx-auto max-w-4xl rounded-2xl border border-amber-200 bg-white p-4 shadow-lg sm:p-6" aria-labelledby="pitch-heading">
      <header className="mb-6 flex flex-col gap-2 border-b border-stone-200 pb-4 md:flex-row md:items-center md:justify-between">
        <p>Pitch 3</p>
        <h2 className="text-2xl font-bold text-green-950" id="pitch-heading">Where is this found?</h2>
      </header>

      <blockquote className="my-6 rounded-xl bg-amber-50 p-6 text-xl leading-relaxed text-stone-800">
        <p>“Adam fell that men might be...”</p>
      </blockquote>

      <section aria-labelledby="book-stage-heading">
        <h3 className="text-xl font-bold text-green-950" id="book-stage-heading">1. Which book?</h3>

        <form>
          <fieldset className="mt-4 grid gap-3 rounded-xl border border-stone-200 p-5">
            <legend className="px-2 font-semibold text-green-900">Choose a book</legend>

            <div>
              <input
                type="radio"
                id="book-1-nephi"
                className="peer sr-only"
                name="book"
                value="1-nephi"
              />
              <label className="block min-h-12 w-full cursor-pointer rounded-xl border border-stone-200 bg-white px-5 py-4 text-center font-semibold text-stone-800 shadow-sm transition hover:-translate-y-0.5 hover:border-green-700 hover:bg-green-50 hover:text-green-900 hover:shadow-md peer-focus-visible:ring-2 peer-focus-visible:ring-green-300 peer-checked:border-green-900 peer-checked:bg-green-700 peer-checked:text-white" htmlFor="book-1-nephi">1 Nephi</label>
            </div>

            <div>
              <input
                type="radio"
                id="book-2-nephi"
                className="peer sr-only"
                name="book"
                value="2-nephi"
              />
              <label className="block min-h-12 w-full cursor-pointer rounded-xl border border-stone-200 bg-white px-5 py-4 text-center font-semibold text-stone-800 shadow-sm transition hover:-translate-y-0.5 hover:border-green-700 hover:bg-green-50 hover:text-green-900 hover:shadow-md peer-focus-visible:ring-2 peer-focus-visible:ring-green-300 peer-checked:border-green-900 peer-checked:bg-green-700 peer-checked:text-white" htmlFor="book-2-nephi">2 Nephi</label>
            </div>

            <div>
              <input
                type="radio"
                id="book-alma"
                className="peer sr-only"
                name="book"
                value="alma"
              />
              <label className="block min-h-12 w-full cursor-pointer rounded-xl border border-stone-200 bg-white px-5 py-4 text-center font-semibold text-stone-800 shadow-sm transition hover:-translate-y-0.5 hover:border-green-700 hover:bg-green-50 hover:text-green-900 hover:shadow-md peer-focus-visible:ring-2 peer-focus-visible:ring-green-300 peer-checked:border-green-900 peer-checked:bg-green-700 peer-checked:text-white" htmlFor="book-alma">Alma</label>
            </div>

            <div>
              <input
                type="radio"
                id="book-mosiah"
                className="peer sr-only"
                name="book"
                value="mosiah"
              />
              <label className="block min-h-12 w-full cursor-pointer rounded-xl border border-stone-200 bg-white px-5 py-4 text-center font-semibold text-stone-800 shadow-sm transition hover:-translate-y-0.5 hover:border-green-700 hover:bg-green-50 hover:text-green-900 hover:shadow-md peer-focus-visible:ring-2 peer-focus-visible:ring-green-300 peer-checked:border-green-900 peer-checked:bg-green-700 peer-checked:text-white" htmlFor="book-mosiah">Mosiah</label>
            </div>
          </fieldset>

          <button className="w-full cursor-pointer rounded-lg bg-scripture-green sm:w-auto px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="button">Submit Book</button>
        </form>
      </section>

      {/*
        In the finished application, this stage appears after the player
        commits a book answer. Chapter scoring remains independent of the
        selected book.
      */}
      <details className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4" open>
        <summary className="cursor-pointer font-semibold text-green-900">2. Which chapter?</summary>

        <section aria-labelledby="chapter-stage-heading">
          <h3 className="mt-4 text-lg font-bold text-green-950" id="chapter-stage-heading">Enter the chapter</h3>

          <form className="mt-3 grid max-w-sm gap-3">
            <label className="font-semibold text-stone-700" htmlFor="chapter-answer">Chapter</label>
            <input
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

      {/*
        An optional third stage can be enabled in practice settings for
        players who want to identify the exact verse or verse range.
      */}
      <details className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
        <summary className="cursor-pointer font-semibold text-green-900">Advanced setting: exact verse</summary>

        <section aria-labelledby="verse-stage-heading">
          <h3 className="mt-4 text-lg font-bold text-green-950" id="verse-stage-heading">3. Which verse?</h3>

          <p>
            Exact verse identification is optional and intended for a
            higher-difficulty practice setting.
          </p>

          <form className="mt-3 grid max-w-sm gap-3">
            <label className="font-semibold text-stone-700" htmlFor="verse-answer">Verse</label>
            <input
              id="verse-answer"
              name="verse"
              type="number"
              min="1"
              inputMode="numeric"
            />

            <button className="w-full cursor-pointer rounded-lg bg-scripture-green sm:w-auto px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="button">Submit Verse</button>
          </form>
        </section>
      </details>

      {/*
        JavaScript will eventually reveal this after the required answer
        stages are complete.
      */}
      <details className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
        <summary className="cursor-pointer font-semibold text-green-900">Example answer feedback</summary>

        <section aria-labelledby="feedback-heading">
          <h3 className="mt-4 text-lg font-bold text-green-950" id="feedback-heading">Correct reference: 2 Nephi 2:25</h3>

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

          <button className="w-full cursor-pointer rounded-lg bg-scripture-green sm:w-auto px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="button">Next Pitch</button>
        </section>

        <section aria-labelledby="translation-heading">
          <h3 className="mt-4 text-lg font-bold text-green-950" id="translation-heading">Compare Bible translations</h3>

          <p>
            For Old Testament and New Testament passages, an alternate
            translation can be displayed here after the answer is revealed.
          </p>

          <p>
            Translation data will be provided by
            <a className="font-semibold text-green-800 hover:text-green-950" href="https://bible-api.com/">Bible API</a>.
          </p>
        </section>
      </details>
    </article>

    <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="checkpoint-heading">
      <h2 className="text-2xl font-bold text-green-950" id="checkpoint-heading">Current inning</h2>

      <p>3 pitches played.</p>

      <ul className="my-4 list-disc space-y-1 pl-5">
        <li>2 review passages strengthened</li>
        <li>1 new passage introduced</li>
      </ul>

      <p>
        Your progress is saved after every answer, so you can finish
        whenever you need to.
      </p>

      <button className="w-full cursor-pointer rounded-lg border border-scripture-green sm:w-auto bg-white px-6 py-3 font-semibold text-scripture-green transition hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="button">Finish Here</button>
      <button className="w-full cursor-pointer rounded-lg bg-scripture-green sm:w-auto px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="button">Keep Playing</button>
    </section>
  </main>
    );
}