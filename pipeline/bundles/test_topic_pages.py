"""Shelves: what counts as being about a topic, how far back the cards reach, and what is off
the board entirely."""
from __future__ import annotations

import datetime as dt
import json

from pipeline import build_data, config, snapshot, util

TODAY = dt.date(2026, 7, 29)


def _video(vid, title, channel="UCcole", days_ago=1, tags=(), description=""):
    published = dt.datetime(2026, 7, 29, tzinfo=dt.UTC) - dt.timedelta(days=days_ago)
    return {"id": vid,
            "snippet": {"title": title, "description": description, "tags": list(tags),
                        "channelId": channel, "publishedAt": util.iso_z(published)},
            "contentDetails": {"duration": "PT10M"}, "statistics": {"viewCount": "1000"}}


def _seed(videos):
    by_channel: dict[str, list] = {}
    for v in videos:
        by_channel.setdefault(v["snippet"]["channelId"], []).append(v)
    for channel_id, rows in by_channel.items():
        snapshot.record_video_metadata(channel_id, rows)


def _leaf(topic_id):
    bundle = json.loads((config.db_dir() / "topic_pages.json").read_text())
    return next((t for t in bundle["topics"] if t["topic_id"] == topic_id), None)


def test_a_tags_only_hit_is_not_membership(ait_root):
    """The bug this floor exists for: creators stuff "claude code vs cursor" into the tags of
    every upload, so a tags hit put a UI-design tutorial on the comparison shelf beside real
    comparisons. Tags are 0.45 and titles are 0.6; membership is drawn at the title."""
    _seed([_video("tagged", "Turn Claude Code into your own UI designer",
                  tags=["mcp", "model context protocol"]),
           _video("titled", "Wiring MCP servers into Claude Code", channel="UCdan")])
    build_data.build(TODAY)

    leaf = _leaf("claude-code-mcp-setup")
    assert leaf["video_ids"] == ["titled"]


def test_shelf_cards_reach_back_only_the_shelf_window(ait_root):
    """The shelf answers "what is being made now". A 793-day-old video is corpus, not news, and
    it was outranking this month's uploads because it had had two years to accumulate views."""
    _seed([_video("fresh", "Wiring MCP servers into Claude Code", days_ago=5),
           _video("stale", "Wiring MCP servers into Claude Code", channel="UCdan", days_ago=400)])
    build_data.build(TODAY)

    leaf = _leaf("claude-code-mcp-setup")
    assert leaf["recent_video_ids"] == ["fresh"]
    # The all-time membership is untouched: the window is a display rule, not a deletion.
    assert sorted(leaf["video_ids"]) == ["fresh", "stale"]
    assert leaf["video_count"] == 2


def test_an_excluded_topic_leaves_the_bundle_entirely(ait_root, write_config):
    write_config("exclusions.json", {"version": 1, "topics": ["claude-code-mcp-setup"]})
    _seed([_video("v1", "Wiring MCP servers into Claude Code")])
    build_data.build(TODAY)

    assert _leaf("claude-code-mcp-setup") is None


def test_an_excluded_term_drops_the_video_from_the_shelf_and_its_counts(ait_root, write_config):
    write_config("exclusions.json", {"version": 1, "terms": ["openclaw"]})
    _seed([_video("keep", "Wiring MCP servers into Claude Code"),
           _video("drop", "OpenClaw does MCP too", channel="UCdan")])
    build_data.build(TODAY)

    leaf = _leaf("claude-code-mcp-setup")
    assert leaf["video_ids"] == ["keep"]
    assert leaf["video_count"] == 1


def test_the_shrinkage_is_reported_rather_than_silent(ait_root, write_config):
    """A page that quietly got smaller is the failure mode. meta says how much was withheld."""
    write_config("exclusions.json",
                 {"version": 1, "topics": ["claude-code-subagents"], "terms": ["openclaw"]})
    _seed([_video("keep", "Wiring MCP servers into Claude Code"),
           _video("drop", "OpenClaw does MCP too", channel="UCdan")])
    build_data.build(TODAY)

    meta = json.loads((config.db_dir() / "meta.json").read_text())
    assert meta["exclusions"]["topics"] == 1
    assert meta["exclusions"]["videos"] == 1
