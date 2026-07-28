"""Entry point 1: the daily free sweep. Appends to _raw/, never edits and never deletes.

A channel that vanishes from a 200 response has gone private. It is written as status "absent"
with null counts, never as a zero and never omitted, because omitting it would let the gap
detector heal a hole that is not a hole.
"""
from __future__ import annotations

import argparse
import datetime as dt
import pathlib

from . import config, growth, util, youtube


def snapshot_path(date_str: str) -> pathlib.Path:
    return config.raw_dir() / "snapshots" / f"{date_str}.json"


def _stat(item: dict, key: str) -> int | None:
    value = item.get("statistics", {}).get(key)
    return int(value) if value is not None else None


def channel_rows(roster: list[dict], api: youtube.YouTube, today: dt.date) -> dict[str, dict]:
    """One row per roster channel, always. Absent is a state, not an omission."""
    date_string = util.date_str(today)
    ids = [row["channel_id"] for row in roster]
    fetched = api.channels(ids)
    out: dict[str, dict] = {}
    for channel_id in ids:
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
    ledger = youtube.QuotaLedger(youtube.ledger_path_for(date_string))
    batches = -(-len(roster) // youtube.BATCH)
    if dry_run:
        return {"date": date_string, "channels": len(roster),
                "would_spend_units": batches,
                "missing_dates": missing_dates(today, 30)}

    api = youtube.YouTube(config.require_env("YOUTUBE_API_KEY"), ledger=ledger)
    rows = channel_rows(roster, api, today)
    write_channel_snapshot(rows, today)
    ledger.save()
    absent = [cid for cid, row in rows.items() if row["status"] == "absent"]
    return {"date": date_string, "channels": len(rows), "absent": absent,
            "units": ledger.total, "missing_dates": missing_dates(today, 30)}


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
