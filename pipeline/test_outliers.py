"""Outlier fetching. Every test uses a fake transport; none ever spends a credit."""
from __future__ import annotations

from pipeline import outliers


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
