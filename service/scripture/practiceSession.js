/**
 * Server-owned, short-lived Locate pitches backed by the immutable SQLite corpus.
 * No permanent question ID or answer key is sent to the browser. A random pitch
 * token identifies an in-memory game interaction, not a scripture reference.
 *
 * This deliberately does not write attempts to MongoDB yet: DB-09 will connect
 * completed, server-graded pitches to authenticated and guest progress.
 */
import { randomBytes, randomInt } from 'node:crypto';

export class PracticeError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'PracticeError';
    this.status = status;
  }
}

const STAGES = new Set(['book', 'chapter', 'verse']);
const DEFAULT_TTL_MS = 30 * 60_000;
const DEFAULT_MAX_PITCHES = 1500;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/u;

function error(status, message) {
  throw new PracticeError(status, message);
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function positiveInteger(value, name) {
  const parsed = typeof value === 'number' ? value
    : (typeof value === 'string' && /^[1-9]\d{0,3}$/u.test(value) ? Number(value) : NaN);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 9999) {
    error(400, `${name} must be a positive whole number (1–9999)`);
  }
  return parsed;
}

function shuffle(items, random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Build a separate opaque ID for each pitch; never use a canonical reference as a token. */
const generateToken = () => randomBytes(32).toString('base64url');

export function createPracticeSessionEngine({
  corpus,
  now = Date.now,
  random = randomInt,
  tokenGenerator = generateToken,
  ttlMs = DEFAULT_TTL_MS,
  maxPitches = DEFAULT_MAX_PITCHES,
} = {}) {
  if (!corpus || typeof corpus.getCatalog !== 'function' ||
      typeof corpus.getScopedPool !== 'function' || typeof corpus.listPassages !== 'function') {
    throw new TypeError('A validated, open scripture corpus is required');
  }
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 ||
      !Number.isSafeInteger(maxPitches) || maxPitches < 1) {
    throw new RangeError('Invalid pitch expiration or capacity');
  }
  const catalog = corpus.getCatalog();
  const volumeById = new Map(catalog.volumes.map((volume) => [volume.id, volume]));
  const bookById = new Map(catalog.volumes.flatMap((volume) => volume.books.map((book) =>
    [book.id, { ...book, volume: volume.id }])));
  const booksWithVerses = new Set(corpus.listPassages().map((row) => row.book));
  const sessions = new Map();
  const pools = new Map();

  function pruneExpired() {
    const time = now();
    for (const [id, state] of sessions) {
      if (state.expiresAt <= time) sessions.delete(id);
    }
  }

  function checkedScope(input) {
    if (!object(input) || Object.keys(input).some((key) => !['volume', 'book'].includes(key))) {
      error(400, 'scope must contain only optional volume and book identifiers');
    }
    const { volume = null, book = null } = input;
    if (volume !== null && !volumeById.has(volume)) error(400, 'Unknown scripture volume');
    if (book !== null && (!volume || bookById.get(book)?.volume !== volume ||
        !booksWithVerses.has(book))) {
      error(400, 'Unknown scripture book for this volume');
    }
    return { volume, book };
  }

  function checkedOptions(options) {
    if (!object(options) || Object.keys(options).some((key) => !['scope', 'exactVerse'].includes(key))) {
      error(400, 'Only scope and exactVerse options are supported');
    }
    if (options.exactVerse !== undefined && typeof options.exactVerse !== 'boolean') {
      error(400, 'exactVerse must be a boolean');
    }
    return { scope: checkedScope(options.scope ?? {}), exactVerse: options.exactVerse === true };
  }

  function booksForScope(scope) {
    if (scope.book) return [bookById.get(scope.book)];
    return [...bookById.values()].filter((book) =>
      booksWithVerses.has(book.id) && (!scope.volume || book.volume === scope.volume));
  }

  function getPool(scope, exactVerse, hasBookStage) {
    const stages = [ ...(hasBookStage ? ['book'] : []), 'chapter', ...(exactVerse ? ['verse'] : []) ];
    const key = JSON.stringify([scope.volume, scope.book, stages]);
    if (pools.has(key)) return pools.get(key);
    const result = corpus.getScopedPool({ ...scope, testedStages: stages });
    // Limit cached pools (particularly one-book filters) on long-running servers.
    if (pools.size >= 12) pools.delete(pools.keys().next().value);
    pools.set(key, result);
    return result;
  }

  function requirePitch(token) {
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
      error(404, 'Pitch not found');
    }
    const record = sessions.get(token);
    if (!record) error(404, 'Pitch not found');
    if (record.expiresAt <= now()) {
      sessions.delete(token);
      error(410, 'Pitch expired; start a new pitch');
    }
    return record;
  }

  function publiclyVisible(record) {
    return {
      pitchId: record.pitchId,
      passage: record.passage,
      scope: { ...record.scope },
      exactVerse: record.exactVerse,
      stage: record.stage,
      choices: record.choices.map((choice) => ({ ...choice })),
      expiresAt: new Date(record.expiresAt).toISOString(),
      ...(record.replies.book ? { bookFeedback: { ...record.replies.book } } : {}),
      ...(record.replies.chapter ? { chapterFeedback: { ...record.replies.chapter } } : {}),
      ...(record.replies.verse ? { verseFeedback: { ...record.replies.verse } } : {}),
    };
  }

  function reveal(record) {
    const { volume, book, chapter, verse } = record.answer;
    const name = bookById.get(book)?.name ?? book;
    return {
      reference: `${volume}:${book}:${chapter}:${verse}`,
      correctReference: `${name} ${chapter}:${verse}`,
      correctBookId: book,
      correctChapter: chapter,
      correctVerse: verse,
      answers: {
        ...(record.guesses.book !== undefined
          ? { bookId: record.guesses.book, bookCorrect: record.guesses.book === book } : {}),
        chapter: record.guesses.chapter,
        chapterCorrect: record.guesses.chapter === chapter,
        ...(record.guesses.verse !== undefined
          ? { verse: record.guesses.verse, verseCorrect: record.guesses.verse === verse } : {}),
      },
    };
  }

  function submittedGuess(body) {
    if (!object(body) || !STAGES.has(body.stage)) error(400, 'Invalid answer stage');
    const { stage } = body;
    const field = stage === 'book' ? 'bookId' : stage;
    if (Object.keys(body).some((key) => key !== 'stage' && key !== field)) {
      error(400, 'Answer must contain only the current stage and its guess');
    }
    return { stage, guess: stage === 'book'
      ? (typeof body.bookId === 'string' ? body.bookId : error(400, 'Invalid bookId'))
      : positiveInteger(body[field], field) };
  }

  return {
    getCatalog() {
      return { language: catalog.language, volumes: catalog.volumes.map((volume) => ({
        id: volume.id, name: volume.name,
        books: volume.books.filter((book) => booksWithVerses.has(book.id)).map((book) => ({ ...book })),
      })) };
    },

    createPitch(options = {}) {
      const { scope, exactVerse } = checkedOptions(options);
      const availableBooks = booksForScope(scope);
      const hasBookStage = !scope.book && availableBooks.length > 1;
      const pool = getPool(scope, exactVerse, hasBookStage);
      if (!pool.eligible.length) error(422, 'No unambiguous playable verses in this scripture scope');
      pruneExpired();
      if (sessions.size >= maxPitches) error(429, 'Too many active pitches; try again later');

      const answer = pool.eligible[random(pool.eligible.length)];
      const distractors = availableBooks.filter((book) => book.id !== answer.book);
      const choices = hasBookStage
        ? shuffle([bookById.get(answer.book), ...shuffle(distractors, random).slice(0, 3)], random)
          .map(({ id, name }) => ({ id, label: name }))
        : [];
      const pitchId = tokenGenerator();
      if (!TOKEN_PATTERN.test(pitchId) || sessions.has(pitchId)) {
        throw new Error('Unable to issue a unique practice token');
      }
      const record = {
        pitchId, scope, exactVerse, answer, passage: answer.text, choices,
        stage: hasBookStage ? 'book' : 'chapter',
        guesses: {}, replies: {}, submissions: {}, expiresAt: now() + ttlMs,
      };
      sessions.set(pitchId, record);
      return publiclyVisible(record);
    },

    getPitch(token) {
      return publiclyVisible(requirePitch(token));
    },

    submitAnswer(token, body) {
      const record = requirePitch(token);
      const { stage, guess } = submittedGuess(body);
      if (record.submissions[stage]) {
        if (record.submissions[stage].guess !== guess) {
          error(409, 'This stage has already been answered differently');
        }
        return structuredClone(record.replies[stage]);
      }
      if (record.stage !== stage) error(409, `Expected ${record.stage} stage`);
      if (stage === 'book' && !record.choices.some((choice) => choice.id === guess)) {
        error(400, 'bookId must be one of the offered choices');
      }
      record.guesses[stage] = guess;
      let reply;
      if (stage === 'book') {
        record.stage = 'chapter';
        reply = { stage, bookId: guess, bookCorrect: guess === record.answer.book,
          correctBookId: record.answer.book,
          correctBookLabel: bookById.get(record.answer.book).name, nextStage: record.stage };
      } else if (stage === 'chapter') {
        record.stage = record.exactVerse ? 'verse' : 'complete';
        reply = { stage, chapter: guess, chapterCorrect: guess === record.answer.chapter,
          correctChapter: record.answer.chapter, nextStage: record.stage,
          ...(record.stage === 'complete' ? reveal(record) : {}) };
      } else {
        record.stage = 'complete';
        reply = { stage, verse: guess, verseCorrect: guess === record.answer.verse,
          correctVerse: record.answer.verse, nextStage: record.stage, ...reveal(record) };
      }
      record.submissions[stage] = { guess };
      record.replies[stage] = reply;
      return structuredClone(reply);
    },

    /** Server-only hook for DB-09 account persistence; never route directly to clients. */
    getCompletedAttempt(token) {
      const record = requirePitch(token);
      if (record.stage !== 'complete') error(409, 'Pitch is not complete');
      const { volume, book, chapter, verse, reference } = record.answer;
      return {
        reference, volume, book, chapter, verse,
        scope: { ...record.scope }, exactVerse: record.exactVerse,
        ...(record.guesses.book !== undefined
          ? { chosenBook: record.guesses.book, bookCorrect: record.guesses.book === book } : {}),
        chosenChapter: record.guesses.chapter,
        chapterCorrect: record.guesses.chapter === chapter,
        ...(record.guesses.verse !== undefined
          ? { chosenVerse: record.guesses.verse, verseCorrect: record.guesses.verse === verse } : {}),
      };
    },
    get activePitches() { return sessions.size; },
  };
}
