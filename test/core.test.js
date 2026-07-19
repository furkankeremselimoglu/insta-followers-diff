/**
 * core.test.js — Unit tests for web/js/core/*.js
 * Uses node:test + node:assert/strict, inline data only (no fixture files).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseFollowList, mergeAccounts, ParseError } from '../web/js/core/parse.js';
import { classifyPaths } from '../web/js/core/locate.js';
import { computeDiff } from '../web/js/core/diff.js';
import { accountsToCsv } from '../web/js/core/csv.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(value, href, timestamp) {
  const entry = {};
  if (value !== undefined) entry.value = value;
  if (href !== undefined) entry.href = href;
  if (timestamp !== undefined) entry.timestamp = timestamp;
  return { title: '', media_list_data: [], string_list_data: [entry] };
}

function bareArray(items) {
  return JSON.stringify(items);
}

function wrappedFollowers(items) {
  return JSON.stringify({ relationships_followers: items });
}

function wrappedFollowing(items) {
  return JSON.stringify({ relationships_following: items });
}

function unknownKeyArray(items) {
  return JSON.stringify({ some_unknown_key: items });
}

// Canonical fixture accounts
const ALICE = makeItem('alice', 'https://www.instagram.com/alice', 1700000001);
const BOB = makeItem('bob', 'https://www.instagram.com/bob', 1700000002);
const CAROL = makeItem('carol', 'https://www.instagram.com/carol', 1700000003);
const DONER = makeItem('döner_king', 'https://www.instagram.com/d%C3%B6ner_king', 1700000004);
const DAVE = makeItem('dave', 'https://www.instagram.com/dave', 1700000005);
const ALICE_DUP = makeItem('alice', 'https://www.instagram.com/alice', 1700000099);
const ERIN = makeItem('erin', 'https://www.instagram.com/erin', 1700000006);
const FRANK = makeItem('frank', 'https://www.instagram.com/frank', 1700000007);

const ALICE_F = makeItem('alice', 'https://www.instagram.com/alice', 1700000101);
const BOB_F = makeItem('bob', 'https://www.instagram.com/bob', 1700000102);
const GRACE_F = makeItem('grace', 'https://www.instagram.com/grace', 1700000103);
const HEIDI_F = makeItem('heidi', 'https://www.instagram.com/heidi', 1700000104);
const DONER_F = makeItem('döner_king', 'https://www.instagram.com/d%C3%B6ner_king', 1700000105);
const IVAN_F = makeItem('ivan', 'https://www.instagram.com/ivan', 1700000106);
const JUDY_F = makeItem('judy', 'https://www.instagram.com/judy', 1700000107);

// ---------------------------------------------------------------------------
// parse.js — parseFollowList
// ---------------------------------------------------------------------------

describe('parseFollowList — shape variants', () => {
  it('parses a bare array (shape 1)', () => {
    const result = parseFollowList(bareArray([ALICE, BOB]));
    assert.equal(result.length, 2);
    assert.equal(result[0].username, 'alice');
    assert.equal(result[1].username, 'bob');
  });

  it('parses relationships_followers wrapper (shape 2a)', () => {
    const result = parseFollowList(wrappedFollowers([ALICE]));
    assert.equal(result.length, 1);
    assert.equal(result[0].username, 'alice');
  });

  it('parses relationships_following wrapper (shape 2b)', () => {
    const result = parseFollowList(wrappedFollowing([BOB]));
    assert.equal(result.length, 1);
    assert.equal(result[0].username, 'bob');
  });

  it('prefers relationships_followers over fallback when both are missing (shape 3)', () => {
    const result = parseFollowList(unknownKeyArray([ALICE]));
    assert.equal(result.length, 1);
    assert.equal(result[0].username, 'alice');
  });

  it('throws UNRECOGNIZED_SHAPE for object with no array values', () => {
    assert.throws(
      () => parseFollowList(JSON.stringify({ foo: 'bar', baz: 42 })),
      (err) => err instanceof ParseError && err.code === 'UNRECOGNIZED_SHAPE'
    );
  });

  it('throws UNRECOGNIZED_SHAPE for a plain string', () => {
    assert.throws(
      () => parseFollowList(JSON.stringify('hello')),
      (err) => err instanceof ParseError && err.code === 'UNRECOGNIZED_SHAPE'
    );
  });

  it('throws HTML_FILE when text starts with <', () => {
    assert.throws(
      () => parseFollowList('<html></html>'),
      (err) => err instanceof ParseError && err.code === 'HTML_FILE'
    );
  });

  it('throws HTML_FILE after stripping BOM when HTML follows', () => {
    assert.throws(
      () => parseFollowList('﻿<html></html>'),
      (err) => err instanceof ParseError && err.code === 'HTML_FILE'
    );
  });

  it('throws HTML_FILE after stripping leading whitespace + BOM', () => {
    assert.throws(
      () => parseFollowList('﻿  <html></html>'),
      (err) => err instanceof ParseError && err.code === 'HTML_FILE'
    );
  });

  it('throws INVALID_JSON for malformed JSON', () => {
    assert.throws(
      () => parseFollowList('{not valid json}'),
      (err) => err instanceof ParseError && err.code === 'INVALID_JSON'
    );
  });

  it('strips BOM before parsing', () => {
    const json = '﻿' + bareArray([ALICE]);
    const result = parseFollowList(json);
    assert.equal(result.length, 1);
  });

  it('strips leading whitespace before parsing', () => {
    const json = '   \n' + bareArray([ALICE]);
    const result = parseFollowList(json);
    assert.equal(result.length, 1);
  });
});

describe('parseFollowList — Account field correctness', () => {
  it('sets username, key, href, timestamp correctly', () => {
    const result = parseFollowList(bareArray([ALICE]));
    const a = result[0];
    assert.equal(a.username, 'alice');
    assert.equal(a.key, 'alice');
    assert.equal(a.href, 'https://www.instagram.com/alice');
    assert.equal(a.timestamp, 1700000001);
  });

  it('key is NFC-lowercased', () => {
    const result = parseFollowList(bareArray([DONER]));
    const a = result[0];
    assert.equal(a.username, 'döner_king');
    assert.equal(a.key, 'döner_king'); // NFC ö
    assert.equal(a.key, 'döner_king'.normalize('NFC').toLowerCase());
  });

  it('preserves original casing in username', () => {
    const item = makeItem('UpperCase_User', 'https://www.instagram.com/UpperCase_User', 1700000001);
    const result = parseFollowList(bareArray([item]));
    assert.equal(result[0].username, 'UpperCase_User');
    assert.equal(result[0].key, 'uppercase_user');
  });

  it('sets timestamp to null when missing', () => {
    const item = { title: '', media_list_data: [], string_list_data: [{ value: 'notime', href: 'https://www.instagram.com/notime' }] };
    const result = parseFollowList(bareArray([item]));
    assert.equal(result[0].timestamp, null);
  });

  it('sets href to null when missing', () => {
    const item = { title: '', media_list_data: [], string_list_data: [{ value: 'nohref', timestamp: 1700000001 }] };
    const result = parseFollowList(bareArray([item]));
    assert.equal(result[0].href, null);
  });
});

describe('parseFollowList — item quirks', () => {
  it('skips items with empty string_list_data', () => {
    const item = { title: '', media_list_data: [], string_list_data: [] };
    const result = parseFollowList(bareArray([item, ALICE]));
    assert.equal(result.length, 1);
    assert.equal(result[0].username, 'alice');
  });

  it('skips items with missing string_list_data', () => {
    const item = { title: '', media_list_data: [] };
    const result = parseFollowList(bareArray([item, ALICE]));
    assert.equal(result.length, 1);
  });

  it('derives username from href when value is empty string', () => {
    const item = { title: '', media_list_data: [], string_list_data: [{ value: '', href: 'https://www.instagram.com/HrefOnly', timestamp: 1700000001 }] };
    const result = parseFollowList(bareArray([item]));
    assert.equal(result.length, 1);
    assert.equal(result[0].username, 'HrefOnly');
  });

  it('derives username from percent-encoded href', () => {
    const item = { title: '', media_list_data: [], string_list_data: [{ value: '', href: 'https://www.instagram.com/d%C3%B6ner_king', timestamp: 1700000001 }] };
    const result = parseFollowList(bareArray([item]));
    assert.equal(result[0].username, 'döner_king');
    assert.equal(result[0].key, 'döner_king'.normalize('NFC').toLowerCase());
  });

  it('skips items where both value and href are absent', () => {
    const item = { title: '', media_list_data: [], string_list_data: [{ timestamp: 1700000001 }] };
    const result = parseFollowList(bareArray([item, ALICE]));
    assert.equal(result.length, 1);
  });

  it('handles empty list gracefully', () => {
    const result = parseFollowList(bareArray([]));
    assert.equal(result.length, 0);
    assert.ok(Array.isArray(result));
  });

  it('handles empty relationships_following object gracefully', () => {
    const result = parseFollowList(JSON.stringify({ relationships_following: [] }));
    assert.equal(result.length, 0);
  });
});

describe('parseFollowList — unicode and percent-encoding', () => {
  it('handles unicode usernames in value field', () => {
    const item = makeItem('用户名', 'https://www.instagram.com/%E7%94%A8%E6%88%B7%E5%90%8D', 1700000001);
    const result = parseFollowList(bareArray([item]));
    assert.equal(result[0].username, '用户名');
    assert.equal(result[0].key, '用户名'.normalize('NFC').toLowerCase());
  });

  it('NFC-normalizes decomposed unicode in key', () => {
    // ö as NFD (o + combining umlaut) vs NFC (ö)
    const nfd = 'öner'; // NFD
    const item = makeItem(nfd, null, 1700000001);
    const result = parseFollowList(bareArray([item]));
    assert.equal(result[0].key, 'öner'); // NFC
  });

  it('case-insensitive key matching (uppercase vs lowercase same username)', () => {
    const itemUpper = makeItem('Alice', null, 1700000001);
    const itemLower = makeItem('alice', null, 1700000002);
    const results = parseFollowList(bareArray([itemUpper, itemLower]));
    assert.equal(results[0].key, 'alice');
    assert.equal(results[1].key, 'alice');
  });
});

// ---------------------------------------------------------------------------
// parse.js — mergeAccounts
// ---------------------------------------------------------------------------

describe('mergeAccounts — deduplication', () => {
  it('concatenates non-overlapping lists', () => {
    const list1 = parseFollowList(bareArray([ALICE, BOB]));
    const list2 = parseFollowList(bareArray([CAROL]));
    const merged = mergeAccounts(list1, list2);
    assert.equal(merged.length, 3);
  });

  it('deduplicates by key, first occurrence wins for username/href', () => {
    const item1 = makeItem('Alice', 'https://www.instagram.com/Alice', 1700000001);
    const item2 = makeItem('alice', 'https://www.instagram.com/alice', 1700000002);
    const list1 = parseFollowList(bareArray([item1]));
    const list2 = parseFollowList(bareArray([item2]));
    const merged = mergeAccounts(list1, list2);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].username, 'Alice'); // first occurrence
  });

  it('keeps the smaller non-null timestamp when deduplicating', () => {
    const item1 = makeItem('alice', null, 1700000099);
    const item2 = makeItem('alice', null, 1700000001);
    const list1 = parseFollowList(bareArray([item1]));
    const list2 = parseFollowList(bareArray([item2]));
    const merged = mergeAccounts(list1, list2);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].timestamp, 1700000001);
  });

  it('keeps first timestamp when second is null', () => {
    const item1 = makeItem('alice', null, 1700000001);
    const item2 = makeItem('alice', null, undefined);
    const list1 = parseFollowList(bareArray([item1]));
    const list2 = parseFollowList(bareArray([item2]));
    const merged = mergeAccounts(list1, list2);
    assert.equal(merged[0].timestamp, 1700000001);
  });

  it('uses second timestamp when first is null', () => {
    const item1 = makeItem('alice', null, undefined);
    const item2 = makeItem('alice', null, 1700000001);
    const list1 = parseFollowList(bareArray([item1]));
    const list2 = parseFollowList(bareArray([item2]));
    const merged = mergeAccounts(list1, list2);
    assert.equal(merged[0].timestamp, 1700000001);
  });

  it('handles canonical fixture: followers_1 + alice duplicate', () => {
    const followers1 = parseFollowList(bareArray([ALICE, BOB, CAROL, DONER, DAVE, ALICE_DUP]));
    const followers2 = parseFollowList(bareArray([ERIN, FRANK]));
    const merged = mergeAccounts(followers1, followers2);
    // alice deduped: 7 unique (alice, bob, carol, döner_king, dave, erin, frank)
    assert.equal(merged.length, 7);
    const alice = merged.find(a => a.key === 'alice');
    assert.ok(alice);
    // First alice has timestamp 1700000001, dup has 1700000099 → keep smaller
    assert.equal(alice.timestamp, 1700000001);
  });

  it('handles empty inputs', () => {
    const merged = mergeAccounts([], []);
    assert.equal(merged.length, 0);
  });

  it('handles single list', () => {
    const list = parseFollowList(bareArray([ALICE, BOB]));
    const merged = mergeAccounts(list);
    assert.equal(merged.length, 2);
  });
});

// ---------------------------------------------------------------------------
// locate.js — classifyPaths
// ---------------------------------------------------------------------------

describe('classifyPaths — basic classification', () => {
  it('classifies followers_1.json and following.json', () => {
    const result = classifyPaths([
      'connections/followers_and_following/followers_1.json',
      'connections/followers_and_following/following.json',
    ]);
    assert.equal(result.followers.length, 1);
    assert.equal(result.following.length, 1);
    assert.equal(result.html.length, 0);
  });

  it('classifies multiple followers parts numerically', () => {
    const result = classifyPaths([
      'connections/followers_and_following/followers_10.json',
      'connections/followers_and_following/followers_2.json',
      'connections/followers_and_following/followers_1.json',
    ]);
    assert.equal(result.followers.length, 3);
    // Numeric sort: 1, 2, 10
    const basenames = result.followers.map(p => p.split('/').pop());
    assert.deepEqual(basenames, ['followers_1.json', 'followers_2.json', 'followers_10.json']);
  });

  it('classifies unsuffixed followers.json as part 0 (before numbered)', () => {
    const result = classifyPaths([
      'export/followers_1.json',
      'export/followers.json',
    ]);
    const basenames = result.followers.map(p => p.split('/').pop());
    assert.deepEqual(basenames, ['followers.json', 'followers_1.json']);
  });

  it('classifies following_1.json variant', () => {
    const result = classifyPaths(['connections/following_1.json']);
    assert.equal(result.following.length, 1);
  });

  it('classifies HTML files', () => {
    const result = classifyPaths([
      'connections/followers_and_following/followers_1.html',
      'connections/followers_and_following/following.html',
    ]);
    assert.equal(result.html.length, 2);
    assert.equal(result.followers.length, 0);
    assert.equal(result.following.length, 0);
  });
});

describe('classifyPaths — decoy and exclusion', () => {
  it('rejects following_hashtags.json', () => {
    const result = classifyPaths(['connections/followers_and_following/following_hashtags.json']);
    assert.equal(result.following.length, 0);
    assert.equal(result.followers.length, 0);
    assert.equal(result.html.length, 0);
  });

  it('rejects close_friends.json', () => {
    const result = classifyPaths(['connections/close_friends.json']);
    assert.equal(result.followers.length, 0);
    assert.equal(result.following.length, 0);
  });

  it('rejects pending_follow_requests.json', () => {
    const result = classifyPaths(['connections/pending_follow_requests.json']);
    assert.equal(result.following.length, 0);
  });

  it('rejects recently_unfollowed_profiles.json', () => {
    const result = classifyPaths(['connections/recently_unfollowed_profiles.json']);
    assert.equal(result.following.length, 0);
  });

  it('excludes paths containing __MACOSX/', () => {
    const result = classifyPaths([
      '__MACOSX/connections/followers_and_following/._followers_1.json',
      'connections/followers_and_following/followers_1.json',
    ]);
    assert.equal(result.followers.length, 1);
    assert.ok(!result.followers[0].includes('__MACOSX'));
  });

  it('excludes basenames starting with . (AppleDouble)', () => {
    const result = classifyPaths([
      'connections/followers_and_following/._followers_1.json',
      'connections/followers_and_following/followers_1.json',
    ]);
    assert.equal(result.followers.length, 1);
    assert.ok(!result.followers[0].includes('._'));
  });

  it('is case-insensitive for basenames', () => {
    const result = classifyPaths([
      'connections/Followers_1.JSON',
      'connections/FOLLOWING.JSON',
    ]);
    assert.equal(result.followers.length, 1);
    assert.equal(result.following.length, 1);
  });

  it('handles empty array', () => {
    const result = classifyPaths([]);
    assert.equal(result.followers.length, 0);
    assert.equal(result.following.length, 0);
    assert.equal(result.html.length, 0);
  });

  it('handles mixed valid and decoy paths', () => {
    const result = classifyPaths([
      'connections/followers_and_following/followers_1.json',
      'connections/followers_and_following/following.json',
      'connections/followers_and_following/following_hashtags.json',
      'connections/followers_and_following/close_friends.json',
      '__MACOSX/connections/followers_and_following/._followers_1.json',
    ]);
    assert.equal(result.followers.length, 1);
    assert.equal(result.following.length, 1);
  });
});

// ---------------------------------------------------------------------------
// diff.js — computeDiff
// ---------------------------------------------------------------------------

describe('computeDiff — canonical fixture dataset', () => {
  // followers: alice, bob, carol, döner_king, dave, erin, frank (7 unique after dedup)
  // following: alice, bob, grace, heidi, döner_king, ivan, judy (7)
  // mutuals: alice, bob, döner_king (3)
  // notFollowingBack: grace, heidi, ivan, judy (4)
  // fans: carol, dave, erin, frank (4)

  function buildFollowers() {
    const f1 = parseFollowList(bareArray([ALICE, BOB, CAROL, DONER, DAVE, ALICE_DUP]));
    const f2 = parseFollowList(bareArray([ERIN, FRANK]));
    return mergeAccounts(f1, f2);
  }

  function buildFollowing() {
    return parseFollowList(wrappedFollowing([ALICE_F, BOB_F, GRACE_F, HEIDI_F, DONER_F, IVAN_F, JUDY_F]));
  }

  it('computes correct counts', () => {
    const result = computeDiff(buildFollowers(), buildFollowing());
    assert.equal(result.counts.followers, 7);
    assert.equal(result.counts.following, 7);
    assert.equal(result.counts.mutuals, 3);
    assert.equal(result.counts.notFollowingBack, 4);
    assert.equal(result.counts.fans, 4);
  });

  it('notFollowingBack contains grace, heidi, ivan, judy', () => {
    const result = computeDiff(buildFollowers(), buildFollowing());
    const keys = result.notFollowingBack.map(a => a.key).sort();
    assert.deepEqual(keys, ['grace', 'heidi', 'ivan', 'judy']);
  });

  it('fans contains carol, dave, erin, frank', () => {
    const result = computeDiff(buildFollowers(), buildFollowing());
    const keys = result.fans.map(a => a.key).sort();
    assert.deepEqual(keys, ['carol', 'dave', 'erin', 'frank']);
  });

  it('mutuals contains alice, bob, döner_king', () => {
    const result = computeDiff(buildFollowers(), buildFollowing());
    const keys = result.mutuals.map(a => a.key).sort();
    assert.deepEqual(keys, ['alice', 'bob', 'döner_king']);
  });

  it('notFollowingBack preserves following export order', () => {
    const result = computeDiff(buildFollowers(), buildFollowing());
    // Following order: alice, bob, grace, heidi, döner_king, ivan, judy
    // notFollowingBack (not in followers): grace, heidi, ivan, judy — in that order
    const keys = result.notFollowingBack.map(a => a.key);
    assert.deepEqual(keys, ['grace', 'heidi', 'ivan', 'judy']);
  });

  it('notFollowingBack accounts are taken from following list', () => {
    const following = buildFollowing();
    const result = computeDiff(buildFollowers(), following);
    // Objects should be the same references (or at least same keys/hrefs)
    const graceInFollowing = following.find(a => a.key === 'grace');
    const graceInResult = result.notFollowingBack.find(a => a.key === 'grace');
    assert.equal(graceInResult.href, graceInFollowing.href);
    assert.equal(graceInResult.timestamp, graceInFollowing.timestamp);
  });
});

describe('computeDiff — edge cases', () => {
  it('handles empty followers list', () => {
    const following = parseFollowList(wrappedFollowing([ALICE_F, BOB_F]));
    const result = computeDiff([], following);
    assert.equal(result.counts.followers, 0);
    assert.equal(result.counts.notFollowingBack, 2);
    assert.equal(result.counts.fans, 0);
    assert.equal(result.counts.mutuals, 0);
  });

  it('handles empty following list', () => {
    const followers = parseFollowList(bareArray([ALICE, BOB]));
    const result = computeDiff(followers, []);
    assert.equal(result.counts.following, 0);
    assert.equal(result.counts.notFollowingBack, 0);
    assert.equal(result.counts.fans, 2);
    assert.equal(result.counts.mutuals, 0);
  });

  it('handles both lists empty', () => {
    const result = computeDiff([], []);
    assert.equal(result.counts.followers, 0);
    assert.equal(result.counts.following, 0);
    assert.equal(result.counts.notFollowingBack, 0);
    assert.equal(result.counts.fans, 0);
    assert.equal(result.counts.mutuals, 0);
    assert.equal(result.notFollowingBack.length, 0);
    assert.equal(result.fans.length, 0);
    assert.equal(result.mutuals.length, 0);
  });

  it('case-insensitive membership: ALICE and alice are the same', () => {
    const followerItem = makeItem('Alice', null, 1700000001);
    const followingItem = makeItem('alice', null, 1700000002);
    const followers = parseFollowList(bareArray([followerItem]));
    const following = parseFollowList(bareArray([followingItem]));
    const result = computeDiff(followers, following);
    assert.equal(result.counts.mutuals, 1);
    assert.equal(result.counts.notFollowingBack, 0);
    assert.equal(result.counts.fans, 0);
  });

  it('döner_king unicode membership', () => {
    const followers = parseFollowList(bareArray([DONER]));
    const following = parseFollowList(wrappedFollowing([DONER_F]));
    const result = computeDiff(followers, following);
    assert.equal(result.counts.mutuals, 1);
    assert.equal(result.counts.notFollowingBack, 0);
  });
});

// ---------------------------------------------------------------------------
// csv.js — accountsToCsv
// ---------------------------------------------------------------------------

describe('accountsToCsv — format correctness', () => {
  it('starts with UTF-8 BOM', () => {
    const csv = accountsToCsv([]);
    assert.ok(csv.startsWith('﻿'), 'CSV must start with BOM');
  });

  it('uses CRLF line endings throughout', () => {
    const accounts = parseFollowList(bareArray([ALICE, BOB]));
    const csv = accountsToCsv(accounts);
    const lines = csv.split('\r\n');
    // Each line ends with \r\n; after split, last element is empty (trailing CRLF)
    assert.ok(lines.length > 1);
    assert.equal(lines[lines.length - 1], ''); // trailing CRLF
    // No bare \n (without preceding \r)
    const bareNewlines = csv.replace(/\r\n/g, '').includes('\n');
    assert.equal(bareNewlines, false);
  });

  it('has correct header', () => {
    const csv = accountsToCsv([]);
    const firstLine = csv.split('\r\n')[0];
    assert.equal(firstLine, '﻿username,profile_url,followed_at');
  });

  it('renders a row with all fields present', () => {
    const accounts = parseFollowList(bareArray([ALICE]));
    const csv = accountsToCsv(accounts);
    const lines = csv.split('\r\n');
    const row = lines[1];
    assert.ok(row.includes('alice'));
    assert.ok(row.includes('https://www.instagram.com/alice'));
    assert.ok(row.includes(new Date(1700000001 * 1000).toISOString()));
  });

  it('uses href as profile_url when present', () => {
    const accounts = parseFollowList(bareArray([ALICE]));
    const csv = accountsToCsv(accounts);
    assert.ok(csv.includes('https://www.instagram.com/alice'));
  });

  it('constructs profile_url from username when href is null', () => {
    const item = { title: '', media_list_data: [], string_list_data: [{ value: 'nohref', timestamp: 1700000001 }] };
    const accounts = parseFollowList(bareArray([item]));
    const csv = accountsToCsv(accounts);
    assert.ok(csv.includes('https://www.instagram.com/nohref/'));
  });

  it('leaves followed_at empty when timestamp is null', () => {
    const item = { title: '', media_list_data: [], string_list_data: [{ value: 'notimestamp', href: 'https://www.instagram.com/notimestamp' }] };
    const accounts = parseFollowList(bareArray([item]));
    const csv = accountsToCsv(accounts);
    const dataLine = csv.split('\r\n')[1];
    // Should end with a comma and nothing after (empty field)
    assert.ok(dataLine.endsWith(','));
  });

  it('ISO 8601 UTC format for followed_at', () => {
    const accounts = parseFollowList(bareArray([ALICE]));
    const csv = accountsToCsv(accounts);
    const dataLine = csv.split('\r\n')[1];
    // Should match ISO 8601 pattern
    assert.ok(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/.test(dataLine));
  });
});

describe('accountsToCsv — RFC 4180 quoting', () => {
  it('quotes fields containing a comma', () => {
    const item = makeItem('user,name', null, 1700000001);
    const accounts = parseFollowList(bareArray([item]));
    const csv = accountsToCsv(accounts);
    assert.ok(csv.includes('"user,name"'));
  });

  it('quotes fields containing a double-quote and doubles the quote', () => {
    const item = makeItem('user"name', null, 1700000001);
    const accounts = parseFollowList(bareArray([item]));
    const csv = accountsToCsv(accounts);
    assert.ok(csv.includes('"user""name"'));
  });

  it('quotes fields containing CR', () => {
    const item = makeItem('user\rname', null, 1700000001);
    const accounts = parseFollowList(bareArray([item]));
    const csv = accountsToCsv(accounts);
    assert.ok(csv.includes('"user\rname"'));
  });

  it('quotes fields containing LF', () => {
    const item = makeItem('user\nname', null, 1700000001);
    const accounts = parseFollowList(bareArray([item]));
    const csv = accountsToCsv(accounts);
    assert.ok(csv.includes('"user\nname"'));
  });

  it('does not quote plain alphanumeric usernames', () => {
    const accounts = parseFollowList(bareArray([ALICE]));
    const csv = accountsToCsv(accounts);
    const dataLine = csv.split('\r\n')[1];
    assert.ok(dataLine.startsWith('alice,'));
  });

  it('handles empty accounts array — only header + trailing CRLF', () => {
    const csv = accountsToCsv([]);
    const lines = csv.split('\r\n');
    // BOM+header, empty trailing
    assert.equal(lines.length, 2);
    assert.equal(lines[1], '');
  });

  it('handles unicode usernames without quoting (no special chars)', () => {
    const accounts = parseFollowList(bareArray([DONER]));
    const csv = accountsToCsv(accounts);
    const dataLine = csv.split('\r\n')[1];
    assert.ok(dataLine.startsWith('döner_king,'));
  });
});
