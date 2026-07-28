"""Growth math. Everything here is Derived tier and must render its own formula.

YouTube rounds subscriberCount to three significant figures for every channel you do not own,
so the bucket width is always about 0.1% of the count. Counts below 1,000 are exact.
"""
from __future__ import annotations

import datetime as dt

from . import util

MONOTONIC_KEYS = ("view_count", "video_count")


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
    usable = {d: r for d, r in by_date.items()
              if r.get("status") == "ok" and r.get(metric) is not None}
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
