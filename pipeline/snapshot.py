"""Entry point 1: the daily free sweep. Appends to _raw/, never edits and never deletes.

A channel that vanishes from a 200 response has gone private. It is written as status "absent"
with null counts, never as a zero and never omitted, because omitting it would let the gap
detector heal a hole that is not a hole.
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import pathlib
import re

from . import config, growth, util, youtube

_DURATION = re.compile(r"P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?")
SHORT_MAX_SECONDS = 180    # a constant, not a threshold: it is YouTube's own Shorts boundary


def snapshot_path(date_str: str) -> pathlib.Path:
    return config.raw_dir() / "snapshots" / f"{date_str}.json"


def _stat(item: dict, key: str) -> int | None:
    value = item.get("statistics", {}).get(key)
    return int(value) if value is not None else None


def fetch_channels(roster: list[dict], api: youtube.YouTube) -> dict[str, dict]:
    return api.channels([row["channel_id"] for row in roster])


def channel_rows(roster: list[dict], fetched: dict[str, dict], today: dt.date) -> dict[str, dict]:
    """One row per roster channel, always. Absent is a state, not an omission."""
    date_string = util.date_str(today)
    out: dict[str, dict] = {}
    for row in roster:
        channel_id = row["channel_id"]
        item = fetched.get(channel_id)
        if item is None:
            out[channel_id] = {"date": date_string, "status": "absent", "view_count": None,
                               "subscriber_count": None, "subscriber_bucket": None,
                               "video_count": None, "source": "youtube_api"}
            continue
        subscribers = _stat(item, "subscriberCount")
        out[channel_id] = {"date": date_string, "status": "ok",
                           "view_count": _stat(item, "viewCount"),
                           "subscriber_count": subscribers,
                           "subscriber_bucket": growth.bucket_width(subscribers),
                           "video_count": _stat(item, "videoCount"),
                           "source": "youtube_api"}
    return out


def write_channel_snapshot(rows: dict[str, dict], today: dt.date) -> pathlib.Path:
    date_string = util.date_str(today)
    path = snapshot_path(date_string)
    util.write_json(path, {"date": date_string, "channels": rows})
    return path


def classify_duration(iso8601: str) -> tuple[int, str]:
    """ISO-8601 duration -> (seconds, "short"|"long"). Separate baselines per length."""
    match = _DURATION.fullmatch(iso8601 or "")
    if not match:
        raise ValueError(f"unparseable duration {iso8601!r}")
    days, hours, minutes, seconds = (int(g or 0) for g in match.groups())
    total = ((days * 24 + hours) * 60 + minutes) * 60 + seconds
    return total, ("short" if total <= SHORT_MAX_SECONDS else "long")


def registry_path(channel_id: str) -> pathlib.Path:
    return config.raw_dir() / "videos" / f"{channel_id}.jsonl"


def registry(channel_id: str) -> dict[str, dict]:
    """video_id -> the last observation. The file is append-only; the reader takes the newest."""
    out: dict[str, dict] = {}
    for row in util.read_jsonl(registry_path(channel_id)):
        out[row["video_id"]] = row
    return out


def known_video_ids(channel_id: str) -> set[str]:
    return set(registry(channel_id))


def _observation(channel_id: str, item: dict, seen_at: str) -> dict:
    snippet = item.get("snippet", {})
    duration_s, kind = classify_duration(item.get("contentDetails", {}).get("duration", ""))
    return {"video_id": item["id"], "channel_id": channel_id,
            "title": snippet.get("title"), "description": snippet.get("description") or "",
            "tags": snippet.get("tags") or [], "published_at": snippet.get("publishedAt"),
            "duration_s": duration_s, "type": kind, "seen_at": seen_at}


def record_video_metadata(channel_id: str, items: list[dict],
                          seen_at: str | None = None) -> int:
    """Append an observation only when the video is new or changed. Returns the count written."""
    seen_at = seen_at or util.iso_z(dt.datetime.now(tz=util.UTC))
    current = registry(channel_id)
    written = 0
    for item in items:
        observation = _observation(channel_id, item, seen_at)
        previous = current.get(observation["video_id"])
        if previous is not None:
            comparable = {k: v for k, v in observation.items() if k != "seen_at"}
            if all(previous.get(k) == v for k, v in comparable.items()):
                continue
        util.append_jsonl(registry_path(channel_id), observation)
        current[observation["video_id"]] = observation
        written += 1
    return written


def video_ids_to_sweep(channel_id: str, today: dt.date, traction_thresholds: dict,
                       include_tail: bool | None = None) -> list[str]:
    """The newest recent_daily_n every day, plus the whole tail every tail_sweep_days.

    NO VIDEO IS EVER DROPPED: a two-year-old video that goes viral is caught within a week and
    rejoins daily tracking, because the tail sweep re-reads it and traction sees the jump.
    """
    rows = list(registry(channel_id).values())
    rows.sort(key=lambda r: r.get("published_at") or "", reverse=True)
    recent_n = traction_thresholds["recent_daily_n"]
    if include_tail is None:
        include_tail = today.toordinal() % traction_thresholds["tail_sweep_days"] == 0
    chosen = rows if include_tail else rows[:recent_n]
    return [r["video_id"] for r in chosen]


def video_rows(video_ids: list[str], api: youtube.YouTube, today: dt.date) -> dict[str, dict]:
    """One row per requested id. A deleted video is absent, never a zero."""
    date_string = util.date_str(today)
    fetched = api.videos(video_ids)
    out: dict[str, dict] = {}
    for video_id in video_ids:
        item = fetched.get(video_id)
        if item is None:
            out[video_id] = {"date": date_string, "status": "absent",
                             "view_count": None, "source": "youtube_api"}
            continue
        views = item.get("statistics", {}).get("viewCount")
        out[video_id] = {"date": date_string, "status": "ok",
                         "view_count": int(views) if views is not None else None,
                         "source": "youtube_api"}
    return out


def video_snapshot_path(date_str: str) -> pathlib.Path:
    return config.raw_dir() / "video_snapshots" / f"{date_str}.json"


def write_video_snapshot(rows: dict[str, dict], today: dt.date) -> pathlib.Path:
    date_string = util.date_str(today)
    path = video_snapshot_path(date_string)
    util.write_json(path, {"date": date_string, "videos": rows})
    return path


def write_repo_snapshot(payload: dict, today: dt.date) -> pathlib.Path:
    path = config.raw_dir() / "repos" / f"{util.date_str(today)}.json"
    util.write_json(path, payload)
    return path


def present_dates() -> list[str]:
    directory = config.raw_dir() / "snapshots"
    if not directory.exists():
        return []
    return sorted(p.stem for p in directory.glob("*.json"))


def missing_dates(today: dt.date, days: int) -> list[str]:
    """Calendar dates in the last `days` with no snapshot file. A hole is expected, not fatal."""
    present = set(present_dates())
    return [d for d in util.last_n_dates(today, days) if d not in present]


def run(today: dt.date | None = None, dry_run: bool = False) -> dict:
    today = today or util.today()
    date_string = util.date_str(today)
    roster = config.roster()
    config.self_channel(roster)                      # fails loudly on zero or two
    traction_thresholds = config.thresholds()["traction"]
    ledger = youtube.QuotaLedger(youtube.ledger_path_for(date_string))
    if dry_run:
        return {"date": date_string, "channels": len(roster),
                "would_spend_units": -(-len(roster) // youtube.BATCH),
                "missing_dates": missing_dates(today, 30)}

    api = youtube.YouTube(config.require_env("YOUTUBE_API_KEY"), ledger=ledger)
    fetched = fetch_channels(roster, api)
    rows = channel_rows(roster, fetched, today)
    write_channel_snapshot(rows, today)

    new_videos = 0
    for channel_id, item in fetched.items():
        uploads = api.playlist_items(api.uploads_playlist_id(item),
                                     known_ids=known_video_ids(channel_id))
        ids = [i["contentDetails"]["videoId"] for i in uploads]
        if ids:
            new_videos += record_video_metadata(channel_id, list(api.videos(ids).values()))

    to_sweep: list[str] = []
    for row in roster:
        to_sweep.extend(video_ids_to_sweep(row["channel_id"], today, traction_thresholds))
    write_video_snapshot(video_rows(to_sweep, api, today), today)

    from . import comments as comments_module
    self_row = config.self_channel(roster)
    comment_ledger = comments_module.Ledger()
    all_videos = [
        {**row, "video_id": vid}
        for r in roster
        for vid, row in registry(r["channel_id"]).items()
    ]
    remaining = youtube.DAILY_BUDGET - ledger.total - 500        # keep 500 units in hand
    comment_summary = comments_module.ingest(
        all_videos, api, comment_ledger, config.thresholds()["comments"],
        self_row["channel_id"], quota_cap=max(0, remaining))
    comment_ledger.save()

    from . import firecrawl
    from . import github as github_module
    from . import topics as topics_module
    github_thresholds = config.thresholds()["github"]
    gh = github_module.GitHub(os.environ.get("GITHUB_TOKEN", ""))
    leaf_topics = topics_module.leaves(topics_module.load())
    try:
        search = github_module.sweep(
            gh, github_module.build_queries(leaf_topics, today, github_thresholds),
            today, github_thresholds, config.excluded_repo_ids(), with_contributors=True)
        search_reason = None
    except github_module.GitHubError as exc:      # non-critical by design, like trending below
        search = {"repos": [], "partial_run": True}
        search_reason = f"{type(exc).__name__}: {exc}"
    trending = firecrawl.trending_sweep(
        lambda url: firecrawl.scrape_markdown(url, os.environ.get("FIRECRAWL_API_KEY", "")),
        gh, today, github_thresholds)
    write_repo_snapshot({"date": date_string,
                         "search": search["repos"], "trending": trending["repos"],
                         "partial_run": search["partial_run"], "search_reason": search_reason,
                         "trending_ok": trending["ok"], "trending_reason": trending["reason"]},
                        today)

    ledger.save()
    return {"date": date_string, "channels": len(rows),
            "absent": [c for c, r in rows.items() if r["status"] == "absent"],
            "new_videos": new_videos, "videos_swept": len(to_sweep),
            "units": ledger.total, "missing_dates": missing_dates(today, 30),
            "comments": comment_summary,
            "partial_run": search["partial_run"], "trending_ok": trending["ok"]}


def main() -> int:
    parser = argparse.ArgumentParser(description="the daily free sweep")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--date", help="YYYY-MM-DD, defaults to today UTC")
    args = parser.parse_args()
    day = util.parse_date(args.date) if args.date else None
    summary = run(today=day, dry_run=args.dry_run)
    for key, value in summary.items():
        print(f"{key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
