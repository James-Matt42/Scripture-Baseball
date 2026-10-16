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
  const { activeProfile, preferences, isSaved, createProfile, signIn, signOut, updatePreferences } = useAccount();
  const [signInEmail, setSignInEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [accountMessage, setAccountMessage] = useState("");
  const [accountError, setAccountError] = useState("");
  const [settings, setSettings] = useState(() => ({ ...preferences }));
  const [settingsMessage, setSettingsMessage] = useState("");

  // Switching profiles swaps the visible form values for that profile's saved choices.
  useEffect(() => {
    setSettings({ ...preferences });
  }, [preferences]);

  function handleCreate(event) {
    event.preventDefault();
    const result = createProfile({ displayName: newName, email: newEmail });
    if (!result.ok) {
      setAccountError(result.error);
      setAccountMessage("");
      return;
    }
    setAccountError("");
    setAccountMessage(result.copiedGuestActivity
      ? "Local profile created. Guest practice copied."
      : "Local profile created.");
    setNewName("");
    setNewEmail("");
    if (returnToRoom) navigate(returnToRoom);
  }

  function handleSignIn(event) {
    event.preventDefault();
    const result = signIn(signInEmail);
    if (!result.ok) {
      setAccountError(result.error);
      setAccountMessage("");
      return;
    }
    setAccountError("");
    setAccountMessage("Signed in to this browser's saved profile.");
    setSignInEmail("");
    if (returnToRoom) navigate(returnToRoom);
  }

  function handleSignOut() {
    signOut();
    setAccountMessage("Signed out. Guest practice is available.");
    setAccountError("");
  }

  function savePracticePreferences(event) {
    event.preventDefault();
    updatePreferences({
      answerDifficulty: settings.answerDifficulty,
      preferredVolume: settings.preferredVolume,
    });
    setSettingsMessage("Practice preferences saved.");
  }

  function saveNotificationPreferences(event) {
    event.preventDefault();
    updatePreferences({
      practiceReminders: settings.practiceReminders,
      gameNotifications: settings.gameNotifications,
    });
    setSettingsMessage("Notification choices saved.");
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] space-y-8 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
      <header className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm md:flex md:items-start md:justify-between md:gap-8">
        <h1 className="text-3xl font-bold text-green-950">Account</h1>
        <p className="max-w-xl text-stone-700">
          Local demo profiles only. No passwords, secure login, or cross-device syncing.
        </p>
      </header>

      {returnToRoom && (
        <p className="rounded-lg bg-green-50 p-3 text-stone-800">
          <Link className="font-semibold text-green-800 underline" to={returnToRoom}>Return to room invitation</Link>
          {" "}after choosing a local profile.
        </p>
      )}

      {isSaved === false && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-stone-800" role="alert">
          Browser storage is unavailable. Changes may be lost on refresh.
        </p>
      )}
      {accountError && <p className="rounded-lg bg-amber-50 p-3 text-stone-800" role="alert">{accountError}</p>}
      {accountMessage && <p className="rounded-lg bg-green-50 p-3 text-green-950" role="status">{accountMessage}</p>}

      {activeProfile ? (
        <section className="grid gap-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="signed-in-heading">
          <h2 className="text-2xl font-bold text-green-950" id="signed-in-heading">Your local profile</h2>
          <p>Signed in as <strong>{activeProfile.displayName}</strong></p>
          <dl className="grid gap-2 text-stone-700">
            <div><dt className="font-semibold">Email</dt><dd>{activeProfile.email}</dd></div>
            <div><dt className="font-semibold">Created</dt><dd>{activeProfile.createdAt ? new Date(activeProfile.createdAt).toLocaleDateString() : "Unknown"}</dd></div>
          </dl>
          <p><Link className="font-semibold text-green-800 hover:text-green-950" to="/progress">View your learning progress</Link></p>
          <div><button className={secondaryButton} type="button" onClick={handleSignOut}>Sign Out</button></div>
        </section>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="sign-in-heading">
            <h2 className="text-2xl font-bold text-green-950" id="sign-in-heading">Open a saved profile</h2>
            <p className="mt-2 text-sm text-stone-600">Enter an email used on this browser. No password is required.</p>
            <form className="mt-4 grid gap-4" onSubmit={handleSignIn}>
              <div className="grid gap-2">
                <label className="font-semibold text-stone-700" htmlFor="sign-in-email">Email</label>
                <input className={inputClass} id="sign-in-email" name="email" type="email" autoComplete="email"
                  value={signInEmail} onChange={(event) => setSignInEmail(event.target.value)} required />
              </div>
              <div><button className={primaryButton} type="submit">Sign In Locally</button></div>
            </form>
          </section>

          <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="create-account-heading">
            <h2 className="text-2xl font-bold text-green-950" id="create-account-heading">Create a local profile</h2>
            <p className="mt-2 text-sm text-stone-600">Your guest practice is copied into the new profile.</p>
            <form className="mt-4 grid gap-4" onSubmit={handleCreate}>
              <div className="grid gap-2">
                <label className="font-semibold text-stone-700" htmlFor="display-name">Display name</label>
                <input className={inputClass} id="display-name" name="display-name" type="text" autoComplete="nickname"
                  maxLength={40} value={newName} onChange={(event) => setNewName(event.target.value)} required />
              </div>
              <div className="grid gap-2">
                <label className="font-semibold text-stone-700" htmlFor="create-email">Email (local identifier)</label>
                <input className={inputClass} id="create-email" name="email" type="email" autoComplete="email"
                  value={newEmail} onChange={(event) => setNewEmail(event.target.value)} required />
              </div>
              <div><button className={primaryButton} type="submit">Create Profile</button></div>
            </form>
          </section>
        </div>
      )}

      <section className="grid gap-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="preferences-heading">
        <h2 className="text-2xl font-bold text-green-950" id="preferences-heading">Practice preferences</h2>
        <p className="text-sm text-stone-600">Saved for {activeProfile ? activeProfile.displayName : "guest practice"} on this device.</p>
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
            <p className="text-xs text-stone-600">The starter lineup currently uses Book of Mormon passages.</p>
          </div>
          <div><button className={primaryButton} type="submit">Save Preferences</button></div>
        </form>
      </section>

      <section className="grid gap-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm" aria-labelledby="notifications-heading">
        <h2 className="text-2xl font-bold text-green-950" id="notifications-heading">Notifications</h2>
        <p className="text-sm text-stone-600">Choices are saved locally; notifications are not sent yet.</p>
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
    </main>
  );
}
