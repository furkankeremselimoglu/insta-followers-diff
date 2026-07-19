/**
 * integration.test.js — Fixture-driven integration tests for gramdiff
 *
 * Uses node:test + node:assert/strict. Reads fixture files from test/fixtures/
 * and runs the full parse → merge → diff pipeline, asserting exact canonical
 * expected values per architecture doc §3.7.
 *
 * ZIP test: imports vendored web/vendor/fflate.js (unzipSync — synchronous,
 * no Worker/Blob needed) and asserts results identical to loose-file run.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFollowList, mergeAccounts, ParseError } from '../web/js/core/parse.js';
import { classifyPaths } from '../web/js/core/locate.js';
import { computeDiff } from '../web/js/core/diff.js';
import { accountsToCsv } from '../web/js/core/csv.js';
import { unzipSync } from '../web/vendor/fflate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');

// ---------------------------------------------------------------------------
// Canonical expected values (§3.7 — literal, never recomputed from inputs)
// ---------------------------------------------------------------------------

const EXPECTED = {
  followers: 7,       // deduped: alice bob carol döner_king dave erin frank
  following: 7,       // alice bob grace heidi döner_king ivan judy
  mutuals: 3,         // alice bob döner_king
  notFollowingBack: 4, // grace heidi ivan judy
  fans: 4,            // carol dave erin frank
};

const EXPECTED_MUTUALS_KEYS = new Set(['alice', 'bob', 'döner_king']);
const EXPECTED_NFB_KEYS = new Set(['grace', 'heidi', 'ivan', 'judy']);
const EXPECTED_FANS_KEYS = new Set(['carol', 'dave', 'erin', 'frank']);

// ---------------------------------------------------------------------------
// Helper: run full pipeline for a set of fixture paths
// ---------------------------------------------------------------------------

/**
 * Given a fixture root directory (absolute), read all files under it,
 * classifyPaths, parse, merge, diff, and return the diff result.
 *
 * @param {string} dir - absolute path to fixture root (e.g. export-modern)
 * @returns {Promise<{result: object, followersAccounts: Account[], followingAccounts: Account[]}>}
 */
async function runPipelineFromDir(dir) {
  // Collect all relative paths under the dir (recursive, depth-limited)
  const allPaths = [];
  async function walk(current, relativeTo) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const e of entries) {
      const rel = relativeTo ? relativeTo + '/' + e.name : e.name;
      if (e.isDirectory()) {
        await walk(join(current, e.name), rel);
      } else {
        allPaths.push(rel);
      }
    }
  }
  await walk(dir, '');

  const { followers: followerPaths, following: followingPaths } = classifyPaths(allPaths);

  const followerTexts = await Promise.all(
    followerPaths.map(p => readFile(join(dir, p), 'utf-8'))
  );
  const followingTexts = await Promise.all(
    followingPaths.map(p => readFile(join(dir, p), 'utf-8'))
  );

  const followerLists = followerTexts.map(parseFollowList);
  const followingLists = followingTexts.map(parseFollowList);

  const followersAccounts = mergeAccounts(...followerLists);
  const followingAccounts = mergeAccounts(...followingLists);

  const result = computeDiff(followersAccounts, followingAccounts);
  return { result, followersAccounts, followingAccounts };
}

/**
 * Run full pipeline from a set of pre-loaded text strings (for ZIP path).
 */
function runPipelineFromTexts(followerTexts, followingTexts) {
  const followerLists = followerTexts.map(parseFollowList);
  const followingLists = followingTexts.map(parseFollowList);
  const followersAccounts = mergeAccounts(...followerLists);
  const followingAccounts = mergeAccounts(...followingLists);
  return computeDiff(followersAccounts, followingAccounts);
}

// ---------------------------------------------------------------------------
// Helper: assert canonical expected sets
// ---------------------------------------------------------------------------

function assertCanonicalCounts(counts, label) {
  assert.equal(counts.followers, EXPECTED.followers,
    `${label}: followers count should be ${EXPECTED.followers}`);
  assert.equal(counts.following, EXPECTED.following,
    `${label}: following count should be ${EXPECTED.following}`);
  assert.equal(counts.mutuals, EXPECTED.mutuals,
    `${label}: mutuals count should be ${EXPECTED.mutuals}`);
  assert.equal(counts.notFollowingBack, EXPECTED.notFollowingBack,
    `${label}: notFollowingBack count should be ${EXPECTED.notFollowingBack}`);
  assert.equal(counts.fans, EXPECTED.fans,
    `${label}: fans count should be ${EXPECTED.fans}`);
}

