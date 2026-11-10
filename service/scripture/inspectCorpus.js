#!/usr/bin/env node
/** Read-only offline audit; never exposes scripture text or modifies the file. */
import { openScriptureCorpus, DEFAULT_CORPUS_PATH } from './corpus.js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { normalizePassageText, partitionScopedPassages } from './scopeDuplicates.js';
import { assessPassageText } from './corpus.js';
import { findNearDuplicatePassages } from './nearDuplicates.js';

function parseArgs(argv) {
  const args = { path: process.env.SCRIPTURE_SQLITE_PATH || DEFAULT_CORPUS_PATH,
    allowPartial: false, nearDuplicates: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--path' && argv[i + 1]) args.path = argv[++i];
    else if (argv[i] === '--allow-partial') args.allowPartial = true;
    else if (argv[i] === '--near-duplicates') args.nearDuplicates = true;
    else throw new Error('Usage: node service/scripture/inspectCorpus.js [--path file.sqlite] [--allow-partial] [--near-duplicates]');
  }
  return args;
}

export function summarizeCorpus(corpus, { nearDuplicates = false } = {}) {
  const metadata = corpus.metadata;
  const all = corpus.listPassages();
  const flags = { short: 0, long: 0, 'possible-html': 0, 'text-artifact': 0 };
  let reviewed = 0;
  const groups = new Map();
  for (const verse of all) {
    // Report flags, don't change or suppress any source text.
    const reasons = assessPassageText(verse.text);
    for (const reason of reasons) flags[reason]++;
    const norm = normalizePassageText(verse.text);
    const group = groups.get(norm) ?? [];
    group.push(verse);
    groups.set(norm, group);
    reviewed++;
  }

  let exactGroups = 0, repeatedRows = 0, crossVolumeGroups = 0;
  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    exactGroups++;
    repeatedRows += group.length;
    if (new Set(group.map((row) => row.volume)).size > 1) crossVolumeGroups++;
  }

  // Report separately per test scope: a cross-volume repeat can be perfectly
  // valid in Book of Mormon-only play. The numbers are not global exclusions.
  const allScope = partitionScopedPassages(all);
  const volumeScopes = Object.fromEntries(['ot', 'nt', 'bom', 'dc', 'pgp']
    .map((volume) => {
      const { eligible, ambiguous, repeatedSameAnswer } = partitionScopedPassages(all,
        { volume, testedStages: ['book', 'chapter'] });
      return [volume, { eligible: eligible.length, ambiguous: ambiguous.length,
        repeatedSameAnswer: repeatedSameAnswer.length }];
    }));
  return {
    formatVersion: metadata.format_version,
    language: metadata.language,
    fingerprint: metadata.fingerprint,
    partial: metadata.partial,
    pages: metadata.pages,
    verses: metadata.verses,
    declarationParagraphs: metadata.declarationParagraphs,
    byVolume: metadata.counts,
    qualityReviewFlags: flags,
    exactRepeatedText: { groups: exactGroups, rowsInGroups: repeatedRows,
      groupsAcrossVolumes: crossVolumeGroups },
    ...(nearDuplicates ? { nearDuplicateReview: findNearDuplicatePassages(all) } : {}),
    ambiguityByScope: {
      allVolumes: { eligible: allScope.eligible.length, ambiguous: allScope.ambiguous.length,
        repeatedSameAnswer: allScope.repeatedSameAnswer.length },
      oneVolume: volumeScopes,
    },
    reviewedRows: reviewed,
    notes: [
      'Repeats are evaluated within the selected play scope and tested answer stages.',
      'Quality flags are review signals, not corrections or global scripture exclusions.',
      'Near-identical non-exact wording still requires additional review before broad mixed play.',
      'Publisher provenance is not confirmation of redistribution rights.',
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let corpus;
  try {
    const config = parseArgs(process.argv.slice(2));
    corpus = await openScriptureCorpus(config);
    console.log(JSON.stringify(summarizeCorpus(corpus, { nearDuplicates: config.nearDuplicates }), null, 2));
  } catch (error) {
    console.error(`Scripture corpus audit failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    corpus?.close();
  }
}
