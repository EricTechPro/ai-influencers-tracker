"""recent.json: what went up lately, ranked against each channel's own normal.

The bundle read vidIQ's outlier sweep until this rewrite. Every test here asserts against the
free corpus instead, because the number the feed ranks on is ours now.
"""
from __future__ import annotations

import datetime as dt
import json

from pipeline import build_data, config, snapshot, util

TODAY = dt.date(2026, 7, 29)


def _video(vid, title="A video", channel="UCcole", days_ago=1, views=1000,
           kind="long", tags=(), description=""):
    published = dt.datetime(2026, 7, 29, tzinfo=dt.UTC) - dt.timedelta(days=days_ago)
    return {"id": vid,
            "snippet": {"title": title, "description": description, "tags": list(tags),
                        "channelId": channel, "publishedAt": util.iso_z(published)},
            "contentDetails": {"duration": "PT30S" if kind == "short" else "PT10M"},
            "statistics": {"viewCount": str(views)}}


def _seed(videos):
    by_channel: dict[str, list] = {}
    for v in videos:
        by_channel.setdefault(v["snippet"]["channelId"], []).append(v)
    for channel_id, rows in by_channel.items():
        snapshot.record_video_metadata(channel_id, rows)


def _baseline_for(channel="UCcole", views=1000, kind="long"):
    """Five mature uploads at `views`, which is the minimum a baseline is built from.

    maturity_days is 14 and baseline_min_videos is 5, so anything younger or thinner leaves the
    channel with no baseline at all — which is the state the feed has to render as unknown.

    Deliberately older than feed_window_days: a baseline upload inside the window is a feed row
    too, at 1.0x its own median, and these exist to set the divisor rather than to be ranked.
    """
    return [_video(f"base{kind}{i}", channel=channel, days_ago=40 + i, views=views, kind=kind)
            for i in range(5)]


def _bundle():
    return json.loads((config.db_dir() / "recent.json").read_text())


def _row(bundle, video_id):
    return next((v for v in bundle["videos"] if v["video_id"] == video_id), None)


def test_the_number_is_ours_and_the_bundle_says_so(ait_root):
    """The whole point of the rewrite. breakout_score was vidIQ's and cost credits; the
    multiplier is computed from exact free view counts and nothing paid can improve on exact."""
    _seed([*_baseline_for(views=1000), _video("hit", views=10_000, days_ago=1)])
    build_data.build(TODAY)

    bundle = _bundle()
    assert bundle["source"] == "corpus"
    assert bundle["trust"]["multiplier"] == "derived"
    assert "breakout_score" not in bundle["trust"]
    assert _row(bundle, "hit")["multiplier"] == 10.0


def test_a_derived_number_ships_its_working(ait_root):
    """Derived tier: the multiplier shows the baseline it was divided by and how many uploads
    that baseline was taken from, so the card can prove the number rather than assert it."""
    _seed([*_baseline_for(views=1000), _video("hit", views=10_000, days_ago=1)])
    build_data.build(TODAY)

    row = _row(_bundle(), "hit")
    assert row["baseline"] == 1000
    assert row["baseline_n"] == 5


def test_a_channel_without_enough_mature_uploads_is_unknown_never_low(ait_root):
    """Four uploads is under baseline_min_videos, so there is no baseline to divide by. The
    failure this guards: rendering that as a 0.0x and sinking a video nobody has measured."""
    _seed([_video(f"thin{i}", channel="UCdan", days_ago=20 + i) for i in range(4)]
          + [_video("unscored", channel="UCdan", days_ago=1, views=99_999)])
    build_data.build(TODAY)

    bundle = _bundle()
    assert _row(bundle, "unscored")["multiplier"] is None
    assert "UCdan" in bundle["coverage"]["unscored_channel_ids"]


def test_rows_are_sorted_by_multiplier_descending_unscored_last(ait_root):
    _seed([
        *_baseline_for(views=1000),
        _video("mid", views=4_000, days_ago=1),
        _video("high", views=9_000, days_ago=1),
        _video("low", views=2_000, days_ago=1),
        _video("none", channel="UCdan", days_ago=1, views=50_000),
    ])
    build_data.build(TODAY)

    assert [v["video_id"] for v in _bundle()["videos"]] == ["high", "mid", "low", "none"]


def test_shorts_and_long_form_are_measured_against_their_own_kind(ait_root):
    """Mixing the two distributions makes both wrong: a channel whose shorts take 50x its
    long-form views would score every short a breakout and every video a failure."""
    _seed([
        *_baseline_for(views=1000, kind="long"),
        *_baseline_for(views=50_000, kind="short"),
        _video("shortie", views=100_000, days_ago=1, kind="short"),
        _video("longie", views=2_000, days_ago=1, kind="long"),
    ])
    build_data.build(TODAY)

    bundle = _bundle()
    assert _row(bundle, "shortie")["multiplier"] == 2.0
    assert _row(bundle, "longie")["multiplier"] == 2.0