function assertCanonicalSets(result, label) {
  assertCanonicalCounts(result.counts, label);

  const mutualKeys = new Set(result.mutuals.map(a => a.key));
  const nfbKeys = new Set(result.notFollowingBack.map(a => a.key));
  const fanKeys = new Set(result.fans.map(a => a.key));

  assert.deepEqual(mutualKeys, EXPECTED_MUTUALS_KEYS,
    `${label}: mutuals usernames mismatch`);
  assert.deepEqual(nfbKeys, EXPECTED_NFB_KEYS,
    `${label}: notFollowingBack usernames mismatch`);
  assert.deepEqual(fanKeys, EXPECTED_FANS_KEYS,
    `${label}: fans usernames mismatch`);
}

// ---------------------------------------------------------------------------
// Tests: export-modern (loose files)
// ---------------------------------------------------------------------------

describe('export-modern (loose files)', () => {
  it('classifyPaths finds followers_1, followers_2, following correctly', async () => {
    const dir = join(FIXTURES, 'export-modern');
    const allPaths = [
      'connections/followers_and_following/followers_1.json',
      'connections/followers_and_following/followers_2.json',
      'connections/followers_and_following/following.json',
    ];
    const { followers, following, html } = classifyPaths(allPaths);
    assert.equal(followers.length, 2);
    assert.equal(following.length, 1);
    assert.equal(html.length, 0);
    // Sorted numerically: followers_1 before followers_2
    assert.match(followers[0], /followers_1\.json$/i);
    assert.match(followers[1], /followers_2\.json$/i);
  });

  it('produces exact canonical expected sets', async () => {
    const dir = join(FIXTURES, 'export-modern');
    const { result } = await runPipelineFromDir(dir);
    assertCanonicalSets(result, 'export-modern');
  });

  it('deduplicates alice (appears twice in followers_1.json) keeping smaller timestamp', async () => {
    const dir = join(FIXTURES, 'export-modern');
    const { followersAccounts } = await runPipelineFromDir(dir);
    const alice = followersAccounts.find(a => a.key === 'alice');
    assert.ok(alice, 'alice must be in followers');
    // First occurrence timestamp=1700000001, duplicate=1700000099; smaller wins
    assert.equal(alice.timestamp, 1700000001);
  });

  it('döner_king key is NFC-lowercased', async () => {
    const dir = join(FIXTURES, 'export-modern');
    const { followersAccounts } = await runPipelineFromDir(dir);
    const doner = followersAccounts.find(a => a.key === 'döner_king');
    assert.ok(doner, 'döner_king must be in followers');
    assert.equal(doner.username, 'döner_king');
    assert.equal(doner.href, 'https://www.instagram.com/d%C3%B6ner_king');
  });
});

// ---------------------------------------------------------------------------
// Tests: export-legacy (relationships_followers wrapper, single file)
// ---------------------------------------------------------------------------

describe('export-legacy (relationships_followers wrapper)', () => {
  it('produces exact canonical expected sets', async () => {
    const dir = join(FIXTURES, 'export-legacy');
    const { result } = await runPipelineFromDir(dir);
    assertCanonicalSets(result, 'export-legacy');
  });

  it('followers file parsed via relationships_followers key', async () => {
    const text = await readFile(join(FIXTURES, 'export-legacy', 'followers.json'), 'utf-8');
    const accounts = parseFollowList(text);
    // legacy has 7 distinct accounts (no duplicate)
    assert.equal(accounts.length, 7);
    assert.ok(accounts.some(a => a.username === 'alice'));
    assert.ok(accounts.some(a => a.username === 'frank'));
  });
});

// ---------------------------------------------------------------------------
// Tests: export-quirks (edge cases)
// ---------------------------------------------------------------------------

