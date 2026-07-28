"""Outlier fetching. Every test uses a fake transport; none ever spends a credit."""
from __future__ import annotations

import datetime as dt
import json

import pytest

from pipeline import config, outliers, util, vidiq


def test_batches_splits_at_the_vendor_limit():
    ids = [f"UC{i:03d}" for i in range(72)]
    groups = outliers.batches(ids)
    assert len(groups) == 3
    assert [len(g) for g in groups] == [24, 24, 24]
    assert [i for g in groups for i in g] == ids


def test_batches_keeps_a_short_final_group():
    ids = [f"UC{i:03d}" for i in range(50)]
    groups = outliers.batches(ids)
    assert [len(g) for g in groups] == [24, 24, 2]


def test_batches_of_an_empty_roster_is_empty_not_one_empty_group():
    assert outliers.batches([]) == []


# One real row from vidiq_outliers on 2026-07-29, trimmed to the keys we read.
LIVE_ROW = {
    "videoId": "IbFaY3xFpZM",
    "videoTitle": "I Tested 100+ Hermes Agent Automations. These Are The Best",
    "videoPublishedAt": 1784848095,
    "videoDuration": 1045,
    "channelId": "UC4SgqYQmdTCKXUoer2U-lcg",
    "channelTitle": "Dubibubi",
    "viewCount": 36869,
    "breakoutScore": 9.59,
    "videoType": "long",
    "vph": 145.71,
    "engagementRate": 0.049,
}


def test_normalise_maps_the_live_shape():
    row = outliers.normalise(LIVE_ROW)
    assert row == {
        "video_id": "IbFaY3xFpZM",
        "title": "I Tested 100+ Hermes Agent Automations. These Are The Best",
        # 1784848095 is 2026-07-23T23:08:15Z. Asserted as a literal rather than recomputed,
        # so a change to parse_ts/iso_z has to break a test to land.
        "published_at": "2026-07-23T23:08:15Z",
        "view_count": 36869,
        "duration_s": 1045,
        "type": "long",
        "channel_id": "UC4SgqYQmdTCKXUoer2U-lcg",
        "channel_name": "Dubibubi",
        "breakout_score": 9.59,
        "vph": 145.71,
        "engagement_rate": 0.049,
    }


def test_normalise_never_recomputes_or_rounds_the_score():
    row = outliers.normalise({**LIVE_ROW, "breakoutScore": 17.934999})
    assert row["breakout_score"] == 17.934999


def test_normalise_keeps_a_missing_score_as_none_not_zero():
    payload = {k: v for k, v in LIVE_ROW.items() if k != "breakoutScore"}
    assert outliers.normalise(payload)["breakout_score"] is None


class FakeClient:
    """Stands in for VidIQ. Records calls and replays scripted replies, one per batch."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    def call(self, tool, arguments):
        self.calls.append((tool, arguments))
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def _guard():
    return vidiq.CostGuard(balance=1000, reserve=0, ceiling=1000)


def test_fetch_makes_one_call_per_batch_and_merges_the_videos():
    ids = [f"UC{i:03d}" for i in range(48)]
    client = FakeClient([{"videos": [LIVE_ROW]}, {"videos": [LIVE_ROW]}])
    result = outliers.fetch(client, _guard(), ids)

    assert len(client.calls) == 2
    assert result["coverage"] == {
        "channels_requested": 48,
        "batches_ok": 2,
        "batches_failed": 0,
        "missing_channel_ids": [],
    }
    assert result["credits"] == 10
    assert len(result["videos"]) == 1


def test_fetch_sends_the_arguments_vidiq_expects():
    client = FakeClient([{"videos": []}])
    outliers.fetch(client, _guard(), ["UC001"], content_type="short", window="thisWeek")
    tool, args = client.calls[0]
    assert tool == "vidiq_outliers"
    assert args == {
        "channelIds": ["UC001"],
        "contentType": "short",
        "publishedWithin": "thisWeek",
        "limit": 100,
        "sort": "breakoutScore",
    }


def test_a_failed_batch_is_reported_missing_not_silently_dropped():
    ids = [f"UC{i:03d}" for i in range(48)]
    client = FakeClient([{"videos": [LIVE_ROW]}, vidiq.VidiqError("boom")])
    result = outliers.fetch(client, _guard(), ids)

    assert result["coverage"]["batches_ok"] == 1
    assert result["coverage"]["batches_failed"] == 1
    assert result["coverage"]["missing_channel_ids"] == ids[24:]
    assert len(result["videos"]) == 1


def test_fetch_stops_when_the_cost_guard_refuses():
    guard = vidiq.CostGuard(balance=1000, reserve=0, ceiling=5)
    client = FakeClient([{"videos": []}, {"videos": []}])
    with pytest.raises(vidiq.CostGuardError):
        outliers.fetch(client, guard, [f"UC{i:03d}" for i in range(48)])


def test_fetch_dedupes_a_video_returned_by_two_batches():
    client = FakeClient([{"videos": [LIVE_ROW]}, {"videos": [LIVE_ROW]}])
    result = outliers.fetch(client, _guard(), [f"UC{i:03d}" for i in range(48)])
    assert len({v["video_id"] for v in result["videos"]}) == 1
    assert len(result["videos"]) == 1


def test_sweep_dry_run_spends_nothing_and_writes_nothing(ait_root, capsys):
    client = FakeClient([])
    result = outliers.sweep(config.roster(), client, _guard(), dt.date(2026, 7, 29))

    assert result["dry_run"] is True
    assert result["spent"] == 0
    assert client.calls == []
    assert not (ait_root / "_synthesize" / "outliers").exists()
    assert "credits" in capsys.readouterr().out


def test_sweep_writes_both_formats_into_one_dated_file(ait_root):
    # 3 roster channels -> 1 batch per format -> 2 calls
    client = FakeClient([{"videos": [LIVE_ROW]}, {"videos": []}])
    result = outliers.sweep(config.roster(), client, _guard(), dt.date(2026, 7, 29),
                            dry_run=False)

    path = ait_root / "_synthesize" / "outliers" / "2026-07-29.json"
    assert path.exists()
    written = json.loads(path.read_text())
    assert written["date"] == "2026-07-29"
    assert [f["content_type"] for f in written["formats"]] == ["long", "short"]
    assert written["formats"][0]["videos"][0]["video_id"] == "IbFaY3xFpZM"
    assert result["spent"] == 10


def test_latest_returns_none_when_no_sweep_has_run(ait_root):
    assert outliers.latest() is None


def test_latest_returns_the_newest_file(ait_root):
    for date in ("2026-07-27", "2026-07-29", "2026-07-28"):
        util.write_json(config.synth_dir() / "outliers" / f"{date}.json", {"date": date})
    assert outliers.latest()["date"] == "2026-07-29"
