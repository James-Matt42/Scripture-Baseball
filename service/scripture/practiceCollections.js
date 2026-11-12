/** Collections are selection rules over the same verified scripture corpus. */
export const PRACTICE_COLLECTIONS = Object.freeze([
  { id: 'all', title: 'Mixed practice', description: 'Playable passages from the selected books and volumes.' },
  { id: 'misses', title: 'My misses', description: 'Revisit passages with a previously incorrect answer.' },
  { id: 'favorites', title: 'My favorites', description: 'Practice passages you have saved after answering.' },
  { id: 'weak-areas', title: 'Weak areas', description: 'Focus on books where you have missed book or chapter questions.' },
]);
const COLLECTION_IDS = new Set(PRACTICE_COLLECTIONS.map(({ id }) => id));
const REFERENCE = /^[a-z]+:[a-z0-9-]+:[1-9]\d{0,3}:[1-9]\d{0,3}$/u;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateCollection(value, fail) {
  const id = value === undefined ? 'all' : value;
  if (!COLLECTION_IDS.has(id)) fail(400, 'Unknown scripture collection');
  return id;
}

/** This data can prioritize a guest's questions, but never proves correctness. */
export function validateGuestSelection(value, fail) {
  if (value === undefined) return { attempts: [], favorites: [] };
  if (!isObject(value) || Object.keys(value).some((k) => !['attempts', 'favorites'].includes(k))) {
    fail(400, 'Invalid guest selection');
  }
  const attempts = value.attempts ?? [];
  const favorites = value.favorites ?? [];
  if (!Array.isArray(attempts) || attempts.length > 500 || !Array.isArray(favorites) || favorites.length > 100 ||
      favorites.some((ref) => typeof ref !== 'string' || !REFERENCE.test(ref))) {
    fail(400, 'Invalid guest selection');
  }
  for (const attempt of attempts) {
    if (!isObject(attempt) || Object.keys(attempt).some((key) =>
      !['reference', 'chapterCorrect', 'bookCorrect', 'verseCorrect'].includes(key)) ||
        typeof attempt.reference !== 'string' || !REFERENCE.test(attempt.reference) ||
        typeof attempt.chapterCorrect !== 'boolean' ||
        (attempt.bookCorrect !== undefined && typeof attempt.bookCorrect !== 'boolean') ||
        (attempt.verseCorrect !== undefined && typeof attempt.verseCorrect !== 'boolean')) {
      fail(400, 'Invalid guest selection');
    }
  }
  return { attempts, favorites };
}

function referenceBook(reference) {
  if (typeof reference !== 'string' || !REFERENCE.test(reference)) return null;
  const [volume, book] = reference.split(':');
  return `${volume}:${book}`;
}

/** Select only from the already quality- and scope-checked pool. No global text exclusions. */
export function collectionCandidates(eligible, collection, { attempts = [], favorites = [] } = {}) {
  if (collection === 'all') return eligible;
  if (collection === 'favorites') {
    const saved = new Set(favorites);
    return eligible.filter((row) => saved.has(row.reference));
  }
  if (collection === 'misses') {
    const missed = new Set(attempts.filter((item) => item.bookCorrect === false ||
      item.chapterCorrect === false || item.verseCorrect === false).map((item) => item.reference));
    return eligible.filter((row) => missed.has(row.reference));
  }
  if (collection === 'weak-areas') {
    const byBook = new Map();
    for (const item of attempts) {
      const book = referenceBook(item.reference);
      if (!book || typeof item.chapterCorrect !== 'boolean') continue;
      const tally = byBook.get(book) ?? { attempts: 0, misses: 0 };
      tally.attempts++;
      if (item.chapterCorrect === false || item.bookCorrect === false) tally.misses++;
      byBook.set(book, tally);
    }
    const weakest = [...byBook.entries()]
      .filter(([, count]) => count.misses > 0)
      .sort((a, b) => (b[1].misses / b[1].attempts) - (a[1].misses / a[1].attempts) ||
        b[1].misses - a[1].misses || a[0].localeCompare(b[0]))
      .slice(0, 3).map(([book]) => book);
    const books = new Set(weakest);
    return eligible.filter((row) => books.has(`${row.volume}:${row.book}`));
  }
  throw new TypeError('Unknown practice collection');
}
