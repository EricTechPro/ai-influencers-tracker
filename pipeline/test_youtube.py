import json

import pytest

from pipeline import youtube


class FakeTransport:
    """Records every URL and replies from a queue of dicts."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.urls = []

    def __call__(self, url):
        self.urls.append(url)
        return json.dumps(self.replies.pop(0)).encode()


def _channel_item(cid, subs="219000", views="11991545", videos="412"):
    return {"id": cid,
            "snippet": {"title": cid, "thumbnails": {"high": {"url": f"http://x/{cid}.jpg"}}},
            "statistics": {"subscriberCount": subs, "viewCount": views, "videoCount": videos},
            "contentDetails": {"relatedPlaylists": {"uploads": "UU" + cid[2:]}}}


def test_channels_batches_fifty_ids_per_call(ait_root):
    ids = [f"UC{i:03d}" for i in range(72)]
    transport = FakeTransport([
        {"items": [_channel_item(c) for c in ids[:50]]},
        {"items": [_channel_item(c) for c in ids[50:]]},
    ])
    api = youtube.YouTube("KEY", transport=transport)
    got = api.channels(ids)
    assert len(transport.urls) == 2
    assert len(got) == 72
    assert api.ledger.total == 2


def test_a_channel_missing_from_a_200_response_is_simply_absent(ait_root):
    transport = FakeTransport([{"items": [_channel_item("UCa")]}])
    api = youtube.YouTube("KEY", transport=transport)
    got = api.channels(["UCa", "UCgoneprivate"])
    assert set(got) == {"UCa"}


def test_videos_batches_fifty_and_charges_one_unit_per_call(ait_root):
    ids = [f"v{i}" for i in range(120)]
    transport = FakeTransport([
        {"items": [{"id": i} for i in ids[:50]]},
        {"items": [{"id": i} for i in ids[50:100]]},
        {"items": [{"id": i} for i in ids[100:]]},
    ])
    api = youtube.YouTube("KEY", transport=transport)
    assert len(api.videos(ids)) == 120
    assert api.ledger.total == 3
    assert api.ledger.by_call["videos.list"] == 3


def test_playlist_items_stops_at_the_first_known_id(ait_root):
    page = {"items": [{"contentDetails": {"videoId": "new1"}},
                      {"contentDetails": {"videoId": "new2"}},
                      {"contentDetails": {"videoId": "old1"}}],
            "nextPageToken": "PAGE2"}
    transport = FakeTransport([page])
    api = youtube.YouTube("KEY", transport=transport)
    got = api.playlist_items("UUx", known_ids={"old1"})
    assert [g["contentDetails"]["videoId"] for g in got] == ["new1", "new2"]
    assert len(transport.urls) == 1          # never asked for page 2


def test_quota_is_refused_once_the_daily_budget_is_gone(ait_root):
    api = youtube.YouTube("KEY", transport=FakeTransport([]))
    api.ledger.spend(youtube.DAILY_BUDGET, "videos.list")
    with pytest.raises(youtube.QuotaExceeded):
        api.channels(["UCa"])


def test_the_ledger_persists_and_reloads(ait_root, tmp_path):
    path = tmp_path / "quota-2026-07-27.json"
    ledger = youtube.QuotaLedger(path)
    ledger.spend(2, "channels.list")
    ledger.spend(72, "videos.list")
    ledger.save()
    assert youtube.QuotaLedger(path).total == 74
    assert youtube.QuotaLedger(path).by_call["videos.list"] == 72


def test_search_list_is_not_callable(ait_root):
    """100 units a call. Banned by spec §8, and there is deliberately no method for it."""
    assert not hasattr(youtube.YouTube("KEY"), "search")
