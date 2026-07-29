"""Still pulling views, or done."""
from __future__ import annotations

import datetime as dt

from pipeline import momentum

NOW = dt.datetime(2026, 7, 29, tzinfo=dt.UTC)
T = {"climbing_min_daily_share": 0.02, "flat_max_daily_share": 0.005, "min_age_hours": 48}


def _at(days_ago):
    return (NOW - dt.timedelta(days=days_ago)).isoformat().replace("+00:00", "Z")


def test_a_video_still_being_found_is_climbing():
    """The live case that proved the first formula wrong: 23,746 views at 7.7 days old and
    35.63 vph, which is 3.6% of its own total every day and a visibly rising curve on vidIQ.
    The old ratio-against-lifetime-average check called this one dead."""
    got = momentum.for_video(35.63, 23_746, _at(7.7), NOW, T)
    assert got["state"] == "climbing"
    assert got["daily_share"] == 0.036


def test_a_video_nobody_watches_any_more_is_flat():
    # 23 days old, 100k views, 1 view/hour: 0.02% of its total per day.
    assert momentum.for_video(1.0, 100_000, _at(23), NOW, T)["state"] == "flat"


def test_between_the_two_is_steady_and_says_nothing():
    assert momentum.for_video(50.0, 100_000, _at(20), NOW, T)["state"] == "steady"


def test_a_concave_curve_is_not_stagnation():
    """Every view curve flattens against its own lifetime average, because the early days are
    always the fastest. A check built on that called 124 of 169 outliers dead. A big video still
    adding 5% of itself daily is climbing, whatever its lifetime average says."""
    got = momentum.for_video(2100.0, 1_000_000, _at(30), NOW, T)
    assert got["state"] == "climbing"


def test_a_video_too_young_to_judge_is_unmeasured():
    assert momentum.for_video(500.0, 1000, _at(1), NOW, T)["state"] == "unmeasured"


def test_a_missing_vph_is_unmeasured_never_flat():
    """A number nobody returned is not evidence that a video stopped."""
    assert momentum.for_video(None, 24_000, _at(10), NOW, T)["state"] == "unmeasured"
    assert momentum.for_video(10.0, None, _at(10), NOW, T)["state"] == "unmeasured"


def test_it_shows_its_working():
    got = momentum.for_video(35.63, 23_746, _at(7.7), NOW, T)
    assert got["per_day"] == 855
    assert got["vph"] == 35.63
