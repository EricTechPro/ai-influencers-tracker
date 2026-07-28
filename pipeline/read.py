"""The read layer over _raw/ and _synthesize/. Nothing here writes anything, anywhere."""
from __future__ import annotations

import functools

from . import config, growth, snapshot, util, vidiq


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
    return growth.filter_monotonic(merged)


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
                                          key=lambda r: r["date"]))


def all_videos(roster: list[dict]) -> list[dict]:
    """Registry metadata joined to the newest observed count. One row per video, ever seen."""
    out = []
    for channel_row in roster:
        for video_id, meta in snapshot.registry(channel_row["channel_id"]).items():
            series = video_series(video_id)
            newest = next((r for r in reversed(series) if r["status"] == "ok"), None)
            out.append({**meta, "video_id": video_id,
                        "view_count": newest["view_count"] if newest else None,
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


def reset_caches() -> None:
    _all_channel_rows.cache_clear()
    _all_video_rows.cache_clear()
