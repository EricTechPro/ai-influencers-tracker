import datetime as dt

from pipeline import build_data, growth, read
from pipeline.bundles import channels as channels_bundle

TODAY = dt.date(2026, 7, 28)


def _daily_series(end, days, start_subs, growth_per_day, corrupt_last=False):
    """`days` consecutive daily rows ending at `end`, subscriber_count growing linearly.

    Mirrors the real per_simmons/anthropic-ai shape: a purchased vidIQ history plus one real
    day at the end, that last day sometimes tagged corrupt by an unrelated view_count anomaly.
    """
    rows = []
    for i in range(days):
        day = end - dt.timedelta(days=days - 1 - i)
        status = "corrupt" if corrupt_last and i == days - 1 else "ok"
        rows.append({"date": day.isoformat(), "status": status,
                     "subscriber_count": start_subs + growth_per_day * i,
                     "view_count": 1_000_000 + i * 5_000, "video_count": 40 + i})
    return rows


def _channel_row(ctx, series, monkeypatch, channel_id=None):
    monkeypatch.setattr(read, "channel_series", lambda cid: series)
    bundle = channels_bundle.build(ctx)
    row = bundle["channels"][0] if channel_id is None else next(
        r for r in bundle["channels"] if r["channel_id"] == channel_id)
    return row


def test_a_corrupt_today_row_still_supplies_todays_real_subscriber_count(
        ait_root, monkeypatch):
    """Mirrors the real per_simmons/anthropic-ai series: today is tagged corrupt by an
    unrelated view_count anomaly, but its subscriber_count is the freshest real reading the
    pipeline has. subscriber_count is never itself monotonicity-checked (it is not in
    growth.MONOTONIC_KEYS), so it must use today's value; view_count and video_count, the
    fields the corrupt verdict is actually about, must fall back to the newest row where
    status was "ok" instead of publishing the condemned reading.

    Pins growth.MONOTONIC_KEYS for the test rather than trusting its live value: growth.py is
    owned by a concurrent session mid-rework, so this asserts the contract this fix promises
    (condemned fields respect status, everything else respects presence) independent of
    whatever growth.py currently contains.
    """
    monkeypatch.setattr(growth, "MONOTONIC_KEYS", ("view_count", "video_count"))
    series = [
        {"date": "2026-04-30", "status": "ok", "subscriber_count": 2680,
         "view_count": 64181, "video_count": 46},
        {"date": "2026-07-27", "status": "ok", "subscriber_count": 20300,
         "view_count": 1_600_000, "video_count": 69},
        {"date": "2026-07-28", "status": "corrupt", "subscriber_count": 21700,
         "view_count": 1_653_317, "video_count": 70},
    ]
    ctx = build_data.make_context(TODAY)
    row = _channel_row(ctx, series, monkeypatch)

    assert row["subscriber_count"] == 21700
    assert row["subscriber_bucket"] == growth.bucket_width(21700)
    # Both condemned fields fall back to the last row where status was "ok" (2026-07-27), not
    # today's corrupt-flagged reading. Taking view_count from the corrupt row would have
    # published a collapsed 1,653,317-scale reading as the channel's headline, the exact
    # failure mode the corruption check exists to catch (observed for real on
    # UCy71Sv5TVBbn5BYETRQV22Q: 2,854,571 collapsed to 49,857 on its own corrupt tail).
    assert row["view_count"] == 1_600_000
    assert row["video_count"] == 69
    # status itself still tells the truth about the freshest row's own verdict; it just no
    # longer gates which row supplies subscriber_count.
    assert row["status"] == "corrupt"


def test_the_headline_and_the_90d_delta_can_no_longer_form_an_impossible_pair(
        ait_root, monkeypatch):
    """Before this fix, subscriber_count could come from a stale ok row while subscriber_delta
    came from growth.delta()'s own (already-fixed) endpoint selection, so a channel could render
    a 90d delta larger than its own current subscriber count. Both must now agree."""
    series = _daily_series(TODAY, 90, start_subs=2680, growth_per_day=213, corrupt_last=True)
    ctx = build_data.make_context(TODAY)
    row = _channel_row(ctx, series, monkeypatch)

    delta = row["subscriber_delta"]["90d"]
    assert delta["state"] == "ok"
    assert row["subscriber_count"] == series[-1]["subscriber_count"]
    assert delta["value"] <= row["subscriber_count"]
    assert row["subscriber_count"] - delta["value"] == series[0]["subscriber_count"]


def test_a_field_absent_everywhere_stays_the_honest_none(ait_root, monkeypatch):
    """No row in the series ever carries subscriber_count. That is missing data, not a zero,
    and it must not crash the bucket-width computation either."""
    series = [{"date": "2026-07-27", "status": "ok", "subscriber_count": None,
               "view_count": 1000, "video_count": 5},
              {"date": "2026-07-28", "status": "ok", "subscriber_count": None,
               "view_count": 1100, "video_count": 5}]
    ctx = build_data.make_context(TODAY)
    row = _channel_row(ctx, series, monkeypatch)

    assert row["subscriber_count"] is None
    assert row["subscriber_bucket"] is None
    assert row["view_count"] == 1100          # unaffected: present on every row


def _video(video_id, published_at, view_count=1000, channel_id="UCcole"):
    return {"video_id": video_id, "channel_id": channel_id, "published_at": published_at,
            "view_count": view_count, "series": [], "topic_assignments": []}


def test_a_future_dated_video_is_not_counted_as_published_in_the_window(
        ait_root, monkeypatch):
    """util.days_between goes negative when published_at is ahead of ctx.today, so a bare
    `<= 30` accepts a future date in every window between now and then. web/lib/compare.ts
    and web/lib/recent.ts already guard their own lower bound; without the same guard here
    the pipeline's videos_published and the dashboard's own count disagree on exactly the
    row the web-side guard exists to exclude."""
    series = _daily_series(TODAY, 90, start_subs=2680, growth_per_day=213)
    ctx = build_data.make_context(TODAY)
    ctx.videos.extend([
        _video("inside", (TODAY - dt.timedelta(days=5)).isoformat() + "T00:00:00Z"),
        _video("future", (TODAY + dt.timedelta(days=3)).isoformat() + "T00:00:00Z",
               view_count=999_999),
    ])
    row = _channel_row(ctx, series, monkeypatch, channel_id="UCcole")

    assert row["videos_published"]["30d"] == 1
    assert row["median_views_per_video"]["30d"] == 1000
