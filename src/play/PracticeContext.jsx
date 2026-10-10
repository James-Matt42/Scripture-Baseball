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

export function PracticeProvider({ children }) {
  const [practice, setPractice] = useState(() => loadPracticeState(browserStorage()));
  const [isSaved, setIsSaved] = useState(null);

  // Runs after changes, including partial guesses; never writes during render.
  useEffect(() => {
    setIsSaved(savePracticeState(browserStorage(), practice));
  }, [practice]);

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
    keepPlaying: () => dispatch({ type: "resume", timestamp: new Date().toISOString() }),
    startNewInning: () => dispatch({ type: "new-inning", timestamp: new Date().toISOString() }),
  }), [practice, isSaved, dispatch]);

  return <PracticeContext.Provider value={value}>{children}</PracticeContext.Provider>;
}

export function usePractice() {
  const context = useContext(PracticeContext);
  if (!context) throw new Error("usePractice must be used inside PracticeProvider");
  return context;
}
