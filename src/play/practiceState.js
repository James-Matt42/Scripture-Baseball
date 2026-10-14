import {
  SAMPLE_QUESTIONS,
  getQuestionById,
  gradeBookAndChapter,
  gradeExactVerse,
} from "../scripture/questions.js";
import { getChallengeById, getChallengeQuestions } from "../challenges/catalog.js";
import { getPracticeStats, getResumePitchIndex } from "./session.js";

export const PRACTICE_STORAGE_KEY = "scripture-baseball.practice.v1";
const VERSION = 1;
const MAX_SAVED_INNINGS = 100;
const MAX_QUESTIONS = 30;
const STARTER_IDS = SAMPLE_QUESTIONS.map((question) => question.id);

export function getPracticeStorageKey(profileId) {
  return typeof profileId === "string" && /^account-[1-9]\d*$/.test(profileId)
    ? `${PRACTICE_STORAGE_KEY}.${profileId}`
    : PRACTICE_STORAGE_KEY;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function normalizeQuestionIds(value, fallback = STARTER_IDS) {
  if (!Array.isArray(value)) return [...fallback];
  const ids = [...new Set(value.filter((id) => typeof id === "string" && getQuestionById(id)))].slice(0, MAX_QUESTIONS);
  return ids.length ? ids : [...fallback];
}

function normalizeFavorites(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id) => typeof id === "string" && getQuestionById(id)))].slice(0, MAX_QUESTIONS);
}

export function getSessionQuestions(session) {
  return normalizeQuestionIds(session?.questionIds).map((id) => getQuestionById(id));
}

function createSession(inning = 1, exactVerse = false, challengeId = "todays-lineup", questionIds = STARTER_IDS) {
  return {
    inning,
    challengeId,
    questionIds: [...questionIds],
    pitchIndex: 0,
    attempts: [],
    exactVerse,
    modeOverride: false,
    isFinished: false,
    archived: false,
    draft: null,
  };
}

export function createInitialPracticeState(defaultExactVerse = false) {
  return { version: VERSION, session: createSession(1, defaultExactVerse), history: [], favorites: [] };
}

// Always grade stored guesses again instead of accepting saved correctness flags.
function normalizeAttempt(value, question, exactVerse) {
  if (
    !isRecord(value) ||
    value.questionId !== question.id ||
    !question.choices.includes(value.bookId) ||
    !positiveInteger(value.chapter) ||
    (exactVerse && !positiveInteger(value.verse))
  ) return null;

  const answer = gradeBookAndChapter(question, value.bookId, value.chapter);
  return exactVerse ? gradeExactVerse(question, answer, value.verse) : answer;
}

function normalizeAttempts(value, exactVerse, questions) {
  if (!Array.isArray(value)) return [];
  const found = new Map();
  const allowed = new Map(questions.map((question) => [question.id, question]));
  for (const item of value) {
    if (!isRecord(item) || found.has(item.questionId)) continue;
    const question = allowed.get(item.questionId);
    if (!question) continue;
    const attempt = normalizeAttempt(item, question, exactVerse);
    if (attempt) found.set(question.id, attempt);
    if (found.size === questions.length) break;
  }
  return questions.filter((question) => found.has(question.id)).map((question) => found.get(question.id));
}

