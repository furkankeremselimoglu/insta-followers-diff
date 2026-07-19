/**
 * diff.js — set difference logic for follower/following lists.
 * Pure ES module: no DOM APIs, no Node APIs, importable in both browser and Node.
 */

/**
 * Compute the diff between followers and following lists.
 *
 * @param {Account[]} followers - accounts that follow you
 * @param {Account[]} following - accounts you follow
 * @returns {{
 *   notFollowingBack: Account[],
 *   fans: Account[],
 *   mutuals: Account[],
 *   counts: { followers: number, following: number, notFollowingBack: number, fans: number, mutuals: number }
 * }}
 */
export function computeDiff(followers, following) {
  // Build sets of keys for membership testing
  const followerKeys = new Set(followers.map(a => a.key));
  const followingKeys = new Set(following.map(a => a.key));

  // notFollowingBack: you follow them but they don't follow you back
  // Account objects taken from following list, preserving export order
  const notFollowingBack = following.filter(a => !followerKeys.has(a.key));

  // fans: they follow you but you don't follow them back
  // Account objects taken from followers list
  const fans = followers.filter(a => !followingKeys.has(a.key));

  // mutuals: intersection — in both (from followers list)
  const mutuals = followers.filter(a => followingKeys.has(a.key));

  return {
    notFollowingBack,
    fans,
    mutuals,
    counts: {
      followers: followerKeys.size,
      following: followingKeys.size,
      notFollowingBack: new Set(notFollowingBack.map(a => a.key)).size,
      fans: new Set(fans.map(a => a.key)).size,
      mutuals: new Set(mutuals.map(a => a.key)).size,
    },
  };
}
