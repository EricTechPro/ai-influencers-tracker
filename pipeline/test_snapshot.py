import datetime as dt
import json

import pytest

from pipeline import config, snapshot, util

TODAY = dt.date(2026, 7, 27)


class FakeTransport:
    def __init__(self, items):
        self.items = items
        self.urls = []

    def __call__(self, url):
        self.urls.append(url)
        wanted = url.split("id=")[1].split("&")[0].split("%2C")
        return json.dumps({"items": [self.items[i] for i in wanted if i in self.items]}).encode()


def _item(cid, subs, views, videos):
    return {"id": cid,
            "snippet": {"title": cid, "thumbnails": {"high": {"url": f"http://x/{cid}.jpg"}}},
            "statistics": {"subscriberCount": str(subs), "viewCount": str(views),
                           "videoCount": str(videos)},
            "contentDetails": {"relatedPlaylists": {"uploads": "UU" + cid[2:]}}}


def _api(items):
    from pipeline import youtube
    return youtube.YouTube("KEY", transport=FakeTransport(items))


def test_a_row_is_written_for_every_roster_channel(ait_root):
    api = _api({"UCself": _item("UCself", 68700, 4102880, 210),
                "UCcole": _item("UCcole", 219000, 11991545, 412),
                "UCdan": _item("UCdan", 2930000, 90000000, 900)})
    rows = snapshot.channel_rows(config.roster(), api, TODAY)
    assert set(rows) == {"UCself", "UCcole", "UCdan"}
    assert rows["UCcole"] == {"date": "2026-07-27", "status": "ok", "view_count": 11991545,
                              "subscriber_count": 219000, "subscriber_bucket": 1000,
                              "video_count": 412, "source": "youtube_api"}


def test_a_channel_missing_from_the_response_is_absent_never_zero(ait_root):
    api = _api({"UCself": _item("UCself", 68700, 4102880, 210),
                "UCcole": _item("UCcole", 219000, 11991545, 412)})
    rows = snapshot.channel_rows(config.roster(), api, TODAY)
    assert rows["UCdan"] == {"date": "2026-07-27", "status": "absent", "view_count": None,
                             "subscriber_count": None, "subscriber_bucket": None,
                             "video_count": None, "source": "youtube_api"}


def test_rerunning_the_same_day_is_byte_identical(ait_root):
    rows = {"UCcole": {"date": "2026-07-27", "status": "ok", "view_count": 1,
                       "subscriber_count": 1000, "subscriber_bucket": 10,
                       "video_count": 1, "source": "youtube_api"}}
    first = snapshot.write_channel_snapshot(rows, TODAY).read_bytes()
    assert snapshot.write_channel_snapshot(rows, TODAY).read_bytes() == first


def test_missing_dates_finds_the_hole(ait_root):
    for day in ("2026-07-24", "2026-07-25", "2026-07-27"):
        util.write_json(snapshot.snapshot_path(day), {"date": day, "channels": {}})
    assert snapshot.missing_dates(TODAY, days=4) == ["2026-07-26"]


def test_no_snapshots_at_all_reports_every_day_missing(ait_root):
    assert snapshot.missing_dates(TODAY, days=3) == ["2026-07-25", "2026-07-26", "2026-07-27"]


def test_the_sweep_refuses_to_run_without_exactly_one_self_channel(write_config):
    write_config("channels.json", {"version": 1, "channels": [
        {"handle": "a", "channel_id": "UCa", "category": "creator", "tracked": True}]})
    with pytest.raises(config.ConfigError, match="exactly one"):
        snapshot.run(today=TODAY, dry_run=True)


def test_dry_run_writes_nothing(ait_root, monkeypatch):
    monkeypatch.setenv("YOUTUBE_API_KEY", "KEY")
    summary = snapshot.run(today=TODAY, dry_run=True)
    assert summary["would_spend_units"] == 1        # 3 ids, one batch of 50
    assert not snapshot.snapshot_path("2026-07-27").exists()
