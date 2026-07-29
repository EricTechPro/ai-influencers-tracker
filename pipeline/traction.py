"""Per-video traction. Free and exact, because it is built from daily videos.list counts.

still_growing needs BOTH conditions. Volume alone promotes any large back catalogue; share alone
promotes noise on a tiny video.
"""
from __future__ import annotations

import datetime as dt

from . import growth


def for_video(series: list[dict], total_views: int | None, today: dt.date,
              thresholds: dict, anchor_max_lag_days: int = growth.ANCHOR_MAX_LAG_DAYS) -> dict:
    lag = anchor_max_lag_days
    gained = {
        "24h": growth.delta_24h(series, "view_count", today, lag),
        "7d": growth.delta(series, "view_count", 7, today, lag),
        "30d": growth.delta(series, "view_count", 30, today, lag),
    }
    week = gained["7d"]
    share = None
    if week["state"] == "ok" and total_views:
        share = week["value"] / total_views

    if week["state"] != "ok" or share is None:
        still_growing = None                       # unmeasured, not False
    else:
        still_growing = (week["value"] >= thresholds["still_growing_min_views_7d"]
                         and share >= thresholds["still_growing_min_share_7d"])

    return {"views_gained": gained, "share_recent_7d": share, "still_growing": still_growing}
