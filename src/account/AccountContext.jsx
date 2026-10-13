import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  accountReducer,
  copyGuestPracticeToProfile,
  getActiveProfile,
  getPreferences,
  loadAccountState,
  normalizeEmail,
  saveAccountState,
  validateProfile,
} from "./accountState.js";

const AccountContext = createContext(null);

function browserStorage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function AccountProvider({ children }) {
  const [account, setAccount] = useState(() => loadAccountState(browserStorage()));
  const [isSaved, setIsSaved] = useState(null);

  useEffect(() => {
    setIsSaved(saveAccountState(browserStorage(), account));
  }, [account]);

  const createProfile = useCallback(({ displayName, email }) => {
    const error = validateProfile(displayName, email);
    if (error) return { ok: false, error };
    if (account.profiles.some((profile) => profile.email === normalizeEmail(email))) {
      return { ok: false, error: "A local profile already uses that email. Sign in instead." };
    }
    const next = accountReducer(account, {
      type: "create", displayName, email, createdAt: new Date().toISOString(),
    });
    if (next === account) return { ok: false, error: "Could not create this profile." };
    const copiedGuestActivity = copyGuestPracticeToProfile(browserStorage(), next.activeProfileId);
    setAccount(next);
    return { ok: true, copiedGuestActivity };
  }, [account]);

  const signIn = useCallback((email) => {
    if (!account.profiles.some((profile) => profile.email === normalizeEmail(email))) {
      return { ok: false, error: "No saved profile with that email on this browser." };
    }
    setAccount((previous) => accountReducer(previous, { type: "sign-in", email }));
    return { ok: true };
  }, [account.profiles]);

  const signOut = useCallback(() => {
    setAccount((previous) => accountReducer(previous, { type: "sign-out" }));
  }, []);

  const updatePreferences = useCallback((changes) => {
    setAccount((previous) => accountReducer(previous, { type: "update-preferences", changes }));
  }, []);

  const value = useMemo(() => ({
    activeProfile: getActiveProfile(account),
    preferences: getPreferences(account),
    isSaved,
    createProfile,
    signIn,
    signOut,
    updatePreferences,
  }), [account, isSaved, createProfile, signIn, signOut, updatePreferences]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (!context) throw new Error("useAccount must be used inside AccountProvider");
  return context;
}
