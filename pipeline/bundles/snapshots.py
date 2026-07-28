"""snapshots.json and video_snapshots.json: the growth history, exactly as recorded."""
from __future__ import annotations

from .. import config, read, snapshot, util

VERSION = 3
VIDEO_VERSION = 1


def build(ctx) -> dict:
    channels = {}
    for row in ctx.roster:
        channels[row["channel_id"]] = {"handle": row.get("handle"),
                                       "series": read.channel_series(row["channel_id"])}
    present = snapshot.present_dates()
    window = ctx.thresholds["growth"]["default_window_days"]
    return {"version": VERSION, "generated_at": ctx.generated_at,
            "dates_present": present,
            "dates_missing": snapshot.missing_dates(ctx.today, window),
            "channels": channels}


def build_videos(ctx) -> dict:
    return {"version": VIDEO_VERSION, "generated_at": ctx.generated_at,
            "videos": {v["video_id"]: {"channel_id": v["channel_id"], "series": v["series"]}
                       for v in ctx.videos}}


def write(ctx) -> None:
    util.write_json(config.db_dir() / "snapshots.json", build(ctx))
    util.write_json(config.db_dir() / "video_snapshots.json", build_videos(ctx))
