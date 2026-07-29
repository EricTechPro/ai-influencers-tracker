"""recent.json: vidIQ's outliers, in the shape the web reads."""
from __future__ import annotations

import datetime as dt
import json

from pipeline import build_data, config, util

ROW = {
    "video_id": "IbFaY3xFpZM",
    "title": "I Tested 100+ Hermes Agent Automations. These Are The Best",
    "published_at": "2026-07-23T23:08:15Z",
    "view_count": 36869,
    "duration_s": 1045,
    "type": "long",
    "channel_id": "UCcole",
    "channel_name": "Cole Medin",
    "breakout_score": 9.59,
    "vph": 145.71,
    "engagement_rate": 0.049,
}


def _sweep(ait_root, videos, coverage=None):
    util.write_json(config.synth_dir() / "outliers" / "2026-07-29.json", {
        "date": "2026-07-29",
        "window": "thisMonth",
        "formats": [{
            "content_type": "long",
            "window": "thisMonth",
            "videos": videos,
            "coverage": coverage or {"channels_requested": 3, "batches_ok": 1,
                                     "batches_failed": 0, "missing_channel_ids": []},
            "credits": 5,
        }],
    })


def test_bundle_carries_the_vendor_score_and_names_its_source(ait_root):
    _sweep(ait_root, [ROW])
    build_data.build(dt.date(2026, 7, 29))

    bundle = json.loads((config.db_dir() / "recent.json").read_text())
    assert bundle["source"] == "vidiq"
    assert bundle["trust"]["breakout_score"] == "vendor"
    assert bundle["videos"][0]["breakout_score"] == 9.59
    assert bundle["videos"][0]["pattern_id"] is None


def test_rows_are_sorted_by_breakout_score_descending(ait_root):
    _sweep(ait_root, [
        {**ROW, "video_id": "low", "breakout_score": 2.1},
        {**ROW, "video_id": "high", "breakout_score": 9.5},
        {**ROW, "video_id": "mid", "breakout_score": 4.0},
    ])
    build_data.build(dt.date(2026, 7, 29))

    bundle = json.loads((config.db_dir() / "recent.json").read_text())
    assert [v["video_id"] for v in bundle["videos"]] == ["high", "mid", "low"]


def test_a_failed_batch_reaches_the_bundle_as_coverage(ait_root):
    _sweep(ait_root, [ROW], coverage={"channels_requested": 72, "batches_ok": 2,
                                      "batches_failed": 1,
                                      "missing_channel_ids": ["UCgone"]})
    build_data.build(dt.date(2026, 7, 29))

    bundle = json.loads((config.db_dir() / "recent.json").read_text())
    assert bundle["coverage"]["batches_failed"] == 1
    assert bundle["coverage"]["missing_channel_ids"] == ["UCgone"]


def test_no_sweep_yet_is_an_empty_bundle_that_says_so(ait_root):
    build_data.build(dt.date(2026, 7, 29))

    bundle = json.loads((config.db_dir() / "recent.json").read_text())
    assert bundle["videos"] == []
    assert bundle["fetched_at"] is None


def test_rebuild_is_byte_identical(ait_root):
    _sweep(ait_root, [ROW])
    build_data.build(dt.date(2026, 7, 29))
    first = (config.db_dir() / "recent.json").read_bytes()
    build_data.build(dt.date(2026, 7, 29))
    assert (config.db_dir() / "recent.json").read_bytes() == first


def test_the_feed_obeys_the_exclusions_config(ait_root, write_config):
    """The feed is the first thing /topics shows, and it was the one display surface that never
    imported exclusions: the rule lived at each call site, so a new surface defaulted to wrong."""
    write_config("exclusions.json", {"version": 1, "terms": ["openclaw"], "channels": ["UCdan"]})
    _sweep(ait_root, [
        ROW,
        {**ROW, "video_id": "byterm", "title": "OpenClaw does everything"},
        {**ROW, "video_id": "bychannel", "channel_id": "UCdan", "channel_name": "Dan"},
    ])
    build_data.build(dt.date(2026, 7, 29))

    bundle = json.loads((config.db_dir() / "recent.json").read_text())
    assert [v["video_id"] for v in bundle["videos"]] == ["IbFaY3xFpZM"]


def test_the_grid_thresholds_reach_the_bundle(ait_root):
    """web/ may only read _db/, so a threshold reaches the UI through the bundle or not at all.
    These were literals in the page, which made the config block documentation for a decision it
    did not control."""
    _sweep(ait_root, [ROW])
    build_data.build(dt.date(2026, 7, 29))

    bundle = json.loads((config.db_dir() / "recent.json").read_text())
    assert bundle["display_floor"] == 2.5
    assert bundle["per_channel_cap"] == 2
