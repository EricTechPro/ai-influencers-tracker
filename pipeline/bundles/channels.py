"""channels.json: the leaderboard bundle. Four rank modes, the measurement floor everywhere.

The self channel is ranked like everyone else and is included in every median and percentile.
is_self drives colour only.
"""
from __future__ import annotations

import datetime as dt
import statistics

from .. import config, growth, read, util

VERSION = 3


def own_coverage(topic_id: str, own_videos: list[dict], today: dt.date,
                 own_thresholds: dict) -> dict:
    """Suppression is a FILTER, never a deletion: the row keeps its score and its verdict."""
    covering = [v for v in own_videos if topic_id in (v.get("topic_ids") or [])]
    if not covering:
        return {"covered": False, "video_id": None, "published_at": None, "suppressed": False}
    newest = max(covering, key=lambda v: v["published_at"])
    age = util.days_between(util.parse_ts(newest["published_at"]).date(), today)
    fresh = age <= own_thresholds["covered_lookback_days"]
    return {"covered": True, "video_id": newest["video_id"],
            "published_at": newest["published_at"],
            "suppressed": bool(own_thresholds["suppress_covered_topics"] and fresh)}


def _windows(ctx) -> list[int]:
    return list(ctx.thresholds["growth"]["windows_days"])


def build(ctx) -> dict:
    growth_thresholds = ctx.thresholds["growth"]
    default_window = growth_thresholds["default_window_days"]
    rows = []
    for roster_row in ctx.roster:
        channel_id = roster_row["channel_id"]
        series = read.channel_series(channel_id)
        newest = next((r for r in reversed(series) if r["status"] == "ok"), None)
        subscriber_count = newest["subscriber_count"] if newest else None
        channel_videos = [v for v in ctx.videos if v["channel_id"] == channel_id]

        view_delta = {"24h": growth.delta_24h(series, "view_count", ctx.today)}
        subscriber_delta, growth_rate, per_1k = {}, {}, {}
        for window in _windows(ctx):
            view_delta[f"{window}d"] = growth.delta(series, "view_count", window, ctx.today)
            subscriber_delta[f"{window}d"] = growth.subscriber_delta(
                series, window, ctx.today, growth_thresholds)
            growth_rate[f"{window}d"] = growth.subscriber_growth_rate(
                series, window, ctx.today, growth_thresholds)
            per_1k[f"{window}d"] = growth.subs_per_1k_views(
                subscriber_delta[f"{window}d"], view_delta[f"{window}d"])

        published = [v for v in channel_videos
                     if util.days_between(util.parse_ts(v["published_at"]).date(), ctx.today)
                     <= 30 and v["view_count"] is not None]
        rows.append({
            "channel_id": channel_id,
            "handle": roster_row.get("handle"), "name": roster_row.get("name"),
            "avatar": f"/assets/channels/{channel_id}.jpg",
            "lang": roster_row.get("lang"), "niche": roster_row.get("niche"),
            "category": roster_row.get("category"),
            "is_self": channel_id == ctx.self_channel_id,
            "blurb": None,                       # Inference tier, build step 11
            "subscriber_count": subscriber_count,
            "subscriber_bucket": growth.bucket_width(subscriber_count),
            "view_count": newest["view_count"] if newest else None,
            "video_count": newest["video_count"] if newest else None,
            "status": newest["status"] if newest else "insufficient_data",
            "view_delta": view_delta,
            "subscriber_delta": subscriber_delta,
            "subscriber_growth_rate": growth_rate,
            "subs_per_1k_views": per_1k,
            "subscriber_daily": ({"state": "unavailable", "reason": "owner_only"}
                                 if channel_id != ctx.self_channel_id
                                 else {"state": "unavailable", "reason": "not_built"}),
            "videos_published": {"30d": len(published)},
            "median_views_per_video": {
                "30d": statistics.median(v["view_count"] for v in published) if published
                else None},
            "still_growing_video_ids": sorted(
                v["video_id"] for v in channel_videos
                if ctx.traction.get(v["video_id"], {}).get("still_growing")),
        })

    # Ranks are computed over EVERY row including the self channel, and over every window.
    for window in _windows(ctx):
        flat = [{"channel_id": r["channel_id"],
                 "subscriber_count": r["subscriber_count"],
                 "subscriber_growth_rate": r["subscriber_growth_rate"][f"{window}d"],
                 "views_gained": r["view_delta"][f"{window}d"]} for r in rows]
        for mode in ("growth", "general", "subscribers", "views"):
            ranked = growth.rank(flat, mode, growth_thresholds)
            for row in rows:
                row.setdefault("rank", {}).setdefault(mode, {})[f"{window}d"] = \
                    ranked[row["channel_id"]]

    rows.sort(key=lambda r: r["rank"]["growth"][f"{default_window}d"])
    return {"version": VERSION, "generated_at": ctx.generated_at,
            "self_channel_id": ctx.self_channel_id, "channels": rows}


def write(ctx) -> None:
    util.write_json(config.db_dir() / "channels.json", build(ctx))
