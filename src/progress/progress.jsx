import React from "react";
import { Link } from "react-router-dom";

export function Progress() {
    return (
  <main className="mx-auto w-full max-w-[1200px] space-y-8 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
    <header className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm md:flex md:items-start md:justify-between md:gap-8">
      <h1 className="text-3xl font-bold text-green-950">Your Progress</h1>

      <p>
        See what you know well, what is still developing, and where your
        practice is making a difference.
      </p>
    </header>

    {/*
      The information on this page represents application data that will
      eventually be retrieved from the database for the signed-in user.
    */}
    <section className="space-y-4" aria-labelledby="overview-heading">
      <h2 className="text-2xl font-bold text-green-950" id="overview-heading">Learning overview</h2>

      <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 [&>div]:rounded-2xl [&>div]:border [&>div]:border-stone-200 [&>div]:bg-white [&>div]:p-5 [&>div]:text-center [&>div]:shadow-sm [&_dt]:text-sm [&_dt]:font-semibold [&_dt]:text-stone-600 [&_dd]:mt-2 [&_dd]:text-2xl [&_dd]:font-bold [&_dd]:text-green-950">
        <div>
          <dt>Strong passages</dt>
          <dd>42</dd>
        </div>

        <div>
          <dt>Learning</dt>
          <dd>18</dd>
        </div>

        <div>
          <dt>Strengthened this week</dt>
          <dd>11</dd>
        </div>

        <div>
          <dt>Practice days this week</dt>
          <dd>5 of 7</dd>
        </div>
      </dl>
    </section>

    <section className="grid grid-cols-1 gap-6 md:grid-cols-3 [&>h2]:col-span-full" aria-labelledby="mastery-heading">
      <h2 className="text-2xl font-bold text-green-950" id="mastery-heading">Mastery by standard work</h2>

      <article className="flex h-full flex-col rounded-2xl border border-stone-200 bg-white p-6 shadow-sm [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-green-950 [&_dl]:mt-4 [&_dl]:grid [&_dl]:gap-3 [&_dl>div]:rounded-lg [&_dl>div]:bg-green-50 [&_dl>div]:p-3 [&_dt]:text-sm [&_dt]:font-semibold [&_dt]:text-stone-600 [&_dd]:mt-1 [&_dd]:font-semibold">
        <h3>Book of Mormon</h3>

        <dl>
          <div>
            <dt>Current strength</dt>
            <dd>Strong</dd>
          </div>

          <div>
            <dt>Book identification</dt>
            <dd>86%</dd>
          </div>

          <div>
            <dt>Chapter identification</dt>
            <dd>72%</dd>
          </div>
        </dl>
      </article>

      <article className="flex h-full flex-col rounded-2xl border border-stone-200 bg-white p-6 shadow-sm [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-green-950 [&_dl]:mt-4 [&_dl]:grid [&_dl]:gap-3 [&_dl>div]:rounded-lg [&_dl>div]:bg-green-50 [&_dl>div]:p-3 [&_dt]:text-sm [&_dt]:font-semibold [&_dt]:text-stone-600 [&_dd]:mt-1 [&_dd]:font-semibold">
        <h3>New Testament</h3>

        <dl>
          <div>
            <dt>Current strength</dt>
            <dd>Learning</dd>
          </div>

          <div>
            <dt>Book identification</dt>
            <dd>74%</dd>
          </div>

          <div>
            <dt>Chapter identification</dt>
            <dd>58%</dd>
          </div>
        </dl>
      </article>

      <article className="flex h-full flex-col rounded-2xl border border-stone-200 bg-white p-6 shadow-sm [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-green-950 [&_dl]:mt-4 [&_dl]:grid [&_dl]:gap-3 [&_dl>div]:rounded-lg [&_dl>div]:bg-green-50 [&_dl>div]:p-3 [&_dt]:text-sm [&_dt]:font-semibold [&_dt]:text-stone-600 [&_dd]:mt-1 [&_dd]:font-semibold">
        <h3>Old Testament</h3>

        <dl>
          <div>
            <dt>Current strength</dt>
            <dd>Familiar</dd>
          </div>

          <div>
            <dt>Book identification</dt>
            <dd>68%</dd>
          </div>

          <div>
            <dt>Chapter identification</dt>
            <dd>51%</dd>
          </div>
        </dl>
      </article>
    </section>

    <section className="grid gap-5 md:grid-cols-2 [&>h2]:md:col-span-2" aria-labelledby="areas-heading">
      <h2 className="text-2xl font-bold text-green-950" id="areas-heading">Areas to strengthen</h2>

      <article className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-bold text-green-950">New Testament chapters</h3>

        <p>
          You often identify the correct book but have more difficulty
          locating the exact chapter.
        </p>

        <Link className="font-semibold text-green-800 hover:text-green-950" to="/play">Practice this area</Link>
      </article>

      <article className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-bold text-green-950">Small Old Testament books</h3>

        <p>
          These books are currently more difficult for you to distinguish
          from one another.
        </p>

        <Link className="font-semibold text-green-800 hover:text-green-950" to="/play">Practice this area</Link>
      </article>
    </section>

    <section className="space-y-4 overflow-x-auto" aria-labelledby="recent-heading">
      <h2 className="text-2xl font-bold text-green-950" id="recent-heading">Recent practice</h2>

      <table className="w-full min-w-[640px] overflow-hidden rounded-xl bg-white text-left shadow-md [&_th]:bg-green-900 [&_th]:px-4 [&_th]:py-3 [&_th]:text-white [&_td]:border-b [&_td]:border-stone-200 [&_td]:px-4 [&_td]:py-3">
        <caption>Example recent practice stored in the database</caption>

        <thead>
          <tr>
            <th scope="col">Challenge</th>
            <th scope="col">Pitches</th>
            <th scope="col">Book accuracy</th>
            <th scope="col">Chapter accuracy</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td>Today's Lineup</td>
            <td>8</td>
            <td>88%</td>
            <td>75%</td>
          </tr>

          <tr>
            <td>Doctrinal Mastery</td>
            <td>10</td>
            <td>90%</td>
            <td>80%</td>
          </tr>

          <tr>
            <td>Four Gospels</td>
            <td>10</td>
            <td>70%</td>
            <td>60%</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="comeback-heading">
      <h2 className="text-2xl font-bold text-green-950" id="comeback-heading">Comeback passages</h2>

      <p>
        These are passages you previously missed and have recently
        retrieved correctly.
      </p>

      <ul className="my-4 list-disc space-y-1 pl-5">
        <li>2 Nephi 2:25</li>
        <li>Alma 32:21</li>
        <li>John 14:6</li>
      </ul>

      <Link className="font-semibold text-green-800 hover:text-green-950" to="/challenges">Practice My Misses</Link>
    </section>

    <section className="grid gap-5 md:grid-cols-2 [&>h2]:md:col-span-2" aria-labelledby="achievements-heading">
      <h2 className="text-2xl font-bold text-green-950" id="achievements-heading">Achievements</h2>

      <article className="flex flex-col rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <h3>Four Gospels</h3>

        <p>
          Demonstrated reliable recognition of passages from Matthew,
          Mark, Luke, and John.
        </p>

        <p>
          <strong>Earned:</strong> [DATE]
        </p>
      </article>

      <article className="flex flex-col rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <h3>Doctrinal Master</h3>

        <p>
          Progress toward demonstrating location mastery across the
          current doctrinal mastery set.
        </p>

        <p>
          <strong>Current progress:</strong> 18 of 24 passages strong
        </p>
      </article>
    </section>

    <section className="space-y-4 overflow-x-auto" aria-labelledby="history-heading">
      <h2 className="text-2xl font-bold text-green-950" id="history-heading">Recent games</h2>

      <table className="w-full min-w-[640px] overflow-hidden rounded-xl bg-white text-left shadow-md [&_th]:bg-green-900 [&_th]:px-4 [&_th]:py-3 [&_th]:text-white [&_td]:border-b [&_td]:border-stone-200 [&_td]:px-4 [&_td]:py-3">
        <caption>Example multiplayer game history stored in the database</caption>

        <thead>
          <tr>
            <th scope="col">Game</th>
            <th scope="col">Challenge</th>
            <th scope="col">Result</th>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td>Family Scripture Game</td>
            <td>Book of Mormon</td>
            <td>8 of 10</td>
          </tr>

          <tr>
            <td>Four Gospels Challenge</td>
            <td>Four Gospels</td>
            <td>7 of 10</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section className="rounded-xl bg-green-50 p-6" aria-labelledby="progress-note-heading">
      <h2 className="text-2xl font-bold text-green-950" id="progress-note-heading">How progress works</h2>

      <p>
        Scripture Baseball tracks book and chapter knowledge separately
        and looks at repeated retrieval over time rather than treating one
        correct answer as mastery.
      </p>

      <p>
        Practice can become more difficult as you improve, so a similar
        accuracy percentage can still represent progress when you are
        answering harder questions.
      </p>
    </section>
  </main>
    );
}