function normalizeDraft(value, pitchIndex, exactVerse, attempts, questions) {
  const question = questions[pitchIndex];
  if (!question || !isRecord(value) || value.questionId !== question.id) return null;
  if (attempts.some((attempt) => attempt.questionId === question.id)) return null;

  const bookId = question.choices.includes(value.bookId) ? value.bookId : "";
  const chapterInput = typeof value.chapterInput === "string" && /^\d{0,5}$/.test(value.chapterInput)
    ? value.chapterInput : "";
  const verseInput = typeof value.verseInput === "string" && /^\d{0,5}$/.test(value.verseInput)
    ? value.verseInput : "";
  let stage = ["book", "chapter", "verse"].includes(value.stage) ? value.stage : "book";
  if (stage !== "book" && !bookId) stage = "book";
  if (stage === "verse" && (!exactVerse || !positiveInteger(Number(chapterInput)))) stage = "chapter";

  return { questionId: question.id, stage, bookId, chapterInput, verseInput };
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_SAVED_INNINGS).flatMap((item) => {
    if (!isRecord(item) || !positiveInteger(item.inning)) return [];
    const exactVerse = item.exactVerse === true;
    const questionIds = normalizeQuestionIds(item.questionIds);
    const questions = questionIds.map((id) => getQuestionById(id));
    const attempts = normalizeAttempts(item.attempts, exactVerse, questions);
    if (!attempts.length) return [];
    const finishedAt = typeof item.finishedAt === "string" && !Number.isNaN(Date.parse(item.finishedAt))
      ? item.finishedAt : null;
    if (!finishedAt) return [];
    const stats = getPracticeStats(attempts, questions.length, exactVerse);
    return [{
      id: `inning-${item.inning}-${finishedAt}`,
      inning: item.inning,
      challengeId: getChallengeById(item.challengeId) ? item.challengeId : "todays-lineup",
      questionIds,
      finishedAt,
      exactVerse,
      complete: stats.completed === questions.length,
      attempts,
      earnedPoints: stats.earnedPoints,
      possiblePoints: stats.possiblePoints,
    }];
  });
}

export function normalizePracticeState(value, defaultExactVerse = false) {
  if (!isRecord(value) || value.version !== VERSION || !isRecord(value.session)) {
    return createInitialPracticeState(defaultExactVerse);
  }
  const source = value.session;
  const questionIds = normalizeQuestionIds(source.questionIds);
  const questions = questionIds.map((id) => getQuestionById(id));
  const inning = positiveInteger(source.inning) ? source.inning : 1;
  const pitchIndex = Number.isSafeInteger(source.pitchIndex)
    ? Math.max(0, Math.min(source.pitchIndex, questions.length - 1)) : 0;
  const exactVerse = source.exactVerse === true;
  // Retain a manually chosen mode from earlier saved innings.
  const modeOverride = source.modeOverride === true ||
    (source.modeOverride === undefined && exactVerse);
  const attempts = normalizeAttempts(source.attempts, exactVerse, questions);
  const history = normalizeHistory(value.history);
  const archived = source.archived === true && history.some((entry) => entry.inning === inning);
  const isFinished = source.isFinished === true || archived;
  const draft = normalizeDraft(source.draft, pitchIndex, exactVerse, attempts, questions);

  return {
    version: VERSION,
    session: {
      inning, challengeId: getChallengeById(source.challengeId) ? source.challengeId : "todays-lineup",
      questionIds, pitchIndex, exactVerse, modeOverride, attempts, isFinished, archived, draft,
    },
    history,
    favorites: normalizeFavorites(value.favorites),
  };
}

export function loadPracticeState(storage, storageKey = PRACTICE_STORAGE_KEY, defaultExactVerse = false) {
  try {
    const json = storage?.getItem(storageKey);
    return json ? normalizePracticeState(JSON.parse(json), defaultExactVerse) : createInitialPracticeState(defaultExactVerse);
  } catch {
    return createInitialPracticeState(defaultExactVerse);
  }
}

