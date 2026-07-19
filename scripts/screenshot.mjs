/**
 * screenshot.mjs — optional dev utility, NOT part of the app or test suite.
 *
 * Regenerates:
 *   - docs/screenshot.png       (README screenshot: real app loaded with generated
 *                                demo data at realistic scale — ~1.3k accounts)
 *   - web/apple-touch-icon.png  (180x180 raster of web/favicon.svg)
 *   - web/social-preview.png    (1280x640 OpenGraph image; also upload it manually
 *                                in GitHub repo Settings -> Social preview)
 *
 * Requires Playwright, which is deliberately not a dependency of this repo:
 *   TMP=$(mktemp -d) && cd "$TMP" && npm i playwright && npx playwright install chromium
 *   cd "$TMP" && node /path/to/insta-followers-diff/scripts/screenshot.mjs /path/to/insta-followers-diff
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';

const require = createRequire(join(process.cwd(), 'noop.js'));
const { chromium } = require('playwright');

const repo = resolve(process.argv[2] || '.');
const webDir = join(repo, 'web');
const PORT = 8123;

// ─── Demo dataset (seeded so the screenshot is reproducible) ─────────────────
// Realistic scale: following 1,344 / followers 1,208 / not following back 347 /
// fans 211 / mutuals 997. Usernames are synthetic — no real accounts.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260719);
const FIRST = ['luna', 'milo', 'nova', 'kai', 'aria', 'leo', 'maya', 'finn', 'zoe', 'theo',
  'isla', 'ezra', 'ruby', 'axel', 'cleo', 'otis', 'vera', 'nico', 'iris', 'remy',
  'sofia', 'emir', 'lara', 'deniz', 'elif', 'mert', 'sena', 'arda', 'ada', 'can'];
const SECOND = ['bakes', 'travels', 'fit', 'art', 'vlogs', 'codes', 'snaps', 'runs', 'reads',
  'cooks', 'shoots', 'draws', 'lifts', 'rides', 'hikes', 'plays', 'writes', 'styles',
  'designs', 'games'];
const used = new Set();
function genUsername() {
  for (;;) {
    const a = FIRST[Math.floor(rand() * FIRST.length)];
    const b = SECOND[Math.floor(rand() * SECOND.length)];
    const joiner = ['.', '_', ''][Math.floor(rand() * 3)];
    const num = rand() < 0.35 ? String(Math.floor(rand() * 99) + 1) : '';
    const u = a + joiner + b + num;
    if (!used.has(u)) { used.add(u); return u; }
  }
}
const ts = () => 1450000000 + Math.floor(rand() * 330000000); // ~2016-2026
const item = u => ({
  title: '',
  media_list_data: [],
  string_list_data: [{ href: `https://www.instagram.com/${u}`, value: u, timestamp: ts() }],
});
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const mutuals = Array.from({ length: 997 }, genUsername);
const nfb = Array.from({ length: 347 }, genUsername);   // in following only
const fans = Array.from({ length: 211 }, genUsername);  // in followers only

const followers = shuffle([...mutuals, ...fans]).map(item);
const following = shuffle([...mutuals, ...nfb]).map(item);

const demoDir = mkdtempSync(join(tmpdir(), 'ifd-demo-'));
writeFileSync(join(demoDir, 'followers_1.json'), JSON.stringify(followers.slice(0, 800), null, 1));
writeFileSync(join(demoDir, 'followers_2.json'), JSON.stringify(followers.slice(800), null, 1));
writeFileSync(join(demoDir, 'following.json'),
  JSON.stringify({ relationships_following: following }, null, 1));

// ─── Static server (python3 stdlib — same server used for local dev) ─────────
const server = spawn('python3', ['-m', 'http.server', String(PORT), '-d', webDir], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));

const browser = await chromium.launch();
try {
  const svg = readFileSync(join(webDir, 'favicon.svg'), 'utf-8');

  // 1. apple-touch-icon.png from favicon.svg
  const iconPage = await browser.newPage({ viewport: { width: 180, height: 180 } });
  await iconPage.setContent(
    `<body style="margin:0">${svg.replace('<svg ', '<svg width="180" height="180" ')}</body>`
  );
  writeFileSync(join(webDir, 'apple-touch-icon.png'),
    await iconPage.locator('svg').screenshot({ omitBackground: true }));
  console.log('wrote web/apple-touch-icon.png');

  // 2. social-preview.png (1280x640 OpenGraph card)
  const ogPage = await browser.newPage({ viewport: { width: 1280, height: 640 } });
  await ogPage.setContent(`<!DOCTYPE html><html><body style="margin:0">
    <div style="width:1280px;height:640px;display:flex;flex-direction:column;align-items:center;
      justify-content:center;gap:26px;box-sizing:border-box;
      background:linear-gradient(45deg,#6228d7 0%,#ee2a7b 55%,#f9ce34 115%);
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <div style="width:120px;height:120px;filter:drop-shadow(0 6px 18px rgba(0,0,0,.25))">
        ${svg.replace('<svg ', '<svg width="120" height="120" ')}
      </div>
      <div style="font-size:76px;font-weight:800;color:#fff;letter-spacing:-2px;
        text-shadow:0 2px 12px rgba(0,0,0,.2)">insta-followers-diff</div>
      <div style="font-size:34px;font-weight:500;color:rgba(255,255,255,.95)">
        Find who doesn&#8217;t follow you back on Instagram</div>
      <div style="font-size:24px;font-weight:600;color:#fff;background:rgba(0,0,0,.28);
        border-radius:999px;padding:12px 34px">
        &#128274; Export-only &middot; no login &middot; no upload &middot; no ban risk</div>
    </div></body></html>`);
  writeFileSync(join(webDir, 'social-preview.png'), await ogPage.screenshot());
  console.log('wrote web/social-preview.png');

  // 3. README screenshot: load demo data through the real file-input flow
  const page = await browser.newPage({
    viewport: { width: 1160, height: 780 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.setInputFiles('#file-input', [
    join(demoDir, 'followers_1.json'),
    join(demoDir, 'followers_2.json'),
    join(demoDir, 'following.json'),
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
