"""One-time roster resolution: handle -> channel_id, plus subscriber counts for review.

Per docs/plans/2026-07-28-handoff.md section 2 (ticked default), this writes channel_id
directly into config/channels.json: a timestamped backup lands in _raw/ first, and the merge
touches the channel_id field and nothing else. niche is never invented; it stays Eric's to set
by hand, on this row or any other. This is the one sanctioned exception to "the pipeline never
writes into config/" (system.md T1): a one-time script in scripts/, not pipeline/.

    python3 scripts/resolve_channel_ids.py
"""
from __future__ import annotations

import argparse
import datetime as dt
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from pipeline import config, util, youtube      # noqa: E402


def resolve(rows: list[dict], api: youtube.YouTube) -> tuple[list[dict], list[dict]]:
    """forHandle does not batch, so this is one call per unresolved handle. One time only."""
    resolved, unresolved = [], []
    for row in rows:
        out = dict(row)
        if out.get("channel_id"):
            resolved.append(out)
            continue
        data = api._get("channels", {"part": "snippet,statistics",
                                     "forHandle": out["handle"]}, 1, "channels.list")
        items = data.get("items") or []
        if not items:
            unresolved.append(out)
            continue
        item = items[0]
        subs = item.get("statistics", {}).get("subscriberCount")
        out["channel_id"] = item["id"]
        out["resolved_name"] = item.get("snippet", {}).get("title")
        out["subscriber_count"] = int(subs) if subs is not None else None
        out.setdefault("niche", None)          # a human sets niche. Never guessed.
        resolved.append(out)
    return resolved, unresolved


def merge_channel_ids(raw: dict, resolved: list[dict]) -> dict:
    """Return a copy of the raw channels.json content with channel_id filled in from
    `resolved`. Every other field, including niche, is left exactly as it was."""
    by_handle = {r["handle"]: r.get("channel_id") for r in resolved}
    out = {**raw, "channels": [dict(row) for row in raw.get("channels", [])]}
    for row in out["channels"]:
        cid = by_handle.get(row.get("handle"))
        if cid and not row.get("channel_id"):
            row["channel_id"] = cid
    return out


def backup_channels(channels_path: pathlib.Path, raw_dir: pathlib.Path, now: str) -> pathlib.Path:
    """Copy channels.json into _raw/ before any mutation. Timestamped so a second run never
    clobbers the first."""
    backup_path = raw_dir / f"channels_backup_{now}.json"
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    backup_path.write_text(channels_path.read_text())
    return backup_path


def apply_resolution(channels_path: pathlib.Path, raw_dir: pathlib.Path,
                      api: youtube.YouTube, now: str) -> dict:
    """Back up, resolve, and merge channel_id directly into channels_path."""
    raw = util.read_json(channels_path)
    backup_path = backup_channels(channels_path, raw_dir, now)
    resolved, unresolved = resolve(raw.get("channels", []), api)
    merged = merge_channel_ids(raw, resolved)
    util.write_json(channels_path, merged)
    return {"resolved": resolved, "unresolved": unresolved, "backup_path": str(backup_path)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", default="_raw/roster_candidates.json",
                         help="audit file recording what resolve() found (in addition to "
                              "the direct config/channels.json write)")
    args = parser.parse_args()

    config.load_env()
    channels_path = config.config_dir() / "channels.json"
    if util.read_json(channels_path) is None:
        print("config/channels.json not found. Copy config/channels.example.json first.")
        return 1

    api = youtube.YouTube(config.require_env("YOUTUBE_API_KEY"))
    now = dt.datetime.now(tz=util.UTC).strftime("%Y%m%d-%H%M%S")
    summary = apply_resolution(channels_path, config.raw_dir(), api, now)
    resolved, unresolved = summary["resolved"], summary["unresolved"]

    report_path = config.root() / args.report
    util.write_json(report_path, {"resolved": resolved, "unresolved": unresolved})

    print(f"backup: {summary['backup_path']}")
    print(f"resolved {len(resolved)} of {len(resolved) + len(unresolved)}, "
          f"{api.ledger.total} quota units")
    print("channel_id merged directly into config/channels.json "
          "(handoff 2026-07-28 default). niche left unfilled for Eric to set by hand.")
    if unresolved:
        print("UNRESOLVED, fix the handle by hand:")
        for row in unresolved:
            print(f"  {row.get('handle')}")
    print(f"audit report: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
