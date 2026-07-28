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
