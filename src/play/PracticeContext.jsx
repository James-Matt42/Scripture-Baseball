import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "../account/AccountContext.jsx";
import {
  fetchAccountFavorites, fetchAccountProgress, importAccountPractice,
  recordAccountAttempt, saveAccountFavorites,
} from "../api/progressApi.js";
import {
  clearPendingFavorites, combineAttemptHistory, deviceId, finishInitialImport, getOrCreateImport,
  localAttemptRecords, pendingFavorites, setPendingFavorites, unsyncedAttempts,
} from "./accountSync.js";
import {
  getRecordedAttempts, getSessionQuestions,
  loadPracticeState, practiceReducer, savePracticeState,
} from "./practiceState.js";

const PracticeContext = createContext(null);

function browserStorage() {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
}

export function PracticeProvider({ children, storageKey, defaultExactVerse = false }) {
  const { activeProfile, preferences, refreshPreferences } = useAccount();
  const userId = activeProfile?.id ?? null;
  const [practice, setPractice] = useState(() => loadPracticeState(browserStorage(), storageKey, defaultExactVerse));
  const [isSaved, setIsSaved] = useState(null);
  const [localDeviceId] = useState(() => deviceId(browserStorage()));
  const [remoteAttempts, setRemoteAttempts] = useState([]);
  const [syncReady, setSyncReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState('');
  const [attemptError, setAttemptError] = useState('');
  const [favoriteError, setFavoriteError] = useState('');
  const [retry, setRetry] = useState(0);
  const favoriteQueue = useRef(Promise.resolve());

  useEffect(() => {
    setIsSaved(savePracticeState(browserStorage(), practice, storageKey));
  }, [practice, storageKey]);

  useEffect(() => {
    setPractice((previous) => practiceReducer(previous, {
      type: 'set-exact-verse', enabled: defaultExactVerse, fromPreference: true,
    }));
  }, [defaultExactVerse]);

  const dispatch = useCallback((action) => {
    setPractice((previous) => practiceReducer(previous, action));
  }, []);

  // Import the immutable initial local snapshot. Each successful batch is
  // checkpointed so timeouts and reloads never silently lose guest history.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const controller = new AbortController();
    const storage = browserStorage();
    const records = localAttemptRecords(practice, storageKey, localDeviceId);
    const importSnapshot = getOrCreateImport(storage, userId, records, practice.favorites, preferences);
    async function bootstrap() {
      try {
        await finishInitialImport(storage, userId, importSnapshot, (batch) => {
          if (!active) throw new Error('Account changed during import');
          return importAccountPractice(batch, { signal: controller.signal });
        });
        if (!active) return;
        const [progress, favorites] = await Promise.all([
          fetchAccountProgress({ signal: controller.signal }),
          fetchAccountFavorites({ signal: controller.signal }),
        ]);
        if (!active) return;
        setRemoteAttempts(progress.attempts);
        const pending = pendingFavorites(storage, userId);
        dispatch({ type: pending ? 'replace-favorites' : 'merge-favorites', favorites: pending ?? favorites.favorites });
        setBootstrapError('');
        setSyncReady(true);
        // Import may have initialized the user's saved preferences. Read the
        // server version after import, keeping any locally pending edits.
        // Preference failures have their own retry UI on the Account page;
        // they should not incorrectly mark saved practice attempts as failed.
        refreshPreferences(userId).catch(() => {});
      } catch (error) {
        if (active && error?.name !== 'AbortError') setBootstrapError(error.message);
      }
    }
    bootstrap();
    return () => { active = false; controller.abort(); };
    // Only restart a failed bootstrap on explicit retry; new pitches upload
    // separately after it completes, never alter its idempotency snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, storageKey, localDeviceId, retry]);

  // Each local answer has a stable ID. A failed POST remains in local storage
  // and is re-sent on retry/reload; 200 replies denote a successful replay.
  useEffect(() => {
    if (!userId || !syncReady) return;
    const records = localAttemptRecords(practice, storageKey, localDeviceId);
    const [next] = unsyncedAttempts(remoteAttempts, records);
    if (!next) { setAttemptError(''); return; }
    let active = true;
    const controller = new AbortController();
    recordAccountAttempt(next, { signal: controller.signal }).then(({ attempt }) => {
      if (!active) return;
      setRemoteAttempts((previous) => previous.some((item) => item.id === attempt.id)
        ? previous : [...previous, attempt]);
      setAttemptError('');
    }).catch((error) => { if (active) setAttemptError(error.message); });
    return () => { active = false; controller.abort(); };
  }, [userId, syncReady, practice, remoteAttempts, storageKey, localDeviceId, retry]);

  // PUT replaces the collection, so serialize writes. Save pending values
  // before the request and clear them only when the acknowledged list matches.
  useEffect(() => {
    if (!userId || !syncReady) return;
    const favorites = [...practice.favorites];
    const storage = browserStorage();
    setPendingFavorites(storage, userId, favorites);
    let active = true;
    const next = favoriteQueue.current.then(() => active ? saveAccountFavorites(favorites) : null);
    favoriteQueue.current = next.catch(() => {});
    next.then(() => {
      if (!active) return;
      clearPendingFavorites(storage, userId, favorites);
      setFavoriteError('');
    }).catch((error) => { if (active) setFavoriteError(error.message); });
    return () => { active = false; };
  }, [userId, syncReady, practice.favorites, retry]);

  const records = useMemo(() => userId
    ? localAttemptRecords(practice, storageKey, localDeviceId) : [],
  [practice, storageKey, localDeviceId, userId]);
  const recordedAttempts = useMemo(() => userId && syncReady
    ? combineAttemptHistory(remoteAttempts, records, practice)
    : getRecordedAttempts(practice), [userId, syncReady, remoteAttempts, records, practice]);
  const syncError = bootstrapError || attemptError || favoriteError;
  const pendingCount = syncReady ? unsyncedAttempts(remoteAttempts, records).length : 0;
  const syncStatus = !userId ? 'guest' : syncError ? 'error'
    : !syncReady || pendingCount ? 'syncing' : 'connected';

  const value = useMemo(() => ({
    session: practice.session,
    questions: getSessionQuestions(practice.session),
    favorites: practice.favorites,
    history: practice.history,
    recordedAttempts,
    isSaved,
    syncStatus,
    syncError,
    retrySync: () => setRetry((count) => count + 1),
    saveDraft: (draft) => dispatch({ type: 'set-draft', draft }),
    toggleFavorite: (questionId) => {
      // Persist a removal immediately, including while the initial GET is in
      // flight. Otherwise stale server favorites could resurrect an item that
      // the player just unstarred before hydration finished.
      const next = practiceReducer(practice, { type: 'toggle-favorite', questionId });
      if (userId && next !== practice) setPendingFavorites(browserStorage(), userId, next.favorites);
      dispatch({ type: 'toggle-favorite', questionId });
    },
    startChallenge: (challengeId, questions, { authenticatedDeck = false } = {}) => dispatch({
      type: 'start-challenge', challengeId, questionIds: questions.map((item) => item.id),
      authenticatedDeck, timestamp: new Date().toISOString(), defaultExactVerse,
    }),
    setExactVerse: (enabled) => dispatch({ type: 'set-exact-verse', enabled }),
    answerPitch: (attempt) => dispatch({ type: 'answer', attempt }),
    nextPitch: () => dispatch({ type: 'next', timestamp: new Date().toISOString() }),
    finishInning: () => dispatch({ type: 'finish', timestamp: new Date().toISOString() }),
    keepPlaying: () => dispatch({ type: 'resume', timestamp: new Date().toISOString(), defaultExactVerse }),
    startNewInning: () => dispatch({ type: 'new-inning', timestamp: new Date().toISOString(), defaultExactVerse }),
  }), [practice, recordedAttempts, isSaved, syncStatus, syncError, dispatch, defaultExactVerse, userId]);

  return <PracticeContext.Provider value={value}>{children}</PracticeContext.Provider>;
}

export function usePractice() {
  const context = useContext(PracticeContext);
  if (!context) throw new Error('usePractice must be used inside PracticeProvider');
  return context;
}
