import datetime as dt

from pipeline import traction
from pipeline.conftest import FIXTURE_THRESHOLDS as T

TODAY = dt.date(2026, 7, 27)
TR = T["traction"]


def series(values, start=dt.date(2026, 6, 28)):
    return [{"date": (start + dt.timedelta(days=i)).isoformat(), "status": "ok",
             "view_count": v} for i, v in enumerate(values)]


def test_views_gained_is_reported_for_all_three_windows():
    s = series(list(range(100000, 100030)))          # 30 consecutive days, +1/day
    got = traction.for_video(s, total_views=100029, today=TODAY, thresholds=TR)
    assert got["views_gained"]["24h"]["value"] == 1
    assert got["views_gained"]["7d"]["value"] == 6
    assert got["views_gained"]["30d"]["value"] == 29


def test_a_launch_week_video_is_still_growing():
    s = series([140000 + i * 900 for i in range(30)])
    got = traction.for_video(s, total_views=166100, today=TODAY, thresholds=TR)
    assert got["views_gained"]["7d"]["value"] == 5400
    assert round(got["share_recent_7d"], 3) == 0.033
    assert got["still_growing"] is True


def test_a_big_back_catalogue_video_trickling_is_not_growing():
    """150,000 views gaining 300 a week clears neither bar it needs to clear."""
    s = series([150000 + i * 43 for i in range(30)])
    got = traction.for_video(s, total_views=151247, today=TODAY, thresholds=TR)
    assert got["views_gained"]["7d"]["value"] == 258
    assert got["still_growing"] is False


def test_volume_alone_is_not_enough_without_share():
    """+600 in a week on a 1,000,000-view video is 0.06%, under the 2% floor."""
    s = series([1000000 + i * 100 for i in range(30)])
    got = traction.for_video(s, total_views=1002900, today=TODAY, thresholds=TR)
    assert got["views_gained"]["7d"]["value"] == 600
    assert got["share_recent_7d"] < 0.02
    assert got["still_growing"] is False


def test_share_alone_is_not_enough_without_volume():
    """A tiny video can clear 2% on 70 views, which is noise."""
    s = series([1000 + i * 10 for i in range(30)])
    got = traction.for_video(s, total_views=1290, today=TODAY, thresholds=TR)
    assert got["share_recent_7d"] >= 0.02
    assert got["views_gained"]["7d"]["value"] < 500
    assert got["still_growing"] is False


def test_an_incomplete_seven_day_window_leaves_still_growing_unknown():
    s = series([140000, 141000, 142000], start=dt.date(2026, 7, 25))
    got = traction.for_video(s, total_views=142000, today=TODAY, thresholds=TR)
    assert got["views_gained"]["7d"]["state"] == "building"
    assert got["still_growing"] is None
    assert got["share_recent_7d"] is None


def test_a_deleted_video_with_no_usable_points_is_insufficient_not_zero():
    s = [{"date": "2026-07-27", "status": "absent", "view_count": None}]
    got = traction.for_video(s, total_views=None, today=TODAY, thresholds=TR)
    assert got["views_gained"]["7d"]["state"] == "insufficient_data"
    assert got["still_growing"] is None
