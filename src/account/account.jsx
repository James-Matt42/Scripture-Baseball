import React from "react";
import './account.css';

export function Account() {
    return (
          <main class="sb-main">
    <header class="sb-header">
      <h1>Account</h1>

      <p>
        Sign in to save your learning history, continue across devices,
        and keep your multiplayer results.
      </p>
    </header>

    <section class="sb-form-group" aria-labelledby="sign-in-heading">
      <h2 id="sign-in-heading">Sign in</h2>

      <form>
        <div>
          <label class="sb-form-label" for="sign-in-email">Email</label>
          <input
            id="sign-in-email"
            name="email"
            type="email"
            autocomplete="email"
            required
          />
        </div>

        <div>
          <label class="sb-form-label" for="sign-in-password">Password</label>
          <input
            id="sign-in-password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
          />
        </div>

        <button class="sb-button-primary" type="button">Sign In</button>
      </form>
    </section>

    <section class="sb-form-group" aria-labelledby="create-account-heading">
      <h2 id="create-account-heading">Create an account</h2>

      <p>
        If you have already practiced or joined a game as a guest, your
        existing activity will be carried into your new account.
      </p>

      <form>
        <div>
          <label class="sb-form-label" for="display-name">Display name</label>
          <input
            id="display-name"
            name="display-name"
            type="text"
            autocomplete="nickname"
            required
          />
        </div>

        <div>
          <label class="sb-form-label" for="create-email">Email</label>
          <input
            id="create-email"
            name="email"
            type="email"
            autocomplete="email"
            required
          />
        </div>

        <div>
          <label class="sb-form-label" for="create-password">Password</label>
          <input
            id="create-password"
            name="password"
            type="password"
            autocomplete="new-password"
            required
          />
        </div>

        <div>
          <label class="sb-form-label" for="confirm-password">Confirm password</label>
          <input
            id="confirm-password"
            name="confirm-password"
            type="password"
            autocomplete="new-password"
            required
          />
        </div>

        <button class="sb-button-primary" type="button">Create Account</button>
      </form>
    </section>

    {/* <!--
      This section represents the authenticated account state that will be
      shown after login.
    --> */}
    <section class="sb-form-group" aria-labelledby="signed-in-heading">
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

      <button class="sb-button-secondary" type="button">Sign Out</button>
    </section>

    <section class="sb-form-group" aria-labelledby="preferences-heading">
      <h2 id="preferences-heading">Practice preferences</h2>

      <form>
        <fieldset class="sb-option-group">
          <legend>Default answer difficulty</legend>

          <div>
            <input
              type="radio"
              id="answer-book-chapter"
              name="answer-difficulty"
              value="book-chapter"
              checked
            />
            <label class="sb-form-label" for="answer-book-chapter">
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
            <label class="sb-form-label" for="answer-exact-verse">
              Book, chapter, and exact verse
            </label>
          </div>
        </fieldset>

        <div>
          <label class="sb-form-label" for="preferred-volume">Preferred scripture focus</label>

          <select class="sb-form-input" id="preferred-volume" name="preferred-volume">
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

        <button class="sb-button-primary" type="button">Save Preferences</button>
      </form>
    </section>

    <section class="sb-form-group" aria-labelledby="notifications-heading">
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
          <label class="sb-form-label" for="practice-reminders">
            Send optional practice reminders
          </label>
        </div>

        <div>
          <input
            type="checkbox"
            id="game-notifications"
            name="game-notifications"
            checked
          />
          <label class="sb-form-label" for="game-notifications">
            Notify me when a private game needs my attention
          </label>
        </div>

        <button class="sb-button-primary" type="button">Save Notification Settings</button>
      </form>
    </section>
  </main>
    );
}