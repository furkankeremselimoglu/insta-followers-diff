"""
test_export_writer.py — stdlib-only unit tests for export_writer.py.

Verifies that the generated JSON payloads exactly match the canonical
Instagram export shape (section 3.2 of the architecture doc) and that
write_export produces the correct file paths and JSON content.

Does NOT import instagrapi — safe to run on a bare Python installation.
"""

import json
import os
import sys
import tempfile
import time
import unittest
import zipfile

# Allow importing export_writer from the parent scraper/ directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from export_writer import (  # noqa: E402
    followers_payload,
    following_payload,
    write_export,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_ALICE = {"username": "alice", "href": "https://www.instagram.com/alice", "timestamp": 1700000001}
_BOB   = {"username": "bob",   "href": "https://www.instagram.com/bob",   "timestamp": 1700000002}
_CAROL = {"username": "carol", "href": "https://www.instagram.com/carol", "timestamp": 1700000003}

# Sentinel for distinguishing "not passed" from "explicitly passed empty list"
_SENTINEL = object()


def _first_sld(item):
    """Return the first string_list_data entry of an item."""
    return item["string_list_data"][0]


# ---------------------------------------------------------------------------
# followers_payload tests
# ---------------------------------------------------------------------------

class TestFollowersPayload(unittest.TestCase):

    def test_returns_bare_list(self):
        result = followers_payload([_ALICE])
        self.assertIsInstance(result, list,
            "followers_payload must return a bare list (modern followers_*.json shape)")

    def test_item_keys(self):
        result = followers_payload([_ALICE])
        item = result[0]
        self.assertIn("title", item)
        self.assertIn("media_list_data", item)
        self.assertIn("string_list_data", item)

    def test_title_is_empty_string(self):
        result = followers_payload([_ALICE])
        self.assertEqual(result[0]["title"], "")

    def test_media_list_data_is_empty_list(self):
        result = followers_payload([_ALICE])
        self.assertEqual(result[0]["media_list_data"], [])

    def test_string_list_data_has_one_entry(self):
        result = followers_payload([_ALICE])
        sld = result[0]["string_list_data"]
        self.assertIsInstance(sld, list)
        self.assertEqual(len(sld), 1)

    def test_string_list_data_keys(self):
        result = followers_payload([_ALICE])
        entry = _first_sld(result[0])
        self.assertIn("href", entry)
        self.assertIn("value", entry)
        self.assertIn("timestamp", entry)

    def test_value_is_username(self):
        result = followers_payload([_ALICE])
        self.assertEqual(_first_sld(result[0])["value"], "alice")

    def test_href_preserved(self):
        result = followers_payload([_ALICE])
        self.assertEqual(_first_sld(result[0])["href"], "https://www.instagram.com/alice")

    def test_timestamp_preserved(self):
        result = followers_payload([_ALICE])
        self.assertEqual(_first_sld(result[0])["timestamp"], 1700000001)

    def test_multiple_users_order_preserved(self):
        result = followers_payload([_ALICE, _BOB, _CAROL])
        self.assertEqual(len(result), 3)
        self.assertEqual(_first_sld(result[0])["value"], "alice")
        self.assertEqual(_first_sld(result[1])["value"], "bob")
        self.assertEqual(_first_sld(result[2])["value"], "carol")

    def test_empty_input_returns_empty_list(self):
        self.assertEqual(followers_payload([]), [])

    def test_default_href_when_missing(self):
        user = {"username": "testuser"}
        result = followers_payload([user])
        entry = _first_sld(result[0])
        self.assertEqual(entry["href"], "https://www.instagram.com/testuser")

    def test_default_timestamp_is_recent_when_missing(self):
        before = int(time.time())
        user = {"username": "testuser"}
        result = followers_payload([user])
        after = int(time.time())
        ts = _first_sld(result[0])["timestamp"]
        self.assertGreaterEqual(ts, before)
        self.assertLessEqual(ts, after)

    def test_timestamp_is_int(self):
        result = followers_payload([_ALICE])
        ts = _first_sld(result[0])["timestamp"]
        self.assertIsInstance(ts, int)

    def test_unicode_username(self):
        user = {"username": "döner_king", "href": "https://www.instagram.com/d%C3%B6ner_king", "timestamp": 1700000004}
        result = followers_payload([user])
        entry = _first_sld(result[0])
        self.assertEqual(entry["value"], "döner_king")
        self.assertEqual(entry["href"], "https://www.instagram.com/d%C3%B6ner_king")


