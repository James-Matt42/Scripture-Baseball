import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, statSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const builder = fileURLToPath(new URL('./build_corpus.py', import.meta.url));
const publisher = 'https://www.churchofjesuschrist.org';
const fixtureVerse = (number, text) => ({ number, text, footnote_refs: [], footnotes: [] });
const fixtureChapter = (volume, book, number, verseText) => ({
  path: `/study/scriptures/${volume}/${book}/${number}`,
  url: `${publisher}/study/scriptures/${volume}/${book}/${number}?lang=eng`,
  title: `Book ${book}`,
  type: 'chapter',
  book: { slug: book },
  chapter: { number: String(number), heading: `Chapter ${number}`,
    preface: [{ type: 'heading', text: 'Introduction', links: [] }],
    summary: 'A real chapter summary.',
    dates: [{ text: 'About 500 B.C.', start_year: -500, end_year: -500 }],
    verses: [fixtureVerse(1, verseText)],
    footnotes: [{ id: 'fn1', verse: 1, content: [{ type: 'text', text: 'note' }] }],
  },
});
const volumes = {
  ot: [fixtureChapter('ot', 'isa', 53, 'A shared line.')],
  nt: [fixtureChapter('nt', 'matt', 5, 'A New Testament verse.')],
  bom: [fixtureChapter('bofm', '2-ne', 9, 'A shared line.'), {
    path: '/study/scriptures/bofm/introduction', url: `${publisher}/study/scriptures/bofm/introduction?lang=eng`,
    title: 'Introduction', type: 'content', content: [{ type: 'paragraph', text: 'Background information', links: [] }],
  }],
  dc: [fixtureChapter('dc-testament', 'dc', 1, 'A Doctrine and Covenants verse.'), {
    ...fixtureChapter('dc-testament', 'od', 1, 'A declaration paragraph.'),
    chapter: { number: 1, heading: 'Official Declaration 1', preface: [], summary: '', dates: [], footnotes: [],
      verses: [{ number: 9983123, text: 'To Whom It May Concern:', footnote_refs: [], footnotes: [] },
        { number: 9983124, text: 'Declaration text.', footnote_refs: [], footnotes: [] }],
    },
  }],
  pgp: [fixtureChapter('pgp', 'moses', 1, 'A Pearl of Great Price verse.')],
};

function createFixtures(directory) {
  for (const [volume, pages] of Object.entries(volumes)) {
    writeFileSync(join(directory, `${volume}.json`), JSON.stringify({
      schema_version: 1, language: 'eng', source: publisher, volume,
      pages, parse_errors: [],
    }));
  }
}

function runBuilder(args, env = {}) {
  return spawnSync('python3', [builder, ...args], {
    cwd: dirname(builder), encoding: 'utf8', timeout: 15000,
    env: { ...process.env, SCRIPTURE_JSON_SOURCE: '', ...env },
  });
}

