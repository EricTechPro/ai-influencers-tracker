"""topic_pages.json: every topic, leaf or parent. nodes and edges are reserved for step 15."""
from __future__ import annotations

from .. import config, topics, util

VERSION = 3


def build(ctx) -> dict:
    min_n = ctx.thresholds["min_n"]
    window = ctx.thresholds["supply"]["window_days"]
    floor = ctx.thresholds["topics"]["membership_min_confidence"]
    pages = []
    per_leaf = {}
    for topic in ctx.topic_index.values():
        if not topics.is_leaf(topic):
            continue
        # Membership, not every recorded hit: a description-only match is evidence that this
        # video mentioned the topic, not a claim that it is about it. See topics.is_member.
        matched = [v for v in ctx.videos
                   if topic.id in [a["topic_id"]
                                   for a in ctx.assignments_by_video.get(v["video_id"], [])
                                   if topics.is_member(a, floor)]]
        creators = {v["channel_id"] for v in matched}
        per_leaf[topic.id] = {"videos": len(matched), "creators": len(creators)}
        enough = (len(matched) >= min_n["topic_page_min_videos"]
                  and len(creators) >= min_n["topic_page_min_creators"])
        pages.append({
            "topic_id": topic.id, "label": topic.label, "parent_id": topic.parent_id,
            "is_leaf": True, "shape": topic.shape,
            "video_count": len(matched), "creator_count": len(creators),
            "window_days": window,
            # "1 video, need 3" lives HERE, not on the verdict. See conflict C1.
            "state": "ok" if enough else "insufficient_data",
            "min_videos": min_n["topic_page_min_videos"],
            "newest_video_at": max((v["published_at"] for v in matched), default=None),
            "video_ids": sorted(v["video_id"] for v in matched),
            "nodes": None, "edges": None,
        })

    rolled = topics.rollup(ctx.topic_index, per_leaf)
    for topic in ctx.topic_index.values():
        if topics.is_leaf(topic):
            continue
        counts = rolled.get(topic.id, {"videos": 0, "creators": 0, "leaves": 0})
        pages.append({
            "topic_id": topic.id, "label": topic.label, "parent_id": topic.parent_id,
            "is_leaf": False,
            "leaf_count": counts["leaves"], "video_count": counts["videos"],
            "creator_count": counts["creators"], "window_days": window,
            "children": list(topic.children_ids),
        })
    pages.sort(key=lambda p: p["topic_id"])
    return {"version": VERSION, "generated_at": ctx.generated_at, "topics": pages}


def write(ctx) -> None:
    util.write_json(config.db_dir() / "topic_pages.json", build(ctx))
