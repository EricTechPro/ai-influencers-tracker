"""channel_top.json: each channel's most-viewed uploads, in card shape, at any age.

The feed answers "what went up lately" and is bounded by feed_window_days. A channel page asks a
different question — "what are this creator's biggest videos ever" — and the answer is almost
always outside that window. Austin Marchese's 725k video is two months old; the feed cannot show
it and should not, which is why this bundle exists rather than a wider feed.
"""
from __future__ import annotations

import datetime as dt
import json

from pipeline import build_data, config, snapshot, util

TODAY = dt.date(2026, 7, 29)


def _video(vid, title="A video", channel="UCcole", days_ago=1, views=1000, kind="long"):
    published = dt.datetime(2026, 7, 29, tzinfo=dt.UTC) - dt.timedelta(days=days_ago)
    return {"id": vid,
            "snippet": {"title": title, "description": "", "tags": [],
                        "channelId": channel, "publishedAt": util.iso_z(published)},
            "contentDetails": {"duration": "PT30S" if kind == "short" else "PT10M"},
            "statistics": {"viewCount": str(views)}}


def _seed(videos):
    by_channel: dict[str, list] = {}
    for v in videos:
        by_channel.setdefault(v["snippet"]["channelId"], []).append(v)
    for channel_id, rows in by_channel.items():
        snapshot.record_video_metadata(channel_id, rows)


def _baseline_for(channel="UCcole", views=1000):
    """Five mature uploads, the minimum a multiplier baseline is built from."""
    return [_video(f"base{i}", channel=channel, days_ago=40 + i, views=views)
            for i in range(5)]


def _bundle():
    return json.loads((config.db_dir() / "channel_top.json").read_text())


def test_a_channels_biggest_video_appears_however_old_it_is(ait_root):
    """The reason this bundle exists. feed_window_days is 30; a 200-day-old breakout is exactly
    what a channel page is opened to find, and the feed can never show it."""
    _seed([*_baseline_for(),
           _video("ancient-hit", days_ago=200, views=725_000),
           _video("recent-dud", days_ago=1, views=900)])
    build_data.build(TODAY)

    rows = _bundle()["channels"]["UCcole"]
    assert [r["video_id"] for r in rows][:1] == ["ancient-hit"]
    assert rows[0]["view_count"] == 725_000


def test_rows_are_ranked_by_views_not_by_multiplier(ait_root):
    """The feed ranks on multiplier, because it asks what beat its channel's normal. This asks
    what is biggest, full stop, and those are different orders."""
    _seed([*_baseline_for(),
           _video("biggest", days_ago=100, views=500_000),
           _video("second", days_ago=2, views=50_000)])
    build_data.build(TODAY)

    assert [r["video_id"] for r in _bundle()["channels"]["UCcole"]][:2] == ["biggest", "second"]


def test_a_row_carries_the_same_card_fields_the_feed_ships(ait_root):
    """One card component renders both surfaces, so both must hand it the same shape. A second
    row shape would mean a second idea of what a card is."""
    _seed([*_baseline_for(), _video("hit", days_ago=100, views=10_000)])
    build_data.build(TODAY)

    row = next(r for r in _bundle()["channels"]["UCcole"] if r["video_id"] == "hit")
    for key in ("video_id", "title", "published_at", "view_count", "duration_s", "type",
                "channel_id", "channel_name", "multiplier", "baseline", "baseline_n",
                "views_gained_24h", "momentum", "lang", "lang_tier"):
        assert key in row, f"card field {key} missing"
    assert row["channel_name"] == "Cole Medin"


def test_a_channel_with_fewer_videos_than_the_cap_yields_what_it_has(ait_root):
    """Never padded, never zero-filled. A thin channel is a thin channel."""
    _seed([_video("only", channel="UCdan", days_ago=3, views=100)])
    build_data.build(TODAY)

    assert len(_bundle()["channels"]["UCdan"]) == 1


def test_the_cap_bounds_what_a_channel_page_loads(ait_root):
    """A 251-video channel must not ship 251 rows to answer "what are the biggest"."""
    _seed([_video(f"v{i}", channel="UCdan", days_ago=i + 1, views=1000 + i) for i in range(30)])
    build_data.build(TODAY)

    assert len(_bundle()["channels"]["UCdan"]) == 20


def test_an_excluded_title_never_reaches_a_channel_page(ait_root):
    """config/exclusions.json binds every display surface, not just the ones that remembered.

    Exclusion is by channel or by title term — there is no per-video-id rule — so the highest
    view count on the channel is the right thing to try to sneak through.
    """
    (ait_root / "config" / "exclusions.json").write_text(json.dumps(
        {"version": 1, "terms": ["openclaw"], "topics": [], "channels": []}))
    _seed([*_baseline_for(),
           _video("banned", title="openclaw changes everything", days_ago=100, views=999_000)])
    build_data.build(TODAY)

    assert "banned" not in [r["video_id"] for r in _bundle()["channels"].get("UCcole", [])]


def test_a_term_that_only_looks_like_the_excluded_one_still_renders(ait_root):
    """Word boundaries, not substrings. Dropping "openclawback" for containing "openclaw" would
    be a false claim about what the video is about."""
    (ait_root / "config" / "exclusions.json").write_text(json.dumps(
        {"version": 1, "terms": ["openclaw"], "topics": [], "channels": []}))
    _seed([*_baseline_for(),
           _video("kept", title="openclawback explained", days_ago=100, views=999_000)])
    build_data.build(TODAY)

    assert "kept" in [r["video_id"] for r in _bundle()["channels"]["UCcole"]]