describe('export-quirks (edge cases)', () => {
  it('skips item with empty string_list_data silently', async () => {
    const text = await readFile(join(FIXTURES, 'export-quirks', 'followers_1.json'), 'utf-8');
    const accounts = parseFollowList(text);
    // The empty string_list_data item should be skipped.
    // The fixture has: alice, bob, [empty sld], HrefOnly, carol, döner_king, dave, erin, frank → 8 valid
    assert.equal(accounts.length, 8, 'expected 8 accounts (empty sld item skipped)');
  });

  it('derives username from href when value is empty string', async () => {
    const text = await readFile(join(FIXTURES, 'export-quirks', 'followers_1.json'), 'utf-8');
    const accounts = parseFollowList(text);
    // HrefOnly item has value="" → username derived from href last segment = "HrefOnly"
    const hrefOnly = accounts.find(a => a.username === 'HrefOnly');
    assert.ok(hrefOnly, 'HrefOnly must be derived from href');
    assert.equal(hrefOnly.key, 'hrefonly', 'key must be lowercase NFC');
    assert.equal(hrefOnly.href, 'https://www.instagram.com/HrefOnly');
  });

  it('HrefOnly item has null timestamp', async () => {
    const text = await readFile(join(FIXTURES, 'export-quirks', 'followers_1.json'), 'utf-8');
    const accounts = parseFollowList(text);
    const hrefOnly = accounts.find(a => a.key === 'hrefonly');
    assert.ok(hrefOnly, 'HrefOnly must be present');
    assert.equal(hrefOnly.timestamp, null, 'timestamp should be null');
  });

  it('full pipeline does not throw on quirks fixture', async () => {
    const dir = join(FIXTURES, 'export-quirks');
    await assert.doesNotReject(() => runPipelineFromDir(dir));
  });
});

// ---------------------------------------------------------------------------
// Tests: export-empty (empty follower/following lists)
// ---------------------------------------------------------------------------

