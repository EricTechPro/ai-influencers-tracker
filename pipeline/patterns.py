"""Pattern rows over the outlier set.

The grouping itself is an LLM judgement and happens outside pipeline/, which imports stdlib only
and never calls a model. A skill writes _synthesize/patterns/<date>.json; this module reads it and
adds the one thing that is not a judgement: whether the group already has a leaf in
config/topics.json. That check is a deterministic alias match, so it is Derived, and it is what
decides whether a row offers "promote" or "add to that topic".
"""
from __future__ import annotations

import datetime as dt

from . import config, topics, util


def read_groups(today: dt.date | None = None) -> list[dict]:
    """The newest grouping pass, or []. Empty is a state: no pass has run."""
    directory = config.synth_dir() / "patterns"
    if not directory.is_dir():
        return []
    files = sorted(directory.glob("*.json"))
    if not files:
        return []
    return util.read_json(files[-1]).get("groups") or []


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
