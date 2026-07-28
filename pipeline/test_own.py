import datetime as dt

from pipeline import bundles, build_data, config, snapshot, util
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


def _seed_own_video(video_id, *, title="t", description="", tags=None,
                     published_at="2026-07-20T00:00:00Z"):
    """An own-channel (UCself) video registered with real title/description/tags,
    so it flows through topics.match_video exactly like the build does."""
    snapshot.record_video_metadata("UCself", [{
        "id": video_id,
        "snippet": {"title": title, "description": description, "tags": tags or [],
                    "channelId": "UCself", "publishedAt": published_at},
        "contentDetails": {"duration": "PT10M"}, "statistics": {"viewCount": "100"},
    }])


def test_a_description_only_alias_hit_does_not_claim_coverage(ait_root):
    # "mcp" only appears in the description, never the title: a weak signal.
    _seed_own_video("own1", title="Fable 5 + Seedance 2.0 = Scroll Animations That Sell",
                     description="wiring an mcp server into this workflow")
    build_data.build(today=TODAY)
    row = util.read_json(config.db_dir() / "opportunities.json")["rows"]
    topic = next(r for r in row if r["topic_id"] == "claude-code-mcp-setup")
    assert topic["own_coverage"] == {"covered": False, "video_id": None,
                                     "published_at": None, "suppressed": False}


def test_a_title_alias_hit_still_claims_coverage(ait_root):
    _seed_own_video("own2", title="Wiring an MCP server into Claude Code")
    build_data.build(today=TODAY)
    rows = util.read_json(config.db_dir() / "opportunities.json")["rows"]
    topic = next(r for r in rows if r["topic_id"] == "claude-code-mcp-setup")
    assert topic["own_coverage"]["covered"] is True
    assert topic["own_coverage"]["video_id"] == "own2"
    assert topic["own_coverage"]["suppressed"] is True
