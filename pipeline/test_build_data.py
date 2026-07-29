import datetime as dt

from pipeline import build_data, comments, config, snapshot, util

TODAY = dt.date(2026, 7, 27)


def seed_video(channel_id, video_id, published_at="2026-05-01T00:00:00Z"):
    """A registered video with no per-day count series: enough to appear in videos.json."""
    util.append_jsonl(snapshot.registry_path(channel_id), {
        "video_id": video_id, "channel_id": channel_id, "title": "t", "description": "",
        "tags": [], "published_at": published_at, "duration_s": 600, "type": "long",
        "seen_at": "2026-07-27T00:00:00Z"})


def seed_comment(channel_id, video_id, comment_id, like_count):
    util.append_jsonl(comments.store_path(channel_id), {
        "comment_id": comment_id, "video_id": video_id, "channel_id": channel_id,
        "video_title": "t", "video_url": f"https://youtu.be/{video_id}",
        "video_published_at": "2026-05-01T00:00:00Z", "author": "someone",
        "author_channel_id": "UCviewer", "text": "hi", "like_count": like_count,
        "reply_count": 0, "published_at": "2026-05-02T00:00:00Z", "answered": False,
        "lag_days": 1, "topic_ids": [], "category": None})


def seed_snapshots(days=8):
    """A clean run of daily channel snapshots ending on TODAY."""
    for i in range(days):
        day = TODAY - dt.timedelta(days=i)
        rows = {}
        for cid, subs, views in (("UCself", 68700, 4102880), ("UCcole", 219000, 11991545),
                                 ("UCdan", 2930000, 90000000)):
            rows[cid] = {"date": util.date_str(day), "status": "ok",
                         "view_count": views - i * 40000,
                         "subscriber_count": subs - i * 900,
                         "subscriber_bucket": None, "video_count": 400 - i,
                         "source": "youtube_api"}
        snapshot.write_channel_snapshot(rows, day)


def test_the_reader_merges_the_bought_history_under_the_snapshotted_one(ait_root):
    seed_snapshots(days=2)
    util.write_json(config.raw_dir() / "backfill" / "UCcole.json", {
        "channel_id": "UCcole",
        "series": [{"date": "2026-07-20", "status": "ok", "view_count": 1, "subscriber_count": 1,
                    "subscriber_bucket": 1, "video_count": 1, "source": "vidiq_backfill"},
                   {"date": "2026-07-27", "status": "ok", "view_count": 999,
                    "subscriber_count": 999, "subscriber_bucket": 1, "video_count": 1,
                    "source": "vidiq_backfill"}]})
    from pipeline import read
    series = read.channel_series("UCcole")
    by_date = {row["date"]: row for row in series}
    assert by_date["2026-07-20"]["source"] == "vidiq_backfill"
    assert by_date["2026-07-27"]["source"] == "youtube_api"     # ours always wins


def test_the_snapshots_bundle_reports_present_and_missing_dates(ait_root):
    seed_snapshots(days=3)
    (config.raw_dir() / "snapshots" / "2026-07-26.json").unlink()
    build_data.build(today=TODAY)
    bundle = util.read_json(config.db_dir() / "snapshots.json")
    assert bundle["version"] == 3
    assert "2026-07-26" in bundle["dates_missing"]
    assert bundle["channels"]["UCcole"]["handle"] == "ColeMedin"


def test_a_channel_row_carries_bounded_states_and_never_a_bare_number(ait_root):
    seed_snapshots(days=8)
    build_data.build(today=TODAY)
    channels = util.read_json(config.db_dir() / "channels.json")
    by_id = {c["channel_id"]: c for c in channels["channels"]}

    dan = by_id["UCdan"]["subscriber_delta"]["7d"]
    assert dan["state"] == "bounded" and dan["value"] is None and dan["upper"] == 50000
    assert dan["bucket"] == 10000

    self_row = by_id["UCself"]["subscriber_delta"]["7d"]
    assert self_row["state"] == "ok" and self_row["value"] == 5400   # 6 days x 900, floor is 500


