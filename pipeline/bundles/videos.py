"""videos.json: metadata, multiplier, traction, and the keyword topic assignments."""
from __future__ import annotations

from .. import config, multiplier, topics, traction, util

VERSION = 2


def build(ctx) -> dict:
    rows = []
    for video in ctx.videos:
        baselines = ctx.baselines[video["channel_id"]]
        rows.append({
            "video_id": video["video_id"],
            "channel_id": video["channel_id"],
            "published_at": video["published_at"],
            "title": video["title"],
            "duration_s": video["duration_s"],
            "type": video["type"],
            "view_count": video["view_count"],
            "multiplier": multiplier.for_video(video, baselines),
            "traction": traction.for_video(video["series"], video["view_count"], ctx.today,
                                           ctx.thresholds["traction"]),
            # A video the comment ledger has not reached yet is missing, never a zero.
            "comment_stats": ctx.comment_stats.get(video["video_id"]),
            "topic_assignments": topics.match_video(video, ctx.topic_index),
            # The creator's own keywords, as YouTube returned them. Not a topic assignment and
            # not derived from one: a topic is this project's taxonomy matched against a title,
            # a tag is what the uploader typed. The feed facets on these because they are the
            # vocabulary the niche actually uses. An older _raw row with no tags key is missing,
            # never an empty list — [] would claim the uploader tagged nothing.
            "tags": video.get("tags"),
        })
    rows.sort(key=lambda r: r["video_id"])
    return {"version": VERSION, "generated_at": ctx.generated_at, "videos": rows}


def write(ctx) -> None:
    util.write_json(config.db_dir() / "videos.json", build(ctx))
