"""Is a video still climbing, or did it spike and die?

A big number on a card says how many views a video has, never whether it is still getting them.
The failure this exists to catch: a video that went viral on day one, took all its views in
24 hours and has been flat ever since. It looks identical to a genuine breakout on view count
alone, and it is the opposite signal — copying it means arriving after the thing is over.

The comparison is a video against its own history, not against other videos. vidIQ returns vph,
views in the last hour; view_count over the video's age is what it has averaged across its whole
life. A video pulling more per hour now than it has averaged is still accelerating. One pulling a
fraction of its own average has spent itself.

Derived tier: both inputs are vendor numbers, the ratio is ours, and it shows its working.
"""
from __future__ import annotations

import datetime as dt

from . import util

STATES = ("climbing", "steady", "spent", "unmeasured")


def for_video(vph: float | None, view_count: int | None, published_at: str | None,
              now: dt.datetime, thresholds: dict) -> dict:
    """One video's momentum. Unmeasured when any input is missing: a video whose vph nobody
    returned is not a stagnant video, it is one we cannot speak about."""
    if vph is None or not view_count or not published_at:
        return {"state": "unmeasured", "ratio": None, "lifetime_vph": None, "vph": vph}

    age_hours = (now - util.parse_ts(published_at)).total_seconds() / 3600
    if age_hours < thresholds["min_age_hours"]:
        # Everything is above its own average on day one. Judging that early would call every
        # fresh upload a breakout and every one of them would be right for a day.
        return {"state": "unmeasured", "ratio": None, "lifetime_vph": None, "vph": vph}

    lifetime_vph = view_count / age_hours
    if lifetime_vph <= 0:
        return {"state": "unmeasured", "ratio": None, "lifetime_vph": None, "vph": vph}

    ratio = vph / lifetime_vph
    if ratio >= thresholds["climbing_min_ratio"]:
        state = "climbing"
    elif ratio < thresholds["spent_max_ratio"]:
        state = "spent"
    else:
        state = "steady"
    return {"state": state, "ratio": round(ratio, 3),
            "lifetime_vph": round(lifetime_vph, 1), "vph": vph}
