import { ALL_QUESTIONS, SAMPLE_QUESTIONS, getQuestionById, getQuestionVolume } from "../scripture/questions.js";

// Only catalog playable selections backed by questions in our local dataset.
// Adding a challenge later requires supplying real question IDs, not just a card.
export const CHALLENGES = [
  { id: "todays-lineup", title: "Today's Lineup", section: "recommended", category: "volume", difficulty: "beginner", description: "Six starter passages from the Book of Mormon.", questionIds: SAMPLE_QUESTIONS.map((question) => question.id) },
  { id: "doctrinal-mastery", title: "Doctrinal Mastery", section: "recommended", category: "doctrinal-mastery", difficulty: "standard", description: "A starter selection of doctrinal mastery references.", questionIds: ["2-nephi-2-25", "alma-32-21", "ether-12-27", "john-3-16", "dc-18-10", "moses-1-39"] },
  { id: "four-gospels", title: "Four Gospels", section: "recommended", category: "volume", difficulty: "standard", description: "Identify passages from Matthew, Mark, Luke, and John.", questionIds: ["matthew-5-14", "mark-10-27", "luke-2-10", "john-14-6", "john-3-16", "matthew-6-6"] },
  { id: "my-misses", title: "My Misses", section: "personal", category: "personal", difficulty: "standard", description: "Replay passages you have missed in solo practice." },
  { id: "my-favorites", title: "My Favorites", section: "personal", category: "personal", difficulty: "standard", description: "Practice passages you have bookmarked during solo practice." },
  { id: "weak-areas", title: "Weak Areas", section: "personal", category: "personal", difficulty: "advanced", description: "Review books where your recent answers need work." },
  { id: "book-of-mormon", title: "Book of Mormon", section: "catalog", category: "volume", difficulty: "beginner", description: "Locate passages from the Book of Mormon.", volumes: ["book-of-mormon"] },
  { id: "new-testament", title: "New Testament", section: "catalog", category: "volume", difficulty: "beginner", description: "Locate passages from the New Testament.", volumes: ["new-testament"] },
  { id: "old-testament", title: "Old Testament", section: "catalog", category: "volume", difficulty: "beginner", description: "Locate passages from the Old Testament.", volumes: ["old-testament"] },
  { id: "doctrine-and-covenants", title: "Doctrine and Covenants", section: "catalog", category: "volume", difficulty: "standard", description: "Try a selection from the Doctrine and Covenants.", volumes: ["doctrine-and-covenants"] },
  { id: "pearl-of-great-price", title: "Pearl of Great Price", section: "catalog", category: "volume", difficulty: "standard", description: "Practice the available Pearl of Great Price passage.", volumes: ["pearl-of-great-price"] },
  { id: "alma", title: "Alma", section: "catalog", category: "volume", difficulty: "standard", description: "Focus on Alma's passages.", questionIds: ["alma-32-21", "alma-37-6"] },
  { id: "faith", title: "Faith", section: "catalog", category: "topic", difficulty: "standard", description: "Passages about faith and trust.", questionIds: ["alma-32-21", "ether-12-27", "mark-10-27", "isaiah-40-31"] },
  { id: "prayer", title: "Prayer", section: "catalog", category: "topic", difficulty: "standard", description: "Passages about prayer.", questionIds: ["3-nephi-18-15", "matthew-6-6", "dc-6-36"] },
  { id: "frequently-quoted", title: "Familiar Quotes", section: "catalog", category: "conference", difficulty: "standard", description: "A sample collection of familiar scripture excerpts (not a measured citation ranking).", questionIds: ["1-nephi-3-7", "2-nephi-2-25", "john-3-16", "moses-1-39"] },
  { id: "extra-challenge", title: "Extra Challenge", section: "catalog", category: "expert", difficulty: "advanced", description: "Stretch your chapter recall with less familiar selections.", questionIds: ["isaiah-40-31", "alma-37-6", "dc-6-36", "3-nephi-18-15"] },
  { id: "isaiah", title: "Isaiah Challenge", section: "catalog", category: "expert", difficulty: "advanced", description: "Find the chapter for these Isaiah passages.", questionIds: ["isaiah-1-18", "isaiah-40-31"] },
];

const challengeById = new Map(CHALLENGES.map((item) => [item.id, item]));

export function getChallengeById(id) {
  return challengeById.get(id) ?? null;
}

// An incorrect book, chapter or (when used) verse makes this a missed passage.
function wasMissed(attempt) {
  return attempt.bookCorrect === false || attempt.chapterCorrect === false || attempt.verseCorrect === false;
}

export function getMissedQuestionIds(attempts = []) {
  const ids = new Set(attempts.filter(wasMissed).map((attempt) => attempt.questionId));
  return ALL_QUESTIONS.filter((question) => ids.has(question.id)).map((question) => question.id);
}

export function getWeakAreaQuestionIds(attempts = []) {
  // Use the last 30 answers so older misses don't permanently dominate.
  const recent = attempts.slice(-30);
  const tally = new Map();
  for (const attempt of recent) {
    const question = getQuestionById(attempt.questionId);
    if (!question) continue;
    const current = tally.get(question.bookId) ?? { wrong: 0, total: 0 };
    current.total += 1;
    if (wasMissed(attempt)) current.wrong += 1;
    tally.set(question.bookId, current);
  }
  const weakBooks = [...tally.entries()]
    .filter(([, score]) => score.wrong > 0)
    .sort((a, b) => b[1].wrong / b[1].total - a[1].wrong / a[1].total)
    .map(([bookId]) => bookId);
  return weakBooks.flatMap((bookId) => ALL_QUESTIONS.filter((question) => question.bookId === bookId).map((question) => question.id)).slice(0, 12);
}

export function getChallengeQuestions(id, attempts = [], favorites = [], volume = "") {
  const challenge = getChallengeById(id);
  if (!challenge) return [];
  let ids;
  if (id === "my-misses") ids = getMissedQuestionIds(attempts);
  else if (id === "weak-areas") ids = getWeakAreaQuestionIds(attempts);
  else if (id === "my-favorites") ids = favorites;
  else if (challenge.volumes) {
    ids = ALL_QUESTIONS.filter((question) => challenge.volumes.includes(getQuestionVolume(question))).map((question) => question.id);
  } else ids = challenge.questionIds ?? [];

  const unique = new Set(ids);
  return ALL_QUESTIONS.filter((question) => unique.has(question.id) && (!volume || getQuestionVolume(question) === volume));
}

export function filterChallenges(filters = {}, attempts = [], favorites = []) {
  const { volume = "", category = "", difficulty = "" } = filters;
  return CHALLENGES.filter((challenge) => {
    if (category && challenge.category !== category) return false;
    if (difficulty && challenge.difficulty !== difficulty) return false;
    // With a volume selected, only show challenges that can actually
    // launch at least one question from that volume.
    return !volume || getChallengeQuestions(challenge.id, attempts, favorites, volume).length > 0;
  });
}
