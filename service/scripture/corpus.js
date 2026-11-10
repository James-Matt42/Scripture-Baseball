/**
 * Read-only access to the validated English Standard Works SQLite artifact.
 *
 * This is a server-only repository, not a browser API. In particular, returning
 * a canonical reference from here is safe only if the calling route does not
 * reveal it until the answer is due (DB-08 will own that game contract).
 *
 * Requires Node.js >=22.13 for the unflagged built-in node:sqlite module.
 * It is imported lazily so the existing Service-phase routes still work on
 * older Node versions until SQLite-backed gameplay replaces them.
 */
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { partitionScopedPassages, normalizePassageText } from './scopeDuplicates.js';

export const DEFAULT_CORPUS_PATH = fileURLToPath(new URL('../private/scriptures-eng.sqlite', import.meta.url));
export const CORPUS_FORMAT_VERSION = 'scripture-sqlite-v1';
const registry = JSON.parse(readFileSync(new URL('./canon-eng.json', import.meta.url), 'utf8'));

export class ScriptureCorpusError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ScriptureCorpusError';
  }
}

function requireCondition(condition, message) {
  if (!condition) throw new ScriptureCorpusError(message);
}

function positiveInteger(number, name) {
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return number;
}

function filterScope({ volume = null, book = null } = {}) {
  if (volume !== null && (typeof volume !== 'string' || !volume)) {
    throw new TypeError('volume must be a nonempty identifier');
  }
  if (book !== null && (typeof book !== 'string' || !book)) {
    throw new TypeError('book must be a nonempty identifier');
  }
  if (book !== null && volume === null) {
    throw new TypeError('Book-specific queries require a volume');
  }
  return { volume, book };
}

function unpackJson(json, fallback = null) {
  return json == null ? fallback : JSON.parse(json);
}

function pageFromRow(row, verses = null) {
  if (!row) return null;
  return {
    id: row.id, type: row.kind, volume: row.volume, book: row.book,
    chapter: row.chapter, sourcePath: row.path, title: row.title,
    heading: row.heading, summary: row.summary,
    preface: unpackJson(row.preface_json, []),
    dates: unpackJson(row.dates_json, []),
    footnotes: unpackJson(row.footnotes_json, []),
    content: unpackJson(row.content_json, null),
    ...(verses === null ? {} : { verses }),
  };
}