# ---------------------------------------------------------------------------
# following_payload tests
# ---------------------------------------------------------------------------

class TestFollowingPayload(unittest.TestCase):

    def test_returns_dict(self):
        result = following_payload([_ALICE])
        self.assertIsInstance(result, dict,
            "following_payload must return a dict (relationships_following shape)")

    def test_has_relationships_following_key(self):
        result = following_payload([_ALICE])
        self.assertIn("relationships_following", result,
            "following_payload must have 'relationships_following' key")

    def test_relationships_following_is_list(self):
        result = following_payload([_ALICE])
        self.assertIsInstance(result["relationships_following"], list)

    def test_item_shape_matches_canonical(self):
        result = following_payload([_ALICE])
        item = result["relationships_following"][0]
        self.assertEqual(item["title"], "")
        self.assertEqual(item["media_list_data"], [])
        sld = item["string_list_data"]
        self.assertEqual(len(sld), 1)
        self.assertEqual(sld[0]["value"], "alice")
        self.assertEqual(sld[0]["href"], "https://www.instagram.com/alice")
        self.assertEqual(sld[0]["timestamp"], 1700000001)

    def test_multiple_users(self):
        result = following_payload([_ALICE, _BOB])
        items = result["relationships_following"]
        self.assertEqual(len(items), 2)
        self.assertEqual(_first_sld(items[0])["value"], "alice")
        self.assertEqual(_first_sld(items[1])["value"], "bob")

    def test_empty_input(self):
        result = following_payload([])
        self.assertEqual(result, {"relationships_following": []})

    def test_no_extra_top_level_keys(self):
        result = following_payload([_ALICE])
        self.assertEqual(list(result.keys()), ["relationships_following"])


# ---------------------------------------------------------------------------
# write_export tests
# ---------------------------------------------------------------------------

