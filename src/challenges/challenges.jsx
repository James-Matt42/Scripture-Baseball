import React from "react";
import { Link } from "react-router-dom";
import './challenges.css';

export function Challenges() {
    return (
          <main className="sb-main">
    <header className="sb-page-heading">
      <h1>Challenges</h1>

      <p>
        Choose a focused set of scripture passages to practice on your own
        or use in a private game.
      </p>
    </header>

    <section className="sb-challenge-section" aria-labelledby="recommended-heading">
      <h2 id="recommended-heading">Recommended for you</h2>

      <article className="sb-challenge-card">
        <h3>Today's Lineup</h3>

        <p>
          Personalized practice drawn from passages that are useful for you
          to review now, along with some new material.
        </p>

        <p>
          <strong>Practice style:</strong> Adaptive solo practice
        </p>

        <Link to="/play">Play Today's Lineup</Link>
      </article>

      <article className="sb-challenge-card">
        <h3>Doctrinal Mastery</h3>

        <p>
          Practice locating passages from the doctrinal mastery collection.
        </p>

        <p>
          <strong>Practice style:</strong> Focused challenge
        </p>

        <Link to="/play">Practice Doctrinal Mastery</Link>
        <Link to="/create-game">Create a Multiplayer Game</Link>
      </article>

      <article className="sb-challenge-card">
        <h3>Four Gospels</h3>

        <p>
          Practice distinguishing passages from Matthew, Mark, Luke,
          and John.
        </p>

        <p>
          <strong>Practice style:</strong> Mixed recognition and recall
        </p>

        <Link to="/play">Practice the Four Gospels</Link>
        <Link to="/create-game">Create a Multiplayer Game</Link>
      </article>
    </section>

    {/*
      These challenges will eventually be generated from data stored for
      the signed-in user.
    */}
    <section className="sb-challenge-section" aria-labelledby="personal-heading">
      <h2 id="personal-heading">Your challenges</h2>

      <article className="sb-challenge-card">
        <h3>My Misses</h3>

        <p>
          Revisit passages you have previously answered incorrectly.
        </p>

        <p>
          <strong>Example database data:</strong>
          14 passages currently available for review.
        </p>

        <Link to="/play">Practice My Misses</Link>
      </article>

      <article className="sb-challenge-card">
        <h3>My Favorites</h3>

        <p>
          Practice passages you have saved to your personal collection.
        </p>

        <p>
          <strong>Example database data:</strong>
          8 favorite passages saved.
        </p>

        <Link to="/play">Practice My Favorites</Link>
      </article>

      <article className="sb-challenge-card">
        <h3>Weak Areas</h3>

        <p>
          Focus on books and passages where your recent retrieval has been
          less reliable.
        </p>

        <p>
          <strong>Example database data:</strong>
          New Testament chapters are currently your highest-priority area.
        </p>

        <Link to="/play">Practice Weak Areas</Link>
      </article>
    </section>

    <section className="sb-challenge-section" aria-labelledby="browse-heading">
      <h2 id="browse-heading">Browse challenges</h2>

      <p>
        Use these options to narrow the challenge catalog.
      </p>

      {/*
        Filtering will become interactive when JavaScript and React are
        introduced later in the course.
      */}
      <form>
        <div>
          <label htmlFor="volume-filter">Standard work</label>
          <select id="volume-filter" name="volume">
            <option value="">All standard works</option>
            <option value="old-testament">Old Testament</option>
            <option value="new-testament">New Testament</option>
            <option value="book-of-mormon">Book of Mormon</option>
            <option value="doctrine-and-covenants">
              Doctrine and Covenants
            </option>
            <option value="pearl-of-great-price">
              Pearl of Great Price
            </option>
          </select>
        </div>

        <div>
          <label htmlFor="category-filter">Category</label>
          <select id="category-filter" name="category">
            <option value="">All categories</option>
            <option value="volume">Books and volumes</option>
            <option value="doctrinal-mastery">Doctrinal mastery</option>
            <option value="topic">Topics</option>
            <option value="conference">Conference citations</option>
            <option value="personal">Personal collections</option>
            <option value="expert">Expert challenges</option>
          </select>
        </div>

        <div>
          <label htmlFor="difficulty-filter">Difficulty</label>
          <select id="difficulty-filter" name="difficulty">
            <option value="">Any difficulty</option>
            <option value="beginner">Beginner</option>
            <option value="standard">Standard</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        <button className="sb-button-primary" type="button">Apply Filters</button>
      </form>
    </section>

    <section aria-labelledby="catalog-heading">
      <h2 id="catalog-heading">Challenge catalog</h2>

      <section aria-labelledby="volume-heading">
        <h3 id="volume-heading">Books and volumes</h3>

        <article className="sb-challenge-card">
          <h4>Book of Mormon</h4>
          <p>
            Practice locating passages throughout the Book of Mormon.
          </p>
          <Link to="/play">Start Challenge</Link>
        </article>

        <article className="sb-challenge-card">
          <h4>New Testament</h4>
          <p>
            Practice locating passages throughout the New Testament.
          </p>
          <Link to="/play">Start Challenge</Link>
        </article>

        <article className="sb-challenge-card">
          <h4>Alma</h4>
          <p>
            Focus your practice on passages from the book of Alma.
          </p>
          <Link to="/play">Start Challenge</Link>
        </article>
      </section>

      <section aria-labelledby="topic-heading">
        <h3 id="topic-heading">Topics and collections</h3>

        <article className="sb-challenge-card">
          <h4>Faith</h4>
          <p>
            Practice locating passages connected with the topic of faith.
          </p>
          <Link to="/play">Start Challenge</Link>
        </article>

        <article className="sb-challenge-card">
          <h4>Prayer</h4>
          <p>
            Practice locating passages connected with prayer.
          </p>
          <Link to="/play">Start Challenge</Link>
        </article>

        <article className="sb-challenge-card">
          <h4>Frequently Cited in Conference</h4>
          <p>
            Practice passages that appear frequently in General Conference
            citations.
          </p>
          <Link to="/play">Start Challenge</Link>
        </article>
      </section>

      <section aria-labelledby="advanced-heading">
        <h3 id="advanced-heading">Advanced challenges</h3>

        <article className="sb-challenge-card">
          <h4>Obscure Scriptures</h4>

          <p>
            Test yourself with less familiar passages and fewer obvious
            contextual clues.
          </p>

          <Link to="/play">Start Challenge</Link>
        </article>

        <article className="sb-challenge-card">
          <h4>Isaiah Challenge</h4>

          <p>
            Practice identifying passages from Isaiah and locating their
            chapters.
          </p>

          <Link to="/play">Start Challenge</Link>
        </article>
      </section>
    </section>
  </main>
    );
}