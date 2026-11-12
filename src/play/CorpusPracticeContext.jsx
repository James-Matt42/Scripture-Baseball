import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount } from '../account/AccountContext.jsx';
import { fetchAccountProgress } from '../api/progressApi.js';
import {
  answerPracticeStage, claimGuestPitch, createPracticePitch, fetchPracticeCatalog,
  fetchPracticeFavorites, fetchPracticePitch, putPracticeFavorites,
} from '../api/practiceApi.js';
import {
  CORPUS_GUEST_KEY, addCompletedPitch, completedLocalResult, corpusKey,
  corpusPracticeStats, loadCorpusState, saveCorpusState, uniqueAttemptHistory,
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
  const [state, setState] = useState(() => loadCorpusState(storage(), key,
    preferences.answerDifficulty === 'exact-verse'));
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
    const controller = new AbortController();
    setPitchLoading(true);
    setPitchError('');
    fetchPracticePitch(id, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setPitch(result);
      if (result.stage === 'complete') {
        const final = result.verseFeedback ?? result.chapterFeedback;
        if (final?.reference) setState((prev) => addCompletedPitch(prev,
          completedLocalResult(result, final), { guest: !userId }));
      }
    }).catch((error) => {
      if (controller.signal.aborted) return;
      setPitchError(error.message);
      if (error.status === 404 || error.status === 410) {
        setState((prev) => prev.pitchId === id ? { ...prev, pitchId: null, draft: blankDraft() } : prev);
      }
    }).finally(() => { if (!controller.signal.aborted) setPitchLoading(false); });
    return () => controller.abort();
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
    const controller = new AbortController();
    const queued = favoriteQueue.current.then(() => active ? putPracticeFavorites(values, { signal: controller.signal }) : null);
    favoriteQueue.current = queued.catch(() => {});
    queued.then(() => {
      if (!active) return;
      setState((prev) => equal(prev.favorites, values) ? { ...prev, dirtyFavorites: false } : prev);
      setSyncError('');
    }).catch((error) => { if (active) setSyncError(error.message); });
    return () => { active = false; controller.abort(); };
  }, [userId, syncReady, state.favorites, state.dirtyFavorites, syncRetry]);

  const createPitch = useCallback(async () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setPitchError('');
    try {
      const result = await createPracticePitch({ scope: state.scope, exactVerse: state.exactVerse });
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
  }, [state.scope, state.exactVerse]);

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
    if (pitch?.stage !== 'complete') return;
    await createPitch();
  }, [pitch, createPitch]);

  const setScope = useCallback((scope) => {
    const clean = { volume: scope?.volume || null, book: scope?.book || null };
    setPitch(null);
    setState((prev) => ({ ...prev,
      inning: prev.inning + (prev.attempts.length ? 1 : 0),
      scope: clean, pitchId: null, attempts: [], draft: blankDraft(), paused: false,
    }));
  }, []);
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
  const keepPlaying = useCallback(() => setState((prev) => ({ ...prev, paused: false,
    inning: prev.attempts.length ? prev.inning + 1 : prev.inning, attempts: [] })), []);

  const recordedAttempts = useMemo(() => uniqueAttemptHistory(remoteAttempts, state.history),
    [remoteAttempts, state.history]);
  const value = useMemo(() => ({
    state, pitch, busy, pitchLoading, pitchError, catalog, catalogError,
    retryCatalog: () => setCatalogRetry((n) => n + 1),
    isSaved, recordedAttempts, stats: corpusPracticeStats(state.attempts),
    syncStatus: !userId ? 'guest' : syncError ? 'error' : syncReady ? 'connected' : 'syncing',
    syncError, retrySync: () => setSyncRetry((n) => n + 1),
    createPitch, answer, nextPitch, setScope, setExactVerse, setDraft,
    toggleFavorite, finishInning, keepPlaying,
  }), [state, pitch, busy, pitchLoading, pitchError, catalog, catalogError,
    isSaved, recordedAttempts, userId, syncError, syncReady, createPitch, answer,
    nextPitch, setScope, setExactVerse, setDraft, toggleFavorite, finishInning, keepPlaying]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCorpusPractice() {
  const context = useContext(Context);
  if (!context) throw new Error('useCorpusPractice requires CorpusPracticeProvider');
  return context;
}
