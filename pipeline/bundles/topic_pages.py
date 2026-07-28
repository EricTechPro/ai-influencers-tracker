"""topic_pages.json: every topic, leaf or parent. nodes and edges are reserved for step 15."""
from __future__ import annotations

from .. import config, topics, util

VERSION = 5


def build(ctx) -> dict:
    min_n = ctx.thresholds["min_n"]
    window = ctx.thresholds["supply"]["window_days"]
    floor = ctx.thresholds["topics"]["membership_min_confidence"]
    shelf_days = ctx.thresholds["topics"]["shelf_window_days"]
    pages = []
    per_leaf = {}
    for topic in ctx.topic_index.values():
        if not topics.is_leaf(topic):
            continue
        # A topic Eric has stopped making is noise on a page whose only job is to say what to
        # make next, so an excluded leaf never becomes a page. The videos keep their assignments
        # in videos.json: this hides a shelf, it does not unmake the match.
        if topic.id in ctx.excluded_topic_ids:
            continue
        # Membership, not every recorded hit: a description-only match is evidence that this
        # video mentioned the topic, not a claim that it is about it. See topics.is_member.
        matched = topics.members_of(
            topic.id,
            [v for v in ctx.videos if v["video_id"] not in ctx.excluded_video_ids],
            ctx.assignments_by_video, floor, ctx.classified)
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
            # The cards the shelf renders. A display window over the same membership, kept
            # separate so video_count above stays the honest all-time number.
            "shelf_window_days": shelf_days,
            "recent_video_ids": sorted(v["video_id"] for v in matched
                                       if util.published_within(v, ctx.today, shelf_days)),
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
    # `topics` is gated: a leaf needs min_videos and min_creators before it earns a page, so 28
    # of the tree's ids survive it. /topics was reading its group headings out of that gated
    # list and falling back to the raw id, which printed "n8n-agent-workflows" as a heading for
    # a topic whose label config/topics.json has always carried. `labels` is the whole
    # vocabulary, ungated, so naming a topic never depends on whether it qualified for a page.
    labels = {t.id: t.label for t in ctx.topic_index.values()}
    return {"version": VERSION, "generated_at": ctx.generated_at,
            "topics": pages, "labels": labels}


def write(ctx) -> None:
    util.write_json(config.db_dir() / "topic_pages.json", build(ctx))