describe('export-empty (zero-count result)', () => {
  it('does not throw and returns all-zero counts', async () => {
    const dir = join(FIXTURES, 'export-empty');
    const { result } = await runPipelineFromDir(dir);
    assert.equal(result.counts.followers, 0, 'followers should be 0');
    assert.equal(result.counts.following, 0, 'following should be 0');
    assert.equal(result.counts.notFollowingBack, 0);
    assert.equal(result.counts.fans, 0);
    assert.equal(result.counts.mutuals, 0);
    assert.equal(result.notFollowingBack.length, 0);
    assert.equal(result.fans.length, 0);
    assert.equal(result.mutuals.length, 0);
  });

  it('empty followers_1.json parses as empty array', async () => {
    const text = await readFile(join(FIXTURES, 'export-empty', 'followers_1.json'), 'utf-8');
    const accounts = parseFollowList(text);
    assert.equal(accounts.length, 0);
  });

  it('empty following.json parses as empty array', async () => {
    const text = await readFile(join(FIXTURES, 'export-empty', 'following.json'), 'utf-8');
    const accounts = parseFollowList(text);
    assert.equal(accounts.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Tests: export-html (HTML detection)
// ---------------------------------------------------------------------------

describe('export-html (HTML detection)', () => {
  it('classifyPaths puts .html files in html bucket, not followers/following', () => {
    const paths = [
      'connections/followers_and_following/followers_1.html',
      'connections/followers_and_following/following.html',
    ];
    const { followers, following, html } = classifyPaths(paths);
    assert.equal(followers.length, 0, 'no JSON followers');
    assert.equal(following.length, 0, 'no JSON following');
    assert.equal(html.length, 2, 'both HTML files classified as html');
  });

  it('parseFollowList throws ParseError with code HTML_FILE on HTML text', async () => {
    const text = await readFile(
      join(FIXTURES, 'export-html', 'connections', 'followers_and_following', 'followers_1.html'),
      'utf-8'
    );
    assert.throws(
      () => parseFollowList(text),
      (err) => err instanceof ParseError && err.code === 'HTML_FILE'
    );
  });

  it('parseFollowList throws HTML_FILE on following.html too', async () => {
    const text = await readFile(
      join(FIXTURES, 'export-html', 'connections', 'followers_and_following', 'following.html'),
      'utf-8'
    );
    assert.throws(
      () => parseFollowList(text),
      (err) => err instanceof ParseError && err.code === 'HTML_FILE'
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: export-modern.zip (ZIP path via vendored fflate.js unzipSync)
// ---------------------------------------------------------------------------

describe('export-modern.zip (ZIP extraction via fflate unzipSync)', () => {
  let looseResult = null;

  // We need the loose-file result to compare against; compute it once.
  // Note: node:test doesn't support before() hooks at describe scope directly,
  // so we do a lazy init inside the first test and share via closure.
  // Instead, we run both pipelines inline in each test where needed,
  // or compute separately below.

  it('unzipSync extracts exactly the canonical follow files (no decoys)', async () => {
    const zipBytes = await readFile(join(FIXTURES, 'export-modern.zip'));
    const uint8 = new Uint8Array(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);

    const all = unzipSync(uint8);
    const allPaths = Object.keys(all);

    const { followers, following, html } = classifyPaths(allPaths);

    // Decoys: __MACOSX/... and following_hashtags.json should be excluded
    assert.equal(followers.length, 2, 'should find 2 followers files (followers_1, followers_2)');
    assert.equal(following.length, 1, 'should find 1 following file');
    assert.equal(html.length, 0, 'no HTML in the modern ZIP');

    // Confirm decoys are excluded
    const followingHashtag = allPaths.some(p => /following_hashtags\.json/i.test(p));
    assert.ok(followingHashtag, 'following_hashtags.json should exist in ZIP (as a decoy)');
    // But classifyPaths must exclude it
    assert.ok(
      !following.some(p => /hashtag/i.test(p)),
      'following_hashtags.json must NOT be in following bucket'
    );

    // __MACOSX entries exist
    const hasMacos = allPaths.some(p => p.includes('__MACOSX'));
    assert.ok(hasMacos, '__MACOSX entries should exist in ZIP');
    // classifyPaths must exclude them
    const allClassified = [...followers, ...following, ...html];
    assert.ok(
      !allClassified.some(p => p.includes('__MACOSX')),
      '__MACOSX entries must be excluded from all buckets'
    );
  });

  it('ZIP-path produces exact same canonical counts as loose-file run', async () => {
    // Loose-file run
    const { result: looseResult } = await runPipelineFromDir(join(FIXTURES, 'export-modern'));

    // ZIP run
    const zipBytes = await readFile(join(FIXTURES, 'export-modern.zip'));
    const uint8 = new Uint8Array(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
    const all = unzipSync(uint8);
    const allPaths = Object.keys(all);

    const { followers, following } = classifyPaths(allPaths);

    const decoder = new TextDecoder('utf-8');
    const followerTexts = followers.map(p => decoder.decode(all[p]));
    const followingTexts = following.map(p => decoder.decode(all[p]));

    const zipResult = runPipelineFromTexts(followerTexts, followingTexts);

    // Counts must match
    assert.deepEqual(zipResult.counts, looseResult.counts,
      'ZIP counts must deep-equal loose-file counts');
  });

  it('ZIP-path notFollowingBack usernames are identical to loose-file run', async () => {
    // Loose
    const { result: looseResult } = await runPipelineFromDir(join(FIXTURES, 'export-modern'));

    // ZIP
    const zipBytes = await readFile(join(FIXTURES, 'export-modern.zip'));
    const uint8 = new Uint8Array(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
    const all = unzipSync(uint8);
    const { followers, following } = classifyPaths(Object.keys(all));
    const decoder = new TextDecoder('utf-8');
    const zipResult = runPipelineFromTexts(
      followers.map(p => decoder.decode(all[p])),
      following.map(p => decoder.decode(all[p]))
    );

    const looseNfbKeys = new Set(looseResult.notFollowingBack.map(a => a.key));
    const zipNfbKeys = new Set(zipResult.notFollowingBack.map(a => a.key));
    assert.deepEqual(zipNfbKeys, looseNfbKeys, 'notFollowingBack sets must match');
  });

  it('ZIP-path fans usernames are identical to loose-file run', async () => {
    // Loose
    const { result: looseResult } = await runPipelineFromDir(join(FIXTURES, 'export-modern'));

    // ZIP
    const zipBytes = await readFile(join(FIXTURES, 'export-modern.zip'));
    const uint8 = new Uint8Array(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
    const all = unzipSync(uint8);
    const { followers, following } = classifyPaths(Object.keys(all));
    const decoder = new TextDecoder('utf-8');
    const zipResult = runPipelineFromTexts(
      followers.map(p => decoder.decode(all[p])),
      following.map(p => decoder.decode(all[p]))
    );

    const looseFanKeys = new Set(looseResult.fans.map(a => a.key));
    const zipFanKeys = new Set(zipResult.fans.map(a => a.key));
    assert.deepEqual(zipFanKeys, looseFanKeys, 'fans sets must match');
  });

  it('ZIP-path produces exact canonical expected sets', async () => {
    const zipBytes = await readFile(join(FIXTURES, 'export-modern.zip'));
    const uint8 = new Uint8Array(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
    const all = unzipSync(uint8);
    const { followers, following } = classifyPaths(Object.keys(all));
    const decoder = new TextDecoder('utf-8');
    const zipResult = runPipelineFromTexts(
      followers.map(p => decoder.decode(all[p])),
      following.map(p => decoder.decode(all[p]))
    );
    assertCanonicalSets(zipResult, 'export-modern.zip');
  });
});

// ---------------------------------------------------------------------------
// Tests: CSV of notFollowingBack (export-modern)
// ---------------------------------------------------------------------------

describe('accountsToCsv — notFollowingBack output', () => {
  it('CSV has exactly 5 lines (header + 4 accounts) with CRLF line endings', async () => {
    const { result } = await runPipelineFromDir(join(FIXTURES, 'export-modern'));
    assert.equal(result.notFollowingBack.length, 4,
      'notFollowingBack should have exactly 4 accounts');

    const csv = accountsToCsv(result.notFollowingBack);

    // Split on CRLF to count lines; trailing CRLF creates a trailing empty element
    const lines = csv.split('\r\n');
    // Last element is empty due to trailing CRLF
    assert.ok(lines[lines.length - 1] === '', 'CSV must end with CRLF (trailing empty)');
    const nonEmpty = lines.filter(l => l.length > 0);
    assert.equal(nonEmpty.length, 5, 'must have 5 non-empty lines (1 header + 4 rows)');
  });

  it('CSV starts with UTF-8 BOM', async () => {
    const { result } = await runPipelineFromDir(join(FIXTURES, 'export-modern'));
    const csv = accountsToCsv(result.notFollowingBack);
    assert.ok(csv.startsWith('﻿'), 'CSV must start with UTF-8 BOM');
  });

  it('CSV header is correct', async () => {
    const { result } = await runPipelineFromDir(join(FIXTURES, 'export-modern'));
    const csv = accountsToCsv(result.notFollowingBack);
    // Remove BOM, split on CRLF
    const lines = csv.replace(/^﻿/, '').split('\r\n');
    assert.equal(lines[0], 'username,profile_url,followed_at', 'header row must match');
  });

  it('CSV profile_url uses href from export when present', async () => {
    const { result } = await runPipelineFromDir(join(FIXTURES, 'export-modern'));
    const csv = accountsToCsv(result.notFollowingBack);
    // All notFollowingBack accounts have hrefs in the fixture
    assert.ok(csv.includes('https://www.instagram.com/grace'), 'grace href must appear');
    assert.ok(csv.includes('https://www.instagram.com/heidi'), 'heidi href must appear');
    assert.ok(csv.includes('https://www.instagram.com/ivan'), 'ivan href must appear');
    assert.ok(csv.includes('https://www.instagram.com/judy'), 'judy href must appear');
  });

  it('CSV profile_url falls back to https://www.instagram.com/<username>/ when href absent', () => {
    // Construct a fake account with no href
    const noHref = { username: 'ghostuser', key: 'ghostuser', href: null, timestamp: null };
    const csv = accountsToCsv([noHref]);
    assert.ok(
      csv.includes('https://www.instagram.com/ghostuser/'),
      'fallback profile_url must use username'
    );
  });

  it('CSV followed_at is ISO 8601 when timestamp present', async () => {
    const { result } = await runPipelineFromDir(join(FIXTURES, 'export-modern'));
    const csv = accountsToCsv(result.notFollowingBack);
    // grace timestamp is 1700000103 → 2023-11-14T22:15:03.000Z
    const expected = new Date(1700000103 * 1000).toISOString();
    assert.ok(csv.includes(expected), `CSV must include ISO date ${expected}`);
  });

  it('CSV followed_at is empty when timestamp is null', () => {
    const noTs = { username: 'notime', key: 'notime', href: 'https://www.instagram.com/notime', timestamp: null };
    const csv = accountsToCsv([noTs]);
    const lines = csv.replace(/^﻿/, '').split('\r\n').filter(l => l.length > 0);
    // data line: notime,https://...,
    const dataLine = lines[1];
    assert.ok(dataLine.endsWith(','), 'followed_at field must be empty (line ends with comma)');
  });
});
