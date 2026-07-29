"""vidIQ breakout scores for the roster. Metered, so it lands in _synthesize/, never _raw/.

The score is vidIQ's, not ours. pipeline/multiplier.py still serves the taxonomy shelves; this
module exists because our median-over-mature-uploads baseline disagreed with vidIQ by roughly 2x
on every shared video, and vidIQ additionally normalises by video age, which we cannot do until
the snapshot series exists. See docs/superpowers/specs/2026-07-28-topics-recent-feed-design.md.
"""
from __future__ import annotations

from . import util, vidiq

# vidIQ rejects a 72-id request and accepts a 24-id one. Verified live 2026-07-29. This is a
# vendor constraint, not a tuning knob, which is why it is a constant and not in thresholds.json.
BATCH_SIZE = 24
OUTLIER_COST = 5


def batches(channel_ids: list[str], size: int = BATCH_SIZE) -> list[list[str]]:
    """The roster split into requests vidIQ will actually accept, order preserved."""
    return [channel_ids[i:i + size] for i in range(0, len(channel_ids), size)]


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

    videos = sorted(by_id.values(),
                    key=lambda v: (-(v["breakout_score"] or 0), v["video_id"]))
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
