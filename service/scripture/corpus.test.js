import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { openScriptureCorpus, ScriptureCorpusError, assessPassageText } from './corpus.js';
import { summarizeCorpus } from './inspectCorpus.js';
import { findNearDuplicatePassages } from './nearDuplicates.js';

const builder = new URL('./build_corpus.py', import.meta.url).pathname;
const inspector = new URL('./inspectCorpus.js', import.meta.url).pathname;
const publisher = 'https://www.churchofjesuschrist.org';
const shared = 'And he said unto them, take courage and go forth with patience and faith in God.';

function chapter(volume, book, n, lines) {
  return {
    path: `/study/scriptures/${volume}/${book}/${n}`,
    title: `${book} ${n}`,
    type: 'chapter',
    book: { slug: book },
    chapter: {
      number: String(n), heading: `Chapter ${n}`, summary: 'A chapter heading.',
      preface: [], dates: [{ text: 'About 500 B.C.', start_year: -500, end_year: -500 }],
      footnotes: [{ id: 'a', content: [{ type: 'text', text: 'A footnote' }] }],
      verses: lines.map((text, i) => ({ number: i + 1, text,
        footnote_refs: i ? [] : [{ id: 'a', offset: 0 }] })),
    },
  };
}

function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), 'scriptures-db07-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = join(directory, 'eng');
  mkdirSync(source);
  const data = {
    ot: [chapter('ot', 'isa', 53, [shared])],
    nt: [chapter('nt', 'matt', 5, ['These are the words of the New Testament chapter, spoken to those who listen.'])],
    bom: [chapter('bofm', '2-ne', 9, [shared]),
      chapter('bofm', 'alma', 1, ['A distinct scripture phrase that has enough words to be used in a quiz.']),
      { type: 'content', path: '/study/scriptures/bofm/introduction', title: 'Introduction',
        content: [{ type: 'paragraph', text: 'Background for the Book of Mormon.' }] }],
    dc: [chapter('dc-testament', 'dc', 1, ['Receive the word of the Lord in your heart and act in faith.']),
      { ...chapter('dc-testament', 'od', 1, ['sample']), chapter: {
        number: 1, heading: 'Official Declaration 1', summary: '', preface: [], dates: [],
        footnotes: [], verses: [{ number: 991231, text: 'An introduction to the declaration.' },
          { number: 991232, text: 'The declaration is recorded as prose, not verses.' }],
      } }],
    pgp: [chapter('pgp', 'moses', 1, ['This portion of the Pearl of Great Price is available to learners.'])],
  };
  for (const [volume, pages] of Object.entries(data)) {
    writeFileSync(join(source, `${volume}.json`), JSON.stringify({
      language: 'eng', volume, schema_version: 1, source: publisher,
      parse_errors: [], pages,
    }));
  }
  const output = join(directory, 'scriptures.sqlite');
  const result = spawnSync('python3', [builder, '--source', source, '--output', output, '--allow-partial'],
    { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  return { directory, source, output };
}

test('read-only corpus exposes canonical catalog, verse, chapter, and separately stored documents', async (t) => {
  const { output } = setup(t);
  const sizeBefore = statSync(output).size;
  const corpus = await openScriptureCorpus({ path: output, allowPartial: true });
  t.after(() => corpus.close());
  const catalog = corpus.getCatalog();
  assert.equal(catalog.volumes.length, 5);
  assert.equal(catalog.volumes.reduce((n, volume) => n + volume.books.length, 0), 88);
  assert.equal(catalog.volumes.find((volume) => volume.id === 'bom').books
    .find((book) => book.id === '2-ne').name, '2 Nephi');
  assert.equal(catalog.language, 'eng');
  assert.equal(catalog.fingerprint.length, 64);
  const verse = corpus.getVerse({ volume: 'bom', book: '2-ne', chapter: 9, verse: 1 });
  assert.equal(verse.reference, 'bom:2-ne:9:1');
  assert.equal(verse.text, shared);
  assert.deepEqual(verse.footnoteRefs, [{ id: 'a', offset: 0 }]);
  assert.equal(corpus.getVerse({ volume: 'bom', book: '2-ne', chapter: 9, verse: 4 }), null);
  const page = corpus.getPage({ volume: 'bom', book: '2-ne', chapter: 9 });
  assert.equal(page.type, 'chapter');
  assert.equal(page.verses[0].text, shared);
  assert.equal(page.dates[0].text, 'About 500 B.C.');
  assert.equal(page.footnotes[0].id, 'a');
  assert.equal(page.summary, 'A chapter heading.');
  assert.equal(corpus.getPage({ volume: 'bom', book: '2-ne', chapter: 10 }), null);
  const intro = corpus.getDocument('bom:content:/study/scriptures/bofm/introduction');
  assert.equal(intro.type, 'content');
  assert.equal(intro.content[0].text, 'Background for the Book of Mormon.');
  const declaration = corpus.getPage({ volume: 'dc', book: 'od', chapter: 1 });
  assert.equal(declaration.type, 'declaration');
  assert.equal(declaration.content.length, 2);
  assert.equal('verses' in declaration, false);
  assert.equal(corpus.getVerse({ volume: 'dc', book: 'od', chapter: 1, verse: 1 }), null);
  assert.equal(statSync(output).size, sizeBefore);
  assert.equal(corpus.metadata.partial, true);
  corpus.close();
  assert.throws(() => corpus.getCatalog(), ScriptureCorpusError);
  corpus.close(); // closing twice is safe
});

test('scope-aware repeated verses remain playable when competing answers are out of scope', async (t) => {
  const { output } = setup(t);
  const corpus = await openScriptureCorpus({ path: output, allowPartial: true });
  t.after(() => corpus.close());
  assert.equal(corpus.listPassages().length, 6);
  assert.equal(corpus.listPassages({ volume: 'bom' }).length, 2);
  assert.equal(corpus.listPassages({ volume: 'bom', book: '2-ne' }).length, 1);
  const all = corpus.getScopedPool({ minWords: 4 });
  assert.equal(all.ambiguous.length, 2);
  const bom = corpus.getScopedPool({ volume: 'bom', minWords: 4 });
  assert.equal(bom.ambiguous.length, 0);
  bom.eligible[0].text = 'Do not write back into the corpus or cache';
  assert.equal(corpus.getScopedPool({ volume: 'bom', minWords: 4 }).eligible[0].text, shared);
  assert.equal(bom.eligible.length, 2);
  const book = corpus.getScopedPool({ volume: 'bom', book: '2-ne', minWords: 4 });
  assert.equal(book.totals.eligible, 1);
  assert.equal(corpus.listPassages({ volume: "bom' OR 1=1 --" }).length, 0);
});

test('invalid scripture reference and question scopes fail with actionable errors', async (t) => {
  const { output } = setup(t);
  const corpus = await openScriptureCorpus({ path: output, allowPartial: true });
  t.after(() => corpus.close());
  assert.throws(() => corpus.getVerse({ volume: 'ot', book: 'isa', chapter: 0, verse: 1 }), /chapter/);
  assert.throws(() => corpus.getVerse({ volume: 'ot', book: 'isa', chapter: 53, verse: 1.5 }), /verse/);
  assert.throws(() => corpus.getPage({ book: 'isa', chapter: 53 }), /volume/);
  assert.throws(() => corpus.listPassages({ book: 'isa' }), /volume/);
  assert.throws(() => corpus.getScopedPool({ minWords: 5, maxWords: 3 }), /word counts/);
  assert.throws(() => corpus.getScopedPool({ testedStages: ['pitchId'] }), /valid graded stages/);
});

test('partial or missing databases are refused by default', async (t) => {
  const { output, directory } = setup(t);
  await assert.rejects(openScriptureCorpus({ path: output }), /Partial scripture database/);
  await assert.rejects(openScriptureCorpus({ path: join(directory, 'does-not-exist.sqlite') }),
    /Cannot open or validate/);
});

test('tampered metadata, empty coverage, and malformed chapter annotations are rejected', async (t) => {
  const { output } = setup(t);
  const { DatabaseSync } = await import('node:sqlite');
  const write = (sql) => {
    const db = new DatabaseSync(output);
    try { db.exec(sql); } finally { db.close(); }
  };
  write("UPDATE metadata SET value = '9999' WHERE key = 'verses'");
  await assert.rejects(openScriptureCorpus({ path: output, allowPartial: true }), /counts do not match/);
  write("UPDATE metadata SET value = '6' WHERE key = 'verses'");
  write("UPDATE pages SET dates_json = 'not json' WHERE id = 'bom:2-ne:9'");
  await assert.rejects(openScriptureCorpus({ path: output, allowPartial: true }), /invalid JSON/);
  write("UPDATE pages SET dates_json = '[]' WHERE id = 'bom:2-ne:9'");
  write("UPDATE verses SET footnote_refs_json = 'bad' WHERE page_id = 'bom:2-ne:9'");
  await assert.rejects(openScriptureCorpus({ path: output, allowPartial: true }), /malformed footnote/);
  write("UPDATE verses SET footnote_refs_json = '[]' WHERE page_id = 'bom:2-ne:9'");
  write("DELETE FROM verses WHERE page_id = 'bom:alma:1'");
  await assert.rejects(openScriptureCorpus({ path: output, allowPartial: true }), /counts do not match|no verses/);
});

test('offline inspection reports coverage and scoped duplicate counts without altering data', async (t) => {
  const { output } = setup(t);
  const contents = readFileSync(output);
  const res = spawnSync('node', [inspector, '--path', output, '--allow-partial', '--near-duplicates'],
    { encoding: 'utf8', timeout: 30000 });
  assert.equal(res.status, 0, res.stderr);
  const report = JSON.parse(res.stdout);
  assert.equal(report.verses, 6);
  assert.equal(report.byVolume.bom.verses, 2);
  assert.equal(report.exactRepeatedText.groupsAcrossVolumes, 1);
  assert.equal(report.ambiguityByScope.oneVolume.bom.ambiguous, 0);
  assert.equal(report.ambiguityByScope.allVolumes.ambiguous, 2);
  assert.equal(report.nearDuplicateReview.flaggedPairs, 0);
  assert.deepEqual(readFileSync(output), contents);
});

test('text quality warnings and near duplicates are advisory, never global exclusions', () => {
  assert.deepEqual(assessPassageText('Too short'), ['short']);
  assert.deepEqual(assessPassageText('One two three four five six seven eight nine'), []);
  assert.deepEqual(assessPassageText('This has <em>HTML</em> markup and enough words to flag a rendering problem.'),
    ['possible-html']);
  assert.deepEqual(assessPassageText('One two three four five six seven eight \ufffd'), ['text-artifact']);
  const similar = [
    { reference: 'ot:isa:1:2', volume: 'ot', text: 'The Lord spake unto them and he did say unto all the people to be courageous in the day of trials.' },
    { reference: 'bom:2-ne:2:3', volume: 'bom', text: 'The Lord spake unto them and he did say unto all the people to be courageous in the day of trial.' },
    { reference: 'pgp:moses:1:4', volume: 'pgp', text: 'A completely distinct quotation about traveling over mountains and rivers.' },
  ];
  const findings = findNearDuplicatePassages(similar, { minWords: 10, minSimilarity: 0.7 });
  assert.equal(findings.flaggedPairs, 1);
  assert.equal(findings.examples[0].crossesVolume, true);
  assert.ok(findings.examples[0].similarity >= 0.7);
  assert.equal(similar.length, 3); // nothing is removed
});
