import datetime as dt

from pipeline import bundles
from pipeline.conftest import FIXTURE_THRESHOLDS as T

TODAY = dt.date(2026, 7, 27)
OWN = T["own_content"]


def test_a_covered_topic_is_suppressed_but_never_deleted():
    own_videos = [{"video_id": "mine1", "published_at": "2026-05-14T00:00:00Z",
                   "topic_ids": ["claude-code-mcp-setup"]}]
    row = bundles.channels.own_coverage("claude-code-mcp-setup", own_videos, TODAY, OWN)
    assert row == {"covered": True, "video_id": "mine1",
                   "published_at": "2026-05-14T00:00:00Z", "suppressed": True}


def test_an_uncovered_topic_is_not_suppressed():
    row = bundles.channels.own_coverage("claude-code-subagents", [], TODAY, OWN)
    assert row == {"covered": False, "video_id": None, "published_at": None,
                   "suppressed": False}


def test_coverage_older_than_the_lookback_no_longer_suppresses():
    own_videos = [{"video_id": "old", "published_at": "2024-01-01T00:00:00Z",
                   "topic_ids": ["claude-code-mcp-setup"]}]
    row = bundles.channels.own_coverage("claude-code-mcp-setup", own_videos, TODAY, OWN)
    assert row["covered"] is True and row["suppressed"] is False


def test_suppression_can_be_switched_off_wholesale():
    own_videos = [{"video_id": "mine1", "published_at": "2026-05-14T00:00:00Z",
                   "topic_ids": ["claude-code-mcp-setup"]}]
    row = bundles.channels.own_coverage("claude-code-mcp-setup", own_videos, TODAY,
                                        {**OWN, "suppress_covered_topics": False})
    assert row["covered"] is True and row["suppressed"] is False
