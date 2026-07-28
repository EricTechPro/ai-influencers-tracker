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
    roster = config.roster()
    rows = snapshot.channel_rows(roster, snapshot.fetch_channels(roster, api), TODAY)
    assert set(rows) == {"UCself", "UCcole", "UCdan"}
    assert rows["UCcole"] == {"date": "2026-07-27", "status": "ok", "view_count": 11991545,
                              "subscriber_count": 219000, "subscriber_bucket": 1000,
                              "video_count": 412, "source": "youtube_api"}


def test_a_channel_missing_from_the_response_is_absent_never_zero(ait_root):
    api = _api({"UCself": _item("UCself", 68700, 4102880, 210),
                "UCcole": _item("UCcole", 219000, 11991545, 412)})
    roster = config.roster()
    rows = snapshot.channel_rows(roster, snapshot.fetch_channels(roster, api), TODAY)
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


def test_a_github_search_failure_mid_run_does_not_kill_the_whole_day(ait_root, monkeypatch):
    """A plain GitHubError (not a rate limit, which sweep() already survives) must not abort
    the run after the expensive channel/video/comment phases already ran. The repo snapshot
    still gets written, flagged partial with a reason, and the run summary still comes back.
    """
    monkeypatch.setenv("YOUTUBE_API_KEY", "KEY")
    monkeypatch.setenv("GITHUB_TOKEN", "")
    monkeypatch.setenv("FIRECRAWL_API_KEY", "")

    def youtube_transport(url):
        if "/channels?" in url:
            ids = url.split("id=")[1].split("&")[0].split("%2C")
            items = [_item(cid, 1000, 1000, 10) for cid in ids]
            return json.dumps({"items": items}).encode()
        return json.dumps({"items": []}).encode()          # playlistItems: no new uploads

    monkeypatch.setattr("pipeline.youtube._default_transport", youtube_transport)

    from pipeline import github as github_module

    def failing_github_transport(url, headers):
        raise github_module.GitHubError("HTTP 500")

    monkeypatch.setattr("pipeline.github._default_transport", failing_github_transport)
    monkeypatch.setattr("pipeline.firecrawl.scrape_markdown", lambda url, key: "no repos here")

    summary = snapshot.run(today=TODAY)

    assert summary["partial_run"] is True
    repo_path = snapshot.config.raw_dir() / "repos" / "2026-07-27.json"
    written = json.loads(repo_path.read_text())
    assert written["search"] == []
    assert written["partial_run"] is True
    assert "GitHubError" in written["search_reason"]
    assert written["trending"] == []                      # untouched by the search failure


def test_the_metadata_call_keeps_the_view_count_it_already_paid_for(ait_root):
    """videos.list returns statistics.viewCount in the same response as the title, and it was
    being thrown away. view_count then came only from the traction snapshot series, which has
    reached 3,220 of 11,657 videos, so 8,437 cards rendered "views --" for a number YouTube had
    already handed us. A registry count is exact at seen_at; the series is still preferred when
    one exists, because it is dated."""
    snapshot.record_video_metadata("UCcole", [{
        "id": "v1",
        "snippet": {"title": "t", "description": "", "tags": [], "channelId": "UCcole",
                    "publishedAt": "2026-07-20T00:00:00Z"},
        "contentDetails": {"duration": "PT10M"},
        "statistics": {"viewCount": "43056"},
    }])
    rows = snapshot.registry("UCcole")
    assert rows["v1"]["view_count"] == 43056


def test_a_video_with_no_statistics_block_keeps_a_null_not_a_zero(ait_root):
    snapshot.record_video_metadata("UCcole", [{
        "id": "v2",
        "snippet": {"title": "t", "description": "", "tags": [], "channelId": "UCcole",
                    "publishedAt": "2026-07-20T00:00:00Z"},
        "contentDetails": {"duration": "PT10M"},
    }])
    assert snapshot.registry("UCcole")["v2"]["view_count"] is None


def test_a_video_with_no_duration_does_not_kill_the_sweep(ait_root):
    """A live broadcast or a video whose contentDetails came back without a duration used to
    raise straight out of the daily run, so one bad row cost the whole sweep — including the
    unattended 09:00 launchd one, which has no operator to rerun it. An unparseable duration is
    missing data: the length is None and the format is unknown, which is a state the surfaces
    already render."""
    written = snapshot.record_video_metadata("UCcole", [{
        "id": "live1",
        "snippet": {"title": "live", "description": "", "tags": [], "channelId": "UCcole",
                    "publishedAt": "2026-07-20T00:00:00Z"},
        "contentDetails": {"duration": ""},
        "statistics": {"viewCount": "5"},
    }])
    row = snapshot.registry("UCcole")["live1"]
    assert written == 1
    assert row["duration_s"] is None
    assert row["type"] is None
    assert row["view_count"] == 5
