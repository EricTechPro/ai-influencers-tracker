import datetime as dt

from pipeline import growth, util

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
    """We hold the 26th and it is unusable: the channel was private that day and no later sweep
    can go back for it. A hole, not a shortfall."""
    s = (series([("2026-07-25", 100), ("2026-07-27", 300)])
         + [{"date": "2026-07-26", "status": "absent", "view_count": None}])
    assert growth.delta(s, "view_count", 3, TODAY)["state"] == "blocked"


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


def _run(start_date: str, values: list[int]) -> list[dict]:
    day = dt.date.fromisoformat(start_date)
    return [{"date": str(day + dt.timedelta(days=i)), "status": "ok", "view_count": v}
            for i, v in enumerate(values)]


def test_a_long_self_consistent_run_re_bases_instead_of_staying_condemned():
    """One bad reading must not condemn every day after it until the count climbs back over a
    stale high-water mark. Anthropic dropped once in December and then produced 238 days of
    pristine rising views (31,306,618 -> 31,964,440) that the filter threw away, reporting
    "building" on a channel whose data was perfect. A run that re-establishes its own rising
    baseline for rebase_min_days is a re-based series, not that many days of corruption."""
    series = _run("2026-01-01", [1_000_000]) + _run("2026-01-02", list(range(500_000, 500_020)))
    filtered = growth.filter_monotonic(series, rebase_min_days=14)
    # The reading that broke the sequence is still corrupt; it is the discontinuity itself.
    assert filtered[1]["status"] == "corrupt"
    # Everything after it is accepted, so a window inside the run is measurable.
    assert [row["status"] for row in filtered[2:]] == ["ok"] * 19


def test_a_long_run_re_bases_even_when_it_later_climbs_back_over_the_old_mark():
    """Pat Simmons: 192,901 views, one drop to 36,338, then 240 days climbing back to 185,611
    before clearing the old mark. Those 240 days are real data and must not be thrown away just
    because the series eventually recovered on its own."""
    series = (_run("2026-01-01", [192_901])
              + _run("2026-01-02", list(range(36_338, 36_338 + 20)))
              + _run("2026-01-22", [200_000]))
    filtered = growth.filter_monotonic(series, rebase_min_days=14)
    assert filtered[1]["status"] == "corrupt"            # the drop itself
    assert all(r["status"] == "ok" for r in filtered[2:])  # the run, and the recovery


def test_a_short_excursion_that_recovers_stays_corrupt():
    """Three bad days that fix themselves are an excursion, not a new baseline."""
    series = (_run("2026-01-01", [1_000_000])
              + _run("2026-01-02", [10, 11, 12])
              + _run("2026-01-05", [1_000_100]))
    filtered = growth.filter_monotonic(series, rebase_min_days=14)
    assert [r["status"] for r in filtered] == ["ok", "corrupt", "corrupt", "corrupt", "ok"]


def test_a_short_garbage_burst_is_not_re_based():
    """Robin Ebers, live: 2,854,571 -> 49,605 and still there three days later. Non-decreasing
    inside the burst, but three days is not evidence that a channel lost 98% of its views."""
    series = _run("2026-07-25", [2_854_571]) + _run("2026-07-26", [49_605, 49_605, 49_857])
    filtered = growth.filter_monotonic(series, rebase_min_days=14)
    assert [row["status"] for row in filtered] == ["ok", "corrupt", "corrupt", "corrupt"]


def test_a_run_that_keeps_collapsing_never_re_bases():
    """Re-basing is earned by internal consistency. A run that is still falling past the tolerance
    against its own points has none, however long it goes on."""
    collapsing = [int(500_000 * (0.8 ** i)) for i in range(20)]
    series = _run("2026-01-01", [1_000_000]) + _run("2026-01-02", collapsing)
    filtered = growth.filter_monotonic(series, rebase_min_days=14)
    assert all(row["status"] == "corrupt" for row in filtered[1:])


