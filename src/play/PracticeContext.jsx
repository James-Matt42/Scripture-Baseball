import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  getRecordedAttempts,
  loadPracticeState,
  practiceReducer,
  savePracticeState,
} from "./practiceState.js";

const PracticeContext = createContext(null);

function browserStorage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function PracticeProvider({ children, storageKey, defaultExactVerse = false }) {
  const [practice, setPractice] = useState(() => loadPracticeState(browserStorage(), storageKey, defaultExactVerse));
  const [isSaved, setIsSaved] = useState(null);

  // Runs after changes, including partial guesses; never writes during render.
  useEffect(() => {
    setIsSaved(savePracticeState(browserStorage(), practice, storageKey));
  }, [practice, storageKey]);

  // A changed preference may update an untouched inning, but never overwrite
  // a player-selected mode, an in-progress guess, or a completed pitch.
  useEffect(() => {
    setPractice((previous) => practiceReducer(previous, {
      type: "set-exact-verse", enabled: defaultExactVerse, fromPreference: true,
    }));
  }, [defaultExactVerse]);

  const dispatch = useCallback((action) => {
    setPractice((previous) => practiceReducer(previous, action));
  }, []);

  const value = useMemo(() => ({
    session: practice.session,
    history: practice.history,
    recordedAttempts: getRecordedAttempts(practice),
    isSaved,
    saveDraft: (draft) => dispatch({ type: "set-draft", draft }),
    setExactVerse: (enabled) => dispatch({ type: "set-exact-verse", enabled }),
    answerPitch: (attempt) => dispatch({ type: "answer", attempt }),
    nextPitch: () => dispatch({ type: "next", timestamp: new Date().toISOString() }),
    finishInning: () => dispatch({ type: "finish", timestamp: new Date().toISOString() }),
    keepPlaying: () => dispatch({ type: "resume", timestamp: new Date().toISOString(), defaultExactVerse }),
    startNewInning: () => dispatch({ type: "new-inning", timestamp: new Date().toISOString(), defaultExactVerse }),
  }), [practice, isSaved, dispatch, defaultExactVerse]);

  return <PracticeContext.Provider value={value}>{children}</PracticeContext.Provider>;
}

export function usePractice() {
  const context = useContext(PracticeContext);
  if (!context) throw new Error("usePractice must be used inside PracticeProvider");
  return context;
}
