"""One primary topic per video, judged by a model, validated here."""
from __future__ import annotations

import datetime as dt

import pytest

from pipeline import classify

TODAY = dt.date(2026, 7, 29)


def test_no_pass_yet_is_an_empty_map_not_an_error(ait_root):
    assert classify.read_assignments() == {}


def test_write_then_read_round_trips(ait_root):
    classify.write_assignments(
        [{"video_id": "v1", "topic_id": "claude-code-mcp-setup", "reason": "sets up MCP"}],
        TODAY)
    got = classify.read_assignments()
    assert got["v1"]["topic_id"] == "claude-code-mcp-setup"
    assert got["v1"]["reason"] == "sets up MCP"


def test_a_topic_that_is_not_a_leaf_is_refused(ait_root):
    """The model picks from the taxonomy it was given. A id that is not a scoreable leaf would
    render as a shelf that does not exist, or silently vanish."""
    with pytest.raises(ValueError, match="not a leaf"):
        classify.write_assignments(
            [{"video_id": "v1", "topic_id": "claude-code", "reason": "parent, not a leaf"}],
            TODAY)


def test_none_is_a_valid_answer_and_means_no_topic_fits(ait_root):
    """"This video is about none of your 25 topics" is the honest answer for most of a 72-channel
    corpus, and refusing it would push the model into picking the least-wrong shelf."""
    classify.write_assignments([{"video_id": "v1", "topic_id": None, "reason": "off-taxonomy"}],
                               TODAY)
    assert classify.read_assignments()["v1"]["topic_id"] is None


def test_one_video_cannot_be_given_two_topics(ait_root):
    """The whole point of the pass is that a video has one primary topic. Two rows for one video
    would restore exactly the multi-membership the keyword matcher produced."""
    with pytest.raises(ValueError, match="twice"):
        classify.write_assignments([
            {"video_id": "v1", "topic_id": "claude-code-mcp-setup", "reason": "a"},
            {"video_id": "v1", "topic_id": "claude-code-subagents", "reason": "b"},
        ], TODAY)


def test_an_empty_reason_is_refused(ait_root):
    """Inference renders beside its evidence or not at all. The reason is the evidence."""
    with pytest.raises(ValueError, match="reason"):
        classify.write_assignments(
            [{"video_id": "v1", "topic_id": None, "reason": "  "}], TODAY)


def test_nothing_is_written_when_a_row_fails(ait_root):
    from pipeline import config
    with pytest.raises(ValueError):
        classify.write_assignments([
            {"video_id": "ok", "topic_id": None, "reason": "fine"},
            {"video_id": "bad", "topic_id": "not-a-real-topic", "reason": "fine"},
        ], TODAY)
    assert not (config.synth_dir() / "classifications").exists()


def test_a_later_pass_merges_over_an_earlier_one(ait_root):
    """Batches land as separate files. The newest verdict for a video wins; videos only the
    older pass covered are kept, so a partial re-run never blanks the rest of the corpus."""
    classify.write_assignments(
        [{"video_id": "old", "topic_id": None, "reason": "first pass"},
         {"video_id": "both", "topic_id": None, "reason": "first pass"}],
        dt.date(2026, 7, 28))
    classify.write_assignments(
        [{"video_id": "both", "topic_id": "claude-code-mcp-setup", "reason": "second pass"}],
        dt.date(2026, 7, 29))

    got = classify.read_assignments()
    assert got["both"]["topic_id"] == "claude-code-mcp-setup"
    assert got["old"]["reason"] == "first pass"
