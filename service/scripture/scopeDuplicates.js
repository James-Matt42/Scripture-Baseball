/**
 * A repeated passage is only ambiguous relative to the answers tested and the
 * current content scope. Do NOT blacklist repeated scripture globally: the
 * same wording in Isaiah and 2 Nephi is playable in Book of Mormon-only play.
 *
 * The caller must provide the full candidate pool for the chosen scope. This
 * checks normalized identical wording (case, punctuation, whitespace); softer
 * near-matches can be reviewed separately in DB-07/08 without modifying text.
 */
export function normalizePassageText(text) {
  if (typeof text !== 'string') return '';
  return text.normalize('NFKC').toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/gu, ' ');
}

function answerKey(row, stages) {
  const values = {
    volume: row.volume,
    book: `${row.volume}:${row.book}`,
    chapter: row.chapter,
    verse: row.verse,
  };
  return JSON.stringify(stages.map((stage) => values[stage]));
}

export function partitionScopedPassages(candidates, {
  volume = null,
  book = null,
  testedStages = ['book', 'chapter'],
} = {}) {
  if (!Array.isArray(candidates) || !Array.isArray(testedStages) ||
      testedStages.length === 0 ||
      testedStages.some((stage) => !['volume', 'book', 'chapter', 'verse'].includes(stage))) {
    throw new TypeError('Provide candidates and valid graded stages');
  }
  if (book != null && volume == null) {
    throw new TypeError('A book-specific scope must specify its volume');
  }
  const groups = new Map();
  for (const candidate of candidates) {
    if (volume != null && candidate.volume !== volume) continue;
    if (book != null && candidate.book !== book) continue;
    const normalized = normalizePassageText(candidate.text);
    if (!normalized) continue;
    const group = groups.get(normalized) ?? [];
    group.push(candidate);
    groups.set(normalized, group);
  }

  const eligible = [];
  const ambiguous = [];
  const repeatedSameAnswer = [];
  for (const group of groups.values()) {
    const differentAnswers = new Set(group.map((row) => answerKey(row, testedStages)));
    if (differentAnswers.size > 1) {
      ambiguous.push(...group);
    } else {
      eligible.push(group[0]);
      repeatedSameAnswer.push(...group.slice(1));
    }
  }
  return { eligible, ambiguous, repeatedSameAnswer };
}
