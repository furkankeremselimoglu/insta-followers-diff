/**
 * parse.js — Instagram export JSON → Account[]
 * Pure ES module: no DOM APIs, no Node APIs, importable in both browser and Node.
 */

export class ParseError extends Error {
  /**
   * @param {string} message
   * @param {'HTML_FILE'|'INVALID_JSON'|'UNRECOGNIZED_SHAPE'} code
   */
  constructor(message, code) {
    super(message);
    this.name = 'ParseError';
    this.code = code;
  }
}

/**
 * Build an Account from a raw item object.
 * @param {object} item
 * @returns {import('./types.js').Account|null} null if no usable username
 */
function buildAccount(item) {
  if (!item || typeof item !== 'object') return null;

  const sld = item.string_list_data;
  if (!Array.isArray(sld) || sld.length === 0) return null;

  const entry = sld[0];
  if (!entry || typeof entry !== 'object') return null;

  let username = (typeof entry.value === 'string' && entry.value.trim() !== '')
    ? entry.value
    : null;

  let href = (typeof entry.href === 'string' && entry.href.trim() !== '')
    ? entry.href
    : null;

  // Derive username from href if value missing
  if (!username && href) {
    try {
      // Extract last non-empty path segment and decode
      const url = new URL(href);
      const segments = url.pathname.split('/').filter(s => s.length > 0);
      if (segments.length > 0) {
        username = decodeURIComponent(segments[segments.length - 1]);
      }
    } catch {
      // href is not a full URL; try splitting on '/'
      const segments = href.split('/').filter(s => s.length > 0);
      if (segments.length > 0) {
        try {
          username = decodeURIComponent(segments[segments.length - 1]);
        } catch {
          username = segments[segments.length - 1];
        }
      }
    }
  }

  if (!username || username.trim() === '') return null;

  const timestamp = (typeof entry.timestamp === 'number') ? entry.timestamp : null;

  return {
    username,
    key: username.normalize('NFC').toLowerCase(),
    href: href,
    timestamp,
  };
}

/**
 * Parse an Instagram follow-list JSON string into Account[].
 * @param {string} text
 * @returns {Account[]}
 * @throws {ParseError}
 */
export function parseFollowList(text) {
  // Strip leading BOM and whitespace
  let t = text.replace(/^﻿/, '').trimStart();

  if (t.startsWith('<')) {
    throw new ParseError(
      'Input appears to be an HTML file. Re-request your data export in JSON format.',
      'HTML_FILE'
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(t);
  } catch (e) {
    throw new ParseError(`JSON parse failed: ${e.message}`, 'INVALID_JSON');
  }

  let items;

  if (Array.isArray(parsed)) {
    // Shape (1): bare array
    items = parsed;
  } else if (parsed && typeof parsed === 'object') {
    // Shape (2): known relationship keys
    if (Array.isArray(parsed.relationships_followers)) {
      items = parsed.relationships_followers;
    } else if (Array.isArray(parsed.relationships_following)) {
      items = parsed.relationships_following;
    } else {
      // Shape (3): first own enumerable key whose value is an array
      const firstArrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
      if (firstArrayKey !== undefined) {
        items = parsed[firstArrayKey];
      } else {
        // Shape (4): unrecognized
        throw new ParseError(
          'Unrecognized JSON shape: expected a bare array or an object with a known relationship key.',
          'UNRECOGNIZED_SHAPE'
        );
      }
    }
  } else {
    throw new ParseError(
      'Unrecognized JSON shape: not an array or object.',
      'UNRECOGNIZED_SHAPE'
    );
  }

  const accounts = [];
  for (const item of items) {
    const account = buildAccount(item);
    if (account !== null) {
      accounts.push(account);
    }
  }

  return accounts;
}

/**
 * Merge multiple Account arrays, deduplicating by key.
 * First occurrence wins for username/href; keep the smaller non-null timestamp.
 * @param {...Account[]} lists
 * @returns {Account[]}
 */
export function mergeAccounts(...lists) {
  const seen = new Map(); // key → Account
  for (const list of lists) {
    for (const account of list) {
      if (seen.has(account.key)) {
        // Update timestamp to the smaller non-null one
        const existing = seen.get(account.key);
        if (account.timestamp !== null) {
          if (existing.timestamp === null || account.timestamp < existing.timestamp) {
            existing.timestamp = account.timestamp;
          }
        }
      } else {
        // Clone to avoid mutating the original
        seen.set(account.key, { ...account });
      }
    }
  }
  return Array.from(seen.values());
}
