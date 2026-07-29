"""One primary topic per video, judged by a model.

Keyword matching cannot do this job. It reads "OpenCode Full Tutorial: Free Models, Skills &
MCPs" and files it under Wiring MCP servers into Claude Code, because the word is in the title.
It is not wrong about the word; it is wrong about what the video is *about*, and no threshold
fixes that — raising the floor to title-strength removed the tag spam and left this behind.

So the judgement moves to a model, and stays outside pipeline/, which imports stdlib and never
calls one. A skill or workflow writes _synthesize/classifications/<date>.json; this module
validates it on the way in and serves it on the way out. The verdict is Inference tier and every
row carries the reason it was given, because an inference renders beside its evidence or not at
all.

A video may hold exactly one topic here, which is the entire point: the keyword matcher gave one
video up to five memberships and made every topic look more crowded than it is.
"""
from __future__ import annotations

import datetime as dt
import pathlib

from . import config, topics, util

VERSION = 1
TRUST = "inference"


def read_assignments() -> dict[str, dict]:
    """Every pass on disk, newest verdict winning, keyed by video_id.

    Batches land as separate dated files and a re-run usually covers a subset, so the files are
    merged oldest-first rather than the newest one being read alone: a partial pass must not
    blank the videos it did not look at.
    """
    directory = config.synth_dir() / "classifications"
    if not directory.is_dir():
        return {}
    out: dict[str, dict] = {}
    for path in sorted(directory.glob("*.json")):
        for row in (util.read_json(path) or {}).get("assignments") or []:
            out[row["video_id"]] = {"topic_id": row.get("topic_id"),
                                    "reason": row.get("reason")}
    return out


def write_assignments(rows: list[dict], today: dt.date | None = None) -> pathlib.Path:
    """Validate a classification pass and write it, or raise and write nothing.

    Nothing is written until every row passes: build_data reads whatever is on disk as the real
    classification, so a half-written pass would quietly reshape the board.
    """
    leaves = {leaf.id for leaf in topics.leaves(topics.load())}
    seen: set[str] = set()
    clean: list[dict] = []

    for row in rows:
        video_id = str(row.get("video_id") or "").strip()
        if not video_id:
            raise ValueError("every row needs a video_id")
        if video_id in seen:
            raise ValueError(f"{video_id!r} classified twice; a video has one primary topic")
        seen.add(video_id)

        topic_id = row.get("topic_id")
        if topic_id is not None and topic_id not in leaves:
            raise ValueError(f"{topic_id!r} is not a leaf in config/topics.json")

        reason = str(row.get("reason") or "").strip()
        if not reason:
            raise ValueError(f"{video_id!r} has an empty reason; inference needs its evidence")

        clean.append({"video_id": video_id, "topic_id": topic_id, "reason": reason})

    day = today or util.today()
    path = config.synth_dir() / "classifications" / f"{util.date_str(day)}.json"
    util.write_json(path, {"version": VERSION, "date": util.date_str(day),
                           "trust": TRUST, "assignments": clean})
    return path


def candidates(videos: list[dict], assignments_by_video: dict, floor: float) -> list[dict]:
    """The videos worth spending a model on: the ones a keyword hit already put on a shelf.

    Classifying the whole corpus would be mostly wasted — two thirds of it never reaches a
    surface. This is the set whose membership is currently being asserted, which is exactly the
    set where a wrong assertion shows.
    """
    out = []
    for video in videos:
        matched = [a["topic_id"] for a in assignments_by_video.get(video["video_id"], [])
                   if topics.is_member(a, floor)]
        if matched:
            out.append({"video_id": video["video_id"], "title": video["title"],
                        "channel_id": video["channel_id"], "keyword_topics": sorted(set(matched))})
    return out
