/**
 * csv.js — RFC 4180 CSV serialization for Account[].
 * Pure ES module: no DOM APIs, no Node APIs, importable in both browser and Node.
 */

/**
 * Quote a CSV field per RFC 4180 if it contains double-quote, comma, CR, or LF.
 * @param {string} value
 * @returns {string}
 */
function quoteField(value) {
  if (/[",\r\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/**
 * Serialize an array of Account objects to RFC 4180 CSV.
 * - Output starts with UTF-8 BOM ﻿ for Excel unicode compatibility.
 * - Line endings: CRLF (\r\n).
 * - Header: username,profile_url,followed_at
 * - profile_url: href if present, else https://www.instagram.com/<username>/
 * - followed_at: ISO 8601 UTC when timestamp is known, empty otherwise.
 *
 * @param {Account[]} accounts
 * @returns {string}
 */
export function accountsToCsv(accounts) {
  const BOM = '﻿';
  const CRLF = '\r\n';

  const lines = [BOM + 'username,profile_url,followed_at'];

  for (const account of accounts) {
    const username = quoteField(account.username);
    const profileUrl = quoteField(
      account.href && account.href.trim() !== ''
        ? account.href
        : `https://www.instagram.com/${account.username}/`
    );
    const followedAt = account.timestamp !== null
      ? quoteField(new Date(account.timestamp * 1000).toISOString())
      : '';

    lines.push(`${username},${profileUrl},${followedAt}`);
  }

  return lines.join(CRLF) + CRLF;
}