function query(dbPath, sql) {
  const python = `import sqlite3,sys,json\ndb=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro&immutable=1',uri=True)\nprint(json.dumps(db.execute(sys.argv[2]).fetchall(),ensure_ascii=False))`;
  const res = spawnSync('python3', ['-c', python, dbPath, sql], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  return JSON.parse(res.stdout);
}

function sandbox(t) {
  const directory = mkdtempSync(join(tmpdir(), 'scriptures-db06-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const source = join(directory, 'eng');
  // This fixture's directory is just temporary private JSON.
  mkdirSync(source);
  createFixtures(source);
  return { directory, source, output: join(directory, 'scriptures-eng.sqlite') };
}

test('builds indexed SQLite chapters, content pages and declaration paragraphs', (t) => {
  const { source, output } = sandbox(t);
  const result = runBuilder(['--source', source, '--output', output, '--allow-partial']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Built .*5 verses, 7 pages; 2 declaration paragraphs/);
  assert.equal(existsSync(output), true);
  assert.equal(statSync(output).mode & 0o777, 0o600);
  assert.deepEqual(query(output, 'select count(*) from volumes'), [[5]]);
  assert.deepEqual(query(output, 'select count(*) from books'), [[88]]);
  assert.deepEqual(query(output, 'select count(*) from verses'), [[5]]); // 5 chapter fixtures; OD paragraphs excluded
  assert.deepEqual(query(output, "select text from verses where page_id='bom:2-ne:9' and n=1"), [['A shared line.']]);
  assert.deepEqual(query(output, "select kind from pages where id='dc:od:1'"), [['declaration']]);
  assert.deepEqual(query(output, "select count(*) from verses where page_id='dc:od:1'"), [[0]]);
  assert.deepEqual(query(output, "select json_extract(content_json,'$[0].sourceNumber') from pages where id='dc:od:1'"), [[9983123]]);
  assert.deepEqual(query(output, "select json_extract(content_json,'$[0].text') from pages where id like 'bom:content:%'"), [['Background information']]);
  assert.deepEqual(query(output, "select value from metadata where key='partial'"), [['1']]);
  assert.deepEqual(query(output, 'pragma quick_check'), [['ok']]);
});

test('identical JSON inputs skip rebuilding, changed input triggers atomic rebuild', (t) => {
  const { source, output } = sandbox(t);
  const build = () => runBuilder(['--source', source, '--output', output, '--allow-partial']);
  assert.equal(build().status, 0);
  const first = statSync(output);
  const firstContents = readFileSync(output);
  const again = build();
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /Unchanged scripture JSON/);
  assert.equal(statSync(output).mtimeMs, first.mtimeMs);
  assert.deepEqual(readFileSync(output), firstContents);

  const path = join(source, 'bom.json');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  data.pages[0].chapter.verses[0].text = 'The source verse changed.';
  writeFileSync(path, JSON.stringify(data));
  const changed = build();
  assert.equal(changed.status, 0, changed.stderr);
  assert.match(changed.stdout, /Built/);
  assert.deepEqual(query(output, "select text from verses where page_id='bom:2-ne:9' and n=1"), [['The source verse changed.']]);

  data.pages[0].chapter.verses.push(fixtureVerse(1, 'Duplicate verse index.'));
  writeFileSync(path, JSON.stringify(data));
  const bad = build();
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /duplicate, or out-of-order verse/i);
  // The previously valid output must still be intact after a failed rebuild.
  assert.deepEqual(query(output, "select text from verses where page_id='bom:2-ne:9' and n=1"), [['The source verse changed.']]);
});

test('a strict production build rejects truncated input', (t) => {
  const { source, output } = sandbox(t);
  const result = runBuilder(['--source', source, '--output', output]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /coverage mismatch/i);
  assert.equal(existsSync(output), false);
});

test('an optional frontend prebuild skips when private source is absent', (t) => {
  const { directory } = sandbox(t);
  const result = runBuilder(['--if-present', '--output', join(directory, 'no-source.sqlite')]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /skipping optional corpus build/i);
});

test('can read only English files from a mixed-language archive', (t) => {
  const { source, directory } = sandbox(t);
  const archive = join(directory, 'full.zip');
  const python = [
    'import zipfile,sys,os',
    'with zipfile.ZipFile(sys.argv[2], "w") as z:',
    '  for file in os.listdir(sys.argv[1]):',
    '    z.write(os.path.join(sys.argv[1],file), "scriptures_data/json/eng/"+file)',
    '  z.writestr("scriptures_data/json/fra/bom.json", "not valid JSON")',
  ].join('\n');
  const zipped = spawnSync('python3', ['-c', python, source, archive], { encoding: 'utf8' });
  assert.equal(zipped.status, 0, zipped.stderr);
  const output = join(directory, 'from-zip.sqlite');
  const result = runBuilder(['--source', archive, '--output', output, '--allow-partial']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(query(output, 'select count(*) from volumes'), [[5]]);
});
