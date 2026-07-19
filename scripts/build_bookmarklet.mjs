/**
 * build_bookmarklet.mjs — regenerate the bookmarklet in browser/bookmarklet.md
 * from browser/console-tool.js so the two can never drift apart.
 *
 * The bookmarklet is simply `javascript:` + encodeURIComponent(<full source>).
 * We intentionally do NOT strip comments or minify: encoding the verbatim source
 * keeps the bookmarklet byte-for-byte auditable against console-tool.js (and
 * avoids any risk of a naive minifier corrupting a regex literal or an
 * `https://` inside a string). Modern browsers handle bookmarklets this size.
 *
 * Usage:  node scripts/build_bookmarklet.mjs
 * (Node's built-in APIs only — no dependencies, consistent with the repo.)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = join(repo, 'browser', 'console-tool.js');
const mdPath = join(repo, 'browser', 'bookmarklet.md');

const source = readFileSync(srcPath, 'utf-8');
const bookmarklet = 'javascript:' + encodeURIComponent(source);

const md = readFileSync(mdPath, 'utf-8');

// Replace the first fenced code block whose first line begins with `javascript:`.
const blockRe = /```\r?\njavascript:[\s\S]*?\r?\n```/;
if (!blockRe.test(md)) {
  throw new Error('Could not find the javascript: code block in ' + mdPath);
}
const updated = md.replace(blockRe, '```\n' + bookmarklet + '\n```');

if (updated !== md) {
  writeFileSync(mdPath, updated);
  console.log('Updated bookmarklet (' + bookmarklet.length + ' chars) in browser/bookmarklet.md');
} else {
  console.log('Bookmarklet already up to date (' + bookmarklet.length + ' chars)');
}
