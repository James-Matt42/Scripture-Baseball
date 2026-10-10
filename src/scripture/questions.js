// Local starter questions. Replace or expand this collection when the
// scripture data service is introduced in a later assignment.
export const SCRIPTURE_BOOKS = [
  { id: "1-nephi", label: "1 Nephi", volume: "book-of-mormon" },
  { id: "2-nephi", label: "2 Nephi", volume: "book-of-mormon" },
  { id: "mosiah", label: "Mosiah", volume: "book-of-mormon" },
  { id: "alma", label: "Alma", volume: "book-of-mormon" },
  { id: "helaman", label: "Helaman", volume: "book-of-mormon" },
  { id: "ether", label: "Ether", volume: "book-of-mormon" },
];

export const SAMPLE_QUESTIONS = [
  {
    id: "2-nephi-2-25",
    passage: "Adam fell that men might be; and men are, that they might have joy.",
    bookId: "2-nephi",
    chapter: 2,
    verse: 25,
    choices: ["1-nephi", "2-nephi", "alma", "mosiah"],
  },
  {
    id: "mosiah-2-17",
    passage: "...when ye are in the service of your fellow beings ye are only in the service of your God.",
    bookId: "mosiah",
    chapter: 2,
    verse: 17,
    choices: ["mosiah", "alma", "helaman", "2-nephi"],
  },
  {
    id: "alma-32-21",
    passage: "...if ye have faith ye hope for things which are not seen, which are true.",
    bookId: "alma",
    chapter: 32,
    verse: 21,
    choices: ["alma", "ether", "mosiah", "2-nephi"],
  },
  {
    id: "1-nephi-3-7",
    passage: "I will go and do the things which the Lord hath commanded...",
    bookId: "1-nephi",
    chapter: 3,
    verse: 7,
    choices: ["1-nephi", "helaman", "2-nephi", "mosiah"],
  },
  {
    id: "helaman-5-12",
    passage: "...it is upon the rock of our Redeemer, who is Christ, the Son of God, that ye must build your foundation...",
    bookId: "helaman",
    chapter: 5,
    verse: 12,
    choices: ["ether", "helaman", "alma", "1-nephi"],
  },
  {
    id: "ether-12-27",
    passage: "...if men come unto me I will show unto them their weakness. I give unto men weakness that they may be humble...",
    bookId: "ether",
    chapter: 12,
    verse: 27,
    choices: ["2-nephi", "ether", "mosiah", "helaman"],
  },
];

export function getBookLabel(bookId) {
  return SCRIPTURE_BOOKS.find((book) => book.id === bookId)?.label ?? bookId;
}

export function formatScriptureReference(question) {
  return `${getBookLabel(question.bookId)} ${question.chapter}:${question.verse}`;
}

// Book and chapter are graded independently; a wrong book does not make a
// correct chapter count as wrong.
export function gradeBookAndChapter(question, bookId, chapter) {
  const chapterNumber = Number(chapter);

  return {
    questionId: question.id,
    bookId,
    chapter: chapterNumber,
    bookCorrect: bookId === question.bookId,
    chapterCorrect: Number.isInteger(chapterNumber) && chapterNumber === question.chapter,
  };
}

// Exact-verse practice is optional. Preserve the independently graded book
// and chapter results and add a third, separately scored answer.
export function gradeExactVerse(question, bookAndChapterAttempt, verse) {
  const verseNumber = Number(verse);

  return {
    ...bookAndChapterAttempt,
    verse: verseNumber,
    verseCorrect: Number.isInteger(verseNumber) && verseNumber === question.verse,
  };
}