def test_a_wobble_inside_a_long_run_does_not_condemn_the_whole_run():
    """Anthropic's 238 days contain one dip. Demanding a flawless run threw away all of them."""
    body = list(range(500_000, 500_010)) + [499_999] + list(range(500_010, 500_025))
    series = _run("2026-01-01", [1_000_000]) + _run("2026-01-02", body)
    filtered = growth.filter_monotonic(series, rebase_min_days=14)
    assert sum(1 for r in filtered if r["status"] == "ok") >= 14


def test_a_window_spanning_the_discontinuity_is_still_refused():
    """The re-based run is trustworthy; the step into it is not. Keeping the violating day corrupt
    is what stops a delta being computed straight across the cliff."""
    series = _run("2026-01-01", [1_000_000]) + _run("2026-01-02", list(range(500_000, 500_020)))
    filtered = growth.filter_monotonic(series, rebase_min_days=14)
    assert growth.delta(filtered, "view_count", 21, dt.date(2026, 1, 21))["state"] == "blocked"
    assert growth.delta(filtered, "view_count", 10, dt.date(2026, 1, 21))["state"] == "ok"


def test_a_stored_corrupt_verdict_is_re_judged_not_inherited():
    """corrupt is this function's own verdict, and vidiq.py bakes it into _raw/backfill at fetch
    time. Inheriting it means a row judged under an older, stricter rule stays condemned forever
    however the rule changes: 3,723 rows in _raw were flagged by the old video_count check and a
    rebuild could not clear one of them. _db is regenerable, so the verdict is recomputed from the
    values every build. The values themselves are never touched."""
    s = [{"date": "2026-07-25", "status": "ok", "view_count": 100, "video_count": 10},
         {"date": "2026-07-26", "status": "corrupt", "view_count": 200, "video_count": 9},
         {"date": "2026-07-27", "status": "ok", "view_count": 300, "video_count": 9}]
    filtered = growth.filter_monotonic(s)
    assert [row["status"] for row in filtered] == ["ok", "ok", "ok"]
    assert filtered[1]["view_count"] == 200


def test_re_judging_still_condemns_a_row_that_is_genuinely_corrupt():
    s = [{"date": "2026-07-25", "status": "ok", "view_count": 100},
         {"date": "2026-07-26", "status": "corrupt", "view_count": 5},
         {"date": "2026-07-27", "status": "ok", "view_count": 300}]
    assert [row["status"] for row in growth.filter_monotonic(s)] == ["ok", "corrupt", "ok"]


def test_absent_is_not_this_function_s_verdict_and_passes_through():
    """snapshot.py writes absent when a channel did not come back. Only corrupt is re-judged."""
    s = [{"date": "2026-07-25", "status": "ok", "view_count": 100},
         {"date": "2026-07-26", "status": "absent", "view_count": None},
         {"date": "2026-07-27", "status": "ok", "view_count": 300}]
    assert [row["status"] for row in growth.filter_monotonic(s)] == ["ok", "absent", "ok"]


def test_the_tolerance_default_matches_config():
    """growth.py stays pure and takes thresholds as arguments, so the module default is a mirror
    of config. A mirror that drifts is worse than no mirror."""
    from pipeline import config
    assert config.thresholds()["growth"]["view_drop_tolerance"] == growth.VIEW_DROP_TOLERANCE
    assert config.thresholds()["growth"]["rebase_min_days"] == growth.REBASE_MIN_DAYS


def test_video_count_is_no_longer_a_monotonic_key():
    assert "video_count" not in growth.MONOTONIC_KEYS


def test_deleting_a_video_is_an_event_not_a_corrupt_reading():
    """video_count goes down whenever a creator deletes or unlists something, which is a normal
    thing for a channel to do and not a bad reading. It used to mark the day corrupt, and since
    a corrupt day is dropped from every MONOTONIC_KEYS window, one deletion took that channel's
    view deltas with it: 58 of the roster's 72 channels first broke on exactly this.
    Nothing anywhere computes a delta over video_count, so the check protected no number."""
    s = [{"date": "2026-07-25", "status": "ok", "view_count": 100, "video_count": 485},
         {"date": "2026-07-26", "status": "ok", "view_count": 200, "video_count": 484},
         {"date": "2026-07-27", "status": "ok", "view_count": 300, "video_count": 484}]
    assert [row["status"] for row in growth.filter_monotonic(s)] == ["ok", "ok", "ok"]
    assert growth.delta(s, "view_count", 3, TODAY) == {
        "state": "ok", "value": 200, "from": "2026-07-25", "to": "2026-07-27"}


