"""meta.json: the health readout. coverage_rate is load-bearing, not decoration.

With the proposal queue cut, a falling coverage_rate is the ONLY signal that config/topics.json
needs new leaves.
"""
from __future__ import annotations

from .. import config, read, snapshot, topics, util

VERSION = 3
BUILD_STEP = 8


def build(ctx) -> dict:
    assignments = [dict(a, video_id=v["video_id"])
                   for v in ctx.videos
                   for a in ctx.assignments_by_video.get(v["video_id"], [])]
    present = snapshot.present_dates()
    window = ctx.thresholds["growth"]["default_window_days"]
    statuses = [read.channel_series(r["channel_id"]) for r in ctx.roster]
    newest = [next((p for p in reversed(s) if p["status"] == "ok"), None) for s in statuses]
    # days_present counts our own sweep files and nothing else, which is the right answer to "is
    # the daily sweep running" and the wrong one to "how much history is on the board". The header
    # asked the first and printed it as the second: "1 of 90 days" beside 90-day growth rates
    # measured over a year of vidIQ backfill. Both facts stay; they get separate names.
    history = sorted({row["date"] for series in statuses for row in series})
    return {
        "version": VERSION,
        "generated_at": ctx.generated_at,
        "thresholds_version": ctx.thresholds["version"],
        "build_step": BUILD_STEP,
        "coverage_rate": topics.coverage_rate(ctx.videos, assignments),
        "self_channel_id": ctx.self_channel_id,
        "snapshot_health": {"first_date": history[0] if history else None,
                            "days_present": len(present),
                            "days_missing": len(snapshot.missing_dates(ctx.today, window)),
                            "history_days": len(history)},
        "video_snapshot_health": {"videos_tracked": len(ctx.videos),
                                  "days_present": len(present)},
        "comment_health": {"channels_with_comments": ctx.extra.get("channels_with_comments", 0),
                           "ingested": ctx.extra.get("comments_ingested", 0),
                           "classified": ctx.extra.get("comments_classified", 0)},
        "channels": {"total": len(ctx.roster),
                     "ok": sum(1 for n in newest if n is not None),
                     "absent": sum(1 for n in newest if n is None)},
        "target": config.targets().get("target"),
        "discovery": {"trending_ok": ctx.repos.get("trending_ok"),
                      "reason": ctx.repos.get("trending_reason")},
        "partial_run": bool(ctx.repos.get("partial_run")),
    }


def write(ctx) -> None:
    util.write_json(config.db_dir() / "meta.json", build(ctx))
