import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BIBLE_API_HOME,
  COMPARISON_TRANSLATION,
  BibleComparisonError,
  bibleApiUrl,
  eligibleBibleReference,
  fetchBibleComparison,
} from './bibleApi.js';

function jsonResponse(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return data; } };
}

test('only the revealed Old and New Testament references can be compared', () => {
  assert.equal(eligibleBibleReference('Genesis 1:1'), 'Genesis 1:1');
  assert.equal(eligibleBibleReference('Psalms 23:1'), 'Psalms 23:1');
  assert.equal(eligibleBibleReference('Matthew 5:14'), 'Matthew 5:14');
  assert.equal(eligibleBibleReference('John 3:16'), 'John 3:16');
  assert.equal(eligibleBibleReference('John 3:16-18'), 'John 3:16-18');
  assert.equal(eligibleBibleReference('  Isaiah 40:31  '), 'Isaiah 40:31');
  assert.equal(eligibleBibleReference('2 Nephi 2:25'), null);
  assert.equal(eligibleBibleReference('Moses 1:39'), null);
  assert.equal(eligibleBibleReference('Doctrine and Covenants 18:10'), null);
  assert.equal(eligibleBibleReference(''), null);
  assert.equal(eligibleBibleReference(null), null);
});

test('malformed and injected references are rejected before third-party requests', () => {
  for (const value of [
    'John', 'John 3', 'John 0:16', 'John 3:0', 'John 3:-16',
    'John 3:16;?translation=kjv', 'John 3:16-4', 'John 3:16\nGenesis 1:1',
    'John 9999:16', 'Luke 2:10?test=hi',
  ]) {
    assert.equal(eligibleBibleReference(value), null, value);
    assert.equal(bibleApiUrl(value), null, value);
  }
});

test('URL targets the explicit WEB translation and safely encodes the reference', () => {
  assert.equal(
    bibleApiUrl('John 3:16'),
    `${BIBLE_API_HOME}John%203%3A16?translation=web`,
  );
});

test('browser fetch requests only publicly revealed reference without credentials', async () => {
  let calls = 0;
  const result = await fetchBibleComparison('John 3:16', {
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://bible-api.com/John%203%3A16?translation=web');
      assert.equal(options.credentials, 'omit');
      assert.equal(options.referrerPolicy, 'no-referrer');
      assert.equal(options.method, undefined);
      assert.equal(options.body, undefined);
      return jsonResponse({ reference: 'John 3:16', translation_id: 'web', text: 'For God so loved the world.\n' });
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, {
    reference: 'John 3:16',
    text: 'For God so loved the world.',
    translation: COMPARISON_TRANSLATION,
    sourceUrl: BIBLE_API_HOME,
  });
});

test('non-Bible references never invoke the external API', async () => {
  let calls = 0;
  await assert.rejects(
    fetchBibleComparison('2 Nephi 2:25', { fetchImpl: async () => { calls++; } }),
    (error) => error instanceof BibleComparisonError && /Bible passages/.test(error.message),
  );
  assert.equal(calls, 0);
});

test('provider 404 and rate-limited errors are actionable without affecting game', async () => {
  await assert.rejects(
    fetchBibleComparison('Genesis 1:1', { fetchImpl: async () => jsonResponse({}, 404) }),
    /No alternate translation was found/,
  );
  await assert.rejects(
    fetchBibleComparison('Genesis 1:1', { fetchImpl: async () => jsonResponse({}, 429) }),
    /too many requests/,
  );
  await assert.rejects(
    fetchBibleComparison('Genesis 1:1', { fetchImpl: async () => jsonResponse({}, 503) }),
    /temporarily unavailable/,
  );
});

test('network failures, unreadable JSON, and empty/mismatched provider data do not masquerade as text', async () => {
  await assert.rejects(
    fetchBibleComparison('Luke 2:10', { fetchImpl: async () => { throw new Error('offline'); } }),
    /Could not reach Bible API/,
  );
  await assert.rejects(
    fetchBibleComparison('Luke 2:10', { fetchImpl: async () => ({ ok: true, async json() { throw new SyntaxError(); } }) }),
    /unreadable response/,
  );
  for (const value of [{ text: '' }, { verses: [] }, { text: '  ' }, { text: 'Hello', translation_id: 'kjv' }, { text: 'Hi', translation_id: 3 }]) {
    await assert.rejects(
      fetchBibleComparison('Luke 2:10', { fetchImpl: async () => jsonResponse(value) }),
      /did not return a World English Bible passage/,
    );
  }
});

test('abort signals propagate and cancellation is not presented as an error', async () => {
  const controller = new AbortController();
  const abort = new Error('Aborted');
  abort.name = 'AbortError';
  await assert.rejects(
    fetchBibleComparison('Matthew 5:14', {
      signal: controller.signal,
      fetchImpl: async (url, options) => {
        assert.equal(options.signal, controller.signal);
        throw abort;
      },
    }),
    (error) => error === abort,
  );
});
