"""One video in card shape, for every surface that renders a video card.

The recent feed built this inline until channel pages needed the same tile. Two builders would
have been two ideas of what a card is, and the drift would land on the one field a card cannot
fake: `momentum` is computed from our own dated series, and a second implementation of it in the
web layer would have been arithmetic in the layer that does none.

Nothing here reads config directly. Every threshold arrives through ctx, so a surface cannot
quietly score its cards against a different number than the feed does.
"""
from __future__ import annotations

from . import language, momentum, multiplier, util

# The identity fields, copied through untouched. Everything else on a card is derived.
CARD_KEYS = ("video_id", "title", "published_at", "view_count", "duration_s", "type",
             "channel_id")


def row(video: dict, ctx, names: dict[str, str], now) -> dict:
    """Card fields for one video. `names` maps channel_id to display name, `now` is the parsed
    generated_at the momentum window is measured back from."""
    mult = multiplier.for_video(video, ctx.baselines.get(video["channel_id"], {}))
    # vph was vidIQ's. The same quantity is in our own dated series: views gained over the last
    # 24 hours is exactly what vph*24 was estimating, measured rather than modelled. A video
    # observed once has no delta, and momentum reads that as unmeasured — the honest state for a
    # video nobody has watched change.
    gained = ctx.traction.get(video["video_id"], {}).get("views_gained", {}).get("24h", {})
    day = gained.get("value") if gained.get("state") == "ok" else None
    lang, lang_tier = language.detect(video.get("title"), video.get("default_audio_language"),
                                      ctx.thresholds["language"]["zh_title_min_share"],
                                      video.get("description"))
    return {
        **{k: video.get(k) for k in CARD_KEYS},
        "channel_name": names.get(video["channel_id"]),
        "multiplier": mult["value"],
        "baseline": mult["baseline"],
        "baseline_n": mult["baseline_n"],
        "views_gained_24h": day,
        "momentum": momentum.for_video(None if day is None else day / 24,
                                       video.get("view_count"), video.get("published_at"), now,
                                       ctx.thresholds["momentum"]),
        # The scene this video is from, and which signal read it. Per video, never inherited from
        # the channel: a feed mixes every channel into one grid, which is exactly where a
        # channel-level language stops being able to answer.
        "lang": lang,
        "lang_tier": lang_tier,
    }


def names_for(ctx) -> dict[str, str]:
    return {row["channel_id"]: row["name"] for row in ctx.roster}


def now_for(ctx):
    return util.parse_ts(ctx.generated_at)
