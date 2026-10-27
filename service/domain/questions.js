// Local starter questions. Replace or expand this collection when the
// scripture data service is introduced in a later assignment.
export const SCRIPTURE_BOOKS = [
  { id: "1-nephi", label: "1 Nephi", volume: "book-of-mormon" },
  { id: "2-nephi", label: "2 Nephi", volume: "book-of-mormon" },
  { id: "mosiah", label: "Mosiah", volume: "book-of-mormon" },
  { id: "alma", label: "Alma", volume: "book-of-mormon" },
  { id: "helaman", label: "Helaman", volume: "book-of-mormon" },
  { id: "ether", label: "Ether", volume: "book-of-mormon" },
  { id: "3-nephi", label: "3 Nephi", volume: "book-of-mormon" },
  { id: "genesis", label: "Genesis", volume: "old-testament" },
  { id: "isaiah", label: "Isaiah", volume: "old-testament" },
  { id: "psalms", label: "Psalms", volume: "old-testament" },
  { id: "matthew", label: "Matthew", volume: "new-testament" },
  { id: "mark", label: "Mark", volume: "new-testament" },
  { id: "luke", label: "Luke", volume: "new-testament" },
  { id: "john", label: "John", volume: "new-testament" },
  { id: "dc", label: "Doctrine and Covenants", volume: "doctrine-and-covenants" },
  { id: "moses", label: "Moses", volume: "pearl-of-great-price" },
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

// A small, local question bank for challenge practice. These are starter
// excerpts, not a complete scriptures database. The first six questions are
// kept separate so existing starter innings and saved guesses still load.
export const EXTRA_QUESTIONS = [
  { id: "alma-37-6", passage: "...by small and simple things are great things brought to pass...", bookId: "alma", chapter: 37, verse: 6, choices: ["alma", "mosiah", "helaman", "ether"] },
  { id: "3-nephi-18-15", passage: "...ye must watch and pray always, lest ye enter into temptation...", bookId: "3-nephi", chapter: 18, verse: 15, choices: ["3-nephi", "1-nephi", "2-nephi", "alma"] },
  { id: "genesis-1-1", passage: "In the beginning God created the heaven and the earth.", bookId: "genesis", chapter: 1, verse: 1, choices: ["genesis", "isaiah", "psalms", "moses"] },
  { id: "isaiah-1-18", passage: "Come now, and let us reason together, saith the LORD: though your sins be as scarlet, they shall be as white as snow...", bookId: "isaiah", chapter: 1, verse: 18, choices: ["isaiah", "genesis", "psalms", "moses"] },
  { id: "isaiah-40-31", passage: "...they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles...", bookId: "isaiah", chapter: 40, verse: 31, choices: ["isaiah", "psalms", "genesis", "moses"] },
  { id: "matthew-5-14", passage: "Ye are the light of the world. A city that is set on an hill cannot be hid.", bookId: "matthew", chapter: 5, verse: 14, choices: ["matthew", "mark", "luke", "john"] },
  { id: "mark-10-27", passage: "With men it is impossible, but not with God: for with God all things are possible.", bookId: "mark", chapter: 10, verse: 27, choices: ["matthew", "mark", "luke", "john"] },
  { id: "luke-2-10", passage: "Fear not: for, behold, I bring you good tidings of great joy, which shall be to all people.", bookId: "luke", chapter: 2, verse: 10, choices: ["matthew", "mark", "luke", "john"] },
  { id: "john-14-6", passage: "I am the way, the truth, and the life: no man cometh unto the Father, but by me.", bookId: "john", chapter: 14, verse: 6, choices: ["matthew", "mark", "luke", "john"] },
  { id: "john-3-16", passage: "For God so loved the world, that he gave his only begotten Son...", bookId: "john", chapter: 3, verse: 16, choices: ["matthew", "mark", "luke", "john"] },
  { id: "matthew-6-6", passage: "...when thou prayest, enter into thy closet, and when thou hast shut thy door, pray to thy Father...", bookId: "matthew", chapter: 6, verse: 6, choices: ["matthew", "mark", "luke", "john"] },
  { id: "dc-18-10", passage: "Remember the worth of souls is great in the sight of God;", bookId: "dc", chapter: 18, verse: 10, choices: ["dc", "moses", "2-nephi", "alma"] },
  { id: "dc-6-36", passage: "Look unto me in every thought; doubt not, fear not.", bookId: "dc", chapter: 6, verse: 36, choices: ["dc", "moses", "alma", "ether"] },
  { id: "moses-1-39", passage: "For behold, this is my work and my glory—to bring to pass the immortality and eternal life of man.", bookId: "moses", chapter: 1, verse: 39, choices: ["moses", "dc", "genesis", "isaiah"] },
];

export const ALL_QUESTIONS = [...SAMPLE_QUESTIONS, ...EXTRA_QUESTIONS];
const questionById = new Map(ALL_QUESTIONS.map((question) => [question.id, question]));
const volumeByBook = new Map(SCRIPTURE_BOOKS.map((book) => [book.id, book.volume]));

export function getQuestionById(id) {
  return questionById.get(id) ?? null;
}

export function getQuestionVolume(question) {
  return volumeByBook.get(question.bookId) ?? "";
}

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
