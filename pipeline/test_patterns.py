"""Pattern rows: an inference label, a derived leaf match, and the action that follows."""
from __future__ import annotations

from pipeline import patterns, topics

VIDEOS = {
    "v1": {"video_id": "v1", "title": "Wiring MCP servers into Claude Code",
           "channel_id": "UCa"},
    "v2": {"video_id": "v2", "title": "My .mcp.json setup", "channel_id": "UCb"},
    "v3": {"video_id": "v3", "title": "claude mcp add walkthrough", "channel_id": "UCc"},
    "v4": {"video_id": "v4", "title": "Opus 5 just dropped", "channel_id": "UCa"},
    "v5": {"video_id": "v5", "title": "Fable 5 first look", "channel_id": "UCb"},
}


def test_a_group_matching_an_existing_leaf_is_add_to_leaf(ait_root):
    index = topics.load()
    row = patterns.resolve(
        {"pattern_id": "p1", "label": "MCP setup walkthroughs",
         "evidence": ["v1", "v2", "v3"]},
        VIDEOS, index, min_creators=3)
    assert row["existing_leaf"] == "claude-code-mcp-setup"
    assert row["action"] == "add_to_leaf"
    assert row["creator_count"] == 3


def test_the_leaf_floor_does_not_apply_to_an_existing_leaf(ait_root):
    index = topics.load()
    row = patterns.resolve(
        {"pattern_id": "p1", "label": "MCP setup", "evidence": ["v1", "v2"]},
        VIDEOS, index, min_creators=3)
    assert row["creator_count"] == 2
    assert row["action"] == "add_to_leaf"


def test_three_creators_and_no_leaf_is_promote(ait_root):
    index = topics.load()
    videos = {**VIDEOS, "v6": {"video_id": "v6", "title": "Nothing matches this",
                               "channel_id": "UCd"}}
    row = patterns.resolve(
        {"pattern_id": "p2", "label": "Unmatched thing",
         "evidence": ["v6", "v6b", "v6c"]},
        {**videos,
         "v6b": {"video_id": "v6b", "title": "Also unmatched", "channel_id": "UCe"},
         "v6c": {"video_id": "v6c", "title": "Still unmatched", "channel_id": "UCf"}},
        index, min_creators=3)
    assert row["existing_leaf"] is None
    assert row["action"] == "promote"


def test_too_few_creators_and_no_leaf_is_below_floor(ait_root):
    """Deliberately not v4/v5: those titles carry "just dropped" and "first look", which are
    aliases of the frontier-model-launches leaf, so they resolve to add_to_leaf however few
    creators they have. Below-floor needs a group that matches no leaf at all."""
    index = topics.load()
    videos = {"v7": {"video_id": "v7", "title": "Two channels only A", "channel_id": "UCa"},
              "v8": {"video_id": "v8", "title": "Two channels only B", "channel_id": "UCb"}}
    row = patterns.resolve(
        {"pattern_id": "p3", "label": "Two channels only",
         "evidence": ["v7", "v8"]},
        videos, index, min_creators=3)
    assert row["existing_leaf"] is None
    assert row["creator_count"] == 2
    assert row["action"] == "below_floor"


def test_a_leaf_match_beats_the_creator_floor_in_both_directions(ait_root):
    """The floor gates promote, never add_to_leaf: that topic cleared the floor when a human
    authored it, and a second week of coverage is the existing decision heating up."""
    index = topics.load()
    row = patterns.resolve(
        {"pattern_id": "p5", "label": "Model launches", "evidence": ["v4", "v5"]},
        VIDEOS, index, min_creators=3)
    assert row["existing_leaf"] == "frontier-model-launches"
    assert row["creator_count"] == 2
    assert row["action"] == "add_to_leaf"


def test_creator_count_is_distinct_channels_not_videos(ait_root):
    index = topics.load()
    row = patterns.resolve(
        {"pattern_id": "p4", "label": "One channel twice",
         "evidence": ["v1", "v4"]},
        VIDEOS, index, min_creators=3)
    assert len(row["evidence"]) == 2
    assert row["creator_count"] == 1


def test_read_groups_is_empty_when_no_pass_has_run(ait_root):
    assert patterns.read_groups() == []