function verifyReadOnlyArtifact(db, allowPartial) {
  requireCondition(db.prepare('PRAGMA quick_check').get()?.quick_check === 'ok',
    'Scripture database failed SQLite integrity checks');
  requireCondition(db.prepare('PRAGMA foreign_key_check').all().length === 0,
    'Scripture database has invalid foreign keys');

  const meta = Object.fromEntries(db.prepare('SELECT key, value FROM metadata').all()
    .map(({ key, value }) => [key, value]));
  requireCondition(meta.format_version === CORPUS_FORMAT_VERSION && meta.language === 'eng',
    'Scripture database format/language is incompatible');
  requireCondition(meta.source === registry.source && /^[a-f0-9]{64}$/.test(meta.fingerprint ?? ''),
    'Scripture database provenance is invalid');
  requireCondition(meta.partial === '0' || (allowPartial && meta.partial === '1'),
    'Partial scripture database cannot be used for production play');

  const isPartial = meta.partial === '1';
  let recordedCounts;
  try { recordedCounts = JSON.parse(meta.counts); } catch { /* fail below */ }
  requireCondition(recordedCounts && typeof recordedCounts === 'object',
    'Scripture database coverage report is missing');

  const volumes = db.prepare('SELECT id, name, sort_order FROM volumes ORDER BY sort_order').all();
  requireCondition(volumes.length === registry.volumes.length, 'Incorrect scripture volume count');
  const storedBooks = db.prepare('SELECT volume, slug, name, sort_order, chapter_count FROM books ORDER BY volume, sort_order').all();
  let expectedBookCount = 0;
  const chapters = db.prepare("SELECT volume, book, chapter, kind FROM pages WHERE kind <> 'content'").all();
  const chaptersByBook = new Map();
  for (const page of chapters) {
    const key = `${page.volume}:${page.book}`;
    const numbers = chaptersByBook.get(key) ?? new Set();
    numbers.add(page.chapter);
    chaptersByBook.set(key, numbers);
  }

  let pageTotal = 0;
  let verseTotal = 0;
  let paragraphTotal = 0;
  const volumeStatistics = {};
  const countPages = db.prepare('SELECT kind, COUNT(*) AS total FROM pages WHERE volume = ? GROUP BY kind');
  const countVerses = db.prepare(`SELECT COUNT(*) AS total FROM verses v
    JOIN pages p ON p.id = v.page_id WHERE p.volume = ?`);
  const listDeclarations = db.prepare("SELECT content_json FROM pages WHERE volume = ? AND kind = 'declaration'");

  for (const [volumeIndex, expectedVolume] of registry.volumes.entries()) {
    const storedVolume = volumes[volumeIndex];
    requireCondition(storedVolume.id === expectedVolume.id &&
      storedVolume.name === expectedVolume.name && storedVolume.sort_order === volumeIndex + 1,
    `Incorrect volume registry: ${expectedVolume.id}`);
    for (const [bookIndex, book] of expectedVolume.books.entries()) {
      const stored = storedBooks.find((row) => row.volume === expectedVolume.id && row.slug === book.id);
      requireCondition(stored && stored.name === book.name && stored.sort_order === bookIndex + 1 &&
        stored.chapter_count === book.chapters, `Incorrect book registry: ${expectedVolume.id}:${book.id}`);
      const found = chaptersByBook.get(`${expectedVolume.id}:${book.id}`) ?? new Set();
      requireCondition(found.size <= book.chapters && [...found].every((n) => n >= 1 && n <= book.chapters),
        `Invalid chapter coverage for ${expectedVolume.id}:${book.id}`);
      if (!isPartial) {
        requireCondition(found.size === book.chapters,
          `Missing chapters for ${expectedVolume.id}:${book.id}`);
      }
      expectedBookCount++;
    }
    const pageGroups = Object.fromEntries(countPages.all(expectedVolume.id)
      .map(({ kind, total }) => [kind, total]));
    const chapterCount = (pageGroups.chapter ?? 0) + (pageGroups.declaration ?? 0);
    const contentCount = pageGroups.content ?? 0;
    const verses = countVerses.get(expectedVolume.id).total;
    const paragraphs = listDeclarations.all(expectedVolume.id)
      .reduce((total, row) => total + unpackJson(row.content_json, []).length, 0);
    const actual = { chaptersAndDeclarations: chapterCount, verses,
      paragraphs, contentPages: contentCount };
    requireCondition(recordedCounts[expectedVolume.id] && Object.entries(actual).every(
      ([name, count]) => recordedCounts[expectedVolume.id][name] === count),
      `Recorded counts do not match SQLite content for ${expectedVolume.id}`);
    if (!isPartial) {
      requireCondition(verses === expectedVolume.expectedVerses &&
        contentCount === expectedVolume.expectedContentPages,
        `English scripture coverage differs from the verified registry: ${expectedVolume.id}`);
    }
    volumeStatistics[expectedVolume.id] = actual;
    pageTotal += chapterCount + contentCount;
    verseTotal += verses;
    paragraphTotal += paragraphs;
  }
  requireCondition(storedBooks.length === expectedBookCount, 'Unexpected books in the scripture database');
  requireCondition(pageTotal === Number(meta.pages) && verseTotal === Number(meta.verses) &&
    paragraphTotal === Number(meta.declaration_paragraphs),
    'Overall scripture counts do not match the import metadata');

  // Report malformed source-derived structured fields before a client tries to
  // load a scripture page. These checks do not rewrite source annotations.
  const invalidJson = db.prepare(`SELECT id FROM pages WHERE
    (kind = 'chapter' AND (preface_json IS NULL OR json_valid(preface_json) <> 1
       OR json_type(preface_json) <> 'array' OR dates_json IS NULL OR json_valid(dates_json) <> 1
       OR json_type(dates_json) <> 'array' OR footnotes_json IS NULL
       OR json_valid(footnotes_json) <> 1 OR json_type(footnotes_json) <> 'array'))
    OR (kind <> 'chapter' AND (content_json IS NULL OR json_valid(content_json) <> 1
      OR json_type(content_json) <> 'array'))
    LIMIT 1`).get();
  requireCondition(!invalidJson, 'Scripture chapter or document metadata contains invalid JSON');
  requireCondition(!db.prepare(`SELECT p.id FROM pages p LEFT JOIN verses v ON p.id = v.page_id
    WHERE p.kind = 'chapter' GROUP BY p.id HAVING COUNT(v.n) = 0 LIMIT 1`).get(),
    'An ordinary scripture chapter contains no verses');
  requireCondition(!db.prepare(`SELECT page_id FROM verses GROUP BY page_id
    HAVING MIN(n) <> 1 OR MAX(n) <> COUNT(*) LIMIT 1`).get(),
    'A scripture chapter has a missing or out-of-order verse');
  requireCondition(!db.prepare(`SELECT v.page_id FROM verses v JOIN pages p ON p.id = v.page_id
    WHERE p.kind <> 'chapter' LIMIT 1`).get(),
    'A non-verse scripture document contains numbered verses');
  requireCondition(!db.prepare(`SELECT page_id FROM verses
    WHERE footnote_refs_json IS NOT NULL AND (json_valid(footnote_refs_json) <> 1
      OR json_type(footnote_refs_json) <> 'array') LIMIT 1`).get(),
    'A scripture verse has malformed footnote references');

  return { ...meta, counts: volumeStatistics, pages: pageTotal, verses: verseTotal,
    declarationParagraphs: paragraphTotal, partial: isPartial };
}

