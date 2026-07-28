"""The topic tree. Only leaves are scoreable, and `scoreable` is derived, never authored.

A node with children exists for navigation and rollup only. Adding a child to a leaf silently
demotes it, which is why detect_demotions exists: the caller warns and re-matches that topic's
videos against the new children.
"""
from __future__ import annotations

import dataclasses
import re
from collections.abc import Iterable

from . import config

SHAPES = ("tutorial", "review")

# Where an alias may be found, most authoritative first. The first field that matches decides
# the primary topic, which is why the order is a constant and not a threshold.
HAYSTACK_FIELDS = ("title", "tags", "description")

# Confidence per matched field. Not in thresholds.json: changing it cannot change a verdict,
# because nothing downstream branches on confidence in this plan.
FIELD_CONFIDENCE = {"title": 0.6, "tags": 0.45, "description": 0.3}


class TopicError(RuntimeError):
    pass


@dataclasses.dataclass(frozen=True)
class Topic:
    id: str
    label: str
    shape: str | None
    aliases: tuple[str, ...]
    parent_id: str | None
    children_ids: tuple[str, ...]
    depth: int


def load(tree: dict | None = None) -> dict[str, Topic]:
    """Flatten config/topics.json into an id-keyed index, validating as it walks."""
    data = tree if tree is not None else config.topics_config()
    index: dict[str, Topic] = {}

    def walk(node: dict, parent_id: str | None, depth: int) -> None:
        node_id = node.get("id")
        if not node_id:
            raise TopicError(f"topic without an id under parent {parent_id!r}")
        if node_id in index:
            raise TopicError(f"duplicate topic id {node_id!r}")
        children = node.get("children") or []
        shape = node.get("shape")
        if children and shape is not None:
            raise TopicError(
                f"{node_id!r} has children and a shape: only leaves carry shape"
            )
        if not children and shape not in SHAPES:
            raise TopicError(
                f"leaf {node_id!r} has shape {shape!r}, expected one of tutorial|review"
            )
        index[node_id] = Topic(
            id=node_id,
            label=node.get("label") or node_id,
            shape=shape,
            aliases=tuple(a.lower() for a in (node.get("aliases") or [])),
            parent_id=parent_id,
            children_ids=tuple(c["id"] for c in children),
            depth=depth,
        )
        for child in children:
            walk(child, node_id, depth + 1)

    for root_node in data.get("topics", []):
        walk(root_node, None, 0)
    return index


def is_leaf(topic: Topic) -> bool:
    return not topic.children_ids


def leaves(index: dict[str, Topic]) -> list[Topic]:
    return [t for t in index.values() if is_leaf(t)]


def ancestors(index: dict[str, Topic], topic_id: str) -> list[str]:
    out: list[str] = []
    current = index[topic_id].parent_id
    while current:
        out.append(current)
        current = index[current].parent_id
    return out


def validate(index: dict[str, Topic]) -> list[str]:
    """Soft warnings over an already-loaded index. load() raises on hard failures as it walks;
    this is for checks that don't need to abort the walk, e.g. an alias reused across topics."""
    warnings: list[str] = []
    seen: dict[str, str] = {}
    for topic in leaves(index):
        for alias in topic.aliases:
            if alias in seen and seen[alias] != topic.id:
                warnings.append(
                    f"alias {alias!r} is shared by {seen[alias]!r} and {topic.id!r}"
                )
            else:
                seen[alias] = topic.id
    return warnings


def detect_demotions(index: dict[str, Topic], previous_assignments: Iterable[dict]) -> list[dict]:
    """Topics that carry videos and have since gained children. The caller warns and re-matches."""
    carried: dict[str, list[str]] = {}
    for row in previous_assignments:
        carried.setdefault(row["topic_id"], []).append(row["video_id"])
    out = []
    for topic_id, video_ids in sorted(carried.items()):
        topic = index.get(topic_id)
        if topic is not None and not is_leaf(topic):
            out.append({"topic_id": topic_id,
                        "video_ids": sorted(video_ids),
                        "new_children": list(topic.children_ids)})
    return out


def _haystacks(video: dict) -> dict[str, str]:
    tags = video.get("tags") or []
    return {
        "title": (video.get("title") or "").lower(),
        "tags": " ".join(tags).lower(),
        "description": (video.get("description") or "").lower(),
    }


def _alias_hits(alias: str, haystacks: dict[str, str]) -> list[str]:
    # A trailing "s" is allowed (simple plural: "subagent" hits "subagents"), but nothing else
    # past the alias: "mcp" still must not hit inside "mcpherson".
    pattern = re.compile(rf"(?<!\w){re.escape(alias)}s?(?!\w)")
    return [field for field in HAYSTACK_FIELDS if pattern.search(haystacks[field])]


def match_video(video: dict, index: dict[str, Topic]) -> list[dict]:
    """n:m keyword assignment over leaves only. Exactly one row carries primary=True."""
    haystacks = _haystacks(video)
    rows: list[dict] = []
    for topic in leaves(index):
        best: tuple[int, str, str] | None = None      # (field rank, field, alias)
        for alias in topic.aliases:
            for field in _alias_hits(alias, haystacks):
                candidate = (HAYSTACK_FIELDS.index(field), field, alias)
                if best is None or candidate < best:
                    best = candidate
        if best is None:
            continue
        matched_on = sorted(
            {f for alias in topic.aliases for f in _alias_hits(alias, haystacks)},
            key=HAYSTACK_FIELDS.index,
        )
        rows.append({
            "topic_id": topic.id,
            "primary": False,
            "confidence": FIELD_CONFIDENCE[best[1]],
            "method": "keyword",
            "matched_on": matched_on,
            "matched_alias": best[2],
        })
    if rows:
        rows.sort(key=lambda r: (-r["confidence"], r["topic_id"]))
        rows[0]["primary"] = True
    return rows


def coverage_rate(videos: list[dict], assignments: Iterable[dict]) -> float | None:
    """Assigned videos over total. None on an empty roster: missing is a state, never a zero."""
    total = len({v["video_id"] for v in videos})
    if not total:
        return None
    assigned = len({a["video_id"] for a in assignments})
    return assigned / total


def rollup(index: dict[str, Topic], per_leaf: dict[str, dict]) -> dict[str, dict]:
    """Sum leaf counts into every ancestor. Parents get counts and never a score or a verdict."""
    out: dict[str, dict] = {}
    for leaf_id, counts in per_leaf.items():
        for parent_id in ancestors(index, leaf_id):
            bucket = out.setdefault(parent_id, {"videos": 0, "creators": 0, "leaves": 0})
            bucket["videos"] += counts.get("videos", 0)
            bucket["creators"] += counts.get("creators", 0)
            bucket["leaves"] += 1
    return out
