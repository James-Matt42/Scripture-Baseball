import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { loginAccount, logoutAccount, registerAccount, restoreAccountSession, AuthRequestError } from '../api/authApi.js';
import { fetchAccountPreferences, patchAccountPreferences } from '../api/progressApi.js';
import {
  acceptServerPreferences,
  confirmServerPreferences,
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
  const [preferencesError, setPreferencesError] = useState('');
  const [preferencesRetry, setPreferencesRetry] = useState(0);
  const preferenceQueue = useRef(Promise.resolve());

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
    // Corpus guest answers are claimed using server-issued tokens after login.
    setSettings((previous) => ensureUserPreferences(previous, user, browserStorage()));
    setPreferencesError('');
    setSession({ user, checking: false, error: '' });
    return { ok: true };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const user = await loginAccount({ email, password });
    setSettings((previous) => ensureUserPreferences(previous, user, browserStorage()));
    setPreferencesError('');
    setSession({ user, checking: false, error: '' });
    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    // Do not claim sign-out succeeded if the server did not revoke the token.
    await logoutAccount();
    setPreferencesError('');
    setSession({ user: null, checking: false, error: '' });
    return { ok: true };
  }, []);

  const refreshPreferences = useCallback(async (userId) => {
    try {
      const { preferences } = await fetchAccountPreferences();
      setSettings((previous) => acceptServerPreferences(previous, userId, preferences));
      setPreferencesError('');
      return preferences;
    } catch (error) {
      setPreferencesError(error.message);
      throw error;
    }
  }, []);

  // A verified session can begin on a different device or browser. Hydrate
  // its preferences from MongoDB, not just this browser's localStorage. The
  // merge deliberately leaves any pending local edits untouched.
  useEffect(() => {
    const userId = session.user?.id;
    if (!userId) return;
    const controller = new AbortController();
    let active = true;
    fetchAccountPreferences({ signal: controller.signal }).then(({ preferences }) => {
      if (!active) return;
      setSettings((previous) => acceptServerPreferences(previous, userId, preferences));
      setPreferencesError('');
    }).catch((error) => {
      if (active && error?.name !== 'AbortError') setPreferencesError(error.message);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [session.user?.id]);

  const updatePreferences = useCallback((changes) => {
    setSettings((previous) => updateClientPreferences(previous, session.user?.id, changes));
    setPreferencesError('');
  }, [session.user?.id]);

  // Serialize PATCH requests, because several fast preference edits must not
  // reach the server out of order. A failed write remains in localStorage and
  // is retried explicitly; fetching preferences never clobbers pending edits.
  const pendingPreferences = session.user?.id ? settings.pendingByUser?.[session.user.id] : null;
  useEffect(() => {
    const userId = session.user?.id;
    if (!userId || !pendingPreferences) return;
    const submitted = { ...pendingPreferences };
    let active = true;
    const next = preferenceQueue.current.then(() => active ? patchAccountPreferences(submitted) : null);
    preferenceQueue.current = next.catch(() => {});
    next.then((result) => {
      if (!active) return;
      setSettings((previous) => confirmServerPreferences(previous, userId, submitted, result.preferences));
      setPreferencesError('');
    }).catch((error) => {
      if (active) setPreferencesError(error.message);
    });
    return () => { active = false; };
  }, [session.user?.id, pendingPreferences, preferencesRetry]);

  const value = useMemo(() => ({
    activeProfile: session.user,
    isRestoringSession: session.checking,
    sessionError: session.error,
    preferences: getClientPreferences(settings, session.user?.id),
    isSaved,
    preferencesPending: !!pendingPreferences,
    preferencesError,
    retryPreferences: () => {
      if (pendingPreferences) setPreferencesRetry((count) => count + 1);
      else if (session.user) refreshPreferences(session.user.id).catch(() => {});
    },
    refreshPreferences,
    createProfile,
    signIn,
    signOut,
    updatePreferences,
  }), [session, settings, isSaved, pendingPreferences, preferencesError,
    refreshPreferences, createProfile, signIn, signOut, updatePreferences]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (!context) throw new Error('useAccount must be used inside AccountProvider');
  return context;
}
