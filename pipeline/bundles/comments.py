"""comments.json: one corpus, three indexes.

by_channel  what does THIS creator's audience ask
by_topic    what does EVERYONE ask about this subject, across every creator covering it
by_video    what did THIS upload provoke

The bundle pairs `category` with `text` structurally, so it is not possible to render a category
without the evidence for it.
"""
from __future__ import annotations

from .. import comments as comments_module
from .. import config, util

VERSION = 2
CATEGORY_KEYS = ("video_request", "question", "correction", "suggestion", "other")


def _counts(rows: list[dict]) -> dict:
    out = {key: 0 for key in CATEGORY_KEYS}
    out["unsorted"] = 0
    for row in rows:
        category = (row.get("category") or {}).get("key") if row.get("category") else None
        out[category if category in out else "unsorted"] += 1
    return out


def _top(rows: list[dict], limit: int) -> list[dict]:
    ordered = sorted(rows, key=lambda r: (-(r.get("like_count") or 0),
                                          -(r.get("reply_count") or 0),
                                          r["comment_id"]))
    return ordered[:limit]


def build(ctx) -> dict:
    limit = ctx.thresholds["comments"]["top_n_per_channel"]
    topics_by_video = {
        v["video_id"]: [a["topic_id"] for a in ctx.assignments_by_video.get(v["video_id"], [])]
        for v in ctx.videos
    }
    channel_of_video = {v["video_id"]: v["channel_id"] for v in ctx.videos}

    by_channel, by_video, by_topic = {}, {}, {}
    for roster_row in ctx.roster:
        channel_id = roster_row["channel_id"]
        rows = list(comments_module.load(channel_id).values())
        for row in rows:
            row["topic_ids"] = topics_by_video.get(row["video_id"], row.get("topic_ids") or [])
        if rows:
            by_channel[channel_id] = {
                "totals": {"ingested": len(rows),
                           "classified": sum(1 for r in rows if r.get("category")),
                           "window_days": 365},
                "top": _top(rows, limit),
                "by_category": _counts(rows),
                "most_discussed_video_ids": [
                    vid for vid, _ in sorted(
                        ((v, sum(1 for r in rows if r["video_id"] == v))
                         for v in {r["video_id"] for r in rows}),
                        # Count ties break on video_id: a set's iteration order is hash-randomized
                        # per process, and an untied sort key would make the rebuild non-identical.
                        key=lambda pair: (-pair[1], pair[0]))[:5]],
            }
        for row in rows:
            bucket = by_video.setdefault(row["video_id"], [])
            bucket.append(row)
            for topic_id in row["topic_ids"]:
                by_topic.setdefault(topic_id, []).append(row)

    by_video_out = {
        video_id: {"totals": {"comments": len(rows)}, "by_category": _counts(rows),
                   "top": _top(rows, ctx.thresholds["comments"]["page_size"] * 2)}
        for video_id, rows in by_video.items()
    }
    by_topic_out = {}
    for topic_id, rows in by_topic.items():
        videos = {v["video_id"] for v in ctx.videos
                  if topic_id in topics_by_video.get(v["video_id"], [])}
        creators = {channel_of_video[v] for v in videos if v in channel_of_video}
        by_topic_out[topic_id] = {
            "totals": {"comments": len(rows), "videos": len(videos), "creators": len(creators)},
            "top": _top(rows, limit),
            "by_category": _counts(rows),
            "unserved": [],          # Inference, and it needs extraction. Build step 16.
        }
    return {"version": VERSION, "generated_at": ctx.generated_at,
            "by_channel": by_channel, "by_video": by_video_out, "by_topic": by_topic_out}


def write(ctx) -> None:
    util.write_json(config.db_dir() / "comments.json", build(ctx))