def test_a_routine_view_purge_is_tolerated():
    """YouTube removes views it decides were invalid, so view_count ticks down by a fraction of a
    percent on a healthy channel. Observed live: 22,009 -> 21,991 and 19,367 -> 19,363."""
    s = [{"date": "2026-07-25", "status": "ok", "view_count": 22009},
         {"date": "2026-07-26", "status": "ok", "view_count": 21991},
         {"date": "2026-07-27", "status": "ok", "view_count": 22050}]
    assert [row["status"] for row in growth.filter_monotonic(s)] == ["ok", "ok", "ok"]


def test_a_view_count_that_falls_off_a_cliff_is_still_corrupt():
    """Observed live on Pat Simmons: 192,901 -> 36,338, an 81% fall in a day. A purge does not
    do that; a bad read does. The tolerance admits the first case without admitting this one."""
    s = [{"date": "2026-07-25", "status": "ok", "view_count": 192901},
         {"date": "2026-07-26", "status": "ok", "view_count": 36338}]
    assert [row["status"] for row in growth.filter_monotonic(s)] == ["ok", "corrupt"]


def test_the_tolerance_is_relative_not_absolute():
    """A 500-view drop is noise on a million-view channel and a cliff on a thousand-view one."""
    big = [{"date": "2026-07-25", "status": "ok", "view_count": 1_000_000},
           {"date": "2026-07-26", "status": "ok", "view_count": 999_500}]
    small = [{"date": "2026-07-25", "status": "ok", "view_count": 1_000},
             {"date": "2026-07-26", "status": "ok", "view_count": 500}]
    assert [r["status"] for r in growth.filter_monotonic(big)] == ["ok", "ok"]
    assert [r["status"] for r in growth.filter_monotonic(small)] == ["ok", "corrupt"]


def test_a_window_short_of_days_is_building_and_says_so():
    """Fewer dates exist than the window asks for. Another day of collecting fixes this, which is
    exactly what "building" promises."""
    s = _run("2026-07-26", [100, 200, 300])
    out = growth.delta(s, "view_count", 7, dt.date(2026, 7, 28))
    assert out["state"] == "building"
    assert (out["have"], out["need"]) == (3, 7)


def test_a_window_holed_by_a_bad_day_is_blocked_not_building():
    """Every date the window needs exists; one of them failed the corruption check. Waiting will
    never fill that hole - the day already happened and its reading is wrong forever.

    AI Systems by Jimi reads 179 of 180 on its view delta because 2026-02-10 came back as 606
    views against 21,103 the day before. Rendering that as "building 179/180" invites you to wait
    for a 180th day that is already here, so the state has its own name and its own count: what
    is missing, not what is present.
    """
    days = [{"date": d, "status": "ok", "view_count": 100 + i}
            for i, d in enumerate(util.last_n_dates(dt.date(2026, 7, 28), 7))]
    days[3]["status"] = "corrupt"
    out = growth.delta(days, "view_count", 7, dt.date(2026, 7, 28))
    assert out["state"] == "blocked"
    assert out["unusable"] == 1
    assert out["need"] == 7
    assert out["value"] is None


def test_blocked_beats_building_when_a_window_is_both_short_and_holed():
    """A hole is the permanent half of the problem, so it is the half that gets named."""
    days = [{"date": d, "status": "ok", "view_count": 100 + i}
            for i, d in enumerate(util.last_n_dates(dt.date(2026, 7, 28), 7))]
    days[2]["status"] = "corrupt"
    out = growth.delta(days[:6], "view_count", 7, dt.date(2026, 7, 28))
    assert out["state"] == "blocked"


