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


def _newest_with(series: list[dict], field: str) -> dict | None:
    """The newest row carrying `field`, skipping rows whose status condemns that very field.

    `status` reflects a growth.MONOTONIC_KEYS violation and nothing else, so it is a verdict on
    the fields actually being monitored (currently `view_count`, `video_count`). For every other
    field it is unrelated news: `subscriber_count` is never monotonicity-checked and must not go
    stale just because an unrelated metric tripped the check. That's why this does not simply
    filter every field on status.

    But a condemned field must not ignore status either. `UCy71Sv5TVBbn5BYETRQV22Q`'s newest row
    is corrupt because its view count collapsed 2,854,571 to 49,857; taking `view_count` from
    that row would publish 49,857 as the channel's headline, the exact reading the corruption
    check exists to catch. A condemned field falls back to its last row where status was "ok";
    every other field still takes the freshest row it appears in, regardless of status.
    """
    condemned = field in growth.MONOTONIC_KEYS
    return next(
        (r for r in reversed(series)
         if r.get(field) is not None and not (condemned and r.get("status") != "ok")),
        None,
    )


def build(ctx) -> dict:
    growth_thresholds = ctx.thresholds["growth"]
    default_window = growth_thresholds["default_window_days"]
    rows = []
    for roster_row in ctx.roster:
        channel_id = roster_row["channel_id"]
        series = read.channel_series(channel_id)
        subs_row = _newest_with(series, "subscriber_count")
        view_row = _newest_with(series, "view_count")
        video_row = _newest_with(series, "video_count")
        subscriber_count = subs_row["subscriber_count"] if subs_row else None
        # The channel's own freshest-row verdict, not tied to whichever row supplied any one
        # field above: it answers "how trustworthy is our latest observation," full stop.
        tail_status = series[-1]["status"] if series else "insufficient_data"
        channel_videos = [v for v in ctx.videos if v["channel_id"] == channel_id]

        lag = growth_thresholds["anchor_max_lag_days"]
        view_delta = {"24h": growth.delta_24h(series, "view_count", ctx.today, lag)}
        subscriber_delta, growth_rate, per_1k = {}, {}, {}
        for window in _windows(ctx):
            view_delta[f"{window}d"] = growth.delta(series, "view_count", window, ctx.today, lag)
            subscriber_delta[f"{window}d"] = growth.subscriber_delta(
                series, window, ctx.today, growth_thresholds)
            growth_rate[f"{window}d"] = growth.subscriber_growth_rate(
                series, window, ctx.today, growth_thresholds)
            per_1k[f"{window}d"] = growth.subs_per_1k_views(
                subscriber_delta[f"{window}d"], view_delta[f"{window}d"])

        # days_between is negative when published_at is ahead of today, so a bare `<= 30`
        # would count a future-dated row in every window between now and then. The web's
        # videosInWindow and selectRecent already guard their own lower bound; the same
        # guard here keeps both surfaces counting the same set, which is the whole point of
        # the null-view_count filter beside it.
        published = [v for v in channel_videos
                     if 0 <= util.days_between(util.parse_ts(v["published_at"]).date(),
                                               ctx.today) <= 30
                     and v["view_count"] is not None]
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
            "view_count": view_row["view_count"] if view_row else None,
            "video_count": video_row["video_count"] if video_row else None,
            "status": tail_status,
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
