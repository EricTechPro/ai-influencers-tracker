"""A video's views over its channel's own baseline. Free, exact, and computed at every window.

Nothing paid can improve this: viewCount is exact, and the multiplier is built from it.
Shorts and long-form carry separate baselines because mixing two distributions makes both wrong.
"""
from __future__ import annotations

import datetime as dt
import statistics

from . import util

KINDS = ("long", "short")


def baseline(videos: list[dict], kind: str, today: dt.date, thresholds: dict) -> dict:
    """Median view count of the last baseline_n mature uploads of one kind."""
    mature = [
        v for v in videos
        if v.get("type") == kind
        and v.get("view_count") is not None
        and util.days_between(util.parse_ts(v["published_at"]).date(), today)
        >= thresholds["maturity_days"]
    ]
    mature.sort(key=lambda v: v["published_at"], reverse=True)
    sample = mature[:thresholds["baseline_n"]]
    if len(sample) < thresholds["baseline_min_videos"]:
        return {"state": "no_baseline", "value": None, "n": len(sample)}
    return {"state": "ok",
            "value": statistics.median(v["view_count"] for v in sample),
            "n": len(sample)}


def baselines(videos: list[dict], today: dt.date, thresholds: dict) -> dict[str, dict]:
    return {kind: baseline(videos, kind, today, thresholds) for kind in KINDS}


def for_video(video: dict, channel_baselines: dict[str, dict]) -> dict:
    """The videos.json multiplier block. no_baseline renders as unknown, never as low."""
    base = channel_baselines.get(video.get("type"), {"state": "no_baseline", "value": None, "n": 0})
    if base["state"] != "ok" or base["value"] <= 0 or video.get("view_count") is None:
        return {"value": None, "state": "no_baseline", "baseline": None,
                "baseline_n": base.get("n", 0), "source": "computed"}
    return {"value": video["view_count"] / base["value"], "state": "ok",
            "baseline": base["value"], "baseline_n": base["n"], "source": "computed"}
