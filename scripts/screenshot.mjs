/**
 * screenshot.mjs — optional dev utility, NOT part of the app or test suite.
 *
 * Regenerates:
 *   - docs/screenshot.png       (README screenshot: the real app's landing view —
 *                                drop zone + "How to get your Instagram export" steps)
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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const require = createRequire(join(process.cwd(), 'noop.js'));
const { chromium } = require('playwright');

const repo = resolve(process.argv[2] || '.');
const webDir = join(repo, 'web');
const PORT = 8123;

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

  // 3. README screenshot: the landing view — drop zone + "How to get your
  //    Instagram export" steps — so the hero conveys the export-only flow.
  const page = await browser.newPage({
    viewport: { width: 1160, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForSelector('#drop-zone');
  await page.waitForTimeout(200);
  mkdirSync(join(repo, 'docs'), { recursive: true });
  await page.screenshot({ path: join(repo, 'docs', 'screenshot.png'), fullPage: true });
  console.log('wrote docs/screenshot.png');
} finally {
  await browser.close();
  server.kill();
}
