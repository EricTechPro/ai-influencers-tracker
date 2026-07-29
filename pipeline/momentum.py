"""Is a video still pulling views, or is it done?

A big number on a card says how many views a video has, never whether it is still getting them.
The failure this exists to catch: a video that took its views in a burst and has been flat since.
On view count alone it is indistinguishable from one still climbing, and it is the opposite
signal — copying it means arriving after the thing is over.

The measure is how much of its own total a video is still adding each day: vidIQ's vph over 24
hours, against the views it already has. 3.6%/day is a video still being found; 0.04%/day is a
video nobody is watching any more. This is the same shape as traction.still_growing_min_share_7d,
which asks the same question of our own snapshot series over a week.

Deliberately NOT vph against the video's lifetime average. That was the first attempt and it was
wrong: every view curve is concave, so current vph sits below the lifetime average for almost
every healthy video, and the check called 124 of 169 outliers dead — including one adding 3.6% of
its total every day with a visibly rising curve. It was measuring the shape all view curves have,
not whether this one had stopped.

Derived tier: vph and view_count are vendor numbers, the share is ours, and it shows its working.
"""
from __future__ import annotations

import datetime as dt

from . import util

STATES = ("climbing", "steady", "flat", "unmeasured")


def for_video(vph: float | None, view_count: int | None, published_at: str | None,
              now: dt.datetime, thresholds: dict) -> dict:
    """One video's momentum. Unmeasured when any input is missing: a video whose vph nobody
    returned is not a flat video, it is one we cannot speak about."""
    if vph is None or not view_count or not published_at:
        return {"state": "unmeasured", "daily_share": None, "per_day": None, "vph": vph}

    age_hours = (now - util.parse_ts(published_at)).total_seconds() / 3600
    if age_hours < thresholds["min_age_hours"]:
        # A video's first day is all burst. Judging that early would call every fresh upload a
        # breakout, and every one of them would be right for a day.
        return {"state": "unmeasured", "daily_share": None, "per_day": None, "vph": vph}

    per_day = vph * 24
    share = per_day / view_count
    if share >= thresholds["climbing_min_daily_share"]:
        state = "climbing"
    elif share < thresholds["flat_max_daily_share"]:
        state = "flat"
    else:
        state = "steady"
    return {"state": state, "daily_share": round(share, 4),
            "per_day": round(per_day), "vph": vph}
