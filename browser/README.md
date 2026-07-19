# insta-followers-diff — in-browser tool (opt-in, secondary path)

> **THIS IS NOT THE RECOMMENDED WAY TO USE INSTA-FOLLOWERS-DIFF.**
> See the [web app](../web/index.html) for the safe, privacy-first, zero-risk approach.

---

## WARNING — Read Before You Proceed

```
╔══════════════════════════════════════════════════════════════════════╗
║                      ⚠  SERIOUS RISK ⚠                             ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  Using this in-browser tool VIOLATES Instagram's Terms of Service.  ║
║                                                                      ║
║  By making requests against Instagram's private API from your       ║
║  logged-in session you risk:                                         ║
║    • Temporary rate-limiting or IP block                             ║
║    • Account checkpoint requiring phone/email verification           ║
║    • Permanent suspension or ban of your Instagram account           ║
║                                                                      ║
║  THIS IS NOT THE RECOMMENDED PATH.                                   ║
║  USE AT YOUR OWN RISK.                                               ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

The in-browser tool exists only for users who cannot wait for an official
Instagram data export or want an immediate check. For everyone else, the
recommended flow takes about two minutes and carries zero risk:

1. Go to **Meta Accounts Center** → Your information and permissions →
   Download your information → Download or transfer information.
2. Select your Instagram account.
3. Choose **Some of your information** → **Followers and following**.
4. Set format to **JSON** (not HTML) and request the download.
5. Drop the ZIP into the **insta-followers-diff web app** — everything runs in
   your browser, nothing ever leaves your device.

---

## What it does

`console-tool.js` runs entirely inside your own logged-in Instagram tab:

- Fetches **only your own** followers and following lists via Instagram's
  same-origin web API, using your existing session cookie. No credentials are
  entered or stored.
- Computes the diff **locally in your browser** — who doesn't follow you back
  (accounts you follow who don't follow you), your fans (accounts who follow you
  that you don't follow back), and mutuals.
- Displays results in a floating panel with live progress, a count summary,
  and a scrollable list you can toggle between "Not following you back" and
  "Fans".
- Optionally downloads `followers_1.json` and `following.json` in the exact
  format accepted by the [insta-followers-diff web app](../web/index.html) — so
  you can drop the two files straight in for further analysis.

**Own-account-only by design.** The tool reads your user id from the
`ds_user_id` cookie that Instagram sets at login. There is no `--target`
option; fetching another account's lists is not supported by design.

**Nothing is sent to any third party.** All outbound requests are same-origin
calls to `www.instagram.com` — the same API calls Instagram's own UI makes.
Results are computed in memory and never leave your machine unless you
explicitly click "Download export files".

---

## Exact usage (console paste — primary, recommended path)

1. Open `https://www.instagram.com` in a desktop browser and make sure you are
   logged in.
2. Open DevTools → Console:
   - Chrome / Edge: `F12` then click **Console**, or `Ctrl+Shift+J` (Windows/Linux) / `Cmd+Opt+J` (Mac)
   - Firefox: `F12` then click **Console**, or `Ctrl+Shift+K` (Windows/Linux) / `Cmd+Opt+K` (Mac)
   - Safari: enable Developer menu → Develop → Show JavaScript Console
3. Open `browser/console-tool.js` in a text editor (or on GitHub), select all,
   copy.
4. Paste the entire contents into the console and press **Enter**.
5. Read the consent warning that appears; click **OK** to proceed or **Cancel**
   to abort. No network requests are made until you click OK.
6. Watch the panel in the top-right corner: it fetches your following list first,
   then your followers list, showing a live count as pages arrive.
7. When complete, review the **Not following you back** list (default) and toggle
   to **Fans** if you want.
8. Optional: click **Download export files** in the panel footer. Your browser
   will download `followers_1.json` then `following.json`. Both files can then be
   selected together in the [web app](../web/index.html) file picker for further
   analysis.

### Bookmarklet alternative

If you prefer a one-click shortcut, see [bookmarklet.md](bookmarklet.md) for a
pre-minified version you can save as a browser bookmark and click while on
`www.instagram.com`. The console-paste path is recommended as primary because it
lets you read the full source before running.

---

## Privacy

- Everything is computed locally in your browser using your own logged-in session.
- The only network requests made are same-origin `GET` calls to
  `www.instagram.com` — no different from what Instagram's own UI does.
- Nothing is sent to any third-party server, analytics endpoint, or external URL.
- The two downloaded JSON files are local files on your machine; they are only
  uploaded to the web app if you choose to drag them in (and the web app itself
  makes zero network requests — it processes everything offline).

---

## Rate-limit guidance

The tool uses gentle defaults:

- **Page size:** 50 accounts per request (a gentle default the tool sets, not an API hard limit).
- **Delay between pages:** randomized 1.2–2.5 seconds.
- **No retries:** if Instagram returns HTTP 429 (rate limited), the tool stops
  immediately and shows a warning. It does not retry.
- **Page cap:** 400 pages maximum (20,000 accounts) per list, as a runaway guard.

Large accounts (10,000+ followers or following) will legitimately take several
minutes. If Instagram throttles the request mid-fetch, stop, close the panel,
and wait at least 10–15 minutes before trying again. Run this at most
occasionally — frequent use significantly increases the risk of an account
checkpoint or suspension.

---

## Timestamp caveat

Instagram's web API does **not** expose the original date you followed someone
or they followed you. Timestamps in the exported `followers_1.json` and
`following.json` files are set to the time of the fetch (capture time), just
as the optional scraper tool does. The "followed at" column in the web app will
show the fetch date for all rows, not the real follow date. The in-browser panel
itself does not display dates at all.

---

## Troubleshooting

**"Not logged in" banner appears**
: Log out of Instagram, log back in, refresh the page, then paste the script
  again. Make sure you are on `www.instagram.com` (not the mobile site or a
  redirect).

**HTTP 429 / "Rate limited" banner**
: Instagram throttled the request. Stop using the tool immediately. Wait at least
  10–15 minutes before trying again. If you see this frequently, consider using
  the official data export instead.

**Private account / blocked / checkpoint**
: If Instagram shows a checkpoint (verification required), complete the
  verification in the browser tab first. Do not run the tool again until the
  checkpoint is resolved. Repeated triggering of checkpoints can lead to
  suspension.

**Nothing appears / panel does not show**
: Confirm you are on `www.instagram.com` and pasted the entire contents of
  `console-tool.js` (not just part of it). Check the console for any
  JavaScript errors.

**CSP errors in the console**
: Some CSP-related warnings may appear in the console — these are expected and
  harmless. The tool is built to avoid all CSP-blocked patterns (`innerHTML`,
  inline styles, `eval`, external scripts). If you see a hard error about script
  execution being blocked, try a different browser.

**"Partial results" warning**
: The page cap (400 pages) was hit before all accounts were fetched. The diff
  shown may be incomplete. For very large accounts, consider using the official
  export instead.
