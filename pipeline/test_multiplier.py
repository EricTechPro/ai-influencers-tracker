import datetime as dt

from pipeline import multiplier
from pipeline.conftest import FIXTURE_THRESHOLDS as T

TODAY = dt.date(2026, 7, 27)
M = T["multiplier"]


def video(vid, views, kind="long", days_old=60):
    published = (TODAY - dt.timedelta(days=days_old)).isoformat() + "T00:00:00Z"
    return {"video_id": vid, "view_count": views, "type": kind, "published_at": published}


def test_the_baseline_is_the_median_of_the_last_twenty_mature_uploads():
    videos = [video(f"v{i}", 1000 * i, days_old=100 - i) for i in range(1, 26)]
    got = multiplier.baseline(videos, "long", TODAY, M)
    assert got["state"] == "ok" and got["n"] == 20
    assert got["value"] == 15500          # median of the 20 newest mature uploads


def test_videos_younger_than_maturity_days_are_excluded():
    """A three-day-old upload has not accumulated views and would drag the baseline down."""
    mature = [video(f"v{i}", 30000, days_old=30) for i in range(6)]
    fresh = [video("brand-new", 12, days_old=3)]
    got = multiplier.baseline(mature + fresh, "long", TODAY, M)
    assert got["value"] == 30000 and got["n"] == 6


def test_shorts_and_long_form_get_separate_baselines():
    videos = ([video(f"L{i}", 100000, "long") for i in range(6)]
              + [video(f"S{i}", 4000, "short") for i in range(6)])
    got = multiplier.baselines(videos, TODAY, M)
    assert got["long"]["value"] == 100000
    assert got["short"]["value"] == 4000


def test_too_few_mature_uploads_is_no_baseline_and_never_low():
    videos = [video(f"v{i}", 30000) for i in range(4)]        # baseline_min_videos is 5
    got = multiplier.baseline(videos, "long", TODAY, M)
    assert got == {"state": "no_baseline", "value": None, "n": 4}


def test_a_video_with_no_baseline_is_unknown_not_zero():
    baselines = {"long": {"state": "no_baseline", "value": None, "n": 2},
                 "short": {"state": "no_baseline", "value": None, "n": 0}}
    got = multiplier.for_video(video("v1", 146102), baselines)
    assert got == {"value": None, "state": "no_baseline", "baseline": None,
                   "baseline_n": 2, "source": "computed"}


def test_the_multiplier_is_views_over_the_matching_baseline():
    baselines = {"long": {"state": "ok", "value": 30400, "n": 20},
                 "short": {"state": "ok", "value": 5000, "n": 20}}
    got = multiplier.for_video(video("v1", 146102), baselines)
    assert round(got["value"], 1) == 4.8 and got["baseline"] == 30400
    assert got["state"] == "ok" and got["source"] == "computed"


def test_a_short_is_measured_against_the_short_baseline():
    baselines = {"long": {"state": "ok", "value": 30400, "n": 20},
                 "short": {"state": "ok", "value": 5000, "n": 20}}
    got = multiplier.for_video(video("s1", 15000, "short"), baselines)
    assert got["value"] == 3.0 and got["baseline"] == 5000
