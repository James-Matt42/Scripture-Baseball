import { VOLUME_OPTIONS } from "../account/accountState.js";
import { getChallengeById } from "../challenges/catalog.js";
import { getBookLabel, getQuestionById, getQuestionVolume } from "../scripture/questions.js";
import { getPracticeStats } from "../play/session.js";

// All progress metrics are calculated from saved solo attempts. There are no
// estimated or placeholder statistics, and an unplayed passage is not a miss.
const VOLUMES = VOLUME_OPTIONS.filter((item) => item.value);

function accuracy(correct, total) {
  return total ? Math.round((correct / total) * 100) : null;
}

function dateOrNull(value) {
  const date = typeof value === "string" ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function localDay(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function correctLocation(attempt) {
  // An exact-verse miss still needs review, even if book and chapter were right.
  return attempt.bookCorrect === true && attempt.chapterCorrect === true && attempt.verseCorrect !== false;
}

function createTally() {
  return { pitches: 0, bookCorrect: 0, chapterCorrect: 0, versePitches: 0, verseCorrect: 0 };
}

function addAttempt(tally, attempt) {
  tally.pitches += 1;
  if (attempt.bookCorrect === true) tally.bookCorrect += 1;
  if (attempt.chapterCorrect === true) tally.chapterCorrect += 1;
  if (typeof attempt.verseCorrect === "boolean") {
    tally.versePitches += 1;
    if (attempt.verseCorrect) tally.verseCorrect += 1;
  }
}

function withAccuracy(tally) {
  return {
    ...tally,
    bookAccuracy: accuracy(tally.bookCorrect, tally.pitches),
    chapterAccuracy: accuracy(tally.chapterCorrect, tally.pitches),
    verseAccuracy: accuracy(tally.verseCorrect, tally.versePitches),
  };
}

export function getProgressReport({ attempts = [], history = [], now = new Date() } = {}) {
  const completed = Array.isArray(history) ? history : [];
  const savedAttempts = Array.isArray(attempts) ? attempts : [];

  // History contains the archived portion of recordedAttempts, in the same
  // order. Current-inning attempts have no date: do not manufacture one.
  const archived = completed.flatMap((inning) =>
    (Array.isArray(inning?.attempts) ? inning.attempts : []).map((attempt) => ({
      questionId: attempt.questionId,
      finishedAt: dateOrNull(inning.finishedAt),
    })),
  );
  const timeline = savedAttempts.flatMap((attempt, index) => {
    const question = getQuestionById(attempt?.questionId);
    if (!question) return [];
    const finishedAt = archived[index]?.questionId === attempt.questionId
      ? archived[index].finishedAt : null;
    return [{ attempt, question, finishedAt }];
  });

  const totals = createTally();
  const byVolume = new Map(VOLUMES.map((volume) => [volume.value, createTally()]));
  const byBook = new Map();
  const byPassage = new Map();

  for (const event of timeline) {
    const { attempt, question } = event;
    addAttempt(totals, attempt);
    addAttempt(byVolume.get(getQuestionVolume(question)), attempt);

    if (!byBook.has(question.bookId)) byBook.set(question.bookId, createTally());
    addAttempt(byBook.get(question.bookId), attempt);

    if (!byPassage.has(question.id)) byPassage.set(question.id, { question, events: [] });
    byPassage.get(question.id).events.push(event);
  }

  const passages = [...byPassage.values()].map(({ question, events }) => {
    const latest = events.at(-1);
    const previous = events.slice(0, -1);
    const previouslyMissed = previous.some(({ attempt }) => !correctLocation(attempt));
    const lastTwoCorrect = events.length >= 2 && events.slice(-2).every(({ attempt }) => correctLocation(attempt));
    return {
      question,
      attempts: events.length,
      latestCorrect: correctLocation(latest.attempt),
      strong: lastTwoCorrect,
      needsReview: !correctLocation(latest.attempt),
      comeback: previouslyMissed && correctLocation(latest.attempt),
      latestFinishedAt: latest.finishedAt,
    };
  });

  const strongPassages = passages.filter((passage) => passage.strong);
  const learningPassages = passages.filter((passage) => !passage.strong);
  const needsReview = passages.filter((passage) => passage.needsReview);
  const comebacks = passages.filter((passage) => passage.comeback);

  const weakBooks = [...byBook.entries()].flatMap(([bookId, tally]) => {
    const missed = needsReview.filter(({ question }) => question.bookId === bookId);
    if (!missed.length) return [];
    return [{
      bookId,
      label: getBookLabel(bookId),
      questionIds: missed.map(({ question }) => question.id),
      needsReview: missed.length,
      ...withAccuracy(tally),
    }];
  }).sort((a, b) => b.needsReview - a.needsReview || a.chapterAccuracy - b.chapterAccuracy || a.label.localeCompare(b.label));

  const current = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const weekStart = new Date(current.getFullYear(), current.getMonth(), current.getDate() - ((current.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);
  const thisWeek = (date) => date && date >= weekStart && date < weekEnd && date <= current;
  const practiceDays = new Set(completed.map((inning) => dateOrNull(inning.finishedAt))
    .filter(thisWeek).map(localDay)).size;

  const strengthenedThisWeek = comebacks.filter((passage) => thisWeek(passage.latestFinishedAt));
  const recentInnings = completed.filter((inning) => Array.isArray(inning?.attempts) && inning.attempts.length)
    .slice(-10).reverse().map((inning) => {
      const stats = getPracticeStats(inning.attempts, inning.questionIds?.length ?? inning.attempts.length, inning.exactVerse);
      return {
        id: inning.id,
        finishedAt: dateOrNull(inning.finishedAt),
        challenge: getChallengeById(inning.challengeId)?.title ?? "Solo practice",
        complete: stats.completed === stats.totalPitches,
        ...stats,
        bookAccuracy: accuracy(stats.bookCorrect, stats.completed),
        chapterAccuracy: accuracy(stats.chapterCorrect, stats.completed),
      };
    });

  const volumes = VOLUMES.map(({ value, label }) => ({
    id: value,
    label,
    strongPassages: strongPassages.filter(({ question }) => getQuestionVolume(question) === value).length,
    ...withAccuracy(byVolume.get(value)),
  }));

  const achievements = [
    { id: "first-inning", label: "First Inning", detail: "Finish a solo inning", earned: recentInnings.length > 0 },
    { id: "ten-pitches", label: "Ten Pitches", detail: "Answer 10 pitches", earned: totals.pitches >= 10 },
    { id: "strong-passage", label: "Strong Passage", detail: "Recall a passage correctly twice in a row", earned: strongPassages.length > 0 },
    { id: "volume-explorer", label: "Volume Explorer", detail: "Practice in three standard works", earned: volumes.filter((volume) => volume.pitches > 0).length >= 3 },
  ];

  return {
    ...withAccuracy(totals),
    passages,
    strongPassages,
    learningPassages,
    needsReview,
    comebacks,
    weakBooks,
    volumes,
    practiceDays,
    strengthenedThisWeek,
    recentInnings,
    achievements,
  };
}
