"""recent.json: vidIQ's breakout scores, flattened for the /topics feed.

Its own bundle rather than a slice of videos.json, which is 16.7 MB and deliberately never
shipped to the browser whole. This one carries card fields only, for one month of outliers, so
the window / format / per-channel toggles are all client-side filters over a payload that is
already in memory.
"""
from __future__ import annotations

from .. import config, exclusions, momentum, outliers, patterns, util

VERSION = 1
TRUST = {"breakout_score": "vendor", "vph": "vendor", "momentum": "derived",
         "pattern": "inference", "existing_leaf": "derived"}

CARD_KEYS = ("video_id", "title", "published_at", "view_count", "duration_s", "type",
             "channel_id", "channel_name", "breakout_score", "vph")


def build(ctx) -> dict:
    sweep = outliers.latest()
    blocks = (sweep.get("formats") or []) if sweep else []
    covs = [b.get("coverage") or {} for b in blocks]
    coverage = {
        "channels_requested": max((c.get("channels_requested", 0) for c in covs), default=0),
        "batches_ok": sum(c.get("batches_ok", 0) for c in covs),
        "batches_failed": sum(c.get("batches_failed", 0) for c in covs),
        "missing_channel_ids": sorted({i for c in covs
                                       for i in c.get("missing_channel_ids") or []}),
    }

    # The feed obeys config/exclusions.json like every other display surface. It is the first
    # thing /topics shows, so a muted channel or an off-the-board title landing here would be
    # the loudest possible place for the rule to be forgotten.
    rules = exclusions.load()
    now = util.parse_ts(ctx.generated_at)
    thresholds = ctx.thresholds["momentum"]
    videos = [{**{k: row.get(k) for k in CARD_KEYS}, "pattern_id": None,
               "momentum": momentum.for_video(row.get("vph"), row.get("view_count"),
                                              row.get("published_at"), now, thresholds)}
              for block in blocks
              for row in block.get("videos") or []
              if not rules.excludes_video(row)]

    videos.sort(key=outliers.by_score)

    # The grouping is an LLM pass that runs outside pipeline/; this only reads what it wrote and
    # stamps each card with the group it belongs to, so the feed can highlight a pattern's videos.
    videos_by_id = {v["video_id"]: v for v in videos}
    min_creators = ctx.thresholds["min_n"]["consensus_min_creators"]
    rows = [patterns.resolve(g, videos_by_id, ctx.topic_index, min_creators)
            for g in patterns.read_groups()]
    for row in rows:
        for video_id in row["evidence"]:
            videos_by_id[video_id]["pattern_id"] = row["pattern_id"]

    return {
        "version": VERSION,
        "generated_at": ctx.generated_at,
        "source": "vidiq",
        "fetched_at": sweep.get("date") if sweep else None,
        "window": sweep.get("window") if sweep else None,
        "coverage": coverage,
        # The two numbers that decide what the grid shows, carried to the UI the one honest way
        # web/ can get at config: through _db/. Hardcoding them in the page made the threshold
        # block documentation for a decision it did not control.
        "display_floor": ctx.thresholds["outliers"]["display_floor"],
        "per_channel_cap": ctx.thresholds["outliers"]["per_channel_cap"],
        "videos": videos,
        "patterns": rows,
        "trust": dict(TRUST),
    }


def write(ctx) -> None:
    util.write_json(config.db_dir() / "recent.json", build(ctx))
