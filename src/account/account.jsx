import React from "react";
import './account.css';

export function Account() {
    return (
          <main className="sb-main">
    <header className="sb-header">
      <h1>Account</h1>

      <p>
        Sign in to save your learning history, continue across devices,
        and keep your multiplayer results.
      </p>
    </header>

    <section className="sb-form-group" aria-labelledby="sign-in-heading">
      <h2 id="sign-in-heading">Sign in</h2>

      <form>
        <div>
          <label className="sb-form-label" htmlFor="sign-in-email">Email</label>
          <input
            id="sign-in-email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>

        <div>
          <label className="sb-form-label" htmlFor="sign-in-password">Password</label>
          <input
            id="sign-in-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        <button className="sb-button-primary" type="button">Sign In</button>
      </form>
    </section>

    <section className="sb-form-group" aria-labelledby="create-account-heading">
      <h2 id="create-account-heading">Create an account</h2>

      <p>
        If you have already practiced or joined a game as a guest, your
        existing activity will be carried into your new account.
      </p>

      <form>
        <div>
          <label className="sb-form-label" htmlFor="display-name">Display name</label>
          <input
            id="display-name"
            name="display-name"
            type="text"
            autoComplete="nickname"
            required
          />
        </div>

        <div>
          <label className="sb-form-label" htmlFor="create-email">Email</label>
          <input
            id="create-email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>

        <div>
          <label className="sb-form-label" htmlFor="create-password">Password</label>
          <input
            id="create-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>

        <div>
          <label className="sb-form-label" htmlFor="confirm-password">Confirm password</label>
          <input
            id="confirm-password"
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>

        <button className="sb-button-primary" type="button">Create Account</button>
      </form>
    </section>

    {/*
      This section represents the authenticated account state that will be
      shown after login.
    */}
    <section className="sb-form-group" aria-labelledby="signed-in-heading">
      <h2 id="signed-in-heading">Example signed-in account</h2>

      <p>
        Signed in as <strong>[USERNAME]</strong>
      </p>

      <dl>
        <div>
          <dt>Email</dt>
          <dd>[EMAIL ADDRESS]</dd>
        </div>

        <div>
          <dt>Member since</dt>
          <dd>[DATE]</dd>
        </div>
      </dl>

      <p>
        <a href="progress.html">View your learning progress</a>
      </p>

      <button className="sb-button-secondary" type="button">Sign Out</button>
    </section>

    <section className="sb-form-group" aria-labelledby="preferences-heading">
      <h2 id="preferences-heading">Practice preferences</h2>

      <form>
        <fieldset className="sb-option-group">
          <legend>Default answer difficulty</legend>

          <div>
            <input
              type="radio"
              id="answer-book-chapter"
              name="answer-difficulty"
              value="book-chapter"
              defaultChecked
            />
            <label className="sb-form-label" htmlFor="answer-book-chapter">
              Book and chapter
            </label>
          </div>

          <div>
            <input
              type="radio"
              id="answer-exact-verse"
              name="answer-difficulty"
              value="exact-verse"
            />
            <label className="sb-form-label" htmlFor="answer-exact-verse">
              Book, chapter, and exact verse
            </label>
          </div>
        </fieldset>

        <div>
          <label className="sb-form-label" htmlFor="preferred-volume">Preferred scripture focus</label>

          <select className="sb-form-input" id="preferred-volume" name="preferred-volume">
            <option value="">No preference</option>
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

        <button className="sb-button-primary" type="button">Save Preferences</button>
      </form>
    </section>

    <section className="sb-form-group" aria-labelledby="notifications-heading">
      <h2 id="notifications-heading">Notifications</h2>

      <p>
        Reminders and multiplayer notifications will be optional and can
        be changed at any time.
      </p>

      <form>
        <div>
          <input
            type="checkbox"
            id="practice-reminders"
            name="practice-reminders"
          />
          <label className="sb-form-label" htmlFor="practice-reminders">
            Send optional practice reminders
          </label>
        </div>

        <div>
          <input
            type="checkbox"
            id="game-notifications"
            name="game-notifications"
            defaultChecked
          />
          <label className="sb-form-label" htmlFor="game-notifications">
            Notify me when a private game needs my attention
          </label>
        </div>

        <button className="sb-button-primary" type="button">Save Notification Settings</button>
      </form>
    </section>
  </main>
    );
}