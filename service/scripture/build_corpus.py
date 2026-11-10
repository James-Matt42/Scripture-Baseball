#!/usr/bin/env python3
"""Build a private, read-only English scripture SQLite file from the supplied JSON.

Supports either scriptures_json.zip (without unpacking other languages), an
'extracted .../json' directory, or its 'eng' subdirectory. No third-party
Python modules are required. The source and generated DB are never web assets.

Examples:
  SCRIPTURE_JSON_SOURCE=/private/scriptures_json.zip npm run scriptures:build
  python3 service/scripture/build_corpus.py --source /private/json/eng \
      --output /private/scriptures-eng.sqlite

A source-content + build-rule fingerprint prevents redundant rebuilds. Changes
are built in a temporary file and atomically replace the prior validated DB.
"""

import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
from urllib.parse import quote
import zipfile

ROOT = Path(__file__).resolve().parents[2]
REGISTRY_PATH = Path(__file__).with_name('canon-eng.json')
VOLUMES = ('ot', 'nt', 'bom', 'dc', 'pgp')
FORMAT_VERSION = 'scripture-sqlite-v1'
DEFAULT_OUTPUT = ROOT / 'service' / 'private' / 'scriptures-eng.sqlite'
DEFAULT_SOURCES = (
    ROOT / 'content' / 'local' / 'scriptures_json.zip',
    ROOT / 'content' / 'local' / 'standard-works' / 'eng',
)


class CorpusError(ValueError):
    """The supplied corpus is not valid for the English scripture registry."""


def fail(message):
    raise CorpusError(message)


def canonical_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), sort_keys=True)


def source_files(source):
    """Return the five English source payloads; don't extract any other languages."""
    source = Path(source)
    result = {}
    if source.is_file() and zipfile.is_zipfile(source):
        with zipfile.ZipFile(source) as archive:
            for volume in VOLUMES:
                suffix = f'/eng/{volume}.json'
                matches = [name for name in archive.namelist()
                           if name.endswith(suffix) and not name.startswith('/')]
                if len(matches) != 1:
                    fail(f'Expected exactly one English {volume}.json in archive')
                result[volume] = archive.read(matches[0])
    elif source.is_dir():
        locations = (source, source / 'eng', source / 'scriptures_data' / 'json' / 'eng')
        candidates = [directory for directory in locations
                      if all((directory / f'{v}.json').is_file() for v in VOLUMES)]
        if len(candidates) != 1:
            fail('Expected an English folder with ot, nt, bom, dc, and pgp JSON files')
        result = {volume: (candidates[0] / f'{volume}.json').read_bytes()
                  for volume in VOLUMES}
    else:
        fail('Scripture source must be a JSON directory or scriptures_json.zip archive')
    return result


def fingerprint(files, registry_bytes):
    # Changing validation/build logic or the registry also invalidates the DB.
    builder_bytes = Path(__file__).read_bytes()
    digest = hashlib.sha256()
    digest.update(FORMAT_VERSION.encode())
    digest.update(hashlib.sha256(builder_bytes).digest())
    digest.update(hashlib.sha256(registry_bytes).digest())
    per_file_hashes = {}
    for volume in VOLUMES:
        file_hash = hashlib.sha256(files[volume]).hexdigest()
        per_file_hashes[f'{volume}.json'] = file_hash
        digest.update(volume.encode())
        digest.update(bytes.fromhex(file_hash))
    return digest.hexdigest(), per_file_hashes


def read_metadata(db_path):
    """Read and integrity-check a completed SQLite artifact without writing it."""
    if not db_path.is_file():
        return None
    uri = f"file:{quote(str(db_path.resolve()), safe='/')}?mode=ro&immutable=1"
    try:
        with closing(sqlite3.connect(uri, uri=True)) as db:
            if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                return None
            return dict(db.execute('SELECT key, value FROM metadata'))
    except (sqlite3.DatabaseError, OSError):
        return None


SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;
CREATE TABLE volumes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL UNIQUE
) WITHOUT ROWID;
CREATE TABLE books (
  volume TEXT NOT NULL REFERENCES volumes(id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  chapter_count INTEGER NOT NULL CHECK (chapter_count > 0),
  PRIMARY KEY (volume, slug),
  UNIQUE (volume, sort_order)
) WITHOUT ROWID;
CREATE TABLE pages (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('chapter', 'declaration', 'content')),
  volume TEXT NOT NULL REFERENCES volumes(id),
  book TEXT,
  chapter INTEGER,
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  heading TEXT,
  summary TEXT,
  preface_json TEXT,
  dates_json TEXT,
  footnotes_json TEXT,
  content_json TEXT,
  FOREIGN KEY (volume, book) REFERENCES books(volume, slug),
  CHECK (
    (kind = 'content' AND book IS NULL AND chapter IS NULL) OR
    (kind IN ('chapter', 'declaration') AND book IS NOT NULL AND chapter > 0)
  )
) WITHOUT ROWID;
CREATE UNIQUE INDEX idx_pages_book_chapter ON pages(volume, book, chapter)
  WHERE book IS NOT NULL;
CREATE INDEX idx_pages_kind_volume ON pages(kind, volume);
CREATE TABLE verses (
  page_id TEXT NOT NULL REFERENCES pages(id),
  n INTEGER NOT NULL CHECK (n > 0),
  text TEXT NOT NULL CHECK (length(trim(text)) > 0),
  footnote_refs_json TEXT,
  PRIMARY KEY (page_id, n)
) WITHOUT ROWID;
"""


def positive_number(raw, what):
    if isinstance(raw, bool):
        fail(f'{what} must be a positive integer')
    try:
        number = int(raw)
    except (ValueError, TypeError):
        fail(f'{what} must be a positive integer')
    if number < 1 or str(raw).strip() != str(number):
        fail(f'{what} must be a positive integer')
    return number


def populate(db, files, registry, expected_fingerprint, hashes, allow_partial=False):
    db.executescript(SCHEMA)
    book_registry = {}
    for vol_pos, volume in enumerate(registry['volumes'], 1):
        volume_id = volume['id']
        if volume_id not in VOLUMES or volume_id in book_registry:
            fail(f'Invalid volume in registry: {volume_id}')
        db.execute('INSERT INTO volumes VALUES (?, ?, ?)',
                   (volume_id, volume['name'], vol_pos))
        books = {}
        for book_pos, book in enumerate(volume['books'], 1):
            slug = book['id']
            if slug in books:
                fail(f'Duplicate book in registry: {volume_id}:{slug}')
            books[slug] = book
            db.execute('INSERT INTO books VALUES (?, ?, ?, ?, ?)',
                       (volume_id, slug, book['name'], book_pos, book['chapters']))
        book_registry[volume_id] = books
    if set(book_registry) != set(VOLUMES):
        fail('Registry must define the five English Standard Works')

    total_pages = total_verses = total_paragraphs = 0
    result_by_volume = {}
    source_domains = set()
    for volume in VOLUMES:
        try:
            data = json.loads(files[volume])
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            fail(f'Invalid JSON for {volume}: {error}')
        if (not isinstance(data, dict) or data.get('language') != registry['language'] or
                data.get('volume') != volume or data.get('schema_version') != 1 or
                data.get('parse_errors') != [] or not isinstance(data.get('pages'), list)):
            fail(f'Unexpected language, volume, schema, parse errors, or pages in {volume}')
        source_domains.add(data.get('source'))
        found_chapters = set()
        verse_count = content_count = paragraph_count = 0
        for page in data['pages']:
            if not isinstance(page, dict) or page.get('type') not in ('chapter', 'content'):
                fail(f'Unknown page type in {volume}')
            path = page.get('path')
            title = page.get('title')
            if not isinstance(path, str) or not path.startswith('/study/scriptures/') or not isinstance(title, str):
                fail(f'Invalid path/title in {volume}')
            if page['type'] == 'content':
                page_id = f'{volume}:content:{path}'
                db.execute('''INSERT INTO pages (id, kind, volume, path, title, content_json)
                              VALUES (?, 'content', ?, ?, ?, ?)''',
                           (page_id, volume, path, title, canonical_json(page.get('content', []))))
                content_count += 1
                total_pages += 1
                continue

            book = page.get('book')
            chapter = page.get('chapter')
            if not isinstance(book, dict) or not isinstance(chapter, dict):
                fail(f'Invalid chapter page in {volume}:{path}')
            slug = book.get('slug')
            if slug not in book_registry[volume]:
                fail(f'Unrecognized book {volume}:{slug}')
            number = positive_number(chapter.get('number'), f'chapter {path}')
            key = (slug, number)
            if key in found_chapters:
                fail(f'Duplicate chapter: {volume}:{slug}:{number}')
            found_chapters.add(key)
            if number > book_registry[volume][slug]['chapters']:
                fail(f'Chapter out of range: {volume}:{slug}:{number}')

            kind = 'declaration' if volume == 'dc' and slug == 'od' else 'chapter'
            verses = chapter.get('verses')
            if not isinstance(verses, list) or not verses:
                fail(f'Empty/missing verse array at {volume}:{slug}:{number}')
            page_id = f'{volume}:{slug}:{number}'
            content = None
            verse_rows = []
            if kind == 'declaration':
                paragraphs = []
                for position, verse in enumerate(verses, 1):
                    if not isinstance(verse, dict) or not isinstance(verse.get('text'), str) or not verse['text'].strip():
                        fail(f'Empty declaration paragraph: {page_id}:{position}')
                    # Source's generated IDs are not canonical verse numbers.
                    paragraphs.append({'order': position, 'text': verse['text'],
                                       'sourceNumber': verse.get('number')})
                content = canonical_json(paragraphs)
                paragraph_count += len(paragraphs)
                total_paragraphs += len(paragraphs)
            else:
                for position, verse in enumerate(verses, 1):
                    if not isinstance(verse, dict):
                        fail(f'Invalid verse at {page_id}:{position}')
                    n = positive_number(verse.get('number'), f'verse {page_id}:{position}')
                    if n != position:
                        fail(f'Missing, duplicate, or out-of-order verse at {page_id}:{position}')
                    if not isinstance(verse.get('text'), str) or not verse['text'].strip():
                        fail(f'Empty verse at {page_id}:{n}')
                    refs = verse.get('footnote_refs') or []
                    if not isinstance(refs, list):
                        fail(f'Invalid footnote references: {page_id}:{n}')
                    verse_rows.append((page_id, n, verse['text'],
                                       canonical_json(refs) if refs else None))
                    verse_count += 1
                    total_verses += 1

            db.execute('''INSERT INTO pages
                  (id, kind, volume, book, chapter, path, title, heading, summary,
                   preface_json, dates_json, footnotes_json, content_json)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                       (page_id, kind, volume, slug, number, path, title,
                        chapter.get('heading'), chapter.get('summary'),
                        canonical_json(chapter.get('preface') or []),
                        canonical_json(chapter.get('dates') or []),
                        canonical_json(chapter.get('footnotes') or []), content))
            if verse_rows:
                db.executemany('''INSERT INTO verses (page_id, n, text, footnote_refs_json)
                                  VALUES (?, ?, ?, ?)''', verse_rows)
            total_pages += 1

        if not allow_partial:
            expected_chapters = {(slug, n)
                                 for slug, book in book_registry[volume].items()
                                 for n in range(1, book['chapters'] + 1)}
            if found_chapters != expected_chapters:
                missing = sorted(expected_chapters - found_chapters)
                extra = sorted(found_chapters - expected_chapters)
                fail(f'Chapter coverage mismatch in {volume}: missing={missing[:3]} extra={extra[:3]}')
            expected_verses = registry['volumes'][VOLUMES.index(volume)]['expectedVerses']
            expected_content = registry['volumes'][VOLUMES.index(volume)]['expectedContentPages']
            if verse_count != expected_verses or content_count != expected_content:
                fail(f'Verse/content count mismatch in {volume}: {verse_count}/{content_count} '
                     f'expected {expected_verses}/{expected_content}')
        result_by_volume[volume] = {'chaptersAndDeclarations': len(found_chapters),
                                    'verses': verse_count, 'paragraphs': paragraph_count,
                                    'contentPages': content_count}

    if source_domains != {registry['source']}:
        fail('Unexpected publisher source URL in supplied corpus')
    if not allow_partial:
        for declaration, count in registry['declarationParagraphs'].items():
            db_row = db.execute("SELECT content_json FROM pages WHERE id = ?",
                                (f'dc:od:{declaration}',)).fetchone()
            if db_row is None or len(json.loads(db_row[0])) != count:
                fail(f'Official Declaration {declaration} paragraph coverage mismatch')

    meta = {'format_version': FORMAT_VERSION, 'language': registry['language'],
            'source': registry['source'], 'fingerprint': expected_fingerprint,
            'source_hashes': canonical_json(hashes),
            'partial': '1' if allow_partial else '0',
            'pages': str(total_pages), 'verses': str(total_verses),
            'declaration_paragraphs': str(total_paragraphs),
            'counts': canonical_json(result_by_volume)}
    db.executemany('INSERT INTO metadata VALUES (?, ?)', meta.items())
    return meta


def build(source, output, allow_partial=False):
    files = source_files(source)
    registry_bytes = REGISTRY_PATH.read_bytes()
    registry = json.loads(registry_bytes)
    sha, hashes = fingerprint(files, registry_bytes)
    current = read_metadata(output)
    if current and current.get('fingerprint') == sha and current.get('partial') == ('1' if allow_partial else '0'):
        print(f'Unchanged scripture JSON and build rules; reusing {output}')
        return 'unchanged'

    output.parent.mkdir(parents=True, exist_ok=True)
    # Named temp in same directory makes the final os.replace atomic.
    descriptor, name = tempfile.mkstemp(prefix='.scripture-build-', suffix='.sqlite', dir=output.parent)
    os.close(descriptor)
    temp = Path(name)
    try:
        with closing(sqlite3.connect(temp)) as db:
            db.execute('PRAGMA foreign_keys=ON')
            meta = populate(db, files, registry, sha, hashes, allow_partial)
            db.commit()
            if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                fail('SQLite integrity check failed')
            if db.execute('PRAGMA foreign_key_check').fetchone() is not None:
                fail('SQLite foreign-key integrity check failed')
        os.chmod(temp, 0o600)
        os.replace(temp, output)
        print(f"Built {output}: {meta['verses']} verses, {meta['pages']} pages; "
              f"{meta['declaration_paragraphs']} declaration paragraphs")
        return 'built'
    finally:
        if temp.exists():
            temp.unlink()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path,
                        default=Path(os.environ['SCRIPTURE_JSON_SOURCE'])
                        if os.getenv('SCRIPTURE_JSON_SOURCE') else None,
                        help='Private scriptures_json.zip or extracted JSON directory')
    parser.add_argument('--output', type=Path,
                        default=Path(os.environ.get('SCRIPTURE_SQLITE_PATH', DEFAULT_OUTPUT)),
                        help='SQLite output path (outside public web root)')
    parser.add_argument('--if-present', action='store_true',
                        help='Skip if no JSON source is configured (for incremental frontend builds)')
    parser.add_argument('--allow-partial', action='store_true',
                        help='Build incomplete synthetic test fixtures only; output marked partial')
    args = parser.parse_args(argv)
    source = args.source or next((candidate for candidate in DEFAULT_SOURCES if candidate.exists()), None)
    if source is None:
        if args.if_present:
            print('No private scripture JSON configured; skipping optional corpus build')
            return 0
        parser.error('Set SCRIPTURE_JSON_SOURCE or provide --source')
    try:
        build(Path(source), args.output, args.allow_partial)
    except (CorpusError, OSError, sqlite3.Error, zipfile.BadZipFile) as error:
        print(f'Scripture build failed: {error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
