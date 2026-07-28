"""Growth math. Everything here is Derived tier and must render its own formula.

YouTube rounds subscriberCount to three significant figures for every channel you do not own,
so the bucket width is always about 0.1% of the count. Counts below 1,000 are exact.
"""
from __future__ import annotations

import datetime as dt
from collections.abc import Callable

from . import util

MONOTONIC_KEYS = ("view_count", "video_count")
UNMEASURED = ("building", "insufficient_data", "no_baseline", "unavailable")


def bucket_width(subscriber_count: int | None) -> int | None:
    """The rounding granularity YouTube applied. 219,000 -> 1,000. 2,380 -> 10. None -> None."""
    if subscriber_count is None:
        return None
    count = int(subscriber_count)
    if count < 1000:
        return 1
    return 10 ** (len(str(count)) - 3)


def load_series(series: list[dict]) -> dict[str, dict]:
    """Date-keyed view of a series. A later write for the same date wins."""
    return {row["date"]: row for row in sorted(series, key=lambda r: r["date"])}


def filter_monotonic(series: list[dict], keys: tuple[str, ...] = MONOTONIC_KEYS) -> list[dict]:
    """Mark any point that goes backwards on a monotonic metric as corrupt.

    The value is left exactly as it arrived. Correcting it on the way in would make the error
    invisible on the way out. Comparison is against the last point that survived, so a single
    corrupt reading cannot rehabilitate the ones after it.
    """
    out: list[dict] = []
    last_good: dict | None = None
    for row in sorted(series, key=lambda r: r["date"]):
        row = dict(row)
        if row.get("status") != "ok":
            out.append(row)
            continue
        if last_good is not None:
            for key in keys:
                current, previous = row.get(key), last_good.get(key)
                if current is not None and previous is not None and current < previous:
                    row["status"] = "corrupt"
                    break
        if row["status"] == "ok":
            last_good = row
        out.append(row)
    return out


def delta(series: list[dict], metric: str, window_days: int, today: dt.date) -> dict:
    """newest - oldest over exactly window_days consecutive dates, or building, or insufficient.

    Spec §6: no branch may return a number computed over fewer days than requested. A window of
    N dates spans N-1 days of growth, which understates rather than overstates. That is the
    stated rule, and understating is the safe direction.
    """
    by_date = load_series(series)
    # status only ever reflects a MONOTONIC_KEYS violation, so it only gates those metrics.
    # subscriber_count is never monotonicity-checked and has its own noise guard downstream
    # (measurement_floor), so a view_count/video_count corruption flag on a row must not also
    # mask that row's otherwise-usable subscriber_count.
    if metric in MONOTONIC_KEYS:
        usable = {d: r for d, r in by_date.items()
                  if r.get("status") == "ok" and r.get(metric) is not None}
    else:
        usable = {d: r for d, r in by_date.items() if r.get(metric) is not None}
    if not usable:
        return {"state": "insufficient_data", "value": None}
    required = util.last_n_dates(today, window_days)
    present = [d for d in required if d in usable]
    if len(present) < window_days:
        return {"state": "building", "have": len(present), "need": window_days, "value": None}
    oldest, newest = present[0], present[-1]
    return {"state": "ok", "value": usable[newest][metric] - usable[oldest][metric],
            "from": oldest, "to": newest}


def delta_24h(series: list[dict], metric: str, today: dt.date) -> dict:
    """A 24h delta needs two points. window_days=1 would compare a point to itself."""
    return delta(series, metric, 2, today)


def views_gained(series: list[dict], window_days: int, today: dt.date) -> dict:
    return delta(series, "view_count", window_days, today)


def measurement_floor(subscriber_count: int | None, growth_thresholds: dict) -> int | None:
    """5x the channel's bucket width. Below this a delta is bounded, never a bare number."""
    bucket = bucket_width(subscriber_count)
    if bucket is None:
        return None
    return growth_thresholds["subscriber_floor_buckets"] * bucket


def subscriber_delta(series: list[dict], window_days: int, today: dt.date,
                     growth_thresholds: dict) -> dict:
    """ok | bounded | building | insufficient_data. Bounded carries upper and never a value."""
    cell = delta(series, "subscriber_count", window_days, today)
    if cell["state"] != "ok":
        return cell
    by_date = load_series(series)
    newest = by_date[cell["to"]]["subscriber_count"]
    bucket = bucket_width(newest)
    floor = measurement_floor(newest, growth_thresholds)
    if abs(cell["value"]) >= floor:
        return {"state": "ok", "value": cell["value"], "bucket": bucket,
                "from": cell["from"], "to": cell["to"]}
    return {"state": "bounded", "upper": floor, "value": None, "bucket": bucket,
            "from": cell["from"], "to": cell["to"]}


