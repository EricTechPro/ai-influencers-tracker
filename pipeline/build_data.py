"""Entry point 2. Pure arithmetic over _raw/ and _synthesize/, writing only _db/.

Idempotent by construction: every input is read, nothing is appended, and every bundle is written
whole with sorted keys. Deleting _db/ and rebuilding must produce identical bytes.
"""
from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
from typing import Any

from . import bundles, config, multiplier, read, topics, traction, util


@dataclasses.dataclass
class Context:
    today: dt.date
    generated_at: str
    thresholds: dict
    roster: list[dict]
    self_channel_id: str
    topic_index: dict
    videos: list[dict]
    baselines: dict[str, dict]
    traction: dict[str, dict]
    comment_stats: dict[str, dict]
    repos: dict
    keyword_volumes: dict
    assignments_by_video: dict[str, list[dict]]
    own_coverage: dict[str, dict]
    extra: dict[str, Any] = dataclasses.field(default_factory=dict)


def make_context(today: dt.date) -> Context:
    read.reset_caches()
    thresholds = config.thresholds()
    roster = config.roster()
    self_row = config.self_channel(roster)
    videos = read.all_videos(roster)
    baselines = {
        row["channel_id"]: multiplier.baselines(
            [v for v in videos if v["channel_id"] == row["channel_id"]],
            today, thresholds["multiplier"])
        for row in roster
    }
    traction_by_video = {
        v["video_id"]: traction.for_video(v["series"], v["view_count"], today,
                                          thresholds["traction"])
        for v in videos
    }

    topic_index = topics.load()
    assignments_by_video = {v["video_id"]: topics.match_video(v, topic_index) for v in videos}
    demotions = topics.detect_demotions(
        topic_index,
        [{"video_id": vid, "topic_id": a["topic_id"]}
         for vid, rows in assignments_by_video.items() for a in rows])
    for row in demotions:
        print(f"WARN leaf became a parent: {row['topic_id']} carried "
              f"{len(row['video_ids'])} videos, now has children {row['new_children']}. "
              f"Its videos were re-matched against the new children.")

    # Coverage demands the strong signal: a topic only counts as covered when the alias hit
    # landed in the title. A description or tags mention is too weak to suppress an opportunity.
    own_videos = [
        {**v, "topic_ids": [a["topic_id"] for a in assignments_by_video[v["video_id"]]
                            if "title" in a["matched_on"]]}
        for v in videos if v["channel_id"] == self_row["channel_id"]
    ]
    own_coverage = {
        leaf.id: bundles.channels.own_coverage(leaf.id, own_videos, today,
                                               thresholds["own_content"])
        for leaf in topics.leaves(topic_index)
    }

    return Context(
        today=today,
        # generated_at is the only non-deterministic field, and it is deliberately excluded
        # from the byte-identity tests by being derived from `today` rather than the clock.
        generated_at=f"{util.date_str(today)}T00:00:00Z",
        thresholds=thresholds, roster=roster, self_channel_id=self_row["channel_id"],
        topic_index=topic_index, videos=videos, baselines=baselines,
        traction=traction_by_video, comment_stats=read.comment_stats(), repos=read.repos(today),
        keyword_volumes=read.keyword_volumes(),
        assignments_by_video=assignments_by_video, own_coverage=own_coverage)


def build(today: dt.date | None = None) -> dict:
    today = today or util.today()
    ctx = make_context(today)
    bundles.snapshots.write(ctx)
    bundles.videos.write(ctx)
    bundles.channels.write(ctx)

    comments_bundle = bundles.comments.build(ctx)
    util.write_json(config.db_dir() / "comments.json", comments_bundle)
    # meta's comment_health is read off the same corpus the comments bundle just indexed, so a
    # channel the comment ledger has not reached yet stays invisible rather than a false zero.
    ctx.extra["channels_with_comments"] = sum(
        1 for row in comments_bundle["by_channel"].values() if row["totals"]["ingested"])
    ctx.extra["comments_ingested"] = sum(
        row["totals"]["ingested"] for row in comments_bundle["by_channel"].values())
    ctx.extra["comments_classified"] = sum(
        row["totals"]["classified"] for row in comments_bundle["by_channel"].values())

    bundles.opportunities.write(ctx)
    bundles.topic_pages.write(ctx)
    bundles.meta.write(ctx)
    return {"date": util.date_str(today), "channels": len(ctx.roster),
            "videos": len(ctx.videos), "bundles": sorted(p.name for p in
                                                         config.db_dir().glob("*.json"))}


def main() -> int:
    parser = argparse.ArgumentParser(description="rebuild _db/ from _raw/ and _synthesize/")
    parser.add_argument("--date", help="YYYY-MM-DD, defaults to today UTC")
    args = parser.parse_args()
    summary = build(util.parse_date(args.date) if args.date else None)
    for key, value in summary.items():
        print(f"{key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
