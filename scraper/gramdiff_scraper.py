#!/usr/bin/env python3
"""
gramdiff_scraper.py — opt-in CLI that fetches your own followers/following
lists via the private Instagram API (instagrapi) and writes output in the
exact format the gramdiff web app accepts.

WARNING — READ BEFORE USE:
  Using third-party clients to access Instagram's private API violates
  Instagram's Terms of Service.  Your account may be rate-limited, locked,
  or permanently banned.  Use at your own risk.  The recommended path is
  the official "Download your information" export via the gramdiff web app.

Usage:
  python3 gramdiff_scraper.py [--out DIR] [--zip] [--yes-i-understand-the-risks]

instagrapi is imported only inside main() so this file and all tests work
without it installed.  If it is missing you will see a friendly hint.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import sys
import time


# ---------------------------------------------------------------------------
# Consent gate
# ---------------------------------------------------------------------------

_WARNING_BLOCK = """
\033[91m╔══════════════════════════════════════════════════════════════╗
║                   ⚠  IMPORTANT WARNING ⚠                    ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Using this scraper VIOLATES Instagram's Terms of Service.   ║
║                                                              ║
║  Risks include:                                              ║
║    • Temporary rate-limiting or IP block                     ║
║    • Account checkpoint / phone-number verification          ║
║    • Permanent account suspension or ban                     ║
║                                                              ║
║  This tool is NOT the recommended path.                      ║
║  The safe, privacy-first alternative:                        ║
║    1. Request "Download your information" from Meta/Instagram ║
║    2. Choose JSON format, select "Followers and following"   ║
║    3. Drop the ZIP into the gramdiff web app                 ║
║                                                              ║
║  If you still want to proceed, type exactly:                 ║
║    I UNDERSTAND                                              ║
╚══════════════════════════════════════════════════════════════╝\033[0m
"""


def require_consent(auto_yes: bool) -> None:
    """Print the warning and require explicit typed consent unless --yes flag given."""
    print(_WARNING_BLOCK, file=sys.stderr)
    if auto_yes:
        print("[consent] --yes-i-understand-the-risks flag accepted.", file=sys.stderr)
        return
    try:
        answer = input("Type 'I UNDERSTAND' to proceed (anything else aborts): ").strip()
    except (EOFError, KeyboardInterrupt):
        print("\nAborted.", file=sys.stderr)
        sys.exit(1)
    if answer != "I UNDERSTAND":
        print("Consent not given — exiting.", file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# Session helpers
# ---------------------------------------------------------------------------

_SESSION_FILE = os.path.join(os.path.dirname(__file__), ".session.json")


def load_session(client) -> bool:
    """Try to load a cached session.  Returns True if loaded successfully."""
    if not os.path.exists(_SESSION_FILE):
        return False
    try:
        client.load_settings(_SESSION_FILE)
        # Verify session is still alive by fetching minimal info
        client.get_timeline_feed()
        print("[session] Reusing saved session.", file=sys.stderr)
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"[session] Saved session invalid ({exc}); will re-login.", file=sys.stderr)
        return False


def save_session(client) -> None:
    """Persist the current session to disk (gitignored)."""
    client.dump_settings(_SESSION_FILE)
    print(f"[session] Session saved to {_SESSION_FILE}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Login with 2FA support
# ---------------------------------------------------------------------------

def login(client, username: str, password: str) -> None:
    """Log in; handle 2FA if Instagram requires it."""
    try:
        client.login(username, password)
    except Exception as exc:
        exc_name = type(exc).__name__
        # instagrapi raises TwoFactorRequired (or similar) for 2FA
        if "TwoFactorRequired" in exc_name or "two_factor" in str(exc).lower():
            print("[2FA] Instagram requires a verification code.", file=sys.stderr)
            try:
                code = input("Enter your 6-digit 2FA code: ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\nAborted.", file=sys.stderr)
                sys.exit(1)
            # instagrapi stores the identifier needed for 2FA verification in
            # the exception or client state; re-login with the code.
            client.login(username, password, verification_code=code)
        else:
            raise


# ---------------------------------------------------------------------------
# User-list conversion
# ---------------------------------------------------------------------------

def _users_to_dicts(users, fetch_time: int) -> list[dict]:
    """
    Convert a list of instagrapi UserShort (or User) objects to the simple
    dicts that export_writer.py expects.

    Note: the private API does NOT expose original follow/follower dates, so
    timestamp is set to the fetch time for all records.
    """
    result = []
    for u in users:
        username = u.username
        result.append(
            {
                "username": username,
                "href": f"https://www.instagram.com/{username}",
                "timestamp": fetch_time,
            }
        )
    return result


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="gramdiff_scraper",
        description=(
            "Fetch your own Instagram followers/following via the private API "
            "and write output in the format the gramdiff web app accepts.\n\n"
            "WARNING: This violates Instagram's ToS.  See scraper/README.md."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "--out",
        default="./gramdiff-export",
        metavar="DIR",
        help="Output directory (default: ./gramdiff-export)",
    )
    p.add_argument(
        "--zip",
        action="store_true",
        dest="make_zip",
        help="Also produce gramdiff-export.zip inside --out",
    )
    p.add_argument(
        "--yes-i-understand-the-risks",
        action="store_true",
        dest="auto_yes",
        help="Skip the interactive consent prompt (for scripted use)",
    )
    return p


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)

    # --- Consent gate (always first) ----------------------------------------
    require_consent(args.auto_yes)

    # --- Import instagrapi only after consent --------------------------------
    try:
        from instagrapi import Client
        from instagrapi.exceptions import TwoFactorRequired  # noqa: F401
    except ImportError:
        print(
            "\n[error] instagrapi is not installed.\n"
            "Install it with:\n"
            "  pip install instagrapi\n"
            "If your Python version is 3.13+ and install fails, use a 3.11/3.12 venv:\n"
            "  python3.12 -m venv .venv && source .venv/bin/activate && pip install instagrapi\n",
            file=sys.stderr,
        )
        sys.exit(2)

    # --- Late import of export_writer (same directory) ----------------------
    # We do this after the instagrapi check so the error message is cleaner.
    sys.path.insert(0, os.path.dirname(__file__))
    from export_writer import write_export  # noqa: PLC0415

    # --- Set up client -------------------------------------------------------
    client = Client()
    client.delay_range = [2, 5]

    # --- Auth ----------------------------------------------------------------
    if not load_session(client):
        try:
            ig_username = input("Instagram username: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nAborted.", file=sys.stderr)
            sys.exit(1)
        password = getpass.getpass("Instagram password: ")
        login(client, ig_username, password)
        save_session(client)

    # --- Fetch own account only ----------------------------------------------
    own_id = client.user_id
    print(f"[fetch] Fetching followers for user ID {own_id} …", file=sys.stderr)
    followers_raw = client.user_followers(own_id, amount=0)  # amount=0 = all
    print(f"[fetch] Fetching following for user ID {own_id} …", file=sys.stderr)
    following_raw = client.user_following(own_id, amount=0)

    fetch_time = int(time.time())
    followers_users = list(followers_raw.values()) if isinstance(followers_raw, dict) else list(followers_raw)
    following_users = list(following_raw.values()) if isinstance(following_raw, dict) else list(following_raw)

    followers_dicts = _users_to_dicts(followers_users, fetch_time)
    following_dicts = _users_to_dicts(following_users, fetch_time)

    print(
        f"[fetch] {len(followers_dicts)} followers, {len(following_dicts)} following.",
        file=sys.stderr,
    )

    # --- Write export --------------------------------------------------------
    written = write_export(
        args.out,
        followers_dicts,
        following_dicts,
        make_zip=args.make_zip,
    )

    print("\n[done] Files written:", file=sys.stderr)
    for name, path in written.items():
        print(f"  {name}: {path}", file=sys.stderr)

    if args.make_zip:
        print(
            f"\nDrop {written.get('gramdiff-export.zip', 'the ZIP')} "
            "into the gramdiff web app to see your results.",
            file=sys.stderr,
        )
    else:
        print(
            f"\nDrop the folder '{args.out}' into the gramdiff web app "
            "to see your results.",
            file=sys.stderr,
        )

    print(
        "\nNote: follow timestamps are set to fetch time — Instagram's private\n"
        "API does not expose original follow/follower dates.",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
