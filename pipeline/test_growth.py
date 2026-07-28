import datetime as dt

from pipeline import growth

TODAY = dt.date(2026, 7, 27)


def series(pairs, metric="view_count", status="ok"):
    return [{"date": d, "status": status, metric: v} for d, v in pairs]


def test_a_complete_window_returns_newest_minus_oldest():
    s = series([("2026-07-25", 100), ("2026-07-26", 150), ("2026-07-27", 400)])
    assert growth.delta(s, "view_count", 3, TODAY) == {
        "state": "ok", "value": 300, "from": "2026-07-25", "to": "2026-07-27"}


def test_a_missing_tuesday_makes_7d_read_building_6_of_7():
    dates = [f"2026-07-{d}" for d in (21, 22, 23, 24, 26, 27)]      # 25 is missing
    s = series([(d, 100) for d in dates])
    assert growth.delta(s, "view_count", 7, TODAY) == {
        "state": "building", "have": 6, "need": 7, "value": None}


def test_no_branch_returns_a_number_over_fewer_days_than_requested():
    s = series([("2026-07-26", 100), ("2026-07-27", 900)])
    for window in (3, 7, 30, 90):
        assert growth.delta(s, "view_count", window, TODAY)["value"] is None


def test_an_absent_point_does_not_count_as_present():
    s = (series([("2026-07-25", 100), ("2026-07-27", 300)])
         + [{"date": "2026-07-26", "status": "absent", "view_count": None}])
    assert growth.delta(s, "view_count", 3, TODAY)["state"] == "building"


def test_an_empty_series_is_insufficient_data_not_zero():
    assert growth.delta([], "view_count", 7, TODAY) == {
        "state": "insufficient_data", "value": None}


def test_24h_uses_two_points_and_never_compares_a_point_to_itself():
    s = series([("2026-07-26", 100), ("2026-07-27", 791)])
    assert growth.delta_24h(s, "view_count", TODAY) == {
        "state": "ok", "value": 691, "from": "2026-07-26", "to": "2026-07-27"}
    one_point = series([("2026-07-27", 791)])
    assert growth.delta_24h(one_point, "view_count", TODAY) == {
        "state": "building", "have": 1, "need": 2, "value": None}


def test_the_monotonicity_filter_rejects_the_real_corrupt_series():
    """Observed 2026-07-27 on a live vidIQ series: views 21,103 -> 606, videos 19 -> 5."""
    s = [{"date": "2026-07-24", "status": "ok", "view_count": 20000, "video_count": 18},
         {"date": "2026-07-25", "status": "ok", "view_count": 21103, "video_count": 19},
         {"date": "2026-07-26", "status": "ok", "view_count": 606, "video_count": 5},
         {"date": "2026-07-27", "status": "ok", "view_count": 21500, "video_count": 20}]
    filtered = growth.filter_monotonic(s)
    assert [row["status"] for row in filtered] == ["ok", "ok", "corrupt", "ok"]
    assert filtered[2]["view_count"] == 606          # stored as it arrived, never repaired


def test_a_corrupt_point_is_not_consumed_by_delta():
    s = [{"date": "2026-07-25", "status": "ok", "view_count": 100},
         {"date": "2026-07-26", "status": "corrupt", "view_count": 5},
         {"date": "2026-07-27", "status": "ok", "view_count": 300}]
    assert growth.delta(s, "view_count", 3, TODAY)["state"] == "building"


def test_subscriber_count_is_not_subject_to_monotonicity():
    """People unsubscribe, and 3-sig-fig rounding wobbles. Only views and videos are monotonic."""
    s = [{"date": "2026-07-26", "status": "ok", "view_count": 100, "subscriber_count": 220000},
         {"date": "2026-07-27", "status": "ok", "view_count": 200, "subscriber_count": 219000}]
    assert [row["status"] for row in growth.filter_monotonic(s)] == ["ok", "ok"]


def test_the_filter_compares_against_the_last_good_point_not_the_previous_one():
    s = [{"date": "2026-07-25", "status": "ok", "view_count": 100},
         {"date": "2026-07-26", "status": "ok", "view_count": 5},
         {"date": "2026-07-27", "status": "ok", "view_count": 50}]
    assert [row["status"] for row in growth.filter_monotonic(s)] == ["ok", "corrupt", "corrupt"]
