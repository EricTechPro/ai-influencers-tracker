"""The read layer over _raw/ and _synthesize/. Nothing here writes anything, anywhere."""
from __future__ import annotations

import functools

from . import comments, config, growth, snapshot, util, vidiq


def _g() -> dict:
    """The growth threshold block. filter_monotonic's knobs live in config, and growth.py stays
    pure by taking them as arguments, so the read happens here at the call site."""
    return config.thresholds()["growth"]


def _snapshot_files():
    directory = config.raw_dir() / "snapshots"
    return sorted(directory.glob("*.json")) if directory.exists() else []


@functools.cache
def _all_channel_rows() -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for path in _snapshot_files():
        for channel_id, row in (util.read_json(path) or {}).get("channels", {}).items():
            out.setdefault(channel_id, []).append(row)
    return out


def channel_series(channel_id: str) -> list[dict]:
    """Snapshotted points merged over the bought history, then monotonicity filtered."""
    ours = _all_channel_rows().get(channel_id, [])
    bought = (util.read_json(config.raw_dir() / "backfill" / f"{channel_id}.json",
                             default={}) or {}).get("series", [])
    merged = vidiq.merge_backfill(ours, bought)
    for row in merged:
        if row.get("subscriber_bucket") is None:
            row["subscriber_bucket"] = growth.bucket_width(row.get("subscriber_count"))
    return growth.filter_monotonic(merged, view_drop_tolerance=_g()["view_drop_tolerance"],
                                   rebase_min_days=_g()["rebase_min_days"])


@functools.cache
def _all_video_rows() -> dict[str, list[dict]]:
    directory = config.raw_dir() / "video_snapshots"
    out: dict[str, list[dict]] = {}
    for path in sorted(directory.glob("*.json")) if directory.exists() else []:
        for video_id, row in (util.read_json(path) or {}).get("videos", {}).items():
            out.setdefault(video_id, []).append(row)
    return out


def video_series(video_id: str) -> list[dict]:
    return growth.filter_monotonic(sorted(_all_video_rows().get(video_id, []),
                                          key=lambda r: r["date"]),
                                   view_drop_tolerance=_g()["view_drop_tolerance"],
                                   rebase_min_days=_g()["rebase_min_days"])


def all_videos(roster: list[dict]) -> list[dict]:
    """Registry metadata joined to the newest observed count. One row per video, ever seen."""
    out = []
    for channel_row in roster:
        for video_id, meta in snapshot.registry(channel_row["channel_id"]).items():
            series = video_series(video_id)
            newest = next((r for r in reversed(series) if r["status"] == "ok"), None)
            out.append({**meta, "video_id": video_id,
                        # The dated series wins when there is one; otherwise the exact count
                        # the registry recorded at seen_at. Neither is invented: both are
                        # numbers YouTube returned, and None still means nobody has asked yet.
                        "view_count": (newest["view_count"] if newest
                                       else meta.get("view_count")),
                        "series": series})
    return out


def repos(today) -> dict:
    directory = config.raw_dir() / "repos"
    files = sorted(directory.glob("*.json")) if directory.exists() else []
    return util.read_json(files[-1]) if files else {"search": [], "trending": [],
                                                    "partial_run": False, "trending_ok": None}


def keyword_volumes() -> dict[str, dict]:
    directory = config.raw_dir() / "keywords"
    files = sorted(directory.glob("*.json")) if directory.exists() else []
    return (util.read_json(files[-1]) or {}).get("volumes", {}) if files else {}


@functools.cache
def _all_comment_rows() -> dict[str, list[dict]]:
    directory = config.raw_dir() / "comments"
    out: dict[str, list[dict]] = {}
    for path in sorted(directory.glob("*.jsonl")) if directory.exists() else []:
        for row in util.read_jsonl(path):
            out.setdefault(row["video_id"], []).append(row)
    return out


def comment_stats() -> dict[str, dict | None]:
    """video_id -> its comment_stats, or None when the ledger has not reached it yet.

    A video the ledger marks done with zero stored roots is a real zero (we asked, there were
    none). A video the ledger has never reached is missing, never a zero: this is the
    distinction the whole layer exists to preserve.
    """
    ledger = comments.Ledger()
    rows_by_video = _all_comment_rows()
    out: dict[str, dict | None] = {}
    for video_id in ledger.rows:
        rows = rows_by_video.get(video_id, [])
        out[video_id] = {
            "root_count": len(rows),
            "top_comment_likes": max((r["like_count"] for r in rows), default=None),
            "classified": sum(1 for r in rows if r.get("category") is not None),
        }
    return out


def reset_caches() -> None:
    _all_channel_rows.cache_clear()
    _all_video_rows.cache_clear()
    _all_comment_rows.cache_clear()
