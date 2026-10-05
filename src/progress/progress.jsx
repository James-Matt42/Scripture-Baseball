import React from "react";
import './progress.css';

export function Progress() {
    return (
  <main className="sb-main">
    <header className="sb-header">
      <h1>Your Progress</h1>

      <p>
        See what you know well, what is still developing, and where your
        practice is making a difference.
      </p>
    </header>

    {/*
      The information on this page represents application data that will
      eventually be retrieved from the database for the signed-in user.
    */}
    <section className="sb-progress-grid" aria-labelledby="overview-heading">
      <h2 id="overview-heading">Learning overview</h2>

      <dl>
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

    <section className="sb-mastery-grid" aria-labelledby="mastery-heading">
      <h2 id="mastery-heading">Mastery by standard work</h2>

      <article className="sb-progress-card">
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

      <article className="sb-progress-card">
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

      <article className="sb-progress-card">
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

    <section aria-labelledby="areas-heading">
      <h2 id="areas-heading">Areas to strengthen</h2>

      <article>
        <h3>New Testament chapters</h3>

        <p>
          You often identify the correct book but have more difficulty
          locating the exact chapter.
        </p>

        <a className="sb-progress-link" href="play.html">Practice this area</a>
      </article>

      <article>
        <h3>Small Old Testament books</h3>

        <p>
          These books are currently more difficult for you to distinguish
          from one another.
        </p>

        <a className="sb-progress-link" href="play.html">Practice this area</a>
      </article>
    </section>

    <section aria-labelledby="recent-heading">
      <h2 id="recent-heading">Recent practice</h2>

      <table className="sb-progress-table">
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

    <section aria-labelledby="comeback-heading">
      <h2 id="comeback-heading">Comeback passages</h2>

      <p>
        These are passages you previously missed and have recently
        retrieved correctly.
      </p>

      <ul>
        <li>2 Nephi 2:25</li>
        <li>Alma 32:21</li>
        <li>John 14:6</li>
      </ul>

      <a className="sb-progress-link" href="challenges.html">Practice My Misses</a>
    </section>

    <section aria-labelledby="achievements-heading">
      <h2 id="achievements-heading">Achievements</h2>

      <article className="sb-achievement-card">
        <h3>Four Gospels</h3>

        <p>
          Demonstrated reliable recognition of passages from Matthew,
          Mark, Luke, and John.
        </p>

        <p>
          <strong>Earned:</strong> [DATE]
        </p>
      </article>

      <article>
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

    <section aria-labelledby="history-heading">
      <h2 id="history-heading">Recent games</h2>

      <table className="sb-progress-table">
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

    <section aria-labelledby="progress-note-heading">
      <h2 id="progress-note-heading">How progress works</h2>

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