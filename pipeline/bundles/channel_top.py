"""channel_top.json: each channel's most-viewed uploads, in card shape, at any age.

Its own bundle rather than a slice of recent.json, because the two answer different questions.
The feed asks what went up lately and is bounded by feed_window_days; a channel page asks what
this creator's biggest videos are, and the answer is usually older than that window. Widening the
feed to reach them would have broken the feed instead of serving the page.

Ranked on view_count, not on multiplier. The feed ranks on multiplier because it asks what beat
its channel's normal; "biggest ever" is a different order and pretending otherwise would put a
2.0x video on a 40,000-view channel above a 700,000-view breakout.
"""
from __future__ import annotations

from .. import cards, config, exclusions, util

VERSION = 1
TRUST = {"multiplier": "derived", "views_gained_24h": "derived", "momentum": "derived"}

# How many rows a channel page loads. A display constant, not a decision knob: changing it
# changes how much of a back catalogue you scroll, never what the board tells you to make.
TOP_N = 20


def _sort_key(row: dict):
    """Descending by views, unmeasured last, video_id breaking every tie.

    A None view_count is a video nobody has counted yet, not a video nobody watched, so it sinks
    below every counted row instead of sorting as a zero. The id tiebreak is what makes a rebuild
    byte-identical when two videos hold the same count.
    """
    counted = row["view_count"] is not None
    return (0 if counted else 1, -(row["view_count"] or 0), row["video_id"])


def build(ctx) -> dict:
    names = cards.names_for(ctx)
    now = cards.now_for(ctx)
    rules = exclusions.load()

    by_channel: dict[str, list[dict]] = {}
    for video in ctx.videos:
        if rules.excludes_video(video):
            continue
        by_channel.setdefault(video["channel_id"], []).append(video)

    channels = {}
    for channel_id, videos in sorted(by_channel.items()):
        rows = [cards.row(v, ctx, names, now) for v in videos]
        rows.sort(key=_sort_key)
        # Sliced after sorting, never padded. A channel with three uploads yields three rows;
        # filling to TOP_N would claim a back catalogue that does not exist.
        channels[channel_id] = rows[:TOP_N]

    return {
        "version": VERSION,
        "generated_at": ctx.generated_at,
        "top_n": TOP_N,
        "channels": channels,
        "trust": dict(TRUST),
    }


def write(ctx) -> None:
    util.write_json(config.db_dir() / "channel_top.json", build(ctx))