def subscriber_growth_rate(series: list[dict], window_days: int, today: dt.date,
                           growth_thresholds: dict) -> dict:
    """The delta over the oldest count in the window. Bounded bounds the rate, not the delta."""
    cell = subscriber_delta(series, window_days, today, growth_thresholds)
    if cell["state"] in UNMEASURED:
        return cell
    base = load_series(series)[cell["from"]]["subscriber_count"]
    if not base:
        return {"state": "insufficient_data", "value": None}
    if cell["state"] == "bounded":
        return {"state": "bounded", "upper": cell["upper"] / base, "value": None,
                "bucket": cell["bucket"], "from": cell["from"], "to": cell["to"]}
    return {"state": "ok", "value": cell["value"] / base, "bucket": cell["bucket"],
            "from": cell["from"], "to": cell["to"]}


def subs_per_1k_views(sub_cell: dict, views_cell: dict) -> dict:
    """The conversion metric. Its numerator carries the floor, so the result inherits it."""
    if views_cell.get("state") != "ok" or not views_cell.get("value"):
        return {"state": views_cell.get("state", "insufficient_data"), "value": None}
    per_1k = views_cell["value"] / 1000
    if sub_cell.get("state") == "ok":
        return {"state": "ok", "value": sub_cell["value"] / per_1k}
    if sub_cell.get("state") == "bounded":
        return {"state": "bounded", "upper": sub_cell["upper"] / per_1k, "value": None}
    return {"state": sub_cell.get("state", "insufficient_data"), "value": None}


def rank_value(cell: dict) -> tuple[int, float]:
    """(tier, magnitude). Tier 2 is measured, 1 is bounded, 0 is unmeasured."""
    state = cell.get("state")
    if state == "ok":
        return (2, float(cell.get("value") or 0))
    if state == "bounded":
        return (1, float(cell.get("upper") or 0))
    return (0, 0.0)


def sort_rows(rows: list, key: Callable[[object], dict], descending: bool = True) -> list:
    """Partitioned sort: ok, then bounded, then unmeasured, in BOTH directions.

    A plain reversible key cannot express this: reversing would put the unmeasured rows first.
    """
    tiers: dict[int, list] = {2: [], 1: [], 0: []}
    for row in rows:
        tier, magnitude = rank_value(key(row))
        tiers[tier].append((magnitude, row))
    out = []
    for tier in (2, 1, 0):
        bucket = tiers[tier]
        if tier:
            bucket.sort(key=lambda pair: pair[0], reverse=descending)
        out.extend(row for _, row in bucket)
    return out


def general_composite(row: dict, growth_thresholds: dict, maxima: dict) -> dict:
    """Weighted composite of subscriber growth, subscriber count, and views gained.

    A bounded or unmeasured input DROPS ITS WEIGHT rather than contributing a guess, and the
    reduced denominator is returned so the row can render x / 50. Never impute a missing input.
    """
    weights = growth_thresholds["rank_weights"]
    parts = {
        "subscriber_growth": (row.get("subscriber_growth_rate", {}), None),
        "subscriber_count": ({"state": "ok", "value": row.get("subscriber_count")},
                             maxima.get("subscriber_count")),
        "views_gained": (row.get("views_gained", {}), maxima.get("views_gained")),
    }
    points, out_of, excluded = 0.0, 0, []
    for key, (cell, scale) in parts.items():
        weight = weights[key]
        usable = cell.get("state") == "ok" and cell.get("value") is not None
        if key == "subscriber_growth":
            scale = 1.0                      # already a rate
        if not usable or not scale:
            excluded.append(key)
            continue
        out_of += weight
        points += weight * min(1.0, cell["value"] / scale)
    return {"value": points if out_of else None, "out_of": out_of, "excluded": excluded}


def rank(channels: list[dict], mode: str, growth_thresholds: dict) -> dict[str, int]:
    """channel_id -> 1-based rank, for one of the four modes. Always a total order."""
    maxima = {
        "subscriber_count": max((c.get("subscriber_count") or 0 for c in channels), default=0),
        "views_gained": max((c.get("views_gained", {}).get("value") or 0 for c in channels),
                            default=0),
    }
    def composite_cell(channel: dict) -> dict:
        composite = general_composite(channel, growth_thresholds, maxima)
        state = "ok" if composite["out_of"] else "insufficient_data"
        # Scaled to the reduced denominator so a row measured on 50 points is comparable
        # to one measured on 100 without ever imputing the missing input.
        value = (composite["value"] / composite["out_of"]) if composite["out_of"] else None
        return {"state": state, "value": value, "out_of": composite["out_of"],
                "excluded": composite["excluded"]}

    def subscribers_cell(channel: dict) -> dict:
        count = channel.get("subscriber_count")
        if count is None:
            return {"state": "insufficient_data", "value": None}
        return {"state": "ok", "value": count}

    keys = {
        "growth": lambda c: c.get("subscriber_growth_rate", {}),
        "subscribers": subscribers_cell,
        "views": lambda c: c.get("views_gained", {}),
        "general": composite_cell,
    }
    if mode not in keys:
        raise ValueError(f"unknown rank mode {mode!r}")
    ordered = sort_rows(channels, key=keys[mode], descending=True)
    return {c["channel_id"]: i + 1 for i, c in enumerate(ordered)}
