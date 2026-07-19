#!/usr/bin/env python3
"""
Build test/fixtures/export-modern.zip from test/fixtures/export-modern/
Zips connections/followers_and_following/* with proper entry paths and injects decoys.
"""

import json
import os
import zipfile
from pathlib import Path


def main():
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    fixture_dir = project_root / "test" / "fixtures" / "export-modern"
    connections_dir = fixture_dir / "connections" / "followers_and_following"
    output_zip = project_root / "test" / "fixtures" / "export-modern.zip"

    if not connections_dir.exists():
        raise FileNotFoundError(f"Fixture directory does not exist: {connections_dir}")

    # Create the ZIP file
    with zipfile.ZipFile(output_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        # Add the real JSON files from connections/followers_and_following/
        for json_file in sorted(connections_dir.glob("*.json")):
            entry_path = f"connections/followers_and_following/{json_file.name}"
            zf.write(json_file, arcname=entry_path)

        # Inject decoy: __MACOSX/connections/followers_and_following/._followers_1.json
        # with arbitrary binary content (AppleDouble resource fork stub)
        decoy_bytes = b"\x00\x05\x16\x07"  # minimal AppleDouble header stub
        zf.writestr(
            "__MACOSX/connections/followers_and_following/._followers_1.json",
            decoy_bytes,
        )

        # Inject decoy: following_hashtags.json (valid JSON but should be ignored)
        following_hashtags = [
            {
                "title": "",
                "media_list_data": [],
                "string_list_data": [
                    {
                        "href": "https://www.instagram.com/explore/tags/test/",
                        "value": "test",
                        "timestamp": 1700000000,
                    }
                ],
            }
        ]
        zf.writestr(
            "connections/followers_and_following/following_hashtags.json",
            json.dumps(following_hashtags, indent=2),
        )

    print(f"Created {output_zip}")


if __name__ == "__main__":
    main()