function qualityFlags(text, { minWords = 8, maxWords = 110 } = {}) {
  if (typeof text !== 'string' || !Number.isSafeInteger(minWords) || minWords < 1 ||
      !Number.isSafeInteger(maxWords) || maxWords < minWords) {
    throw new TypeError('Provide scripture text and valid minimum/maximum word counts');
  }
  const wordCount = normalizePassageText(text).split(' ').filter(Boolean).length;
  const flags = [];
  if (wordCount < minWords) flags.push('short');
  if (wordCount > maxWords) flags.push('long');
  if (/<\/?[a-z][^>]*>/i.test(text)) flags.push('possible-html');
  if (text.includes('\ufffd') || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) {
    flags.push('text-artifact');
  }
  return flags;
}

export { qualityFlags as assessPassageText };

class ScriptureCorpus {
  #db;
  #metadata;
  #poolCache = new Map();

  constructor(db, metadata) {
    this.#db = db;
    this.#metadata = metadata;
  }

  get metadata() {
    this.#assertOpen();
    return structuredClone(this.#metadata);
  }

  #assertOpen() {
    if (!this.#db) throw new ScriptureCorpusError('Scripture corpus is closed');
  }

  close() {
    if (this.#db) {
      this.#db.close();
      this.#db = null;
      this.#poolCache.clear();
    }
  }

  getCatalog() {
    this.#assertOpen();
    const volumes = this.#db.prepare('SELECT id, name FROM volumes ORDER BY sort_order').all();
    const books = this.#db.prepare(`SELECT volume, slug AS id, name, chapter_count AS chapters
      FROM books ORDER BY volume, sort_order`).all();
    return {
      language: this.#metadata.language,
      source: this.#metadata.source,
      fingerprint: this.#metadata.fingerprint,
      volumes: volumes.map(({ id, name }) => ({ id, name,
        books: books.filter((book) => book.volume === id)
          .map(({ id: bookId, name: bookName, chapters }) => ({ id: bookId, name: bookName, chapters })) })),
    };
  }

  getPage({ volume, book, chapter }) {
    this.#assertOpen();
    filterScope({ volume, book });
    if (typeof volume !== 'string' || typeof book !== 'string') {
      throw new TypeError('A chapter requires volume and book identifiers');
    }
    positiveInteger(chapter, 'chapter');
    const row = this.#db.prepare(`SELECT * FROM pages
      WHERE volume = ? AND book = ? AND chapter = ?`).get(volume, book, chapter);
    if (!row) return null;
    const verses = row.kind === 'chapter'
      ? this.#db.prepare('SELECT n, text, footnote_refs_json FROM verses WHERE page_id = ? ORDER BY n')
        .all(row.id).map(({ n, text, footnote_refs_json }) => ({ number: n, text,
          footnoteRefs: unpackJson(footnote_refs_json, []) }))
      : null;
    return pageFromRow(row, verses);
  }

  getDocument(id) {
    this.#assertOpen();
    if (typeof id !== 'string' || !id) throw new TypeError('Document ID must be a nonempty string');
    const row = this.#db.prepare(`SELECT * FROM pages
      WHERE id = ? AND kind IN ('content', 'declaration')`).get(id);
    return pageFromRow(row);
  }

  getVerse({ volume, book, chapter, verse }) {
    this.#assertOpen();
    filterScope({ volume, book });
    if (typeof volume !== 'string' || typeof book !== 'string') {
      throw new TypeError('A chapter requires volume and book identifiers');
    }
    positiveInteger(chapter, 'chapter');
    positiveInteger(verse, 'verse');
    const row = this.#db.prepare(`SELECT v.n, v.text, v.footnote_refs_json FROM verses v
      JOIN pages p ON p.id = v.page_id
      WHERE p.volume = ? AND p.book = ? AND p.chapter = ? AND p.kind = 'chapter'
        AND v.n = ?`).get(volume, book, chapter, verse);
    return row ? { reference: `${volume}:${book}:${chapter}:${verse}`, volume, book,
      chapter, verse, text: row.text, footnoteRefs: unpackJson(row.footnote_refs_json, []) } : null;
  }

  /** All verse text stays server-side. Filters are bound parameters, never SQL fragments. */
  listPassages(options = {}) {
    this.#assertOpen();
    const { volume, book } = filterScope(options);
    const conditions = ["p.kind = 'chapter'"];
    const params = [];
    if (volume) { conditions.push('p.volume = ?'); params.push(volume); }
    if (book) { conditions.push('p.book = ?'); params.push(book); }
    const sql = `SELECT p.volume, p.book, p.chapter, v.n AS verse, v.text
      FROM pages p JOIN verses v ON v.page_id = p.id
      WHERE ${conditions.join(' AND ')} ORDER BY p.volume, p.book, p.chapter, v.n`;
    return this.#db.prepare(sql).all(...params).map(({ volume: v, book: b, chapter, verse, text }) => ({
      reference: `${v}:${b}:${chapter}:${verse}`, volume: v, book: b,
      chapter, verse, text,
    }));
  }

  /**
   * Filter for basic text quality, then test exact duplication ONLY within the
   * actual question scope and graded stages. These are *candidates*, not a
   * permanent blacklist; future contextual multi-verse prompts may use every
   * source verse. Near-duplicate text is reported/reviewed separately.
   */
  getScopedPool({ volume = null, book = null, testedStages = book ? ['chapter'] : ['book', 'chapter'],
    minWords = 8, maxWords = 110 } = {}) {
    this.#assertOpen();
    // Candidate windows are immutable for the life of a read-only corpus file.
    // Cache a handful of common scopes so subsequent quiz requests do not
    // normalize and regroup the entire Standard Works on every pitch.
    const key = JSON.stringify([volume, book, testedStages, minWords, maxWords]);
    const cached = this.#poolCache.get(key);
    if (cached) {
      this.#poolCache.delete(key);
      this.#poolCache.set(key, cached);
      return structuredClone(cached);
    }
    const source = this.listPassages({ volume, book });
    const qualityExcluded = [];
    const usable = [];
    for (const candidate of source) {
      const flags = qualityFlags(candidate.text, { minWords, maxWords });
      if (flags.length) qualityExcluded.push({ ...candidate, flags });
      else usable.push(candidate);
    }
    const { eligible, ambiguous, repeatedSameAnswer } = partitionScopedPassages(usable,
      { volume, book, testedStages });
    const result = { eligible, ambiguous, repeatedSameAnswer, qualityExcluded,
      totals: { scanned: source.length, eligible: eligible.length,
        ambiguous: ambiguous.length, repeatedSameAnswer: repeatedSameAnswer.length,
        qualityExcluded: qualityExcluded.length } };
    if (this.#poolCache.size >= 12) this.#poolCache.delete(this.#poolCache.keys().next().value);
    this.#poolCache.set(key, structuredClone(result));
    return result;
  }
}

export async function openScriptureCorpus({
  path = process.env.SCRIPTURE_SQLITE_PATH || DEFAULT_CORPUS_PATH,
  allowPartial = false,
} = {}) {
  let db;
  try {
    // Node 22.13+ ships SQLite without an npm/native addon. Importing it only
    // when actually opening a corpus leaves prior service tests unaffected.
    const { DatabaseSync } = await import('node:sqlite');
    db = new DatabaseSync(path, { readOnly: true });
    db.exec('PRAGMA query_only = ON');
    const metadata = verifyReadOnlyArtifact(db, allowPartial);
    return new ScriptureCorpus(db, metadata);
  } catch (error) {
    try { db?.close(); } catch { /* retain original error */ }
    if (error instanceof ScriptureCorpusError) throw error;
    if (error?.code === 'ERR_UNKNOWN_BUILTIN_MODULE' || error?.code === 'ERR_MODULE_NOT_FOUND') {
      throw new ScriptureCorpusError('Reading the scripture corpus requires Node.js 22.13 or newer');
    }
    throw new ScriptureCorpusError('Cannot open or validate the private scripture SQLite database');
  }
}