export function savePracticeState(storage, state, storageKey = PRACTICE_STORAGE_KEY) {
  try {
    if (!storage) return false;
    storage.setItem(storageKey, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function archive(state, session, timestamp) {
  if (session.archived || !session.attempts.length) return { ...state, session };
  const stats = getPracticeStats(session.attempts, session.questionIds.length, session.exactVerse);
  const finishedAt = timestamp || new Date(0).toISOString();
  const entry = {
    id: `inning-${session.inning}-${finishedAt}`,
    inning: session.inning,
    challengeId: session.challengeId,
    questionIds: session.questionIds,
    finishedAt,
    exactVerse: session.exactVerse,
    complete: stats.completed === session.questionIds.length,
    attempts: session.attempts,
    earnedPoints: stats.earnedPoints,
    possiblePoints: stats.possiblePoints,
  };
  return {
    ...state,
    session: { ...session, archived: true },
    history: [...state.history, entry].slice(-MAX_SAVED_INNINGS),
  };
}

function startNewInning(state, timestamp, defaultExactVerse = state.session.exactVerse, challengeId = state.session.challengeId, questionIds = state.session.questionIds) {
  const { session } = state;
  const previous = archive(state, session, timestamp);
  return {
    ...previous,
    session: createSession(session.inning + 1, defaultExactVerse, challengeId, questionIds),
  };
}

export function practiceReducer(state, action) {
  const { session } = state;
  const questions = getSessionQuestions(session);
  const question = questions[session.pitchIndex];
  const answeredCurrent = session.attempts.some((attempt) => attempt.questionId === question?.id);

  switch (action.type) {
    case "set-exact-verse":
      if (session.isFinished || session.attempts.length > 0) return state;
      if (action.fromPreference && (session.modeOverride || session.draft)) return state;
      if (session.exactVerse === (action.enabled === true)) return state;
      return {
        ...state,
        session: {
          ...session,
          exactVerse: action.enabled === true,
          modeOverride: action.fromPreference ? session.modeOverride : true,
          draft: null,
        },
      };

    case "toggle-favorite": {
      if (!getQuestionById(action.questionId)) return state;
      const favorites = state.favorites.includes(action.questionId)
        ? state.favorites.filter((id) => id !== action.questionId)
        : [...state.favorites, action.questionId];
      return { ...state, favorites };
    }

    case "start-challenge": {
      const challenge = getChallengeById(action.challengeId);
      if (!challenge || !Array.isArray(action.questionIds)) return state;
      const available = new Set(getChallengeQuestions(challenge.id, getRecordedAttempts(state), state.favorites).map((item) => item.id));
      const questionIds = [...new Set(action.questionIds.filter((id) => available.has(id)))].slice(0, MAX_QUESTIONS);
      if (!questionIds.length) return state;
      // Choosing a challenge before the first scored pitch should not
      // manufacture an empty inning in the player's practice history.
      if (!session.attempts.length && !session.archived) {
        return {
          ...state,
          session: createSession(session.inning, action.defaultExactVerse ?? session.exactVerse, challenge.id, questionIds),
        };
      }
      return startNewInning(state, action.timestamp, action.defaultExactVerse ?? session.exactVerse, challenge.id, questionIds);
    }

    case "set-draft": {
      if (session.isFinished || answeredCurrent) return state;
      const draft = normalizeDraft(action.draft, session.pitchIndex, session.exactVerse, session.attempts, questions);
      if (JSON.stringify(draft) === JSON.stringify(session.draft)) return state;
      return { ...state, session: { ...session, draft } };
    }

    case "answer": {
      if (session.isFinished || answeredCurrent || !question) return state;
      const result = normalizeAttempt(action.attempt, question, session.exactVerse);
      if (!result) return state;
      return { ...state, session: { ...session, attempts: [...session.attempts, result], draft: null } };
    }

    case "next":
      if (session.isFinished || !answeredCurrent) return state;
      if (session.pitchIndex === questions.length - 1) {
        return archive(state, { ...session, isFinished: true, draft: null }, action.timestamp);
      }
      return { ...state, session: { ...session, pitchIndex: session.pitchIndex + 1, draft: null } };

    case "finish":
      if (session.isFinished) return state;
      if (session.attempts.length === questions.length) {
        return archive(state, { ...session, isFinished: true, draft: null }, action.timestamp);
      }
      return { ...state, session: { ...session, isFinished: true } };

    case "resume": {
      if (!session.isFinished) return state;
      if (session.attempts.length === questions.length) return startNewInning(state, action.timestamp, action.defaultExactVerse ?? session.exactVerse);
      const pitchIndex = getResumePitchIndex(questions, session.pitchIndex, session.attempts);
      return {
        ...state,
        session: {
          ...session,
          pitchIndex,
          draft: pitchIndex === session.pitchIndex ? session.draft : null,
          isFinished: false,
        },
      };
    }

    case "new-inning":
      return startNewInning(state, action.timestamp, action.defaultExactVerse ?? session.exactVerse);

    default:
      return state;
  }
}

export function getRecordedAttempts(state) {
  return [
    ...state.history.flatMap((entry) => entry.attempts),
    ...(state.session.archived ? [] : state.session.attempts),
  ];
}
