import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getInvitationPath } from "../rooms/roomState.js";
import { useAccount } from "./AccountContext";
import { VOLUME_OPTIONS } from "./accountState.js";

const primaryButton =
  "w-full cursor-pointer rounded-lg bg-scripture-green px-6 py-3 font-semibold text-white transition hover:brightness-90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300 sm:w-auto";
const secondaryButton =
  "w-full cursor-pointer rounded-lg border border-scripture-green bg-white px-6 py-3 font-semibold text-scripture-green transition hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300 sm:w-auto";
const inputClass = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2";

export function Account() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnToRoom = getInvitationPath(searchParams.get("code"));
  const { activeProfile, preferences, isSaved, sessionError, createProfile, signIn, signOut, updatePreferences, preferencesPending, preferencesError, retryPreferences } = useAccount();
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [accountMessage, setAccountMessage] = useState("");
  const [accountError, setAccountError] = useState("");
  const [settings, setSettings] = useState(() => ({ ...preferences }));
  const [settingsMessage, setSettingsMessage] = useState("");

  // Restore the correct form values when the authenticated user or guest changes.
  useEffect(() => {
    setSettings({ ...preferences });
  }, [preferences]);

  async function handleCreate(event) {
    event.preventDefault();
    if (submitting) return;
    if (newPassword !== confirmPassword) {
      setAccountError("Passwords do not match.");
      setAccountMessage("");
      return;
    }
    setSubmitting(true);
    setAccountError("");
    setAccountMessage("");
    try {
      await createProfile({ displayName: newName, email: newEmail, password: newPassword });
      setAccountMessage("Account created and signed in. Guest results will sync when available.");
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setConfirmPassword("");
      if (returnToRoom) navigate(returnToRoom);
    } catch (error) {
      setAccountError(error.message || "Could not create the account. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignIn(event) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setAccountError("");
    setAccountMessage("");
    try {
      await signIn(signInEmail, signInPassword);
      setAccountMessage("Signed in successfully.");
      setSignInEmail("");
      setSignInPassword("");
      if (returnToRoom) navigate(returnToRoom);
    } catch (error) {
      setAccountError(error.message || "Could not sign in. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    if (submitting) return;
    setSubmitting(true);
    setAccountError("");
    setAccountMessage("");
    try {
      await signOut();
      setAccountMessage("Signed out. Guest practice remains available on this device.");
    } catch (error) {
      setAccountError(error.message || "Could not sign out. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function savePracticePreferences(event) {
    event.preventDefault();
    updatePreferences({
      answerDifficulty: settings.answerDifficulty,
      preferredVolume: settings.preferredVolume,
    });
    setSettingsMessage(activeProfile ? "Practice preferences saved locally; syncing to your account." : "Guest preferences saved on this device.");
  }

  function saveNotificationPreferences(event) {
    event.preventDefault();
    updatePreferences({
      practiceReminders: settings.practiceReminders,
      gameNotifications: settings.gameNotifications,
    });
    setSettingsMessage(activeProfile ? "Notification choices saved locally; syncing to your account." : "Guest notification choices saved on this device.");
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] space-y-8 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
      <header className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm md:flex md:items-start md:justify-between md:gap-8">
        <h1 className="text-3xl font-bold text-green-950">Account</h1>
        <p className="max-w-xl text-stone-700">
          Sign in to save graded scripture practice, favorites, and preferences to your account. MongoDB-backed accounts and progress persist across server restarts. Guest practice stays on this device until it can be claimed. Demo rooms remain local to this device.
        </p>
      </header>

      {returnToRoom && (
        <p className="rounded-lg bg-green-50 p-3 text-stone-800">
          <Link className="font-semibold text-green-800 underline" to={returnToRoom}>Return to room invitation</Link>
          {" "}after signing in or creating an account. Your existing guest room seat is preserved.
        </p>
      )}

      {isSaved === false && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-stone-800" role="alert">
          Browser storage is unavailable. Changes may be lost on refresh.
        </p>
      )}
      {sessionError && !activeProfile && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-stone-800" role="alert">
          Could not restore your account session: {sessionError} You can continue playing as a guest.
        </p>
      )}
      {accountError && <p className="rounded-lg bg-amber-50 p-3 text-stone-800" role="alert">{accountError}</p>}
      {accountMessage && <p className="rounded-lg bg-green-50 p-3 text-green-950" role="status">{accountMessage}</p>}

      {activeProfile ? (
        <section className="grid gap-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="signed-in-heading">
          <h2 className="text-2xl font-bold text-green-950" id="signed-in-heading">Your account</h2>
          <p>Signed in as <strong>{activeProfile.displayName}</strong></p>
          <dl className="grid gap-2 text-stone-700">
            <div><dt className="font-semibold">Email</dt><dd>{activeProfile.email}</dd></div>
            <div><dt className="font-semibold">Created</dt><dd>{activeProfile.createdAt ? new Date(activeProfile.createdAt).toLocaleDateString() : "Unknown"}</dd></div>
          </dl>
          <p><Link className="font-semibold text-green-800 hover:text-green-950" to="/progress">View your learning progress</Link></p>
          <div><button className={secondaryButton} type="button" onClick={handleSignOut} disabled={submitting}>
            {submitting ? "Signing out…" : "Sign Out"}</button></div>
        </section>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="sign-in-heading">
            <h2 className="text-2xl font-bold text-green-950" id="sign-in-heading">Sign in</h2>
            <p className="mt-2 text-sm text-stone-600">Use the email and password you registered with.</p>
            <form className="mt-4 grid gap-4" onSubmit={handleSignIn}>
              <div className="grid gap-2">
                <label className="font-semibold text-stone-700" htmlFor="sign-in-email">Email</label>
                <input className={inputClass} id="sign-in-email" name="email" type="email" autoComplete="email"
                  value={signInEmail} onChange={(event) => setSignInEmail(event.target.value)} required />
              </div>
              <div className="grid gap-2">
                <label className="font-semibold text-stone-700" htmlFor="sign-in-password">Password</label>
                <input className={inputClass} id="sign-in-password" name="password" type="password"
                  autoComplete="current-password" value={signInPassword}
                  onChange={(event) => setSignInPassword(event.target.value)} required />
              </div>
              <div><button className={primaryButton} type="submit" disabled={submitting}>
                {submitting ? "Signing in…" : "Sign In"}</button></div>
            </form>
          </section>

          <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="create-account-heading">
            <h2 className="text-2xl font-bold text-green-950" id="create-account-heading">Create an account</h2>
            <p className="mt-2 text-sm text-stone-600">Your guest practice can be carried into your new account on this device.</p>
            <form className="mt-4 grid gap-4" onSubmit={handleCreate}>
              <div className="grid gap-2">
                <label className="font-semibold text-stone-700" htmlFor="display-name">Display name</label>
                <input className={inputClass} id="display-name" name="display-name" type="text" autoComplete="nickname"
                  maxLength={40} value={newName} onChange={(event) => setNewName(event.target.value)} required />
              </div>
              <div className="grid gap-2">
                <label className="font-semibold text-stone-700" htmlFor="create-email">Email</label>
                <input className={inputClass} id="create-email" name="email" type="email" autoComplete="email"
                  value={newEmail} onChange={(event) => setNewEmail(event.target.value)} required />
              </div>
              <div className="grid gap-2">
                <label className="font-semibold text-stone-700" htmlFor="create-password">Password (at least 8 characters)</label>
                <input className={inputClass} id="create-password" name="new-password" type="password"
                  autoComplete="new-password" minLength={8} value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)} required />
                <p className="text-xs text-stone-600">Passwords are hashed by the server. Maximum 72 UTF-8 bytes.</p>
              </div>
              <div className="grid gap-2">
                <label className="font-semibold text-stone-700" htmlFor="confirm-password">Confirm password</label>
                <input className={inputClass} id="confirm-password" name="confirm-password" type="password"
                  autoComplete="new-password" minLength={8} value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)} required />
              </div>
              <div><button className={primaryButton} type="submit" disabled={submitting}>
                {submitting ? "Creating account…" : "Create Account"}</button></div>
            </form>
          </section>
        </div>
      )}

      <section className="grid gap-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="preferences-heading">
        <h2 className="text-2xl font-bold text-green-950" id="preferences-heading">Practice preferences</h2>
        <p className="text-sm text-stone-600">{activeProfile ? "Synced with your signed-in account when the service is available." : "Guest preferences are stored on this device."}</p>
        <form className="grid gap-4" onSubmit={savePracticePreferences}>
          <fieldset className="grid gap-3 rounded-lg border border-stone-200 bg-amber-50 p-4">
            <legend className="font-semibold text-green-950">Default answer difficulty</legend>
            {[
              { value: "book-chapter", label: "Book and chapter" },
              { value: "exact-verse", label: "Book, chapter, and exact verse" },
            ].map(({ value, label }) => (
              <label className="flex items-center gap-3 font-semibold text-stone-700" key={value}>
                <input type="radio" className="size-4 accent-scripture-green" name="answer-difficulty"
                  value={value} checked={settings.answerDifficulty === value}
                  onChange={() => setSettings((current) => ({ ...current, answerDifficulty: value }))} />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="grid gap-2">
            <label className="font-semibold text-stone-700" htmlFor="preferred-volume">Preferred scripture focus</label>
            <select className={inputClass} id="preferred-volume" name="preferred-volume"
              value={settings.preferredVolume}
              onChange={(event) => setSettings((current) => ({ ...current, preferredVolume: event.target.value }))}>
              {VOLUME_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <p className="text-xs text-stone-600">Choose your practice volume or book on the Play screen. This preference is saved for future personalized lineups.</p>
          </div>
          <div><button className={primaryButton} type="submit">Save Preferences</button></div>
        </form>
      </section>

      <section className="grid gap-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="notifications-heading">
        <h2 className="text-2xl font-bold text-green-950" id="notifications-heading">Notifications</h2>
        <p className="text-sm text-stone-600">Preferences sync to the account service when signed in; actual notifications are not sent yet.</p>
        <form className="grid gap-4" onSubmit={saveNotificationPreferences}>
          <label className="flex items-start gap-3 font-semibold text-stone-700">
            <input type="checkbox" className="mt-1 size-4 accent-scripture-green" checked={settings.practiceReminders}
              onChange={(event) => setSettings((current) => ({ ...current, practiceReminders: event.target.checked }))} />
            Optional practice reminders
          </label>
          <label className="flex items-start gap-3 font-semibold text-stone-700">
            <input type="checkbox" className="mt-1 size-4 accent-scripture-green" checked={settings.gameNotifications}
              onChange={(event) => setSettings((current) => ({ ...current, gameNotifications: event.target.checked }))} />
            Private game alerts
          </label>
          <div><button className={primaryButton} type="submit">Save Notification Settings</button></div>
        </form>
      </section>
      {settingsMessage && <p className="rounded-lg bg-green-50 p-3 text-green-950" role="status">{settingsMessage}</p>}
      {activeProfile && preferencesPending && !preferencesError && (
        <p className="text-sm text-stone-700" role="status">Saving account preferences…</p>
      )}
      {activeProfile && preferencesError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-stone-800" role="alert">
          <p>Could not confirm account preferences. Your local selections are retained: {preferencesError}</p>
          <button type="button" className="mt-2 font-semibold underline" onClick={retryPreferences}>Retry syncing preferences</button>
        </div>
      )}
    </main>
  );
}
