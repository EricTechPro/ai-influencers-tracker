"""vidIQ breakout scores for the roster. Metered, so it lands in _synthesize/, never _raw/.

The score is vidIQ's, not ours. pipeline/multiplier.py still serves the taxonomy shelves; this
module exists because our median-over-mature-uploads baseline disagreed with vidIQ by roughly 2x
on every shared video, and vidIQ additionally normalises by video age, which we cannot do until
the snapshot series exists. See docs/superpowers/specs/2026-07-28-topics-recent-feed-design.md.
"""
from __future__ import annotations

import argparse
import datetime as dt

from . import config, util, vidiq

# vidIQ rejects a 72-id request and accepts a 24-id one. Verified live 2026-07-29. This is a
# vendor constraint, not a tuning knob, which is why it is a constant and not in thresholds.json.
BATCH_SIZE = 24
OUTLIER_COST = 5
FORMATS = ("long", "short")


def batches(channel_ids: list[str], size: int = BATCH_SIZE) -> list[list[str]]:
    """The roster split into requests vidIQ will actually accept, order preserved."""
    return [channel_ids[i:i + size] for i in range(0, len(channel_ids), size)]


def by_score(video: dict) -> tuple:
    """The one ranking for outliers: score descending, video_id breaking ties.

    A null score sorts as 0 here rather than being dropped, because this is only an ordering —
    the display floor is what decides whether a scoreless row reaches the grid. The video_id
    tie-break is what makes a rebuild byte-identical.
    """
    return (-(video["breakout_score"] or 0), video["video_id"])


def normalise(row: dict) -> dict:
    """One vidIQ row in _db/'s vocabulary. breakout_score is carried through untouched:
    it is a vendor number and rounding it would be editing someone else's measurement."""
    return {
        "video_id": row.get("videoId"),
        "title": row.get("videoTitle"),
        "published_at": util.iso_z(util.parse_ts(row["videoPublishedAt"])),
        "view_count": row.get("viewCount"),
        "duration_s": row.get("videoDuration"),
        "type": row.get("videoType"),
        "channel_id": row.get("channelId"),
        "channel_name": row.get("channelTitle"),
        "breakout_score": row.get("breakoutScore"),
        "vph": row.get("vph"),
        "engagement_rate": row.get("engagementRate"),
    }


def fetch(client, guard, channel_ids: list[str], content_type: str = "long",
          window: str = "thisMonth", limit: int = 100) -> dict:
    """Every batch vidIQ will accept, merged. A batch that fails is named, not absorbed.

    Returning 48 channels' outliers as if they were 72 would read as "nothing broke out on the
    other 24", which is a claim nobody made. coverage carries the truth to the page.
    """
    groups = batches(channel_ids)
    by_id: dict[str, dict] = {}
    ok = 0
    missing: list[str] = []

    for group in groups:
        guard.check(OUTLIER_COST, f"vidiq_outliers x{len(group)} {content_type}")
        try:
            payload = client.call("vidiq_outliers", {
                "channelIds": list(group),
                "contentType": content_type,
                "publishedWithin": window,
                "limit": limit,
                "sort": "breakoutScore",
            })
        except vidiq.VidiqError:
            missing.extend(group)
            continue
        finally:
            guard.record(OUTLIER_COST)
        ok += 1
        for raw in payload.get("videos") or []:
            row = normalise(raw)
            if row["video_id"]:
                by_id.setdefault(row["video_id"], row)

    videos = sorted(by_id.values(), key=by_score)
    return {
        "videos": videos,
        "coverage": {
            "channels_requested": len(channel_ids),
            "batches_ok": ok,
            "batches_failed": len(groups) - ok,
            "missing_channel_ids": missing,
        },
        "credits": OUTLIER_COST * len(groups),
        "window": window,
        "content_type": content_type,
    }


def sweep(roster: list[dict], client, guard, today: dt.date,
          window: str = "thisMonth", dry_run: bool = True) -> dict:
    """One dated file holding both formats. thisMonth is fetched once; the 7d and 14d views on
    the page are filtered from it client-side, so the window toggle costs nothing."""
    channel_ids = [row["channel_id"] for row in roster]
    per_format = OUTLIER_COST * len(batches(channel_ids))
    print(guard.preview([(f"vidiq_outliers {fmt} x{len(batches(channel_ids))}", per_format)
                         for fmt in FORMATS]))
    if dry_run:
        return {"formats": len(FORMATS), "credits": per_format * len(FORMATS),
                "spent": 0, "dry_run": True}

    formats = [fetch(client, guard, channel_ids, content_type=fmt, window=window)
               for fmt in FORMATS]
    util.write_json(config.synth_dir() / "outliers" / f"{util.date_str(today)}.json",
                    {"date": util.date_str(today), "window": window, "formats": formats})
    return {"formats": len(formats), "credits": per_format * len(FORMATS),
            "spent": guard.spent, "dry_run": False}


def latest() -> dict | None:
    """The newest sweep on disk, or None. None is a state: no sweep has run yet."""
    return util.newest_json(config.synth_dir() / "outliers")


def main() -> int:
    parser = argparse.ArgumentParser(description="fetch vidIQ breakout scores for the roster")
    parser.add_argument("--no-dry-run", action="store_true", help="actually spend credits")
    args = parser.parse_args()
    client = vidiq.client_from_env()
    guard = vidiq.CostGuard(vidiq.balance(client).get("totalCredits", 0))
    summary = sweep(config.roster(), client, guard, util.today(),
                    dry_run=not args.no_dry_run)
    for key, value in summary.items():
        print(f"{key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
