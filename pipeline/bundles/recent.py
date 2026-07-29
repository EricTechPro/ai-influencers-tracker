"""recent.json: vidIQ's breakout scores, flattened for the /topics feed.

Its own bundle rather than a slice of videos.json, which is 16.7 MB and deliberately never
shipped to the browser whole. This one carries card fields only, for one month of outliers, so
the window / format / per-channel toggles are all client-side filters over a payload that is
already in memory.
"""
from __future__ import annotations

from .. import config, outliers, patterns, util

VERSION = 1
TRUST = {"breakout_score": "vendor", "pattern": "inference", "existing_leaf": "derived"}

CARD_KEYS = ("video_id", "title", "published_at", "view_count", "duration_s", "type",
             "channel_id", "channel_name", "breakout_score")


def build(ctx) -> dict:
    sweep = outliers.latest()
    videos: list[dict] = []
    coverage = {"channels_requested": 0, "batches_ok": 0, "batches_failed": 0,
                "missing_channel_ids": []}

    if sweep:
        for block in sweep.get("formats") or []:
            for row in block.get("videos") or []:
                videos.append({**{k: row.get(k) for k in CARD_KEYS}, "pattern_id": None})
            found = block.get("coverage") or {}
            coverage = {
                "channels_requested": max(coverage["channels_requested"],
                                          found.get("channels_requested", 0)),
                "batches_ok": coverage["batches_ok"] + found.get("batches_ok", 0),
                "batches_failed": coverage["batches_failed"] + found.get("batches_failed", 0),
                "missing_channel_ids": sorted(
                    set(coverage["missing_channel_ids"])
                    | set(found.get("missing_channel_ids") or [])),
            }

    videos.sort(key=lambda v: (-(v["breakout_score"] or 0), v["video_id"]))

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
        "videos": videos,
        "patterns": rows,
        "trust": dict(TRUST),
    }


def write(ctx) -> None:
    util.write_json(config.db_dir() / "recent.json", build(ctx))