def test_the_feed_holds_one_window_of_history_not_the_whole_corpus(ait_root):
    """videos.json is 16.7 MB and deliberately never shipped whole. The feed carries card fields
    for feed_window_days so the client-side toggles filter a payload already in memory."""
    _seed([*_baseline_for(views=1000),
           _video("inside", days_ago=29, views=5_000),
           _video("outside", days_ago=400, views=5_000)])
    build_data.build(TODAY)

    ids = [v["video_id"] for v in _bundle()["videos"]]
    assert "inside" in ids
    assert "outside" not in ids


def test_a_video_published_today_reaches_the_feed(ait_root):
    """The bug the rewrite exists for. The vidIQ bundle's newest video was two days old because
    nothing automated the paid sweep, so /topics could not answer "what went up today" at all."""
    _seed([*_baseline_for(views=1000), _video("today", days_ago=0, views=8_000)])
    build_data.build(TODAY)

    assert _row(_bundle(), "today") is not None


def test_momentum_reads_our_own_snapshots_not_a_vendor_rate(ait_root):
    """momentum used vidIQ's vph. The same quantity is in our own dated series for free: views
    gained over the last 24 hours is exactly what vph*24 was estimating."""
    _seed([*_baseline_for(views=1000), _video("climber", days_ago=4, views=10_000)])
    snapshot.write_video_snapshot(
        {"climber": {"date": "2026-07-28", "status": "ok", "view_count": 9_000,
                     "source": "youtube_api"}}, dt.date(2026, 7, 28))
    snapshot.write_video_snapshot(
        {"climber": {"date": "2026-07-29", "status": "ok", "view_count": 10_000,
                     "source": "youtube_api"}}, TODAY)
    build_data.build(TODAY)

    row = _row(_bundle(), "climber")
    # 1,000 of its 10,000 views arrived in the last day: 10%/day, well past
    # climbing_min_daily_share.
    assert row["momentum"]["state"] == "climbing"
    assert row["momentum"]["per_day"] == 1_000


def test_a_video_nobody_has_measured_twice_is_unmeasured_not_flat(ait_root):
    """One observation cannot produce a 24-hour delta, and a video we have not watched change is
    not a video that stopped moving."""
    _seed([*_baseline_for(views=1000), _video("fresh", days_ago=4, views=10_000)])
    build_data.build(TODAY)

    assert _row(_bundle(), "fresh")["momentum"]["state"] == "unmeasured"


def test_the_feed_obeys_the_exclusions_config(ait_root, write_config):
    """The feed is the first thing /topics shows, so a muted channel or an off-the-board title
    landing here would be the loudest possible place for the rule to be forgotten."""
    write_config("exclusions.json", {"version": 1, "terms": ["openclaw"], "channels": ["UCdan"]})
    _seed([*_baseline_for(views=1000),
           _video("keep", days_ago=1, views=5_000),
           _video("byterm", title="OpenClaw does everything", days_ago=1, views=5_000),
           _video("bychannel", channel="UCdan", days_ago=1, views=5_000)])
    build_data.build(TODAY)

    ids = [v["video_id"] for v in _bundle()["videos"]]
    assert "keep" in ids
    assert "byterm" not in ids
    assert "bychannel" not in ids


def test_the_grid_thresholds_reach_the_bundle(ait_root):
    """web/ may only read _db/, so a threshold reaches the UI through the bundle or not at all."""
    _seed([*_baseline_for(views=1000), _video("hit", days_ago=1, views=5_000)])
    build_data.build(TODAY)

    bundle = _bundle()
    assert bundle["display_floor"] == 2.5
    assert bundle["per_channel_cap"] == 2
    assert bundle["feed_window_days"] == 30


def test_the_card_carries_its_channel_name(ait_root):
    """The registry stores channel_id and never the name, so the card joins it from the roster.
    A card that cannot name its creator is the one thing the grid cannot render."""
    _seed([*_baseline_for(views=1000), _video("hit", days_ago=1, views=5_000)])
    build_data.build(TODAY)

    assert _row(_bundle(), "hit")["channel_name"] == "Cole Medin"


def test_an_empty_corpus_is_an_empty_bundle_that_says_so(ait_root):
    build_data.build(TODAY)

    bundle = _bundle()
    assert bundle["videos"] == []
    assert bundle["fetched_at"] is None


def test_rebuild_is_byte_identical(ait_root):
    _seed([*_baseline_for(views=1000), _video("hit", days_ago=1, views=5_000)])
    build_data.build(TODAY)
    first = (config.db_dir() / "recent.json").read_bytes()
    build_data.build(TODAY)
    assert (config.db_dir() / "recent.json").read_bytes() == first
