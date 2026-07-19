/**
 * locate.js — classify ZIP/folder entry paths into followers/following/html buckets.
 * Pure ES module: no DOM APIs, no Node APIs, importable in both browser and Node.
 */

const FOLLOWERS_RE = /^followers(_\d+)?\.json$/i;
const FOLLOWING_RE = /^following(_\d+)?\.json$/i;
const HTML_RE = /^(followers|following)(_\d+)?\.html$/i;

/**
 * Extract numeric part suffix from a basename, for numeric sorting.
 * Unsuffixed = part 0.
 * @param {string} basename
 * @returns {number}
 */
function partNumber(basename) {
  const m = basename.match(/_(\d+)\.[^.]+$/i);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Classify an array of file paths into followers/following/html buckets.
 * Classification is by basename only; directory paths are irrelevant.
 * Excludes paths containing '__MACOSX/' and basenames starting with '.'.
 *
 * @param {string[]} paths
 * @returns {{ followers: string[], following: string[], html: string[] }}
 */
export function classifyPaths(paths) {
  const followers = [];
  const following = [];
  const html = [];

  for (const p of paths) {
    // Exclude macOS metadata entries
    if (p.includes('__MACOSX/')) continue;

    // Get basename (last segment after '/')
    const basename = p.split('/').pop() ?? p;

    // Exclude hidden/AppleDouble files
    if (basename.startsWith('.')) continue;

    if (FOLLOWERS_RE.test(basename)) {
      followers.push(p);
    } else if (FOLLOWING_RE.test(basename)) {
      following.push(p);
    } else if (HTML_RE.test(basename)) {
      html.push(p);
    }
  }

  // Sort each bucket numerically by part number
  const sortByPart = (a, b) => {
    const ba = a.split('/').pop() ?? a;
    const bb = b.split('/').pop() ?? b;
    return partNumber(ba) - partNumber(bb);
  };

  followers.sort(sortByPart);
  following.sort(sortByPart);
  html.sort(sortByPart);

  return { followers, following, html };
}
