/**
 * screenshot.mjs — optional dev utility, NOT part of the app or test suite.
 *
 * Regenerates:
 *   - docs/screenshot.png       (README screenshot: real app loaded with test fixtures)
 *   - web/apple-touch-icon.png  (180x180 raster of web/favicon.svg)
 *
 * Requires Playwright, which is deliberately not a dependency of this repo:
 *   TMP=$(mktemp -d) && cd "$TMP" && npm i playwright && npx playwright install chromium
 *   node "$TMP/node_modules/.bin/../.." # then run from the temp dir:
 *   node /path/to/gramdiff/scripts/screenshot.mjs /path/to/gramdiff
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const require = createRequire(join(process.cwd(), 'noop.js'));
const { chromium } = require('playwright');

const repo = resolve(process.argv[2] || '.');
const webDir = join(repo, 'web');
const PORT = 8123;

// Static server (python3 stdlib — same server used for local dev).
const server = spawn('python3', ['-m', 'http.server', String(PORT), '-d', webDir], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));

const browser = await chromium.launch();
try {
  // 1. apple-touch-icon.png from favicon.svg
  const iconPage = await browser.newPage({ viewport: { width: 180, height: 180 } });
  const svg = readFileSync(join(webDir, 'favicon.svg'), 'utf-8');
  await iconPage.setContent(
    `<body style="margin:0">${svg.replace('<svg ', '<svg width="180" height="180" ')}</body>`
  );
  writeFileSync(join(webDir, 'apple-touch-icon.png'),
    await iconPage.locator('svg').screenshot({ omitBackground: true }));
  console.log('wrote web/apple-touch-icon.png');

  // 2. README screenshot: load fixtures through the real file-input flow
  const page = await browser.newPage({
    viewport: { width: 1160, height: 780 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  const fx = join(repo, 'test/fixtures/export-modern/connections/followers_and_following');
  await page.setInputFiles('#file-input', [
    join(fx, 'followers_1.json'),
    join(fx, 'followers_2.json'),
    join(fx, 'following.json'),
  ]);
  await page.waitForSelector('#results-section:not([hidden])');
  await page.waitForTimeout(300);
  mkdirSync(join(repo, 'docs'), { recursive: true });
  await page.screenshot({ path: join(repo, 'docs', 'screenshot.png') });
  console.log('wrote docs/screenshot.png');
} finally {
  await browser.close();
  server.kill();
}
