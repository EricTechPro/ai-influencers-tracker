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


def test_a_corrupt_today_row_still_supplies_todays_real_headline_numbers(ait_root, monkeypatch):
    """Mirrors the real per_simmons/anthropic-ai series: today is tagged corrupt by an
    unrelated view_count anomaly, but its subscriber_count/view_count/video_count are the
    freshest real readings the pipeline has. The headline must use them, not a stale ok row."""
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
    assert row["view_count"] == 1_653_317
    assert row["video_count"] == 70
    # status itself still tells the truth about the freshest row's own verdict; only the
    # per-field headline numbers stop being masked by it.
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
