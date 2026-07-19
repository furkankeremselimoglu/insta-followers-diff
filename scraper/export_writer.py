"""
export_writer.py — pure, stdlib-only module.

Produces Instagram export-shaped JSON payloads from lists of user dicts
and writes them to disk in the layout the gramdiff web app accepts:

  <out>/connections/followers_and_following/followers_1.json
  <out>/connections/followers_and_following/following.json

Optionally also packs them into a ZIP archive.

No third-party packages required.
"""

from __future__ import annotations

import json
import os
import time
import zipfile
from typing import Any


# ---------------------------------------------------------------------------
# Payload builders
# ---------------------------------------------------------------------------

def _make_item(username: str, href: str, timestamp: int) -> dict[str, Any]:
    """Build one canonical item in the Instagram export shape (section 3.2)."""
    return {
        "title": "",
        "media_list_data": [],
        "string_list_data": [
            {
                "href": href,
                "value": username,
                "timestamp": timestamp,
            }
        ],
    }


def followers_payload(users: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Build a followers payload (bare JSON array — the modern shape for followers_*.json).

    Each user dict must have at least a 'username' key.  Optional keys:
      href      — full profile URL (defaults to https://www.instagram.com/<username>)
      timestamp — Unix epoch int (defaults to int(time.time()))
    """
    now = int(time.time())
    items = []
    for u in users:
        username = u["username"]
        href = u.get("href") or f"https://www.instagram.com/{username}"
        ts = u.get("timestamp") if u.get("timestamp") is not None else now
        items.append(_make_item(username, href, int(ts)))
    return items


def following_payload(users: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """
    Build a following payload (object with 'relationships_following' key —
    the shape for following.json, per section 3.2).

    Each user dict must have at least a 'username' key.  Optional keys: same as above.
    """
    now = int(time.time())
    items = []
    for u in users:
        username = u["username"]
        href = u.get("href") or f"https://www.instagram.com/{username}"
        ts = u.get("timestamp") if u.get("timestamp") is not None else now
        items.append(_make_item(username, href, int(ts)))
    return {"relationships_following": items}


# ---------------------------------------------------------------------------
# File writer
# ---------------------------------------------------------------------------

_SUBDIR = os.path.join("connections", "followers_and_following")


def write_export(
    out_dir: str,
    followers: list[dict[str, Any]],
    following: list[dict[str, Any]],
    *,
    make_zip: bool = False,
) -> dict[str, str]:
    """
    Write followers_1.json and following.json into:
      <out_dir>/connections/followers_and_following/

    If make_zip is True, also produces <out_dir>/gramdiff-export.zip
    containing both files at the same internal paths.

    Returns a dict of { logical_name: absolute_path } for all files written.
    """
    target_dir = os.path.join(out_dir, _SUBDIR)
    os.makedirs(target_dir, exist_ok=True)

    followers_path = os.path.join(target_dir, "followers_1.json")
    following_path = os.path.join(target_dir, "following.json")

    followers_data = followers_payload(followers)
    following_data = following_payload(following)

    with open(followers_path, "w", encoding="utf-8") as fh:
        json.dump(followers_data, fh, ensure_ascii=False, indent=2)

    with open(following_path, "w", encoding="utf-8") as fh:
        json.dump(following_data, fh, ensure_ascii=False, indent=2)

    written = {
        "followers_1.json": os.path.abspath(followers_path),
        "following.json": os.path.abspath(following_path),
    }

    if make_zip:
        zip_path = os.path.join(out_dir, "gramdiff-export.zip")
        followers_arc = os.path.join(_SUBDIR, "followers_1.json")
        following_arc = os.path.join(_SUBDIR, "following.json")
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.write(followers_path, arcname=followers_arc)
            zf.write(following_path, arcname=following_arc)
        written["gramdiff-export.zip"] = os.path.abspath(zip_path)

    return written
