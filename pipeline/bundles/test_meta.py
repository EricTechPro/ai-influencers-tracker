"""meta.json's channel counter. The header reads these three numbers as an all-clear, so
collapsing a state into `ok` is the same class of failure as printing a zero for missing data."""
from __future__ import annotations

from pipeline import build_data, read
from pipeline.bundles import meta as meta_bundle

TODAY = __import__("datetime").date(2026, 7, 28)


def _series(*statuses):
    """One daily row per status, oldest first, all fields present."""
    return [{"date": f"2026-07-{20 + i:02d}", "status": s, "subscriber_count": 1000 + i,
             "view_count": 50_000 + i, "video_count": 10 + i}
            for i, s in enumerate(statuses)]


def _counts(series_by_channel, monkeypatch):
    monkeypatch.setattr(read, "channel_series", lambda cid: series_by_channel[cid])
    ctx = build_data.make_context(TODAY)
    return meta_bundle.build(ctx)["channels"]


def test_a_channel_whose_latest_reading_is_corrupt_is_not_counted_as_ok(
        ait_root, monkeypatch):
    """The roster's three channels have all been seen, but one's freshest row is corrupt.
    `ok` used to mean "has an ok row somewhere in its history", so a channel whose latest
    reading the pipeline itself condemned still landed in the all-clear bucket and the
    /channels header printed "3 tracked, 0 absent" over it. `ok` now answers the question
    the header asks: is the newest thing we know about this channel trustworthy."""
    by_channel = {
        "UCself": _series("ok", "ok"),
        "UCcole": _series("ok", "ok"),
        "UCdan": _series("ok", "corrupt"),     # seen, but today's reading is condemned
    }
    counts = _counts(by_channel, monkeypatch)

    assert counts == {"total": 3, "ok": 2, "corrupt": 1, "absent": 0}


def test_a_channel_never_seen_ok_stays_absent_and_is_counted_once(ait_root, monkeypatch):
    """absent keeps its own meaning: no ok reading has ever arrived. A channel that is both
    never-ok and corrupt at the tail must land in exactly one bucket, or the three counts
    stop summing to total and the header quietly over-reports the board."""
    by_channel = {
        "UCself": _series("ok", "ok"),
        "UCcole": _series("absent", "absent"),
        "UCdan": _series("absent", "corrupt"),
    }
    counts = _counts(by_channel, monkeypatch)

    assert counts["absent"] == 2
    assert counts["ok"] + counts["corrupt"] + counts["absent"] == counts["total"] == 3