class TestWriteExport(unittest.TestCase):

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()

    def _run(self, followers=_SENTINEL, following=_SENTINEL, make_zip=False):
        return write_export(
            self.tmpdir,
            [_ALICE, _BOB] if followers is _SENTINEL else followers,
            [_ALICE, _CAROL] if following is _SENTINEL else following,
            make_zip=make_zip,
        )

    def test_followers_file_path(self):
        written = self._run()
        expected_sub = os.path.join(
            "connections", "followers_and_following", "followers_1.json"
        )
        self.assertIn("followers_1.json", written)
        self.assertTrue(written["followers_1.json"].endswith(expected_sub))

    def test_following_file_path(self):
        written = self._run()
        expected_sub = os.path.join(
            "connections", "followers_and_following", "following.json"
        )
        self.assertIn("following.json", written)
        self.assertTrue(written["following.json"].endswith(expected_sub))

    def test_followers_json_is_bare_array(self):
        written = self._run()
        with open(written["followers_1.json"], encoding="utf-8") as fh:
            data = json.load(fh)
        self.assertIsInstance(data, list,
            "followers_1.json must be a bare JSON array")

    def test_following_json_has_relationships_key(self):
        written = self._run()
        with open(written["following.json"], encoding="utf-8") as fh:
            data = json.load(fh)
        self.assertIsInstance(data, dict)
        self.assertIn("relationships_following", data)

    def test_followers_content_correct(self):
        written = self._run(followers=[_ALICE, _BOB])
        with open(written["followers_1.json"], encoding="utf-8") as fh:
            data = json.load(fh)
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["string_list_data"][0]["value"], "alice")
        self.assertEqual(data[1]["string_list_data"][0]["value"], "bob")

    def test_following_content_correct(self):
        written = self._run(following=[_ALICE, _CAROL])
        with open(written["following.json"], encoding="utf-8") as fh:
            data = json.load(fh)
        items = data["relationships_following"]
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["string_list_data"][0]["value"], "alice")
        self.assertEqual(items[1]["string_list_data"][0]["value"], "carol")

    def test_directories_created(self):
        written = self._run()
        self.assertTrue(os.path.isfile(written["followers_1.json"]))
        self.assertTrue(os.path.isfile(written["following.json"]))

    def test_no_zip_by_default(self):
        written = self._run(make_zip=False)
        self.assertNotIn("insta-followers-diff-export.zip", written)

    def test_zip_produced_when_requested(self):
        written = self._run(make_zip=True)
        self.assertIn("insta-followers-diff-export.zip", written)
        self.assertTrue(os.path.isfile(written["insta-followers-diff-export.zip"]))

    def test_zip_contains_correct_entries(self):
        written = self._run(make_zip=True)
        with zipfile.ZipFile(written["insta-followers-diff-export.zip"]) as zf:
            names = zf.namelist()
        followers_arc = os.path.join("connections", "followers_and_following", "followers_1.json")
        following_arc = os.path.join("connections", "followers_and_following", "following.json")
        self.assertIn(followers_arc, names)
        self.assertIn(following_arc, names)

    def test_zip_followers_is_bare_array(self):
        written = self._run(make_zip=True)
        with zipfile.ZipFile(written["insta-followers-diff-export.zip"]) as zf:
            arc = os.path.join("connections", "followers_and_following", "followers_1.json")
            data = json.loads(zf.read(arc).decode("utf-8"))
        self.assertIsInstance(data, list)

    def test_zip_following_has_relationships_key(self):
        written = self._run(make_zip=True)
        with zipfile.ZipFile(written["insta-followers-diff-export.zip"]) as zf:
            arc = os.path.join("connections", "followers_and_following", "following.json")
            data = json.loads(zf.read(arc).decode("utf-8"))
        self.assertIn("relationships_following", data)

    def test_written_followers_basename_passes_classifyPaths_regex(self):
        """
        The basename of the written followers file must match
        /^followers(_\\d+)?\\.json$/i  (section 3.3 locate.js rule).
        """
        import re
        written = self._run()
        basename = os.path.basename(written["followers_1.json"])
        pattern = re.compile(r'^followers(_\d+)?\.json$', re.IGNORECASE)
        self.assertRegex(basename, pattern,
            f"'{basename}' does not match the classifyPaths followers regex")

    def test_item_round_trip_canonical_shape(self):
        """
        Full round-trip: write followers, read back, verify every field
        of the canonical shape (title, media_list_data, string_list_data).
        """
        written = self._run(followers=[_ALICE])
        with open(written["followers_1.json"], encoding="utf-8") as fh:
            data = json.load(fh)
        item = data[0]
        self.assertEqual(item["title"], "")
        self.assertEqual(item["media_list_data"], [])
        sld = item["string_list_data"]
        self.assertIsInstance(sld, list)
        self.assertEqual(len(sld), 1)
        entry = sld[0]
        self.assertEqual(entry["value"], "alice")
        self.assertEqual(entry["href"], "https://www.instagram.com/alice")
        self.assertEqual(entry["timestamp"], 1700000001)

    def test_empty_followers_and_following(self):
        written = self._run(followers=[], following=[])
        with open(written["followers_1.json"], encoding="utf-8") as fh:
            f_data = json.load(fh)
        with open(written["following.json"], encoding="utf-8") as fh:
            fo_data = json.load(fh)
        self.assertEqual(f_data, [])
        self.assertEqual(fo_data, {"relationships_following": []})


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    unittest.main()
