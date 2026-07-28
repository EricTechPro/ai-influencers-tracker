import datetime as dt

from pipeline import growth
from pipeline.conftest import FIXTURE_THRESHOLDS as T

TODAY = dt.date(2026, 7, 27)
GROWTH = T["growth"]


def subs_series(pairs):
    return [{"date": d, "status": "ok", "subscriber_count": v, "view_count": i * 1000}
            for i, (d, v) in enumerate(pairs)]


def test_bucket_width_across_the_real_roster():
    assert growth.bucket_width(2930000) == 10000      # Dan Martell
    assert growth.bucket_width(219000) == 1000        # Cole Medin
    assert growth.bucket_width(68700) == 100          # Eric Tech
    assert growth.bucket_width(2380) == 10            # AI Systems by Jimi
    assert growth.bucket_width(847) == 1              # below 1,000 YouTube is exact
    assert growth.bucket_width(None) is None


def test_the_floor_is_five_buckets_and_differs_per_channel():
    assert growth.measurement_floor(219000, GROWTH) == 5000
    assert growth.measurement_floor(2930000, GROWTH) == 50000
    assert growth.measurement_floor(2380, GROWTH) == 50


def test_a_delta_clearing_its_floor_renders_a_number_with_its_bucket():
    s = subs_series([(f"2026-0{5 if d > 27 else 7}-{d:02d}", v) for d, v in
                     [(25, 204000), (26, 210000), (27, 219000)]])
    cell = growth.subscriber_delta(s, 3, TODAY, GROWTH)
    assert cell == {"state": "ok", "value": 15000, "bucket": 1000,
                    "from": "2026-07-25", "to": "2026-07-27"}


def test_a_delta_below_its_floor_is_bounded_and_carries_no_value():
    """Cole Medin, 219,000, bucket 1,000, floor 5,000. A 2,000 week is 2 buckets."""
    s = subs_series([("2026-07-25", 217000), ("2026-07-26", 218000), ("2026-07-27", 219000)])
    assert growth.subscriber_delta(s, 3, TODAY, GROWTH) == {
        "state": "bounded", "upper": 5000, "value": None, "bucket": 1000,
        "from": "2026-07-25", "to": "2026-07-27"}


def test_bounded_is_never_blank_and_never_zero():
    s = subs_series([("2026-07-26", 219000), ("2026-07-27", 219000)])
    cell = growth.subscriber_delta(s, 2, TODAY, GROWTH)
    assert cell["state"] == "bounded" and cell["value"] is None and cell["upper"] == 5000


def test_a_small_channel_is_measurable_over_a_week_where_a_huge_one_is_not():
    small = subs_series([(f"2026-07-{d}", 2380 + (d - 21) * 30) for d in range(21, 28)])
    huge = subs_series([(f"2026-07-{d}", 2930000 + (d - 21) * 1000) for d in range(21, 28)])
    assert growth.subscriber_delta(small, 7, TODAY, GROWTH)["state"] == "ok"
    assert growth.subscriber_delta(huge, 7, TODAY, GROWTH)["state"] == "bounded"


def test_an_incomplete_window_is_building_before_the_floor_is_even_considered():
    s = subs_series([("2026-07-27", 219000)])
    assert growth.subscriber_delta(s, 7, TODAY, GROWTH)["state"] == "building"


def test_the_growth_rate_bounds_as_a_rate():
    s = subs_series([("2026-07-26", 2930000), ("2026-07-27", 2930000)])
    cell = growth.subscriber_growth_rate(s, 2, TODAY, GROWTH)
    assert cell["state"] == "bounded"
    assert round(cell["upper"], 5) == round(50000 / 2930000, 5)
    assert cell["value"] is None


def test_subs_per_1k_views_inherits_the_floor():
    bounded = {"state": "bounded", "upper": 5000, "value": None, "bucket": 1000}
    views = {"state": "ok", "value": 1000000}
    out = growth.subs_per_1k_views(bounded, views)
    assert out == {"state": "bounded", "upper": 5.0, "value": None}

    ok = {"state": "ok", "value": 15000, "bucket": 1000}
    assert growth.subs_per_1k_views(ok, views) == {"state": "ok", "value": 15.0}


def test_subs_per_1k_views_with_unmeasured_views_is_not_a_number():
    ok = {"state": "ok", "value": 15000, "bucket": 1000}
    building = {"state": "building", "have": 3, "need": 7, "value": None}
    assert growth.subs_per_1k_views(ok, building)["state"] == "building"


def test_ok_beats_bounded_beats_unmeasured_descending():
    rows = [
        {"h": "insufficient", "cell": {"state": "insufficient_data", "value": None}},
        {"h": "bounded-small", "cell": {"state": "bounded", "upper": 500, "value": None}},
        {"h": "ok-low", "cell": {"state": "ok", "value": 2100}},
        {"h": "bounded-big", "cell": {"state": "bounded", "upper": 50000, "value": None}},
        {"h": "ok-high", "cell": {"state": "ok", "value": 53000}},
        {"h": "building", "cell": {"state": "building", "have": 2, "need": 7, "value": None}},
    ]
    ordered = [r["h"] for r in growth.sort_rows(rows, key=lambda r: r["cell"], descending=True)]
    assert ordered[:2] == ["ok-high", "ok-low"]
    assert ordered[2:4] == ["bounded-big", "bounded-small"]
    assert set(ordered[4:]) == {"insufficient", "building"}


def test_unmeasured_rows_sort_last_in_both_directions():
    rows = [
        {"h": "insufficient", "cell": {"state": "insufficient_data", "value": None}},
        {"h": "ok-low", "cell": {"state": "ok", "value": 2100}},
        {"h": "bounded", "cell": {"state": "bounded", "upper": 500, "value": None}},
    ]
    up = [r["h"] for r in growth.sort_rows(rows, key=lambda r: r["cell"], descending=False)]
    assert up == ["ok-low", "bounded", "insufficient"]


def test_all_four_rank_modes_produce_a_total_order():
    channels = [
        {"channel_id": "UCa", "subscriber_count": 219000,
         "subscriber_growth_rate": {"state": "ok", "value": 0.074},
         "subscriber_delta": {"state": "ok", "value": 15000},
         "views_gained": {"state": "ok", "value": 3100000}},
        {"channel_id": "UCb", "subscriber_count": 2930000,
         "subscriber_growth_rate": {"state": "bounded", "upper": 0.017, "value": None},
         "subscriber_delta": {"state": "bounded", "upper": 50000, "value": None},
         "views_gained": {"state": "ok", "value": 12100000}},
        {"channel_id": "UCc", "subscriber_count": 2380,
         "subscriber_growth_rate": {"state": "insufficient_data", "value": None},
         "subscriber_delta": {"state": "insufficient_data", "value": None},
         "views_gained": {"state": "insufficient_data", "value": None}},
    ]
    for mode in ("growth", "general", "subscribers", "views"):
        ranks = growth.rank(channels, mode, GROWTH)
        assert sorted(ranks.values()) == [1, 2, 3], mode


def test_the_general_composite_drops_a_bounded_weight_instead_of_guessing():
    row = {"subscriber_count": 2930000,
           "subscriber_growth_rate": {"state": "bounded", "upper": 0.017, "value": None},
           "views_gained": {"state": "ok", "value": 12100000}}
    composite = growth.general_composite(row, GROWTH, maxima={"subscriber_count": 2930000,
                                                              "views_gained": 12100000})
    assert composite["out_of"] == 50            # 100 minus the 50-point growth weight
    assert composite["excluded"] == ["subscriber_growth"]
