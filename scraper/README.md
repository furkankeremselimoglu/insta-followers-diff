# insta-followers-diff scraper (opt-in, secondary path)

> **THIS IS NOT THE RECOMMENDED WAY TO USE INSTA-FOLLOWERS-DIFF.**
> See the [web app](../web/index.html) for the safe, privacy-first approach.

---

## WARNING — Read Before You Proceed

```
╔══════════════════════════════════════════════════════════════════════╗
║                      ⚠  SERIOUS RISK ⚠                             ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  Using this scraper VIOLATES Instagram's Terms of Service.          ║
║                                                                      ║
║  By using any third-party client against Instagram's private API    ║
║  you risk:                                                           ║
║    • Temporary rate-limiting or IP block                             ║
║    • Account checkpoint requiring phone/email verification           ║
║    • Permanent suspension or ban of your Instagram account           ║
║                                                                      ║
║  THIS IS NOT THE RECOMMENDED PATH.                                   ║
║  USE AT YOUR OWN RISK.                                               ║
║                                                                      ║
╚══════════════════════════════════════════════════════════════════════╝
```

The scraper exists only for users who are unable to obtain an official
Instagram data export.  For everyone else, the recommended flow takes
about two minutes and carries zero risk:

1. Go to **Meta Accounts Center** → Your information and permissions →
   Download your information → Download or transfer information.
2. Select your Instagram account.
3. Choose **Some of your information** → **Followers and following**.
4. Set format to **JSON** (not HTML) and request the download.
5. Drop the ZIP into the **insta-followers-diff web app** — everything runs in
   your browser, nothing ever leaves your device.

---

## How the scraper works

`scraper.py` uses [instagrapi](https://github.com/adw0rd/instagrapi)
to call Instagram's private mobile API with your credentials, fetch your own
followers and following lists, and write them in the exact JSON format the
insta-followers-diff web app accepts.  You can then drop the output folder or ZIP
straight into the web app.

**Important limitations:**
- Timestamps are set to the time of the API fetch.  Instagram's private API
  does **not** expose the original date you followed someone or they followed
  you.  The "followed at" column in the web app will show the fetch date for
  all rows when using scraper output.
- Only your own account can be queried.  There is no `--target` argument by
  design; misuse to scrape other accounts would be even more harmful.
- Run at most occasionally.  Frequent polling increases ban risk significantly.

---

## Installation

**Python 3.11 or 3.12 is strongly recommended.**  instagrapi may not yet
support Python 3.13+ due to dependency constraints.  If `pip install` fails
on your system Python, use a virtual environment:

```bash
# Create a 3.11 or 3.12 venv (adjust the python binary name as needed)
python3.12 -m venv scraper/.venv
source scraper/.venv/bin/activate   # Windows: scraper\.venv\Scripts\activate

# Install dependencies
pip install -r scraper/requirements.txt
```

---

## Usage

```bash
# Basic — writes to ./insta-followers-diff-export/
python3 scraper/scraper.py

# Custom output directory
python3 scraper/scraper.py --out /tmp/my-export

# Also produce a ZIP you can drag straight into the web app
python3 scraper/scraper.py --zip

# Skip the interactive consent prompt (useful in scripts — still risky)
python3 scraper/scraper.py --yes-i-understand-the-risks

# Help
python3 scraper/scraper.py --help
```

### What happens at runtime

1. A red warning block is printed and you must type `I UNDERSTAND` to continue
   (or pass `--yes-i-understand-the-risks`).
2. You are prompted for your Instagram **username** and **password**
   (password is entered via `getpass` — it is never echoed to the terminal
   and never stored on disk).
3. If Instagram requires 2FA, you will be prompted for your 6-digit
   verification code.
4. On success, the session is saved to `scraper/.session.json` and reused
   on subsequent runs so you don't have to log in every time.
5. Your followers and following lists are fetched (one request each).
6. The output is written to the directory you specified.

### Output layout

```
<out>/
└── connections/
    └── followers_and_following/
        ├── followers_1.json   # bare JSON array — matches web app expectations
        └── following.json     # {"relationships_following": [...]}

<out>/insta-followers-diff-export.zip      # only if --zip was passed
```

Drop either the **folder** or the **ZIP** into the insta-followers-diff web app.

### Session file

`scraper/.session.json` is gitignored and contains session cookies / tokens.
Delete it to force a fresh login.  Never share or commit this file.

---

## Security notes

- Your password is collected via `getpass` and passed directly to instagrapi.
  It is not logged, stored, or transmitted anywhere except to Instagram's
  servers (via instagrapi).
- The session file contains sensitive tokens.  Keep it private.
- The insta-followers-diff web app never contacts Instagram — it works entirely offline.
  The scraper is a separate, opt-in tool.

---

## Running tests

The test suite for `export_writer.py` uses only Python's stdlib and does
**not** require instagrapi to be installed:

```bash
python3 -m unittest discover -s scraper/tests
```
