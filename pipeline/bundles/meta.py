"""meta.json: the health readout. coverage_rate is load-bearing, not decoration.

With the proposal queue cut, a falling coverage_rate is the ONLY signal that config/topics.json
needs new leaves.
"""
from __future__ import annotations

from .. import config, read, snapshot, topics, util

VERSION = 4
BUILD_STEP = 8


def _exclusion_counts(ctx) -> dict:
    """How much the hand-written exclusions took off the board, read off the sets the context
    already resolved rather than re-deriving the predicate a third time.

    `topics` counts excluded leaves that are real leaves in the taxonomy, so a stale id left in
    the config after a topic is renamed does not inflate the number into a claim.
    """
    leaves = {t.id for t in ctx.topic_index.values() if topics.is_leaf(t)}
    return {
        "topics": len(ctx.excluded_topic_ids & leaves),
        "videos": len(ctx.excluded_video_ids),
    }


def _tail_status(series) -> str:
    """The channel's own freshest-row verdict, spelled the same way channels.py spells it."""
    return series[-1]["status"] if series else "insufficient_data"


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
        # What config/exclusions.json withheld from the display surfaces this build. A board that
        # quietly got smaller is the failure mode; these two counts are what makes it visible.
        "exclusions": _exclusion_counts(ctx),
        "self_channel_id": ctx.self_channel_id,
        "snapshot_health": {"first_date": history[0] if history else None,
                            # When the freshest sweep landed, to the minute. Read off the newest
                            # _raw file, never from the clock, so a rebuild stays byte-identical.
                            "fetched_at_utc": snapshot.newest_fetched_at(),
                            "days_present": len(present),
                            "days_missing": len(snapshot.missing_dates(ctx.today, window)),
                            "history_days": len(history)},
        "video_snapshot_health": {"videos_tracked": len(ctx.videos),
                                  "days_present": len(present)},
        "comment_health": {"channels_with_comments": ctx.extra.get("channels_with_comments", 0),
                           "ingested": ctx.extra.get("comments_ingested", 0),
                           "classified": ctx.extra.get("comments_classified", 0)},
        # Three mutually exclusive buckets that sum to total. `ok` used to mean "has an ok row
        # somewhere in its history", which counted a channel whose freshest reading the pipeline
        # itself condemned as part of the all-clear the /channels header prints. absent keeps its
        # own meaning (no ok reading has ever arrived) and is decided first, so a channel that is
        # both never-ok and corrupt at the tail lands in exactly one bucket.
        "channels": {"total": len(ctx.roster),
                     "ok": sum(1 for n, s in zip(newest, statuses, strict=True)
                               if n is not None and _tail_status(s) == "ok"),
                     "corrupt": sum(1 for n, s in zip(newest, statuses, strict=True)
                                    if n is not None and _tail_status(s) != "ok"),
                     "absent": sum(1 for n in newest if n is None)},
        "target": config.targets().get("target"),
        "discovery": {"trending_ok": ctx.repos.get("trending_ok"),
                      "reason": ctx.repos.get("trending_reason")},
        "partial_run": bool(ctx.repos.get("partial_run")),
    }


def write(ctx) -> None:
    util.write_json(config.db_dir() / "meta.json", build(ctx))