def test_the_self_channel_is_ranked_inline_and_flagged(ait_root):
    seed_snapshots(days=8)
    build_data.build(today=TODAY)
    channels = util.read_json(config.db_dir() / "channels.json")
    assert channels["self_channel_id"] == "UCself"
    self_row = next(c for c in channels["channels"] if c["is_self"])
    assert set(self_row["rank"]) == {"growth", "general", "subscribers", "views"}
    assert self_row["rank"]["growth"]["90d"] >= 1


def test_subscriber_daily_is_owner_only_for_everyone_else(ait_root):
    seed_snapshots(days=8)
    build_data.build(today=TODAY)
    channels = util.read_json(config.db_dir() / "channels.json")
    other = next(c for c in channels["channels"] if not c["is_self"])
    assert other["subscriber_daily"] == {"state": "unavailable", "reason": "owner_only"}


def test_rebuilding_is_byte_identical(ait_root):
    seed_snapshots(days=8)
    build_data.build(today=TODAY)
    before = util.tree_hashes(config.db_dir())
    build_data.build(today=TODAY)
    assert util.tree_hashes(config.db_dir()) == before


def test_deleting_the_db_layer_is_boring(ait_root):
    import shutil
    seed_snapshots(days=8)
    build_data.build(today=TODAY)
    before = util.tree_hashes(config.db_dir())
    shutil.rmtree(config.db_dir())
    build_data.build(today=TODAY)
    assert util.tree_hashes(config.db_dir()) == before


def test_a_video_the_ledger_marks_done_carries_real_comment_stats(ait_root):
    seed_snapshots(days=1)
    seed_video("UCcole", "vid_done")
    seed_comment("UCcole", "vid_done", "c1", like_count=5)
    seed_comment("UCcole", "vid_done", "c2", like_count=1)
    util.write_json(comments.ledger_path(), {"vid_done": {"comments": 2}})
    build_data.build(today=TODAY)
    videos = util.read_json(config.db_dir() / "videos.json")
    row = next(v for v in videos["videos"] if v["video_id"] == "vid_done")
    assert row["comment_stats"] == {"root_count": 2, "top_comment_likes": 5, "classified": 0}


def test_a_video_the_ledger_has_not_reached_yet_is_missing_not_zero(ait_root):
    seed_snapshots(days=1)
    seed_video("UCcole", "vid_pending")
    build_data.build(today=TODAY)
    videos = util.read_json(config.db_dir() / "videos.json")
    row = next(v for v in videos["videos"] if v["video_id"] == "vid_pending")
    assert row["comment_stats"] is None


def test_comment_stats_do_not_break_the_rebuild_byte_identity(ait_root):
    seed_snapshots(days=1)
    seed_video("UCcole", "vid_done")
    seed_comment("UCcole", "vid_done", "c1", like_count=5)
    util.write_json(comments.ledger_path(), {"vid_done": {"comments": 1}})
    seed_video("UCcole", "vid_pending")
    build_data.build(today=TODAY)
    before = util.tree_hashes(config.db_dir())
    build_data.build(today=TODAY)
    assert util.tree_hashes(config.db_dir()) == before


