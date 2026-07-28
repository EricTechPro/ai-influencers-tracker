"""Comment ingest. Nearly free: commentThreads.list is 1 unit per 100 roots.

Two rules the schema enforces rather than the UI:
  a category never ships without the comment text beside it, and
  recency renders as lag from the video's publish date, never as an absolute date.
"""
from __future__ import annotations

import pathlib

from . import config, util


def store_path(channel_id: str) -> pathlib.Path:
    return config.raw_dir() / "comments" / f"{channel_id}.jsonl"


def ledger_path() -> pathlib.Path:
    return config.raw_dir() / "comments" / "_ledger.json"


def lag_days(comment_published_at: str, video_published_at: str) -> int:
    """Days between the video going up and the comment being posted. Never negative."""
    return max(0, util.days_between(util.parse_ts(video_published_at),
                                    util.parse_ts(comment_published_at)))


def is_answered(thread: dict, self_channel_id: str) -> bool:
    """Detected, never declared. The sweep already reads threads, so this costs nothing extra."""
    replies = (thread.get("replies") or {}).get("comments") or []
    return any((r.get("snippet", {}).get("authorChannelId") or {}).get("value") == self_channel_id
               for r in replies)


def normalize(thread: dict, video: dict, self_channel_id: str) -> dict:
    top = thread["snippet"]["topLevelComment"]
    snippet = top["snippet"]
    published = snippet.get("publishedAt")
    return {
        "comment_id": top.get("id") or thread["id"],
        "video_id": video["video_id"],
        "channel_id": video.get("channel_id"),
        "video_title": video.get("title"),
        "video_url": f"https://youtu.be/{video['video_id']}",
        "video_published_at": video.get("published_at"),
        "author": snippet.get("authorDisplayName"),
        "author_channel_id": (snippet.get("authorChannelId") or {}).get("value"),
        "text": snippet.get("textOriginal") or "",
        "like_count": snippet.get("likeCount") or 0,
        "reply_count": thread["snippet"].get("totalReplyCount") or 0,
        "published_at": published,
        "answered": is_answered(thread, self_channel_id),
        "lag_days": lag_days(published, video["published_at"]),
        "topic_ids": list(video.get("topic_ids") or []),
        "category": None,        # step 12 fills this. Until then the row renders as "unsorted".
    }


def load(channel_id: str) -> dict[str, dict]:
    return {row["comment_id"]: row for row in util.read_jsonl(store_path(channel_id))}


def append_new(channel_id: str, rows: list[dict]) -> int:
    """Append rows whose comment_id is not already held. Returns how many landed."""
    known = set(load(channel_id))
    written = 0
    for row in rows:
        if row["comment_id"] in known:
            continue
        util.append_jsonl(store_path(channel_id), row)
        known.add(row["comment_id"])
        written += 1
    return written


class Ledger:
    """Which videos have had their comments pulled. Makes a 3,600-video backfill killable."""

    def __init__(self, path: pathlib.Path | None = None):
        self.path = path or ledger_path()
        self.rows: dict[str, dict] = dict(util.read_json(self.path, default={}))

    def done(self, video_id: str) -> bool:
        return video_id in self.rows

    def mark(self, video_id: str, count: int) -> None:
        self.rows[video_id] = {"comments": count}

    def save(self) -> None:
        util.write_json(self.path, self.rows)


def qualifies_for_classification(row: dict, comment_thresholds: dict) -> bool:
    """The classification floor is likes OR replies. Everything below renders as unsorted."""
    return (row.get("like_count", 0) >= comment_thresholds["classify_min_likes"]
            or row.get("reply_count", 0) >= comment_thresholds["classify_min_replies"])


def ingest(videos: list[dict], api, ledger: Ledger, comment_thresholds: dict,
           self_channel_id: str, quota_cap: int) -> dict:
    """Fetch roots for every video not already in the ledger, stopping cleanly at the cap.

    Checkpoints the comment ledger and the API's quota ledger after every video: a kill -9
    or an uncaught exception loses at most the one video in flight, never the whole run. A
    backfill that only saved once at the end would re-spend quota on retry for every video
    it had already covered, which is exactly the failure the resumable ledger exists to rule
    out. The comment rows themselves are already safe either way (append_new dedupes on
    comment_id), so this is purely about not re-asking YouTube for what we already have.
    """
    fetched = new_rows = 0
    stopped = False
    for video in videos:
        if ledger.done(video["video_id"]):
            continue
        if fetched >= quota_cap:
            stopped = True
            break
        threads = api.comment_threads(video["video_id"], comment_thresholds["roots_per_video"])
        rows = [normalize(t, video, self_channel_id) for t in threads]
        new_rows += append_new(video["channel_id"], rows)
        ledger.mark(video["video_id"], len(rows))
        ledger.save()
        api.ledger.save()
        fetched += 1
    return {"videos_fetched": fetched, "comments_new": new_rows, "stopped_on_cap": stopped}
