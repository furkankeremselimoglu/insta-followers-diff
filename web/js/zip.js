/**
 * zip.js — browser ZIP handling for gramdiff
 * Imports vendored fflate (MIT) and core/locate.js.
 * Zero network APIs — all data stays in the browser, no outbound requests.
 */
import { unzip } from '../vendor/fflate.js';
import { classifyPaths } from './core/locate.js';

/**
 * extractFollowFiles(bytes: Uint8Array)
 *   → Promise<{ followersTexts: string[], followingTexts: string[], htmlDetected: boolean }>
 *
 * Uses fflate's async unzip with a filter so only matched entries are inflated.
 * A full media export can be gigabytes; the filter ensures photos/videos are
 * never decompressed.
 */
export function extractFollowFiles(bytes) {
  return new Promise((resolve, reject) => {
    // First pass: collect all entry names to classify them.
    // fflate's filter receives (file, info) where file is the entry name string.
    // We need to know which entries to keep, which requires classifyPaths.
    // We do a two-step approach: first list all names (via filter returning false
    // but capturing names), then re-run with a filter that admits only matches.
    //
    // fflate's unzip filter is called once per entry before decompression;
    // returning false skips inflation entirely. We build the allowed-set from
    // classifyPaths so we never decompress non-follow files.

    const allNames = [];

    // Collect names in a cheap synchronous scan of the central directory.
    // fflate doesn't expose a standalone name-list API, so we use a filter
    // that always returns false to collect names without decompressing anything.
    unzip(bytes, { filter(file) { allNames.push(file.name); return false; } }, (err) => {
      if (err) {
        // Some fflate versions call the callback even when filter always returns false.
        // That's fine — we already have the names.
      }

      const classified = classifyPaths(allNames);
      const wantedSet = new Set([
        ...classified.followers,
        ...classified.following,
        ...classified.html,
      ]);

      // Per-bucket rule: flag the HTML export whenever a needed JSON half is
      // missing but HTML follow files are present.
      const htmlDetected = classified.html.length > 0 &&
        (classified.followers.length === 0 || classified.following.length === 0);

      if (wantedSet.size === 0) {
        // No matching files at all — resolve with empty buckets.
        // The caller (app.js) will produce appropriate error messaging.
        resolve({ followersTexts: [], followingTexts: [], htmlDetected });
        return;
      }

      const decoder = new TextDecoder('utf-8');
      const results = {}; // name → text

      unzip(bytes, {
        filter(file) {
          return wantedSet.has(file.name);
        },
      }, (err2, unzipped) => {
        if (err2) {
          reject(new Error('Failed to unzip: ' + err2.message));
          return;
        }

        for (const [name, data] of Object.entries(unzipped)) {
          results[name] = decoder.decode(data);
        }

        // Build ordered text arrays using classified order.
        const followersTexts = classified.followers.map(n => results[n]).filter(t => t != null);
        const followingTexts = classified.following.map(n => results[n]).filter(t => t != null);

        resolve({ followersTexts, followingTexts, htmlDetected });
      });
    });
  });
}
