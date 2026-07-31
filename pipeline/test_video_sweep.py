import datetime as dt
import json

from pipeline import snapshot, util

TODAY = dt.date(2026, 7, 27)


class FakeVideoTransport:
    def __init__(self, items):
        self.items = items
        self.urls = []

    def __call__(self, url):
        self.urls.append(url)
        wanted = url.split("id=")[1].split("&")[0].split("%2C")
        return json.dumps({"items": [self.items[i] for i in wanted if i in self.items]}).encode()


def _video(vid, views, duration="PT21M56S", published="2026-06-25T00:00:05Z"):
    return {"id": vid,
            "snippet": {"title": f"title {vid}", "publishedAt": published, "tags": ["ai"],
                        "description": "d", "channelId": "UCcole"},
            "contentDetails": {"duration": duration},
            "statistics": {"viewCount": str(views)}}


def _api(items):
    from pipeline import youtube
    return youtube.YouTube("KEY", transport=FakeVideoTransport(items))


def test_duration_classifies_short_and_long():
    assert snapshot.classify_duration("PT21M56S") == (1316, "long")
    assert snapshot.classify_duration("PT58S") == (58, "short")
    assert snapshot.classify_duration("PT3M") == (180, "short")
    assert snapshot.classify_duration("PT3M1S") == (181, "long")
    assert snapshot.classify_duration("PT1H2M3S") == (3723, "long")


def test_duration_of_an_in_progress_live_broadcast_is_zero_not_a_crash():
    """YouTube reports "P0D" (no T component at all) for a live stream still in progress."""
    assert snapshot.classify_duration("P0D") == (0, "short")


def test_the_registry_appends_only_changed_observations(ait_root):
    items = [_video("v1", 100), _video("v2", 200)]
    assert snapshot.record_video_metadata("UCcole", items) == 2
    assert snapshot.record_video_metadata("UCcole", items) == 0     # nothing changed
    renamed = [{**items[0], "snippet": {**items[0]["snippet"], "title": "new title"}}]
    assert snapshot.record_video_metadata("UCcole", renamed) == 1
    assert snapshot.registry("UCcole")["v1"]["title"] == "new title"
    assert len(list(util.read_jsonl(snapshot.registry_path("UCcole")))) == 3


def test_known_video_ids_reads_the_registry(ait_root):
    snapshot.record_video_metadata("UCcole", [_video("v1", 1), _video("v2", 2)])
    assert snapshot.known_video_ids("UCcole") == {"v1", "v2"}


def test_the_daily_sweep_takes_the_newest_n_and_the_tail_on_cadence(ait_root):
    thresholds = {"recent_daily_n": 2, "tail_sweep_days": 7}
    items = [_video(f"v{i}", 10, published=f"2026-07-{10 + i:02d}T00:00:00Z") for i in range(4)]
    snapshot.record_video_metadata("UCcole", items)

    # Day 2026-07-27 is ordinal % 7 == 0 in this fixture only if we assert on both branches,
    # so drive the branch explicitly instead of depending on the calendar.
    recent = snapshot.video_ids_to_sweep("UCcole", TODAY, thresholds, include_tail=False)
    assert recent == ["v3", "v2"]
    everything = snapshot.video_ids_to_sweep("UCcole", TODAY, thresholds, include_tail=True)
    assert set(everything) == {"v0", "v1", "v2", "v3"}


def test_video_rows_carry_status_and_a_deleted_video_is_absent(ait_root):
    api = _api({"v1": _video("v1", 144053)})
    rows = snapshot.video_rows(["v1", "v2"], api, TODAY)
    assert rows["v1"] == {"date": "2026-07-27", "status": "ok",
                          "view_count": 144053, "source": "youtube_api"}
    assert rows["v2"] == {"date": "2026-07-27", "status": "absent",
                          "view_count": None, "source": "youtube_api"}


def test_a_video_sweep_of_3600_ids_costs_72_units(ait_root):
    ids = [f"v{i}" for i in range(3600)]
    api = _api({i: _video(i, 1) for i in ids})
    snapshot.video_rows(ids, api, TODAY)
    assert api.ledger.by_call["videos.list"] == 72


def test_rewriting_the_same_video_snapshot_is_byte_identical(ait_root):
    rows = {"v1": {"date": "2026-07-27", "status": "ok", "view_count": 1,
                   "source": "youtube_api"}}
    first = snapshot.write_video_snapshot(rows, TODAY).read_bytes()
    assert snapshot.write_video_snapshot(rows, TODAY).read_bytes() == first


def test_observation_keeps_the_uploaders_declared_audio_language():
    item = {"id": "v1",
            "snippet": {"title": "t", "publishedAt": "2026-07-01T00:00:00Z",
                        "defaultAudioLanguage": "zh-Hant"},
            "contentDetails": {"duration": "PT10M"},
            "statistics": {"viewCount": "5"}}
    row = snapshot._observation("UC1", item, "2026-07-27T00:00:00Z")
    assert row["default_audio_language"] == "zh-Hant"


def test_observation_records_an_absent_declaration_as_none_not_empty_string():
    item = {"id": "v2",
            "snippet": {"title": "t", "publishedAt": "2026-07-01T00:00:00Z"},
            "contentDetails": {"duration": "PT10M"},
            "statistics": {"viewCount": "5"}}
    row = snapshot._observation("UC1", item, "2026-07-27T00:00:00Z")
    assert row["default_audio_language"] is None
