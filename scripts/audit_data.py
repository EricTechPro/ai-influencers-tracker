"""Full data-integrity audit of the ai-influencers-tracker data.

The sibling of `projects/social-invest/skills/si-refresh/scripts/audit_data.py`. Reads only;
it never writes into `config/`, `_raw/`, `_synthesize/` or `_db/`.

    python3 scripts/audit_data.py            # free, reads local files only
    python3 scripts/audit_data.py --live     # + 2 quota units: held vs YouTube's videoCount

`--live` is the only check that can prove a channel is under-ingested rather than merely quiet,
because a stale `newest` date is indistinguishable from a creator who stopped posting.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from pipeline import config, util, youtube  # noqa: E402

ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
VIDEO_TYPES = {"short", "long"}
# The observed per-channel ceiling of the uploads walk. A channel sitting at or above this is
# truncated, not complete: its history starts where the walk stopped, not where the channel did.
# Only `--live` can confirm it, so offline runs treat this as the suspicion threshold.
INGEST_CAP = 250

issues: dict[str, list[str]] = collections.defaultdict(list)


def bad(cat: str, msg: str) -> None:
    issues[cat].append(msg)


def held_videos(channel_id: str) -> list[dict]:
    """Every video row we hold for a channel, newest last, de-duplicated by video_id."""
    path = config.raw_dir() / "videos" / f"{channel_id}.jsonl"
    if not path.exists():
        return []
    rows: dict[str, dict] = {}
    for line in path.open():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            bad("jsonl-parse", f"{channel_id}: {exc}")
            continue
        rows[row.get("video_id")] = row
    return sorted(rows.values(), key=lambda r: r.get("published_at") or "")


def audit_roster(roster: list[dict]) -> None:
    own = [r for r in roster if r.get("category") == "own"]
    if len(own) != 1:
        bad("roster", f"exactly one row must be category=own, found {len(own)}")
    handles = collections.Counter(r.get("handle") for r in roster)
    for handle, n in handles.items():
        if n > 1:
            bad("roster", f"handle {handle!r} appears {n}x")
    ids = collections.Counter(r.get("channel_id") for r in roster if r.get("channel_id"))
    for cid, n in ids.items():
        if n > 1:
            bad("roster", f"channel_id {cid} appears {n}x")
    for r in roster:
        if not r.get("channel_id"):
            bad("roster", f"{r.get('handle')}: no channel_id, the sweep cannot batch it")
        if not r.get("name"):
            bad("roster", f"{r.get('handle')}: no name")


def audit_videos(roster: list[dict], today: str) -> dict[str, dict]:
    """Per-channel content shape. Returns the per-channel summary for the coverage table."""
    summary: dict[str, dict] = {}
    for r in roster:
        cid = r.get("channel_id")
        if not cid:
            continue
        rows = held_videos(cid)
        handle = r["handle"]
        if not rows:
            bad("no-videos", f"{handle}: holds no videos at all")
            summary[handle] = {"held": 0, "oldest": "", "newest": "", "max_gap": None}
            continue

        dates = []
        for v in rows:
            pa = v.get("published_at") or ""
            if not ISO_DATE.match(pa):
                bad("date", f"{handle}/{v.get('video_id')}: bad published_at {pa!r}")
                continue
            if pa[:10] > today:
                bad("date", f"{handle}/{v.get('video_id')}: published in the future ({pa[:10]})")
            dates.append(dt.date.fromisoformat(pa[:10]))
            if v.get("type") not in VIDEO_TYPES:
                bad("field", f"{handle}/{v.get('video_id')}: type={v.get('type')!r}")
            d = v.get("duration_s")
            if d is not None and (not isinstance(d, int) or d < 0):
                bad("field", f"{handle}/{v.get('video_id')}: duration_s={d!r}")
            if not (v.get("title") or "").strip():
                bad("field", f"{handle}/{v.get('video_id')}: empty title")
            if v.get("channel_id") != cid:
                bad("field", f"{handle}/{v.get('video_id')}: channel_id mismatch")

        dates.sort()
        gaps = [((dates[i + 1] - dates[i]).days, dates[i], dates[i + 1])
                for i in range(len(dates) - 1)]
        worst = max(gaps) if gaps else None
        summary[handle] = {"held": len(rows), "oldest": str(dates[0]), "newest": str(dates[-1]),
                           "max_gap": worst}
        if len(rows) >= INGEST_CAP:
            bad("truncated", f"{handle}: {len(rows)} held, parked on the {INGEST_CAP} ingest cap, "
                             f"history starts {dates[0]} not at the channel's real start")
    return summary


def audit_snapshots() -> None:
    snap = util.read_json(config.db_dir() / "snapshots.json") or {}
    missing = snap.get("dates_missing") or []
    if missing:
        bad("snapshot-gap", f"{len(missing)} calendar days with no snapshot: "
                            f"{missing[0]} .. {missing[-1]}")


def audit_bundles(roster: list[dict], today: str) -> None:
    meta = util.read_json(config.db_dir() / "meta.json") or {}
    gen = str(meta.get("generated_at") or "")
    if gen and not gen.startswith(today):
        bad("stale-build", f"meta.generated_at={gen!r} is not today, rerun build_data")
    if meta.get("partial_run"):
        bad("stale-build", "meta.partial_run is true, the last sweep was truncated")

    chans = (util.read_json(config.db_dir() / "channels.json") or {}).get("channels") or []
    if len(chans) != len(roster):
        bad("bundle", f"channels.json has {len(chans)} rows, roster has {len(roster)}")
    known = {c.get("channel_id") for c in chans}
    for c in chans:
        if c.get("status") == "absent":
            bad("absent", f"{c.get('handle')}: channel went private or was deleted")

    vids = (util.read_json(config.db_dir() / "videos.json") or {}).get("videos") or []
    orphans = {v.get("channel_id") for v in vids} - known
    for cid in sorted(orphans):
        bad("xref", f"videos.json references channel {cid} absent from channels.json")

    health = meta.get("comment_health") or {}
    with_comments = health.get("channels_with_comments")
    if with_comments is not None and with_comments < len(roster):
        bad("comments", f"only {with_comments} of {len(roster)} channels have comments")


def audit_backfill(roster: list[dict]) -> None:
    """vidIQ history must never move backwards. A falling total is a corrupt vendor point."""
    for r in roster:
        cid = r.get("channel_id")
        path = config.raw_dir() / "backfill" / f"{cid}.json"
        if not cid or not path.exists():
            continue
        points = (util.read_json(path) or {}).get("points") or []
        prev_subs = prev_views = None
        drops = 0
        for p in points:
            if p.get("status") != "ok":
                continue
            subs, views = p.get("subscriber_count"), p.get("view_count")
            if prev_subs is not None and subs is not None and subs < prev_subs:
                drops += 1
            if prev_views is not None and views is not None and views < prev_views:
                drops += 1
            prev_subs, prev_views = subs or prev_subs, views or prev_views
        if drops:
            bad("monotonicity", f"{r['handle']}: {drops} backwards points in vidIQ history")


def audit_live(roster: list[dict], summary: dict[str, dict]) -> None:
    """The only check that separates 'under-ingested' from 'the creator went quiet'."""
    api = youtube.YouTube(config.require_env("YOUTUBE_API_KEY"))
    by_id = {r["channel_id"]: r["handle"] for r in roster if r.get("channel_id")}
    ids = list(by_id)
    for i in range(0, len(ids), 50):
        chunk = ids[i:i + 50]
        data = api._get("channels", {"part": "statistics", "id": ",".join(chunk)},
                        1, "channels.list")
        for item in data.get("items", []):
            handle = by_id[item["id"]]
            total = int(item["statistics"].get("videoCount") or 0)
            row = summary.get(handle) or {}
            row["yt_total"] = total
            gap = total - row.get("held", 0)
            row["gap"] = gap
            if gap > 0:
                bad("under-ingested", f"{handle}: holds {row.get('held')} of {total} videos "
                                      f"({gap} missing)")
    print(f"live check cost {api.ledger.total} quota units")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true",
                        help="also compare held counts against YouTube (2 quota units)")
    parser.add_argument("--table", action="store_true", help="print the per-channel table")
    args = parser.parse_args()

    config.load_env()
    roster = config.roster()
    today = dt.datetime.now(tz=util.UTC).date().isoformat()
    print(f"roster={len(roster)} today={today}")

    audit_roster(roster)
    summary = audit_videos(roster, today)
    audit_snapshots()
    audit_bundles(roster, today)
    audit_backfill(roster)
    if args.live:
        audit_live(roster, summary)

    if args.table:
        print(f"\n{'handle':<28}{'held':>6}{'yt':>7}{'gap':>7}  {'oldest':<12}{'newest':<12}maxgap")
        for handle, s in sorted(summary.items(), key=lambda kv: kv[1]["newest"]):
            g = s["max_gap"]
            print(f"{handle[:27]:<28}{s['held']:>6}{str(s.get('yt_total', '-')):>7}"
                  f"{str(s.get('gap', '-')):>7}  {s['oldest']:<12}{s['newest']:<12}"
                  f"{g[0] if g else '-'}d")

    order = ["roster", "no-videos", "jsonl-parse", "date", "field", "truncated", "under-ingested",
             "absent", "snapshot-gap", "monotonicity", "xref", "bundle", "comments", "stale-build"]
    # A check that never ran is not a check that passed. Missing data is a state, never a zero.
    skipped = set() if args.live else {"under-ingested"}
    print()
    total = 0
    for cat in order:
        found = issues.get(cat)
        if cat in skipped:
            print(f"SKIP  {cat}  (needs --live)")
            continue
        if not found:
            print(f"PASS  {cat}")
            continue
        total += len(found)
        print(f"FAIL  {cat}: {len(found)}")
        for msg in found[:6]:
            print(f"        - {msg}")
        if len(found) > 6:
            print(f"        ... +{len(found) - 6} more")
    print(f"\nTOTAL ISSUES: {total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