def seed_topic_corpus(ait_root):
    """Two videos on mcp-registry-integration, comments on one, and a hot repo linked to it."""
    from pipeline import comments, snapshot
    videos = [
        {"id": "v1", "snippet": {"title": "MCP registry walkthrough", "description": "",
                                 "tags": ["mcp registry"], "channelId": "UCcole",
                                 "publishedAt": "2026-07-21T00:00:00Z"},
         "contentDetails": {"duration": "PT21M56S"}, "statistics": {"viewCount": "1000"}},
        {"id": "v2", "snippet": {"title": "Another mcp registry build", "description": "",
                                 "tags": [], "channelId": "UCdan",
                                 "publishedAt": "2026-07-21T00:00:00Z"},
         "contentDetails": {"duration": "PT9M"}, "statistics": {"viewCount": "500"}},
    ]
    snapshot.record_video_metadata("UCcole", videos[:1])
    snapshot.record_video_metadata("UCdan", videos[1:])
    for i in range(8):
        day = TODAY - dt.timedelta(days=i)
        snapshot.write_video_snapshot(
            {"v1": {"date": util.date_str(day), "status": "ok", "view_count": 1000 - i * 10,
                    "source": "youtube_api"},
             "v2": {"date": util.date_str(day), "status": "ok", "view_count": 500 - i * 5,
                    "source": "youtube_api"}}, day)
    comments.append_new("UCcole", [{
        "comment_id": "Ug1", "video_id": "v1", "channel_id": "UCcole",
        "video_title": "MCP registry walkthrough", "video_url": "https://youtu.be/v1",
        "video_published_at": "2026-07-21T00:00:00Z", "author": "someguy",
        "text": "Would love to see this on Windows", "like_count": 412, "reply_count": 7,
        "published_at": "2026-07-24T00:00:00Z", "answered": False, "lag_days": 3,
        "topic_ids": ["mcp-registry-integration"], "category": None}])
    util.write_json(config.raw_dir() / "repos" / "2026-07-27.json", {
        "date": "2026-07-27", "partial_run": False, "trending_ok": True, "trending_reason": None,
        "search": [{"github_id": 123456, "full_name": "x/mcp-registry",
                    "description": "an mcp registry", "repo_topics": ["mcp"],
                    "stars": 12496, "created_at": "2026-06-10T00:00:00Z", "age_days": 47,
                    "velocity": 265.87, "owner_type": "Organization",
                    "discovered_via": "search",
                    "indie": {"score": 0.58, "owner_type": "Organization",
                              "contributors": 9, "trust": "derived"}}],
        "trending": []})
    util.write_json(config.raw_dir() / "keywords" / "2026-07-27.json", {
        "date": "2026-07-27",
        "volumes": {"mcp-registry-integration": {"keyword": "MCP registry integration",
                                                 "volume": 8100, "state": "ok"}}})


def test_the_opportunity_row_reproduces_71_point_9_end_to_end(ait_root):
    seed_snapshots(days=8)
    seed_topic_corpus(ait_root)
    build_data.build(today=TODAY)
    rows = util.read_json(config.db_dir() / "opportunities.json")["rows"]
    row = next(r for r in rows if r["topic_id"] == "mcp-registry-integration")
    assert row["verdict"] == "MAKE_THIS_NOW"
    assert row["score"]["value"] == 71.9 and row["score"]["out_of"] == 100
    assert row["supply"]["fired"] == ["videos <= 2"]
    assert row["demand"]["fired"] == ["keyword_volume >= 5000", "repo_velocity >= 100.0"]
    assert row["evidence"][0]["github_id"] == 123456
    assert row["trust"] == {"demand": "derived", "supply": "derived",
                            "verdict": "derived", "score": "derived"}


def test_a_parent_never_appears_in_the_opportunity_bundle(ait_root):
    seed_snapshots(days=8)
    seed_topic_corpus(ait_root)
    build_data.build(today=TODAY)
    rows = util.read_json(config.db_dir() / "opportunities.json")["rows"]
    assert "claude-code" not in {r["topic_id"] for r in rows}


def test_a_hunch_sorts_but_never_scores(write_config, ait_root):
    seed_snapshots(days=8)
    seed_topic_corpus(ait_root)
    write_config("targets.json", {"version": 1,
                                  "target": {"mode": "growth", "window_days": 90, "rank": 6},
                                  "hunches": ["claude-code-subagents"]})
    build_data.build(today=TODAY)
    rows = util.read_json(config.db_dir() / "opportunities.json")["rows"]
    hunched = next(r for r in rows if r["topic_id"] == "claude-code-subagents")
    plain = next(r for r in rows if r["topic_id"] == "mcp-registry-integration")
    assert hunched["hunch"] is True and plain["hunch"] is False
    assert all(c["key"] != "hunch" for c in plain["score"]["components"])


def test_a_topic_page_below_the_minimum_says_so_rather_than_hiding(ait_root):
    seed_snapshots(days=8)
    seed_topic_corpus(ait_root)
    build_data.build(today=TODAY)
    pages = {p["topic_id"]: p for p in util.read_json(
        config.db_dir() / "topic_pages.json")["topics"]}
    page = pages["mcp-registry-integration"]
    assert page["state"] == "insufficient_data"        # 2 videos, min is 3
    assert page["video_count"] == 2 and page["creator_count"] == 2
    assert page["nodes"] is None and page["edges"] is None    # reserved for step 15
    assert pages["claude-code"]["is_leaf"] is False and "shape" not in pages["claude-code"]


