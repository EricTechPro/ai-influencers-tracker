"""Shared fixtures. Every test runs against a temp AIT_ROOT, never the real repo."""
from __future__ import annotations

import json
import pathlib

import pytest

FIXTURE_THRESHOLDS = {
    "version": 3,
    "supply": {"window_days": 90, "open_max_videos": 2,
               "crowded_min_videos": 5, "crowded_min_creators": 3},
    "demand": {"high_min_keyword_volume": 5000, "high_min_repo_velocity": 100.0,
               "high_requires": "either"},
    "topics": {"membership_min_confidence": 0.45},
    "min_n": {"topic_page_min_videos": 3, "topic_page_min_creators": 2,
              "consensus_min_creators": 3},
    "github": {"created_within_days": 90, "min_stars": 100, "max_queries_per_run": 25,
               "max_pages_per_query": 3, "age_days_floor": 1,
               "trending_windows": ["daily", "weekly"],
               "indie": {"user_owner_bonus": 0.5, "max_contributors_for_full_score": 5,
                         "corp_org_penalty": 0.4}},
    "growth": {"windows_hours": [24], "windows_days": [7, 14, 30, 90, 180, 365],
               "subscriber_floor_buckets": 5, "view_drop_tolerance": 0.05, "rebase_min_days": 14,
               "default_rank_mode": "growth",
               "default_window_days": 90,
               "rank_weights": {"subscriber_growth": 50, "subscriber_count": 20,
                                "views_gained": 30}},
    "traction": {"still_growing_min_views_7d": 500, "still_growing_min_share_7d": 0.02,
                 "recent_daily_n": 50, "tail_sweep_days": 7},
    "multiplier": {"baseline_n": 20, "baseline_min_videos": 5, "maturity_days": 14},
    "comments": {"roots_per_video": 100, "replies_per_root": 5, "top_n_per_channel": 50,
                 "page_size": 5, "classify_min_likes": 5, "classify_min_replies": 2,
                 "classify_max_per_run": 2000},
    "scoring": {"weights": {"repo_velocity": 40, "keyword_volume": 25,
                            "supply_gap": 25, "staleness": 10},
                "full_scale": {"repo_velocity_stars_per_day": 300,
                               "keyword_volume_searches": 15000,
                               "supply_gap_max_videos": 12, "staleness_days": 30}},
    "own_content": {"suppress_covered_topics": True, "covered_lookback_days": 365},
    "tier3_qualification": {"min_multiplier": 2.0},
}

FIXTURE_TOPICS = {
    "version": 1,
    "topics": [
        {"id": "claude-code", "label": "Claude Code", "children": [
            {"id": "claude-code-mcp-setup", "label": "Wiring MCP servers into Claude Code",
             "shape": "tutorial",
             "aliases": ["mcp", "model context protocol", ".mcp.json", "claude mcp add"]},
            {"id": "claude-code-subagents", "label": "Subagents and agent teams",
             "shape": "tutorial", "aliases": ["subagent", "agent team"]},
        ]},
        {"id": "models", "label": "Models", "children": [
            {"id": "frontier-model-launches", "label": "Frontier model launches",
             "shape": "review", "aliases": ["just dropped", "first look"]},
        ]},
        {"id": "mcp-registry-integration", "label": "MCP registry integration",
         "shape": "tutorial", "aliases": ["mcp registry"]},
    ],
}

FIXTURE_ROSTER = [
    {"handle": "erictech", "name": "Eric Tech", "channel_id": "UCself",
     "niche": "claude-code", "lang": "en", "category": "own", "tracked": True},
    {"handle": "ColeMedin", "name": "Cole Medin", "channel_id": "UCcole",
     "niche": "ai-agents", "lang": "en", "category": "creator", "tracked": True},
    {"handle": "DanMartell", "name": "Dan Martell", "channel_id": "UCdan",
     "niche": "business", "lang": "en", "category": "creator", "tracked": True},
]


@pytest.fixture
def ait_root(tmp_path, monkeypatch):
    """A temp project root with a complete config/ set and empty data layers."""
    root = tmp_path / "ait"
    (root / "config").mkdir(parents=True)
    for layer in ("_raw", "_synthesize", "_db"):
        (root / layer).mkdir()
    cfg = root / "config"
    (cfg / "thresholds.json").write_text(json.dumps(FIXTURE_THRESHOLDS))
    (cfg / "topics.json").write_text(json.dumps(FIXTURE_TOPICS))
    (cfg / "channels.json").write_text(json.dumps({"version": 1, "channels": FIXTURE_ROSTER}))
    (cfg / "targets.json").write_text(json.dumps(
        {"version": 1, "target": {"mode": "growth", "window_days": 90, "rank": 6},
         "hunches": []}))
    (cfg / "excluded_repos.json").write_text(json.dumps({"version": 1, "excluded": []}))
    monkeypatch.setenv("AIT_ROOT", str(root))
    from pipeline import config
    config.reset_caches()
    yield root
    config.reset_caches()


@pytest.fixture
def write_config(ait_root):
    """Overwrite one config file and drop the loader caches."""
    def _write(name: str, obj) -> pathlib.Path:
        from pipeline import config
        path = ait_root / "config" / name
        path.write_text(json.dumps(obj))
        config.reset_caches()
        return path
    return _write
