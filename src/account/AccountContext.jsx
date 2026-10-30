import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loginAccount, logoutAccount, registerAccount, restoreAccountSession, AuthRequestError } from '../api/authApi.js';
import {
  copyLocalPracticeOnRegistration,
  ensureUserPreferences,
  getClientPreferences,
  loadClientSettings,
  saveClientSettings,
  updateClientPreferences,
} from './clientState.js';

const AccountContext = createContext(null);

function browserStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function AccountProvider({ children }) {
  // Never restore an authenticated identity from localStorage. Only a verified
  // server session (whose token stays in an HttpOnly cookie) can set user.
  const [session, setSession] = useState({ user: null, checking: true, error: '' });
  const [settings, setSettings] = useState(() => loadClientSettings(browserStorage()));
  const [isSaved, setIsSaved] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    restoreAccountSession({ signal: controller.signal }).then((user) => {
      if (!active) return;
      if (user) setSettings((previous) => ensureUserPreferences(previous, user, browserStorage()));
      setSession({ user, checking: false, error: '' });
    }).catch((error) => {
      if (!active || error?.name === 'AbortError') return;
      setSession({ user: null, checking: false, error: error.message });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    setIsSaved(saveClientSettings(browserStorage(), settings));
  }, [settings]);

  const createProfile = useCallback(async ({ displayName, email, password }) => {
    await registerAccount({ displayName, email, password });
    let user;
    try {
      // Registration intentionally does not issue a cookie. Log in with the
      // same credentials so the server establishes a revocable session.
      user = await loginAccount({ email, password });
    } catch {
      throw new AuthRequestError('Account created, but automatic sign-in failed. Sign in with your new password.');
    }
    const copiedGuestActivity = copyLocalPracticeOnRegistration(browserStorage(), user);
    setSettings((previous) => ensureUserPreferences(previous, user, browserStorage()));
    setSession({ user, checking: false, error: '' });
    return { ok: true, copiedGuestActivity };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const user = await loginAccount({ email, password });
    setSettings((previous) => ensureUserPreferences(previous, user, browserStorage()));
    setSession({ user, checking: false, error: '' });
    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    // Do not claim sign-out succeeded if the server did not revoke the token.
    await logoutAccount();
    setSession({ user: null, checking: false, error: '' });
    return { ok: true };
  }, []);

  const updatePreferences = useCallback((changes) => {
    setSettings((previous) => updateClientPreferences(previous, session.user?.id, changes));
  }, [session.user?.id]);

  const value = useMemo(() => ({
    activeProfile: session.user,
    isRestoringSession: session.checking,
    sessionError: session.error,
    preferences: getClientPreferences(settings, session.user?.id),
    isSaved,
    createProfile,
    signIn,
    signOut,
    updatePreferences,
  }), [session, settings, isSaved, createProfile, signIn, signOut, updatePreferences]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (!context) throw new Error('useAccount must be used inside AccountProvider');
  return context;
}
