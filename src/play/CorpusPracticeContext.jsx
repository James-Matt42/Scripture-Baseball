import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from '../account/AccountContext.jsx';
import { fetchAccountProgress } from '../api/progressApi.js';
import {
  answerPracticeStage, claimGuestPitch, createPracticePitch, fetchPracticeCatalog,
  fetchPracticeFavorites, fetchPracticePitch, putPracticeFavorites,
} from '../api/practiceApi.js';
import {
  CORPUS_GUEST_KEY, addCompletedPitch, completedLocalResult, corpusKey,
  corpusPracticeStats, finalStageSubmission, loadCorpusState, resumeCorpusInning,
  saveCorpusState, uniqueAttemptHistory,
} from './corpusState.js';

const Context = createContext(null);
const blankDraft = () => ({ bookId: '', chapter: '', verse: '' });
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function storage() {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
}

/** New scripture path only. The old demo question cache is never read. */
export function CorpusPracticeProvider({ children }) {
  const { activeProfile, preferences } = useAccount();
  const userId = activeProfile?.id ?? null;
  const key = corpusKey(userId);
  const [state, setState] = useState(() => {
    const loaded = loadCorpusState(storage(), key, preferences.answerDifficulty === 'exact-verse');
    return !loaded.pitchId && !loaded.history.length && !loaded.scope.volume && preferences.preferredVolume
      ? { ...loaded, scope: { volume: preferences.preferredVolume, book: null } } : loaded;
  });
  const [isSaved, setIsSaved] = useState(null);
  const [pitch, setPitch] = useState(null);
  const [pitchLoading, setPitchLoading] = useState(false);
  const [pitchError, setPitchError] = useState('');
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState('');
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [remoteAttempts, setRemoteAttempts] = useState([]);
  const [syncReady, setSyncReady] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncRetry, setSyncRetry] = useState(0);
  const actionLock = useRef(false);
  const favoriteQueue = useRef(Promise.resolve());
  // Abort outstanding account writes only when this per-user provider unmounts.
  // Aborting each prior PUT when favorites change can leave older server writes
  // racing the most recent PUT, despite the serialized client promise chain.
  const favoriteAbort = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    favoriteAbort.current = controller;
    return () => controller.abort();
  }, []);

  useEffect(() => setIsSaved(saveCorpusState(storage(), key, state)), [key, state]);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogError('');
    fetchPracticeCatalog({ signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setCatalog(result);
    }).catch((error) => { if (!controller.signal.aborted) setCatalogError(error.message); });
    return () => controller.abort();
  }, [catalogRetry]);

  // The browser saves only the opaque token; always restore the live stage and
  // its feedback from the server, which alone knows the correct scripture.
  useEffect(() => {
    if (!state.pitchId) { setPitch(null); return; }
    const id = state.pitchId;
    // A newly created pitch is already in memory. Refetching it here can race
    // with the player's first answer and overwrite a newer stage with a stale one.
    if (pitch?.pitchId === id) return;
    const controller = new AbortController();
    setPitchLoading(true);
    setPitchError('');
    async function restore() {
      try {
        const result = await fetchPracticePitch(id, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setPitch(result);
        if (result.stage === 'complete') {
          // GET feedback alone does not prove that the last POST committed to
          // MongoDB. Replay that exact final guess to make the write durable.
          const submission = finalStageSubmission(result);
          if (!submission) throw new Error('Completed pitch cannot be verified; start a new pitch');
          const confirmed = await answerPracticeStage(id, submission, { signal: controller.signal });
          if (controller.signal.aborted) return;
          setState((prev) => addCompletedPitch(prev,
            completedLocalResult(result, confirmed), { guest: !confirmed.savedToAccount }));
          if (confirmed.savedToAccount && userId) {
            const { attempts } = await fetchAccountProgress({ signal: controller.signal });
            if (!controller.signal.aborted) setRemoteAttempts(attempts);
          }
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setPitchError(error.message);
        if (error.status === 404 || error.status === 410) {
          setState((prev) => prev.pitchId === id ? { ...prev, pitchId: null, draft: blankDraft() } : prev);
        }
      } finally {
        if (!controller.signal.aborted) setPitchLoading(false);
      }
    }
    void restore();
    return () => controller.abort();
  // The pitch ID is the restoration boundary; pitch updates during answering
  // must not abort an in-flight persistence confirmation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pitchId, userId]);

  const refreshAccountHistory = useCallback(async () => {
    if (!userId) return [];
    const { attempts } = await fetchAccountProgress();
    const verified = attempts.filter((item) => typeof item.reference === 'string');
    setRemoteAttempts(verified);
    return verified;
  }, [userId]);

  // A guest completion has a 30-day Mongo-backed receipt, keyed only by its
  // unguessable pitch token. Claim it on login before reading account history.
  useEffect(() => {
    if (!userId) { setSyncReady(false); setSyncError(''); setRemoteAttempts([]); return; }
    let active = true;
    const controller = new AbortController();
    setSyncReady(false);
    setSyncError('');
    async function sync() {
      const local = storage();
      let guest = loadCorpusState(local, CORPUS_GUEST_KEY);
      const claimErrors = [];
      try {
        // Claim failures must not hide otherwise healthy account history.
        // Keep failed tokens for explicit retry; never fabricate the grade.
        const outstanding = [...new Set([...guest.pendingClaims, ...state.pendingClaims])];
        for (const id of outstanding) {
          try {
            await claimGuestPitch(id, { signal: controller.signal });
            if (!active) return;
            guest = { ...guest, pendingClaims: guest.pendingClaims.filter((item) => item !== id) };
            saveCorpusState(local, CORPUS_GUEST_KEY, guest);
            setState((prev) => ({ ...prev, pendingClaims: prev.pendingClaims.filter((item) => item !== id) }));
          } catch (error) {
            if (error.name === 'AbortError') return;
            claimErrors.push(error.message);
          }
        }
        const [progress, remoteFavorites] = await Promise.all([
          fetchAccountProgress({ signal: controller.signal }), fetchPracticeFavorites({ signal: controller.signal }),
        ]);
        if (!active) return;
        setRemoteAttempts(progress.attempts.filter((item) => typeof item.reference === 'string'));
        // Guest favorites are actual revealed verse references, not opaque
        // question tokens. Merge once after signup; further edits are per-user.
        const fromGuest = guest.favorites;
        const current = state.favorites;
        const merged = state.dirtyFavorites ? [...current] :
          [...new Set([...remoteFavorites.favorites, ...current, ...fromGuest])].slice(0, 100);
        if (!equal(merged, remoteFavorites.favorites)) await putPracticeFavorites(merged, { signal: controller.signal });
        if (!active) return;
        setState((prev) => ({ ...prev,
          favorites: prev.dirtyFavorites ? prev.favorites : merged,
          dirtyFavorites: prev.dirtyFavorites,
        }));
        if (fromGuest.length) saveCorpusState(local, CORPUS_GUEST_KEY, { ...guest, favorites: [] });
        setSyncReady(true);
        if (claimErrors.length) setSyncError(`${claimErrors.length} guest pitch claims need another attempt`);
      } catch (error) {
        if (active && error.name !== 'AbortError') setSyncError(error.message);
      }
    }
    void sync();
    return () => { active = false; controller.abort(); };
    // Retry only on user changes or an explicit click, not on every draft edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, syncRetry]);

  useEffect(() => {
    if (!userId || !syncReady || !state.dirtyFavorites) return;
    const values = [...state.favorites];
    let active = true;
    const queued = favoriteQueue.current.then(() => active
      ? putPracticeFavorites(values, { signal: favoriteAbort.current?.signal }) : null);
    favoriteQueue.current = queued.catch(() => {});
    queued.then(() => {
      if (!active) return;
      setState((prev) => equal(prev.favorites, values) ? { ...prev, dirtyFavorites: false } : prev);
      setSyncError('');
    }).catch((error) => { if (active) setSyncError(error.message); });
    // Do not abort an already-sent PUT when preferences change. A later update
    // waits for it to finish, so the newest favorites always win on the server.
    return () => { active = false; };
  }, [userId, syncReady, state.favorites, state.dirtyFavorites, syncRetry]);

  const createPitch = useCallback(async () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setPitchError('');
    try {
      const guestSelection = !userId ? {
        attempts: state.history.slice(-250).map(({ reference, chapterCorrect, bookCorrect, verseCorrect }) => ({
          reference, chapterCorrect, ...(bookCorrect === undefined ? {} : { bookCorrect }),
          ...(verseCorrect === undefined ? {} : { verseCorrect }),
        })),
        favorites: state.favorites,
      } : undefined;
      const result = await createPracticePitch({ scope: state.scope, exactVerse: state.exactVerse,
        collection: state.collection, ...(guestSelection ? { guestSelection } : {}) });
      setPitch(result);
      setState((prev) => ({ ...prev, pitchId: result.pitchId, draft: blankDraft(), paused: false }));
      return result;
    } catch (error) {
      setPitchError(error.message);
      throw error;
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }, [state.scope, state.exactVerse, state.collection, state.history, state.favorites, userId]);

  const answer = useCallback(async (answerBody) => {
    if (!pitch?.pitchId || busy || actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setPitchError('');
    try {
      const feedback = await answerPracticeStage(pitch.pitchId, answerBody);
      const next = { ...pitch, stage: feedback.nextStage,
        [`${answerBody.stage}Feedback`]: feedback };
      setPitch(next);
      if (feedback.nextStage === 'complete') {
        const result = completedLocalResult(next, feedback);
        setState((prev) => addCompletedPitch(prev, result, { guest: !feedback.savedToAccount }));
        if (feedback.savedToAccount) void refreshAccountHistory().catch((error) => setSyncError(error.message));
        else if (userId) setSyncError('Your login session may have expired; sign in again to claim this pitch.');
      }
      return feedback;
    } catch (error) {
      setPitchError(error.message);
      throw error;
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }, [pitch, busy, refreshAccountHistory, userId]);

  const nextPitch = useCallback(async () => {
    if (pitch?.stage !== 'complete' || pitchLoading || pitchError) return;
    await createPitch();
  }, [pitch, createPitch, pitchLoading, pitchError]);

  const selectPractice = useCallback((scope, collection) => {
    const clean = { volume: scope?.volume || null, book: scope?.book || null };
    setPitch(null);
    setState((prev) => ({ ...prev,
      inning: prev.inning + (prev.attempts.length ? 1 : 0),
      scope: clean, collection: collection ?? prev.collection,
      pitchId: null, attempts: [], draft: blankDraft(), paused: false,
    }));
  }, []);
  const setScope = useCallback((scope) => selectPractice(scope), [selectPractice]);
  const setCollection = useCallback((collection) => selectPractice(state.scope, collection),
    [selectPractice, state.scope]);
  const setExactVerse = useCallback((enabled) => {
    setPitch(null);
    setState((prev) => ({ ...prev, exactVerse: !!enabled,
      inning: prev.inning + (prev.attempts.length ? 1 : 0),
      pitchId: null, attempts: [], draft: blankDraft(), paused: false }));
  }, []);
  const setDraft = useCallback((changes) => setState((prev) =>
    ({ ...prev, draft: { ...prev.draft, ...changes } })), []);
  const toggleFavorite = useCallback((reference) => setState((prev) => {
    if (typeof reference !== 'string' || !/^.+:[1-9]\d*:[1-9]\d*$/u.test(reference)) return prev;
    const favorites = prev.favorites.includes(reference)
      ? prev.favorites.filter((item) => item !== reference)
      : [...prev.favorites, reference].slice(0, 100);
    return { ...prev, favorites, dirtyFavorites: true };
  }), []);
  const finishInning = useCallback(() => setState((prev) => ({ ...prev, paused: true })), []);
  const keepPlaying = useCallback(() => {
    const completed = pitch?.stage === 'complete';
    if (completed) setPitch(null);
    setState((prev) => resumeCorpusInning(prev, completed));
  }, [pitch?.stage]);

  const recordedAttempts = useMemo(() => uniqueAttemptHistory(remoteAttempts, state.history),
    [remoteAttempts, state.history]);
  const value = useMemo(() => ({
    state, pitch, busy, pitchLoading, pitchError, catalog, catalogError,
    retryCatalog: () => setCatalogRetry((n) => n + 1),
    isSaved, recordedAttempts, stats: corpusPracticeStats(state.attempts),
    syncStatus: !userId ? 'guest' : syncError ? 'error' : syncReady ? 'connected' : 'syncing',
    syncError, retrySync: () => setSyncRetry((n) => n + 1),
    createPitch, answer, nextPitch, setScope, setCollection, selectPractice, setExactVerse, setDraft,
    toggleFavorite, finishInning, keepPlaying,
  }), [state, pitch, busy, pitchLoading, pitchError, catalog, catalogError,
    isSaved, recordedAttempts, userId, syncError, syncReady, createPitch, answer,
    nextPitch, setScope, setCollection, selectPractice, setExactVerse, setDraft, toggleFavorite, finishInning, keepPlaying]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCorpusPractice() {
  const context = useContext(Context);
  if (!context) throw new Error('useCorpusPractice requires CorpusPracticeProvider');
  return context;
}