def test_a_corrupt_point_is_not_consumed_by_delta():
    s = [{"date": "2026-07-25", "status": "ok", "view_count": 100},
         {"date": "2026-07-26", "status": "corrupt", "view_count": 5},
         {"date": "2026-07-27", "status": "ok", "view_count": 300}]
    assert growth.delta(s, "view_count", 3, TODAY)["state"] == "blocked"


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


CORRUPT_VIEW_CLEAN_SUBS = [
    {"date": "2026-07-25", "status": "ok", "view_count": 100, "subscriber_count": 1000},
    {"date": "2026-07-26", "status": "corrupt", "view_count": 5, "subscriber_count": 1010},
    {"date": "2026-07-27", "status": "ok", "view_count": 300, "subscriber_count": 1020}]


def test_a_corrupt_view_count_day_does_not_block_a_clean_subscriber_delta():
    """subscriber_count is never checked for monotonicity, so a view_count corruption flag on a
    row must not also mask that row's otherwise-usable subscriber_count."""
    assert growth.delta(CORRUPT_VIEW_CLEAN_SUBS, "subscriber_count", 3, TODAY) == {
        "state": "ok", "value": 20, "from": "2026-07-25", "to": "2026-07-27"}


def test_the_same_series_still_refuses_a_views_gained_delta_over_the_corrupt_day():
    assert growth.delta(CORRUPT_VIEW_CLEAN_SUBS, "view_count", 3, TODAY)["state"] == "blocked"


def test_a_missing_subscriber_count_day_still_counts_as_missing():
    s = [{"date": "2026-07-25", "status": "ok", "view_count": 100, "subscriber_count": 1000},
         {"date": "2026-07-26", "status": "ok", "view_count": 200, "subscriber_count": None},
         {"date": "2026-07-27", "status": "ok", "view_count": 300, "subscriber_count": 1020}]
    # The row for the 26th exists and carries no subscriber_count, so the window has a hole in
    # it rather than a missing day.
    assert growth.delta(s, "subscriber_count", 3, TODAY)["state"] == "blocked"


# --- the anchor: which day a window ends on ---------------------------------------------------

def test_a_full_window_ending_yesterday_measures_rather_than_reporting_building():
    """The sweep runs once a day, so from midnight until it lands the newest snapshot is
    yesterday's. Anchoring every window to the calendar's today made that one absent day the
    newest of all six windows at once: the whole roster read `building, 89 of 90` off 366 days of
    stored history. The window still spans exactly the days it asks for; it ends at the last day
    that was actually measured."""
    dates = util.last_n_dates(TODAY - dt.timedelta(days=1), 3)
    s = series([(d, 100 * (i + 1)) for i, d in enumerate(dates)])
    assert growth.delta(s, "view_count", 3, TODAY) == {
        "state": "ok", "value": 200, "from": dates[0], "to": dates[-1]}


def test_the_anchor_never_shortens_the_window():
    """Anchoring is not a tolerance. Two days of history answer a 3-day window with `building`
    no matter which day they end on, because a number computed over fewer days than requested is
    the one thing spec 6 forbids."""
    dates = util.last_n_dates(TODAY - dt.timedelta(days=1), 2)
    s = series([(d, 100) for d in dates])
    assert growth.delta(s, "view_count", 3, TODAY) == {
        "state": "building", "have": 2, "need": 3, "value": None}


def test_a_series_that_stopped_long_ago_is_building_not_a_stale_number():
    """A channel whose snapshots stopped months back holds a complete 3-day run somewhere in its
    past. Reporting it would date-stamp old growth as current. Past the lag the anchor stays on
    today and the shortfall is stated."""
    dates = util.last_n_dates(TODAY - dt.timedelta(days=30), 3)
    s = series([(d, 100 * (i + 1)) for i, d in enumerate(dates)])
    assert growth.delta(s, "view_count", 3, TODAY)["state"] == "building"


def test_the_lag_the_anchor_may_fall_behind_comes_from_config():
    from pipeline import config
    assert config.thresholds()["growth"]["anchor_max_lag_days"] == growth.ANCHOR_MAX_LAG_DAYS
