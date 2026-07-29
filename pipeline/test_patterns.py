"""Pattern rows: an inference label, a derived leaf match, and the action that follows."""
from __future__ import annotations

import datetime as dt

import pytest

from pipeline import config, patterns, topics, util

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


# ————— the write side: what the grouping skill hands back —————

def _recent(ait_root, rows):
    util.write_json(config.db_dir() / "recent.json", {"videos": rows})


def _rows():
    return [{"video_id": v, "title": f"title {v}", "channel_id": f"UC{v}"}
            for v in ("a", "b", "c")]


def test_candidates_are_the_cards_the_feed_is_showing(ait_root):
    _recent(ait_root, _rows())
    got = patterns.candidates()
    assert [c["video_id"] for c in got] == ["a", "b", "c"]


def test_candidates_is_empty_when_no_sweep_has_run(ait_root):
    assert patterns.candidates() == []


def test_write_groups_round_trips_through_read_groups(ait_root):
    _recent(ait_root, _rows())
    patterns.write_groups(
        [{"pattern_id": "p1", "label": "A thing", "evidence": ["a", "b"]}],
        dt.date(2026, 7, 29))
    assert patterns.read_groups() == [
        {"pattern_id": "p1", "label": "A thing", "evidence": ["a", "b"]}]


def test_a_video_the_sweep_never_returned_is_refused(ait_root):
    """The whole point of the evidence field is that every id is checkable. A hallucinated
    video_id would render as a card that cannot exist."""
    _recent(ait_root, _rows())
    with pytest.raises(ValueError, match="not in the sweep"):
        patterns.write_groups(
            [{"pattern_id": "p1", "label": "A thing", "evidence": ["a", "ghost"]}],
            dt.date(2026, 7, 29))


def test_one_video_in_two_groups_is_refused(ait_root):
    """recent.py stamps one pattern_id per video, so a video in two groups would silently take
    whichever came last. Ambiguity is refused rather than resolved."""
    _recent(ait_root, _rows())
    with pytest.raises(ValueError, match="two groups"):
        patterns.write_groups(
            [{"pattern_id": "p1", "label": "One", "evidence": ["a", "b"]},
             {"pattern_id": "p2", "label": "Two", "evidence": ["b", "c"]}],
            dt.date(2026, 7, 29))


def test_a_duplicate_pattern_id_is_refused(ait_root):
    _recent(ait_root, _rows())
    with pytest.raises(ValueError, match="pattern_id"):
        patterns.write_groups(
            [{"pattern_id": "p1", "label": "One", "evidence": ["a"]},
             {"pattern_id": "p1", "label": "Two", "evidence": ["b"]}],
            dt.date(2026, 7, 29))


def test_an_empty_label_or_evidence_is_refused(ait_root):
    _recent(ait_root, _rows())
    with pytest.raises(ValueError, match="label"):
        patterns.write_groups([{"pattern_id": "p1", "label": "  ", "evidence": ["a"]}],
                              dt.date(2026, 7, 29))
    with pytest.raises(ValueError, match="evidence"):
        patterns.write_groups([{"pattern_id": "p1", "label": "One", "evidence": []}],
                              dt.date(2026, 7, 29))


def test_nothing_is_written_when_validation_fails(ait_root):
    """A half-written pass is worse than no pass: build_data would read it as the real grouping."""
    _recent(ait_root, _rows())
    with pytest.raises(ValueError):
        patterns.write_groups([{"pattern_id": "p1", "label": "One", "evidence": ["ghost"]}],
                              dt.date(2026, 7, 29))
    assert not (config.synth_dir() / "patterns").exists()
