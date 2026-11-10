/**
 * Advisory near-duplicate finder for offline corpus review.
 *
 * Uses uncommon three-word shingles as an inverted index to avoid comparing
 * every verse against every other verse. Results are NOT an eligibility list:
 * near matches must be evaluated relative to the questions' scope and stage.
 * This is heuristic (not exhaustive, not semantic similarity) and deliberately
 * does not change, merge, or delete any scripture text.
 */
import { normalizePassageText } from './scopeDuplicates.js';

function fingerprint(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shingles(text) {
  const words = normalizePassageText(text).split(' ').filter(Boolean);
  const hashes = new Set();
  for (let i = 0; i + 2 < words.length; i++) {
    hashes.add(fingerprint(`${words[i]} ${words[i + 1]} ${words[i + 2]}`));
  }
  return { words: words.length, normalized: words.join(' '), grams: hashes };
}

function jaccard(a, b) {
  let common = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const gram of small) if (large.has(gram)) common++;
  return common / (a.size + b.size - common);
}

export function findNearDuplicatePassages(passages, {
  minWords = 12,
  minSimilarity = 0.78,
  maxExamples = 15,
} = {}) {
  if (!Array.isArray(passages) || !Number.isInteger(maxExamples) || maxExamples < 0 ||
      !Number.isInteger(minWords) || minWords < 3 ||
      typeof minSimilarity !== 'number' || minSimilarity < 0 || minSimilarity > 1) {
    throw new TypeError('Invalid near-duplicate review settings');
  }
  const entries = passages.map((passage) => ({ passage, ...shingles(passage.text) }))
    .filter((entry) => entry.words >= minWords);
  const frequencies = new Map();
  for (const { grams } of entries) {
    for (const gram of grams) frequencies.set(gram, (frequencies.get(gram) ?? 0) + 1);
  }
  const index = new Map();
  const examples = [];
  let candidateComparisons = 0;
  let matchCount = 0;

  for (const [position, entry] of entries.entries()) {
    // Use up to six rare anchors that aren't so common they would cause a
    // massive candidate group (such as 'and it came to pass').
    const anchors = [...entry.grams].filter((gram) => frequencies.get(gram) <= 30)
      .sort((a, b) => frequencies.get(a) - frequencies.get(b) || a - b).slice(0, 6);
    const neighbors = new Set();
    for (const anchor of anchors) {
      for (const previous of index.get(anchor) ?? []) neighbors.add(previous);
    }
    for (const previous of neighbors) {
      const other = entries[previous];
      const [a, b] = entry.words < other.words ? [entry.words, other.words] : [other.words, entry.words];
      if (a / b < 0.85 || entry.normalized === other.normalized) continue;
      candidateComparisons++;
      const similarity = jaccard(entry.grams, other.grams);
      if (similarity < minSimilarity) continue;
      matchCount++;
      if (examples.length < maxExamples) {
        examples.push({ a: other.passage.reference, b: entry.passage.reference,
          similarity: Math.round(similarity * 1000) / 1000,
          crossesVolume: other.passage.volume !== entry.passage.volume });
      }
    }
    for (const anchor of anchors) {
      const bucket = index.get(anchor) ?? [];
      bucket.push(position);
      index.set(anchor, bucket);
    }
  }
  return { flaggedPairs: matchCount, candidateComparisons, examples,
    caveat: 'Heuristic word-shingle matches for manual review; never a global exclusion list.' };
}