def test_the_comment_bundle_indexes_the_same_corpus_three_ways(ait_root):
    seed_snapshots(days=8)
    seed_topic_corpus(ait_root)
    build_data.build(today=TODAY)
    cole = util.read_json(config.db_dir() / "comments" / "channel" / "UCcole.json")
    assert cole["version"] == 2
    assert cole["channel"]["totals"]["ingested"] == 1
    assert cole["videos"]["v1"]["totals"]["comments"] == 1
    topic = util.read_json(
        config.db_dir() / "comments" / "topic" / "mcp-registry-integration.json")["topic"]
    assert topic["totals"] == {"comments": 1, "videos": 2, "creators": 2}
    assert topic["by_category"]["unsorted"] == 1        # not classified yet, never hidden


def test_a_category_can_never_ship_without_its_comment_text(ait_root):
    seed_snapshots(days=8)
    seed_topic_corpus(ait_root)
    build_data.build(today=TODAY)
    channel_files = (config.db_dir() / "comments" / "channel").glob("*.json")
    for path in channel_files:
        entry = util.read_json(path)
        for row in entry["channel"]["top"]:
            assert row["text"], "a comment row shipped without its text"
            assert "category" in row and "lag_days" in row
        for video in entry["videos"].values():
            for row in video["top"]:
                assert row["text"], "a comment row shipped without its text"
                assert "category" in row and "lag_days" in row
    topic_files = (config.db_dir() / "comments" / "topic").glob("*.json")
    for path in topic_files:
        entry = util.read_json(path)
        for row in entry["topic"]["top"]:
            assert row["text"], "a comment row shipped without its text"
            assert "category" in row and "lag_days" in row


def test_meta_reports_coverage_health_and_the_target(ait_root):
    seed_snapshots(days=8)
    seed_topic_corpus(ait_root)
    build_data.build(today=TODAY)
    meta = util.read_json(config.db_dir() / "meta.json")
    assert meta["version"] == 3 and meta["thresholds_version"] == 4
    assert meta["self_channel_id"] == "UCself"
    assert meta["channels"] == {"total": 3, "ok": 3, "absent": 0}
    assert 0 <= meta["coverage_rate"] <= 1
    assert meta["target"] == {"mode": "growth", "window_days": 90, "rank": 6}
    assert meta["partial_run"] is False
    assert meta["build_step"] == 8


def test_snapshot_health_counts_bought_history_as_history(ait_root):
    """days_present counts our own sweep files, and the header read it as "1 of 90 days" while
    the board measured 90-day growth off 366 days of vidIQ backfill. Both numbers are true and
    they answer different questions, so history_days is its own field: how many distinct days the
    board can actually measure over, whoever paid for them."""
    seed_snapshots(days=8)
    util.write_json(config.raw_dir() / "backfill" / "UCcole.json", {
        "channel_id": "UCcole",
        "series": [{"date": util.date_str(TODAY - dt.timedelta(days=n)), "status": "ok",
                    "view_count": 1000 - n, "subscriber_count": 100 - n,
                    "subscriber_bucket": 1, "video_count": 1, "source": "vidiq_backfill"}
                   for n in range(40, 8, -1)]})
    seed_topic_corpus(ait_root)
    build_data.build(today=TODAY)
    health = util.read_json(config.db_dir() / "meta.json")["snapshot_health"]
    assert health["days_present"] == 8            # our sweep, unchanged
    # 8 swept (days 0-7) plus 32 bought (days 9-40): distinct dates held, not the span between
    # the ends, so the one-day hole at day 8 is not counted as history we have.
    assert health["history_days"] == 40
    assert health["first_date"] == util.date_str(TODAY - dt.timedelta(days=40))


def test_all_the_bundles_are_written(ait_root):
    seed_snapshots(days=8)
    seed_topic_corpus(ait_root)
    build_data.build(today=TODAY)
    assert sorted(p.name for p in config.db_dir().glob("*.json")) == [
        "channels.json", "meta.json", "opportunities.json", "recent.json",
        "snapshots.json", "topic_pages.json", "video_snapshots.json", "videos.json"]
    assert not (config.db_dir() / "comments.json").exists()
    assert (config.db_dir() / "comments" / "channel" / "UCcole.json").exists()
    assert (config.db_dir() / "comments" / "topic" / "mcp-registry-integration.json").exists()
