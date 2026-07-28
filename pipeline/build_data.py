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
    return Context(
        today=today,
        # generated_at is the only non-deterministic field, and it is deliberately excluded
        # from the byte-identity tests by being derived from `today` rather than the clock.
        generated_at=f"{util.date_str(today)}T00:00:00Z",
        thresholds=thresholds, roster=roster, self_channel_id=self_row["channel_id"],
        topic_index=topics.load(), videos=videos, baselines=baselines,
        traction=traction_by_video, comment_stats=read.comment_stats(), repos=read.repos(today),
        keyword_volumes=read.keyword_volumes())


def build(today: dt.date | None = None) -> dict:
    today = today or util.today()
    ctx = make_context(today)
    bundles.snapshots.write(ctx)
    bundles.videos.write(ctx)
    bundles.channels.write(ctx)
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
