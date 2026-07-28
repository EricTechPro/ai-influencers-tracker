import datetime as dt

from pipeline import avatars, config

TODAY = dt.date(2026, 7, 27)


def _item(cid, thumbs):
    return {"id": cid, "snippet": {"title": cid, "thumbnails": thumbs}}


class FakeDownload:
    """Records every url it was asked to fetch and replies from a url -> bytes map,
    or raises the given exception when the url is a designated failure."""

    def __init__(self, replies, fail_urls=()):
        self.replies = replies
        self.fail_urls = set(fail_urls)
        self.calls = []

    def __call__(self, url):
        self.calls.append(url)
        if url in self.fail_urls:
            raise avatars.urllib.error.URLError("boom")
        return self.replies[url]


def test_thumbnail_url_prefers_medium_closest_to_240():
    item = _item("UCa", {"default": {"url": "http://x/default.jpg"},
                         "medium": {"url": "http://x/medium.jpg"},
                         "high": {"url": "http://x/high.jpg"}})
    assert avatars.thumbnail_url(item) == "http://x/medium.jpg"


def test_thumbnail_url_falls_back_to_high_then_default():
    assert avatars.thumbnail_url(_item("UCa", {"high": {"url": "http://x/high.jpg"}})) \
        == "http://x/high.jpg"
    assert avatars.thumbnail_url(_item("UCa", {"default": {"url": "http://x/default.jpg"}})) \
        == "http://x/default.jpg"


def test_thumbnail_url_is_none_when_no_thumbnails_at_all():
    assert avatars.thumbnail_url(_item("UCa", {})) is None


def test_sync_downloads_a_new_channel_and_writes_the_file(ait_root):
    roster = [{"channel_id": "UCcole"}]
    fetched = {"UCcole": _item("UCcole", {"medium": {"url": "http://x/cole.jpg"}})}
    download = FakeDownload({"http://x/cole.jpg": b"JPEGDATA"})
    result = avatars.sync(roster, fetched, download=download)
    assert result == {"written": ["UCcole"], "skipped": [], "failed": []}
    assert avatars.avatar_path("UCcole").read_bytes() == b"JPEGDATA"


def test_sync_skips_a_channel_whose_file_already_exists(ait_root):
    roster = [{"channel_id": "UCcole"}]
    path = avatars.avatar_path("UCcole")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"OLD")
    fetched = {"UCcole": _item("UCcole", {"medium": {"url": "http://x/cole.jpg"}})}
    download = FakeDownload({"http://x/cole.jpg": b"NEW"})
    result = avatars.sync(roster, fetched, download=download)
    assert result == {"written": [], "skipped": ["UCcole"], "failed": []}
    assert path.read_bytes() == b"OLD"
    assert download.calls == []


def test_sync_force_redownloads_an_existing_file(ait_root):
    roster = [{"channel_id": "UCcole"}]
    path = avatars.avatar_path("UCcole")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"OLD")
    fetched = {"UCcole": _item("UCcole", {"medium": {"url": "http://x/cole.jpg"}})}
    download = FakeDownload({"http://x/cole.jpg": b"NEW"})
    result = avatars.sync(roster, fetched, force=True, download=download)
    assert result == {"written": ["UCcole"], "skipped": [], "failed": []}
    assert path.read_bytes() == b"NEW"


def test_sync_counts_a_download_failure_and_continues(ait_root):
    roster = [{"channel_id": "UCcole"}, {"channel_id": "UCdan"}]
    fetched = {"UCcole": _item("UCcole", {"medium": {"url": "http://x/cole.jpg"}}),
              "UCdan": _item("UCdan", {"medium": {"url": "http://x/dan.jpg"}})}
    download = FakeDownload({"http://x/dan.jpg": b"DANDATA"}, fail_urls={"http://x/cole.jpg"})
    result = avatars.sync(roster, fetched, download=download)
    assert result == {"written": ["UCdan"], "skipped": [], "failed": ["UCcole"]}
    assert avatars.avatar_path("UCdan").exists()
    assert not avatars.avatar_path("UCcole").exists()


def test_sync_marks_a_channel_absent_from_the_fetch_as_failed(ait_root):
    roster = [{"channel_id": "UCcole"}]
    result = avatars.sync(roster, fetched={}, download=FakeDownload({}))
    assert result == {"written": [], "skipped": [], "failed": ["UCcole"]}


def test_sync_marks_a_channel_with_no_thumbnail_as_failed(ait_root):
    roster = [{"channel_id": "UCcole"}]
    fetched = {"UCcole": _item("UCcole", {})}
    result = avatars.sync(roster, fetched, download=FakeDownload({}))
    assert result == {"written": [], "skipped": [], "failed": ["UCcole"]}


def test_dry_run_computes_units_and_writes_nothing(ait_root, monkeypatch):
    monkeypatch.setenv("YOUTUBE_API_KEY", "KEY")
    summary = avatars.run(today=TODAY, dry_run=True)
    assert summary["would_spend_units"] == 1        # 3 roster channels, one batch of 50
    assert not avatars.assets_dir().exists()


def test_run_fetches_and_syncs_for_real(ait_root, monkeypatch):
    monkeypatch.setenv("YOUTUBE_API_KEY", "KEY")
    roster = config.roster()

    def youtube_transport(url):
        import json
        ids = url.split("id=")[1].split("&")[0].split("%2C")
        items = [_item(cid, {"medium": {"url": f"http://x/{cid}.jpg"}}) for cid in ids]
        return json.dumps({"items": items}).encode()

    monkeypatch.setattr("pipeline.youtube._default_transport", youtube_transport)
    download = FakeDownload({f"http://x/{row['channel_id']}.jpg": b"DATA" for row in roster})
    monkeypatch.setattr(avatars, "_default_download", download)

    summary = avatars.run(today=TODAY)
    assert summary["written"] == len(roster)
    assert summary["failed"] == []
    assert summary["units"] == 1
    for row in roster:
        assert avatars.avatar_path(row["channel_id"]).read_bytes() == b"DATA"
