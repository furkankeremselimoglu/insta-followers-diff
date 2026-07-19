# insta-followers-diff

**Find which Instagram accounts you follow that don't follow you back — entirely in your browser.**

Live: https://furkankeremselimoglu.github.io/insta-followers-diff/

![insta-followers-diff — drop your official Instagram data export and see who doesn't follow you back, all offline in your browser](docs/screenshot.png)

## Privacy

All processing happens in your browser. **Zero network requests.** Your data never leaves your device and works completely offline. This is enforced by a strict Content Security Policy and verified by automated CI checks on every commit.

## How to Use

### 1. Get Your Instagram Export

Follow these steps to download your followers and following list from Instagram:

1. **Open Instagram** → tap the menu icon
2. Go to **Accounts Center** → **Your information and permissions**
3. Select **Download your information**
4. Choose **Customize information** (older UI calls this "Some of your information")
5. Under **Connections**, select **only "Followers and following"** (you can ignore the others)
6. Set date range to **"All time"** — a shorter range silently truncates your followers list and inflates the results
7. **Choose JSON format** (NOT HTML — see warning below)
   - **⚠️ Important:** HTML is Instagram's default format and won't work with this app. If you received HTML files instead, go back and re-request selecting JSON format.
8. Complete the request and wait for the email with your download link (this can take minutes to hours)

### 2. Load Your Data Into insta-followers-diff

Once you have your export:

- **Drag and drop** the ZIP file, or
- **Drag and drop** the extracted `connections/followers_and_following/` folder, or
- **Choose files** and select the JSON files manually

The app will parse your data and show you:

- **Not following you back:** Accounts you follow who don't follow you
- **Fans:** Accounts that follow you who you don't follow back

### 3. Download Results

Switch between the two tabs and download the list as CSV for each group (opens in Excel, Google Sheets, etc.).

Click **"Start over"** at any time to load a different export.

## FAQ

**Is this safe?**  
Yes. You're using your own official Instagram export data — no login, no upload, no third-party involvement. The app runs entirely offline in your browser.

**Why did I get HTML instead of JSON?**  
Instagram defaults to HTML format when you request an export. Go back to Accounts Center, request again, and explicitly select JSON when given the format option.

**What do the timestamps mean?**  
The "followed at" dates come directly from Instagram's export. They represent when you followed that account.

**My ZIP is huge. Why?**  
You probably exported **all your information** instead of just "Followers and following." To speed up processing, go back and request only the "Followers and following" category.

**Some followers are missing / the counts look too low?**  
Instagram returns a **partial followers list** when the export's date range isn't set to **"All time"** — it only includes people who followed you within the selected window, while your following list still comes back complete. This produces a wildly inflated "not following back" count. The app **detects this automatically** (when your followers history starts long after your following history) and shows a warning. The fix: re-request your export and set the date range to **"All time"**. A quick manual check — if the "Followers" number in the app is lower than the count on your Instagram profile, your export is incomplete.

## Why export-only?

This tool **only** works with Instagram's official data export — deliberately. It never logs in, never asks for your password, and never touches Instagram's private API. Third-party tools that fetch your lists by logging in (scrapers, browser scripts, "unfollower" apps) violate Instagram's Terms of Service and carry a real risk of account suspension, rate-limiting, or a security checkpoint. This project takes the zero-risk path only.

## Development

### Test

```bash
npm test
```

Runs the Node.js tests (the core diff logic, parsing, CSV export, ZIP handling). No external dependencies required.

### Philosophy

- **No build step.** The web app is pure HTML + ES modules served as-is.
- **No npm dependencies.** Only the Node test runner; the browser sees a single vendored ZIP library.
- **No framework.** Core logic is testable standalone, shared between browser and Node.

See [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

## License

MIT — See [LICENSE](LICENSE)
