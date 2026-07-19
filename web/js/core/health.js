/**
 * health.js — incomplete-export detector for Instagram diff results.
 * Pure ES module: no DOM APIs, no Node APIs, importable in both browser and Node.
 *
 * Purpose:
 *   Instagram's data export truncates the FOLLOWERS list to the export's date
 *   range. If the user leaves the date range at something other than "All time",
 *   the followers file contains only recently-added followers while the FOLLOWING
 *   list still comes back complete. The diff then shows a huge, bogus
 *   "not following back" count (people who actually do follow you, but weren't in
 *   the truncated file). This module detects that scenario from the timestamp
 *   signature so the UI can warn the user to re-request with "All time".
 *
 *   NOTE: this is a heuristic, not a certainty — a genuine account that only
 *   started gaining followers long after it began following others can trip it.
 *   The UI therefore words it as a possibility and lets the user dismiss it, and
 *   the message tells the user how to confirm (compare against their real
 *   follower count).
 *
 * Detection (all conditions must hold), comparing the earliest timestamp in each
 * list:
 *   (a) The followers list has >= MIN_FOLLOWERS_TS timestamped entries.
 *   (b) The following list has >= MIN_FOLLOWING_TS timestamped entries (so we're
 *       comparing against an established history, not a tiny/new account).
 *   (c) The followers list's earliest timestamp is more than GAP_SECONDS newer
 *       than the following list's earliest timestamp — i.e. the followers history
 *       appears "clipped" to a recent window while the following history runs deep.
 */

/** Minimum gap (seconds) between earliestFollowing and earliestFollowers to trigger. */
const GAP_SECONDS = 365 * 24 * 60 * 60; // 1 year
/** Followers list must have at least this many timestamped entries. */
const MIN_FOLLOWERS_TS = 5;
/** Following (reference) list must have at least this many timestamped entries. */
const MIN_FOLLOWING_TS = 10;

const DAY = 24 * 60 * 60;

/** Format a Unix-seconds timestamp as an ISO date (YYYY-MM-DD), deterministic across environments. */
export function isoDate(tsSeconds) {
  return new Date(tsSeconds * 1000).toISOString().slice(0, 10);
}

/**
 * @typedef {Object} ExportWarning
 * @property {true}   incomplete        - always true when returned
 * @property {number} earliestFollowers - Unix seconds of the oldest followers entry
 * @property {number} latestFollowers   - Unix seconds of the newest followers entry
 * @property {number} earliestFollowing - Unix seconds of the oldest following entry
 * @property {number} gapDays           - whole-day gap between the two earliest dates
 * @property {number} followersCount    - total followers parsed (including untimestamped)
 * @property {string} summary           - human-readable warning for display
 */

/**
 * Inspect the timestamp spans of the followers and following lists to detect a
 * likely date-range-truncated (incomplete) followers export.
 *
 * @param {Array<{timestamp: number|null}>} followers - parsed followers Account[]
 * @param {Array<{timestamp: number|null}>} following - parsed following Account[]
 * @returns {ExportWarning|null} warning if the export looks incomplete, else null
 */
export function detectIncompleteExport(followers, following) {
  const followerTs = followers.map(a => a.timestamp).filter(t => typeof t === 'number' && t > 0);
  const followingTs = following.map(a => a.timestamp).filter(t => typeof t === 'number' && t > 0);

  // (a) & (b) enough data in each list to judge
  if (followerTs.length < MIN_FOLLOWERS_TS) return null;
  if (followingTs.length < MIN_FOLLOWING_TS) return null;

  const earliestFollowers = Math.min(...followerTs);
  const latestFollowers = Math.max(...followerTs);
  const earliestFollowing = Math.min(...followingTs);

  // (c) followers history is clipped to a window that starts well after the
  // following history began
  if (earliestFollowers - earliestFollowing <= GAP_SECONDS) return null;

  const gapDays = Math.round((earliestFollowers - earliestFollowing) / DAY);

  return {
    incomplete: true,
    earliestFollowers,
    latestFollowers,
    earliestFollowing,
    gapDays,
    followersCount: followers.length,
    summary:
      'Your followers list may be incomplete. It only covers ' +
      isoDate(earliestFollowers) + ' to ' + isoDate(latestFollowers) +
      ', but your following list goes back to ' + isoDate(earliestFollowing) + '. ' +
      'Instagram returns a partial followers list when the export’s date range is not “All time”. ' +
      'If your profile shows more than ' + followers.length + ' followers, re-request your export with the date range set to “All time”.',
  };
}
