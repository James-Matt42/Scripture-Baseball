import {
  SAMPLE_QUESTIONS,
  gradeBookAndChapter,
  gradeExactVerse,
} from "../scripture/questions.js";
import { getPracticeStats, getResumePitchIndex } from "./session.js";

export const PRACTICE_STORAGE_KEY = "scripture-baseball.practice.v1";
const VERSION = 1;
const MAX_SAVED_INNINGS = 100;

const questionById = new Map(SAMPLE_QUESTIONS.map((question) => [question.id, question]));

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function createSession(inning = 1, exactVerse = false) {
  return {
    inning,
    pitchIndex: 0,
    attempts: [],
    exactVerse,
    isFinished: false,
    archived: false,
    draft: null,
  };
}

export function createInitialPracticeState() {
  return { version: VERSION, session: createSession(), history: [] };
}

// Recalculate scores from saved guesses instead of trusting saved 'correct' flags.
function normalizeAttempt(value, question, exactVerse) {
  if (
    !isRecord(value) ||
    value.questionId !== question.id ||
    !question.choices.includes(value.bookId) ||
    !positiveInteger(value.chapter) ||
    (exactVerse && !positiveInteger(value.verse))
  ) {
    return null;
  }

  const answer = gradeBookAndChapter(question, value.bookId, value.chapter);
  return exactVerse ? gradeExactVerse(question, answer, value.verse) : answer;
}

function normalizeAttempts(value, exactVerse) {
  if (!Array.isArray(value)) return [];
  const found = new Map();
  for (const item of value) {
    if (!isRecord(item) || found.has(item.questionId)) continue;
    const question = questionById.get(item.questionId);
    if (!question) continue;
    const attempt = normalizeAttempt(item, question, exactVerse);
    if (attempt) found.set(question.id, attempt);
    if (found.size === SAMPLE_QUESTIONS.length) break;
  }
  // The starter lineup always follows the order of the sample questions.
  return SAMPLE_QUESTIONS.filter((question) => found.has(question.id)).map((question) => found.get(question.id));
}

function normalizeDraft(value, pitchIndex, exactVerse, attempts) {
  const question = SAMPLE_QUESTIONS[pitchIndex];
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
    const attempts = normalizeAttempts(item.attempts, exactVerse);
    if (!attempts.length) return [];
    const finishedAt = typeof item.finishedAt === "string" && !Number.isNaN(Date.parse(item.finishedAt))
      ? item.finishedAt : null;
    if (!finishedAt) return [];
    const stats = getPracticeStats(attempts, SAMPLE_QUESTIONS.length, exactVerse);
    return [{
      id: `inning-${item.inning}-${finishedAt}`,
      inning: item.inning,
      finishedAt,
      exactVerse,
      complete: stats.completed === SAMPLE_QUESTIONS.length,
      attempts,
      earnedPoints: stats.earnedPoints,
      possiblePoints: stats.possiblePoints,
    }];
  });
}

export function normalizePracticeState(value) {
  if (!isRecord(value) || value.version !== VERSION || !isRecord(value.session)) {
    return createInitialPracticeState();
  }
  const source = value.session;
  const inning = positiveInteger(source.inning) ? source.inning : 1;
  const pitchIndex = Number.isSafeInteger(source.pitchIndex)
    ? Math.max(0, Math.min(source.pitchIndex, SAMPLE_QUESTIONS.length - 1)) : 0;
  const exactVerse = source.exactVerse === true;
  const attempts = normalizeAttempts(source.attempts, exactVerse);
  const history = normalizeHistory(value.history);
  const archived = source.archived === true && history.some((entry) => entry.inning === inning);
  const isFinished = source.isFinished === true || archived;
  const draft = normalizeDraft(source.draft, pitchIndex, exactVerse, attempts);

  return {
    version: VERSION,
    session: { inning, pitchIndex, exactVerse, attempts, isFinished, archived, draft },
    history,
  };
}

export function loadPracticeState(storage) {
  try {
    const json = storage?.getItem(PRACTICE_STORAGE_KEY);
    return json ? normalizePracticeState(JSON.parse(json)) : createInitialPracticeState();
  } catch {
    // Private browsing, blocked storage, or malformed saved data: start fresh.
    return createInitialPracticeState();
  }
}

export function savePracticeState(storage, state) {
  try {
    if (!storage) return false;
    storage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// History is appended once at the end of a full inning, or when the player
// explicitly starts a new inning instead of resuming a partially played one.
function archive(state, session, timestamp) {
  if (session.archived || !session.attempts.length) return { ...state, session };
  const stats = getPracticeStats(session.attempts, SAMPLE_QUESTIONS.length, session.exactVerse);
  const finishedAt = timestamp || new Date(0).toISOString();
  const entry = {
    id: `inning-${session.inning}-${finishedAt}`,
    inning: session.inning,
    finishedAt,
    exactVerse: session.exactVerse,
    complete: stats.completed === SAMPLE_QUESTIONS.length,
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

function startNewInning(state, timestamp) {
  const { session } = state;
  const previous = archive(state, session, timestamp);
  return {
    ...previous,
    session: createSession(session.inning + 1, session.exactVerse),
  };
}

// Keeping transitions in a pure reducer makes refresh/resume and duplicate
// submission behavior testable without a browser.
export function practiceReducer(state, action) {
  const { session } = state;
  const question = SAMPLE_QUESTIONS[session.pitchIndex];
  const answeredCurrent = session.attempts.some((attempt) => attempt.questionId === question?.id);

  switch (action.type) {
    case "set-exact-verse":
      if (session.isFinished || session.attempts.length > 0) return state;
      if (session.exactVerse === (action.enabled === true)) return state;
      return { ...state, session: { ...session, exactVerse: action.enabled === true, draft: null } };

    case "set-draft": {
      if (session.isFinished || answeredCurrent) return state;
      const draft = normalizeDraft(action.draft, session.pitchIndex, session.exactVerse, session.attempts);
      if (JSON.stringify(draft) === JSON.stringify(session.draft)) return state;
      return { ...state, session: { ...session, draft } };
    }

    case "answer": {
      if (session.isFinished || answeredCurrent || !question) return state;
      const result = normalizeAttempt(action.attempt, question, session.exactVerse);
      if (!result) return state;
      return {
        ...state,
        session: { ...session, attempts: [...session.attempts, result], draft: null },
      };
    }

    case "next":
      if (session.isFinished || !answeredCurrent) return state;
      if (session.pitchIndex === SAMPLE_QUESTIONS.length - 1) {
        return archive(state, { ...session, isFinished: true, draft: null }, action.timestamp);
      }
      return { ...state, session: { ...session, pitchIndex: session.pitchIndex + 1, draft: null } };

    case "finish":
      if (session.isFinished) return state;
      if (session.attempts.length === SAMPLE_QUESTIONS.length) {
        return archive(state, { ...session, isFinished: true, draft: null }, action.timestamp);
      }
      return { ...state, session: { ...session, isFinished: true } };

    case "resume": {
      if (!session.isFinished) return state;
      if (session.attempts.length === SAMPLE_QUESTIONS.length) return startNewInning(state, action.timestamp);
      const pitchIndex = getResumePitchIndex(SAMPLE_QUESTIONS, session.pitchIndex, session.attempts);
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
      return startNewInning(state, action.timestamp);

    default:
      return state;
  }
}

// Include the current unfinished inning once; completed innings are already
// represented in the history collection.
export function getRecordedAttempts(state) {
  return [
    ...state.history.flatMap((entry) => entry.attempts),
    ...(state.session.archived ? [] : state.session.attempts),
  ];
}
