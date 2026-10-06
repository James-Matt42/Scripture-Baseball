import React from "react";
import { Link } from "react-router-dom";

export function Account() {
    return (
          <main className="mx-auto w-full max-w-[1200px] space-y-8 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
    <header className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm md:flex md:items-start md:justify-between md:gap-8">
      <h1 className="text-3xl font-bold text-green-950">Account</h1>

      <p>
        Sign in to save your learning history, continue across devices,
        and keep your multiplayer results.
      </p>
    </header>

    <section className="mb-5 grid gap-2" aria-labelledby="sign-in-heading">
      <h2 className="text-2xl font-bold text-green-950" id="sign-in-heading">Sign in</h2>

      <form className="grid gap-4">
        <div className="grid gap-2">
          <label className="font-semibold text-stone-700" htmlFor="sign-in-email">Email</label>
          <input
            id="sign-in-email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>

        <div className="grid gap-2">
          <label className="font-semibold text-stone-700" htmlFor="sign-in-password">Password</label>
          <input
            id="sign-in-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        <button className="w-full cursor-pointer rounded-lg bg-scripture-green sm:w-auto px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="button">Sign In</button>
      </form>
    </section>

    <section className="mb-5 grid gap-2" aria-labelledby="create-account-heading">
      <h2 className="text-2xl font-bold text-green-950" id="create-account-heading">Create an account</h2>

      <p>
        If you have already practiced or joined a game as a guest, your
        existing activity will be carried into your new account.
      </p>

      <form className="grid gap-4">
        <div className="grid gap-2">
          <label className="font-semibold text-stone-700" htmlFor="display-name">Display name</label>
          <input
            id="display-name"
            name="display-name"
            type="text"
            autoComplete="nickname"
            required
          />
        </div>

        <div className="grid gap-2">
          <label className="font-semibold text-stone-700" htmlFor="create-email">Email</label>
          <input
            id="create-email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>

        <div className="grid gap-2">
          <label className="font-semibold text-stone-700" htmlFor="create-password">Password</label>
          <input
            id="create-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>

        <div className="grid gap-2">
          <label className="font-semibold text-stone-700" htmlFor="confirm-password">Confirm password</label>
          <input
            id="confirm-password"
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>

        <button className="w-full cursor-pointer rounded-lg bg-scripture-green sm:w-auto px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="button">Create Account</button>
      </form>
    </section>

    {/*
      This section represents the authenticated account state that will be
      shown after login.
    */}
    <section className="mb-5 grid gap-2" aria-labelledby="signed-in-heading">
      <h2 className="text-2xl font-bold text-green-950" id="signed-in-heading">Example signed-in account</h2>

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
        <Link className="font-semibold text-green-800 hover:text-green-950" to="/progress">View your learning progress</Link>
      </p>

      <button className="w-full cursor-pointer rounded-lg border border-scripture-green sm:w-auto bg-white px-6 py-3 font-semibold text-scripture-green transition hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="button">Sign Out</button>
    </section>

    <section className="mb-5 grid gap-2" aria-labelledby="preferences-heading">
      <h2 className="text-2xl font-bold text-green-950" id="preferences-heading">Practice preferences</h2>

      <form className="grid gap-4">
        <fieldset className="grid gap-3 rounded-lg border border-stone-200 bg-amber-50 p-4">
          <legend>Default answer difficulty</legend>

          <div className="grid grid-cols-[auto_1fr] items-start gap-3">
            <input
              type="radio"
              className="mt-1 size-4 accent-scripture-green"
              id="answer-book-chapter"
              name="answer-difficulty"
              value="book-chapter"
              defaultChecked
            />
            <label className="font-semibold text-stone-700" htmlFor="answer-book-chapter">
              Book and chapter
            </label>
          </div>

          <div className="grid grid-cols-[auto_1fr] items-start gap-3">
            <input
              type="radio"
              className="mt-1 size-4 accent-scripture-green"
              id="answer-exact-verse"
              name="answer-difficulty"
              value="exact-verse"
            />
            <label className="font-semibold text-stone-700" htmlFor="answer-exact-verse">
              Book, chapter, and exact verse
            </label>
          </div>
        </fieldset>

        <div className="grid gap-2">
          <label className="font-semibold text-stone-700" htmlFor="preferred-volume">Preferred scripture focus</label>

          <select className="w-full" id="preferred-volume" name="preferred-volume">
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

        <button className="w-full cursor-pointer rounded-lg bg-scripture-green sm:w-auto px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="button">Save Preferences</button>
      </form>
    </section>

    <section className="mb-5 grid gap-2" aria-labelledby="notifications-heading">
      <h2 className="text-2xl font-bold text-green-950" id="notifications-heading">Notifications</h2>

      <p>
        Reminders and multiplayer notifications will be optional and can
        be changed at any time.
      </p>

      <form className="grid gap-4">
        <div className="grid grid-cols-[auto_1fr] items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-scripture-green"
            id="practice-reminders"
            name="practice-reminders"
          />
          <label className="font-semibold text-stone-700" htmlFor="practice-reminders">
            Send optional practice reminders
          </label>
        </div>

        <div className="grid grid-cols-[auto_1fr] items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-scripture-green"
            id="game-notifications"
            name="game-notifications"
            defaultChecked
          />
          <label className="font-semibold text-stone-700" htmlFor="game-notifications">
            Notify me when a private game needs my attention
          </label>
        </div>

        <button className="w-full cursor-pointer rounded-lg bg-scripture-green sm:w-auto px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300" type="button">Save Notification Settings</button>
      </form>
    </section>
  </main>
    );
}