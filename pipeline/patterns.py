"""Pattern rows over the outlier set.

The grouping itself is an LLM judgement and happens outside pipeline/, which imports stdlib only
and never calls a model. A skill writes _synthesize/patterns/<date>.json; this module reads it and
adds the one thing that is not a judgement: whether the group already has a leaf in
config/topics.json. That check is a deterministic alias match, so it is Derived, and it is what
decides whether a row offers "promote" or "add to that topic".
"""
from __future__ import annotations

import datetime as dt
import pathlib

from . import config, outliers, topics, util

GROUP_KEYS = ("pattern_id", "label", "evidence")


def candidates() -> list[dict]:
    """The outliers a grouping pass may group, read from the _synthesize/ sweep.

    The sweep is the upstream authority and is what "a video vidIQ actually returned" literally
    means. Reading _db/recent.json here instead would run backwards through the layers and close
    a loop, since recent.json is itself built from the file this validates.
    """
    sweep = outliers.latest()
    if not sweep:
        return []
    return [{"video_id": v.get("video_id"), "title": v.get("title"),
             "channel_name": v.get("channel_name"), "type": v.get("type"),
             "breakout_score": v.get("breakout_score")}
            for block in sweep.get("formats") or []
            for v in block.get("videos") or []]


def write_groups(groups: list[dict], today: dt.date | None = None) -> pathlib.Path:
    """Validate a grouping pass and write it, or raise and write nothing.

    The model picks the labels; these checks are the part that is not a judgement. Every rule here
    exists because breaking it puts something on the page that cannot be traced back to a video
    vidIQ actually returned — a hallucinated id rendering as a card, or a video silently taking
    whichever of two groups was written last. A half-written pass is worse than no pass, because
    build_data reads whatever is on disk as the real grouping, so nothing is written until every
    group has passed.
    """
    known = {row["video_id"] for row in candidates()}
    seen_patterns: set[str] = set()
    owner: dict[str, str] = {}
    clean: list[dict] = []

    for group in groups:
        pattern_id = str(group.get("pattern_id") or "").strip()
        if not pattern_id:
            raise ValueError("every group needs a pattern_id")
        if pattern_id in seen_patterns:
            raise ValueError(f"duplicate pattern_id {pattern_id!r}")
        seen_patterns.add(pattern_id)

        label = str(group.get("label") or "").strip()
        if not label:
            raise ValueError(f"group {pattern_id!r} has an empty label")

        evidence = list(group.get("evidence") or [])
        if not evidence:
            raise ValueError(f"group {pattern_id!r} has no evidence")
        for video_id in evidence:
            if video_id not in known:
                raise ValueError(f"{video_id!r} is not in the sweep, so no page can show it")
            if video_id in owner:
                raise ValueError(
                    f"{video_id!r} is in two groups ({owner[video_id]!r} and {pattern_id!r}); "
                    "a card carries one pattern_id, so this is refused rather than resolved")
            owner[video_id] = pattern_id

        clean.append({"pattern_id": pattern_id, "label": label, "evidence": evidence})

    day = today or util.today()
    path = config.synth_dir() / "patterns" / f"{util.date_str(day)}.json"
    util.write_json(path, {"version": 1, "date": util.date_str(day), "groups": clean})
    return path


def read_groups() -> list[dict]:
    """The newest grouping pass, or []. Empty is a state: no pass has run."""
    return (util.newest_json(config.synth_dir() / "patterns", default={}) or {}).get("groups") or []


def _matching_leaf(titles: list[str], topic_index) -> str | None:
    """The leaf whose aliases the group's titles hit most often, or None.

    Deterministic, case-insensitive substring matching against the aliases a human authored.
    Never an inference: either the words are there or they are not.
    """
    # topics.load() already lowercases every alias (pipeline/topics.py:72), so only the
    # haystack needs folding here.
    blob = " ".join(titles).lower()
    best, best_hits = None, 0
    for leaf in topics.leaves(topic_index):
        hits = sum(1 for alias in leaf.aliases if alias in blob)
        if hits > best_hits:
            best, best_hits = leaf.id, hits
    return best


def resolve(group: dict, videos_by_id: dict, topic_index, min_creators: int) -> dict:
    """One PatternRow: the label as given, the leaf match computed, the action that follows.

    The creator floor does not gate add_to_leaf. That topic cleared the floor when it was
    authored; a second week of coverage is not a new decision, it is the existing one heating up.
    """
    rows = [videos_by_id[v] for v in group.get("evidence") or [] if v in videos_by_id]
    creators = {r["channel_id"] for r in rows}
    leaf = _matching_leaf([r["title"] for r in rows], topic_index)

    if leaf is not None:
        action = "add_to_leaf"
    elif len(creators) >= min_creators:
        action = "promote"
    else:
        action = "below_floor"

    return {
        "pattern_id": group["pattern_id"],
        "label": group["label"],
        "evidence": [r["video_id"] for r in rows],
        "creator_count": len(creators),
        "existing_leaf": leaf,
        "action": action,
    }
