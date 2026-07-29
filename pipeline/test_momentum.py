"""Still climbing, or spiked and died."""
from __future__ import annotations

import datetime as dt

from pipeline import momentum

NOW = dt.datetime(2026, 7, 29, tzinfo=dt.UTC)
T = {"climbing_min_ratio": 1.0, "spent_max_ratio": 0.5, "min_age_hours": 48}


def _at(days_ago):
    return (NOW - dt.timedelta(days=days_ago)).isoformat().replace("+00:00", "Z")


def test_pulling_more_per_hour_than_its_own_average_is_climbing():
    # 10 days old, 24,000 views -> 100/h average. 150/h now.
    assert momentum.for_video(150.0, 24_000, _at(10), NOW, T)["state"] == "climbing"


def test_the_day_one_spike_that_died_is_spent():
    """The case this exists for: took all its views in the first day and has been flat since.
    On view count alone it is indistinguishable from a real breakout."""
    got = momentum.for_video(4.0, 24_000, _at(10), NOW, T)
    assert got["state"] == "spent"
    assert got["ratio"] == 0.04


def test_between_the_two_is_steady_not_a_verdict():
    assert momentum.for_video(80.0, 24_000, _at(10), NOW, T)["state"] == "steady"


def test_a_video_too_young_to_judge_is_unmeasured():
    """Everything outruns its own average on day one. Calling that a breakout would make the
    badge meaningless: every fresh upload would wear it, and every one would be right for a day."""
    assert momentum.for_video(500.0, 1000, _at(1), NOW, T)["state"] == "unmeasured"


def test_a_missing_vph_is_unmeasured_never_spent():
    """A number nobody returned is not evidence of stagnation."""
    assert momentum.for_video(None, 24_000, _at(10), NOW, T)["state"] == "unmeasured"
    assert momentum.for_video(10.0, None, _at(10), NOW, T)["state"] == "unmeasured"


def test_it_shows_its_working():
    got = momentum.for_video(150.0, 24_000, _at(10), NOW, T)
    assert got["lifetime_vph"] == 100.0
    assert got["vph"] == 150.0
    assert got["ratio"] == 1.5
