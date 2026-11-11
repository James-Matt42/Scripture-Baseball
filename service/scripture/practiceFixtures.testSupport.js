import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openScriptureCorpus } from './corpus.js';

const publisher = 'https://www.churchofjesuschrist.org';
export const sharedVerse = 'And the Lord said unto them all, be courageous and faithful in all things which ye do.';
export const otherVerse = 'There was a great joy among the people because they chose to listen carefully to the words.';

function chapter(volume, book, n, texts) {
  return {
    type: 'chapter', path: `/study/scriptures/${volume}/${book}/${n}`,
    title: `Chapter ${n}`, book: { slug: book },
    chapter: { number: String(n), heading: `Chapter ${n}`, summary: '',
      preface: [], dates: [], footnotes: [],
      verses: texts.map((text, index) => ({ number: index + 1, text, footnote_refs: [] })) },
  };
}

/** Tests use only short synthetic excerpts; they never publish the private source corpus. */
export async function fixtureCorpus(t) {
  const root = mkdtempSync(join(tmpdir(), 'scripture-db08-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'eng');
  mkdirSync(source);
  const data = {
    ot: [chapter('ot', 'isa', 53, [sharedVerse])],
    nt: [chapter('nt', 'matt', 5, ['Blessed are they who listen to the teachings and return to their families in peace.'])],
    bom: [chapter('bofm', '2-ne', 9, [sharedVerse]),
      chapter('bofm', 'alma', 1, [otherVerse, otherVerse,
        'The people of the land learned to strengthen one another through their own faithful service.'])],
    dc: [chapter('dc-testament', 'dc', 1, ['And in this dispensation the work shall move forward through faith and patient service.']),
      { ...chapter('dc-testament', 'od', 1, []), chapter: {
        number: 1, heading: 'Official Declaration 1', summary: '', preface: [], dates: [],
        footnotes: [], verses: [{ number: 1032101, text: 'This declaration must not be served as a numbered verse.' }],
      } }],
    pgp: [chapter('pgp', 'moses', 1, ['And the work of the Lord proceeded throughout the years as the people learned to trust.'])],
  };
  for (const [volume, pages] of Object.entries(data)) {
    writeFileSync(join(source, `${volume}.json`), JSON.stringify({
      language: 'eng', volume, schema_version: 1, source: publisher, parse_errors: [], pages,
    }));
  }
  const path = join(root, 'scriptures-eng.sqlite');
  const result = spawnSync('python3', [new URL('./build_corpus.py', import.meta.url).pathname,
    '--source', source, '--output', path, '--allow-partial'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  const corpus = await openScriptureCorpus({ path, allowPartial: true });
  t.after(() => corpus.close());
  return corpus;
}
