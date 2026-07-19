# Contributing to insta-followers-diff

Thank you for your interest in contributing to insta-followers-diff! This document outlines how to work with the codebase, run tests, and submit pull requests.

## Philosophy

insta-followers-diff is built on three core principles:

1. **No build step** — the web app is plain HTML + ES modules, deployed as-is.
2. **Zero npm dependencies** — `package.json` exists only for `"type": "module"` and test runner configuration.
3. **Privacy-first** — all processing happens in the browser; no network requests. The optional Python CLI is strictly opt-in and prominently warns of ToS and ban risk.

## Running Tests

### JavaScript (browser + Node core logic)

```bash
npm test
```

This runs `node --test 'test/*.test.js'` using Node's built-in test runner (requires Node 21 or newer for glob support; CI runs Node 22). Tests are in `test/core.test.js` (unit) and `test/integration.test.js` (end-to-end), with fixtures in `test/fixtures/`. No test framework required.

### Python (scraper CLI, optional)

```bash
python3 -m unittest discover -s scraper/tests
```

Tests are stdlib `unittest` only — no external dependencies even for testing. Tests for the scraper do not import `instagrapi`, only `export_writer.py` (the pure export serialization layer).

## Project Layout

- **web/** — everything under web/ is served as the deployed site
  - **web/js/core/** — pure, importable modules (browser AND Node)
    - `parse.js` — JSON parsing with shape resolution
    - `locate.js` — file classification by basename regex
    - `diff.js` — set difference logic
    - `csv.js` — CSV serialization with RFC 4180 compliance
  - **web/js/app.js** — browser-only DOM wiring, drag-drop, tabs
  - **web/js/zip.js** — browser ZIP handling with fflate
  - **web/vendor/** — vendored third-party libraries only
    - `fflate.js` — only third-party dependency, MIT, committed as binary
    - `README.md` — version, source URL, sha256 hash, license attribution
  - **web/css/styles.css** — no framework, system font stack, prefers-color-scheme
  - **web/index.html** — single-page app with CSP header enforcing offline operation

- **test/** — test suites and fixtures
  - `core.test.js` — unit tests, inline literals, no fixture I/O
  - `integration.test.js` — fixture-driven end-to-end tests
  - `fixtures/` — canonical test dataset in multiple export formats

- **scraper/** — optional Python CLI (SECONDARY, requires 3.10+)
  - `scraper.py` — main entry point (ToS warning gate, login, fetch)
  - `export_writer.py` — pure; generates export-shaped JSON output
  - `tests/test_export_writer.py` — stdlib unittest; does NOT require instagrapi

- **scripts/** — build and regeneration utilities
  - `build_fixture_zip.py` — stdlib-only; regenerates `test/fixtures/export-modern.zip`

## Vendoring Policy

Only small, well-maintained MIT-licensed libraries may be vendored. Process:

1. Copy the minified or bundled ESM source directly into `web/vendor/`.
2. Add a `web/vendor/README.md` entry with:
   - Library name and version
   - Source URL
   - SHA-256 hash of the source file
   - License (e.g., "MIT")
3. Update this file with notes on why the library was chosen.
4. Test thoroughly — changes to vendored code must be reviewed carefully.

Current vendors: `fflate.js` (ZIP decompression in the browser).

## Fixture Regeneration

If you modify the test dataset schema or add new test cases, regenerate the canonical fixture ZIP:

```bash
python3 scripts/build_fixture_zip.py
```

This script is stdlib-only and rebuilds `test/fixtures/export-modern.zip` from the loose JSON files, ensuring consistency between the fixture dataset and the committed binary.

## Pull Request Expectations

All PRs to `main` must:

1. **Pass all tests** — both JavaScript and Python suites must pass in CI.
2. **Preserve privacy** — no network APIs (fetch, XMLHttpRequest, sendBeacon, WebSocket, EventSource) may be added to `web/js/` or `web/index.html`. CI enforces this with a grep-based check.
3. **Maintain the no-dependency principle** — no npm or pip packages added to the core web app or tests (except stdlib).
4. **Document data format changes** — if you modify the export JSON shape or add a new file classification rule, update the architecture doc comments in the relevant core module.

## Code Review Checklist

- [ ] Tests pass locally (`npm test` + `python3 -m unittest discover -s scraper/tests`)
- [ ] No network APIs in web/js or web/index.html
- [ ] No new npm or pip dependencies added (or justified in PR description)
- [ ] Fixtures and test assertions align (run `python3 scripts/build_fixture_zip.py` if needed)
- [ ] Commit messages are clear and reference the issue (if applicable)

## Getting Help

- Check the [README.md](README.md) for end-user documentation and privacy guarantees.
- The module contracts and parsing rules are documented in the JSDoc headers of `web/js/core/*.js`.
- Open an issue with questions or design feedback.

Thank you for making insta-followers-diff better!
