import datetime as dt
import json

import pytest

from pipeline import comments, config
from pipeline.conftest import FIXTURE_THRESHOLDS as T

C = T["comments"]
VIDEO = {"video_id": "zbmuiaPuiNM", "channel_id": "UCcole",
         "title": "Google Just Dropped a Masterclass",
         "published_at": "2026-06-25T00:00:05Z"}


def thread(cid="Ug1", text="Would love to see this on Windows", likes=412, replies=7,
           published="2026-06-28T10:00:00Z", reply_authors=()):
    return {"id": cid,
            "snippet": {"topLevelComment": {"id": cid, "snippet": {
                "authorDisplayName": "someguy",
                "authorChannelId": {"value": "UCcommenter"},
                "textOriginal": text, "likeCount": likes,
                "publishedAt": published}},
                "totalReplyCount": replies},
            "replies": {"comments": [
                {"snippet": {"authorChannelId": {"value": a}, "textOriginal": "r"}}
                for a in reply_authors]}}


class FakeTransport:
    def __init__(self, threads_by_video):
        self.by_video = threads_by_video
        self.urls = []

    def __call__(self, url):
        self.urls.append(url)
        video_id = url.split("videoId=")[1].split("&")[0]
        return json.dumps({"items": self.by_video.get(video_id, [])}).encode()


def _api(by_video):
    from pipeline import youtube
    return youtube.YouTube("KEY", transport=FakeTransport(by_video))


def test_lag_is_days_after_the_video_not_the_comment_date():
    assert comments.lag_days("2026-06-28T10:00:00Z", "2026-06-25T00:00:05Z") == 3
    assert comments.lag_days("2026-09-29T00:00:00Z", "2026-06-25T00:00:05Z") == 96


def test_lag_is_never_negative():
    """Clock skew, or a comment on a premiere. Zero is honest; a negative lag is not."""
    assert comments.lag_days("2026-06-24T00:00:00Z", "2026-06-25T00:00:05Z") == 0


def test_a_normalized_row_always_carries_its_text_beside_its_null_category(ait_root):
    row = comments.normalize(thread(), VIDEO, self_channel_id="UCself")
    assert row["text"] == "Would love to see this on Windows"
    assert row["category"] is None                 # renders as "unsorted", never hidden
    assert row["like_count"] == 412 and row["reply_count"] == 7
    assert row["lag_days"] == 3
    assert row["video_title"] == "Google Just Dropped a Masterclass"
    assert row["video_url"] == "https://youtu.be/zbmuiaPuiNM"


def test_answered_is_detected_from_the_self_channel_id_in_the_replies():
    assert comments.is_answered(thread(reply_authors=("UCother",)), "UCself") is False
    assert comments.is_answered(thread(reply_authors=("UCother", "UCself")), "UCself") is True


def test_appending_is_idempotent_on_comment_id(ait_root):
    rows = [comments.normalize(thread("Ug1"), VIDEO, "UCself"),
            comments.normalize(thread("Ug2"), VIDEO, "UCself")]
    assert comments.append_new("UCcole", rows) == 2
    assert comments.append_new("UCcole", rows) == 0
    assert len(comments.load("UCcole")) == 2


def test_the_ledger_makes_the_backfill_resumable(ait_root, tmp_path):
    ledger = comments.Ledger(tmp_path / "ledger.json")
    ledger.mark("v1", 213)
    ledger.save()
    reloaded = comments.Ledger(tmp_path / "ledger.json")
    assert reloaded.done("v1") and not reloaded.done("v2")


def test_ingest_skips_videos_the_ledger_already_holds(ait_root, tmp_path):
    api = _api({"v1": [thread("Ug1")], "v2": [thread("Ug2")]})
    ledger = comments.Ledger(tmp_path / "ledger.json")
    ledger.mark("v1", 1)
    videos = [{**VIDEO, "video_id": "v1"}, {**VIDEO, "video_id": "v2"}]
    out = comments.ingest(videos, api, ledger, C, "UCself", quota_cap=100)
    assert out["videos_fetched"] == 1 and out["comments_new"] == 1
    assert "videoId=v1" not in " ".join(api.transport.urls)


def test_ingest_stops_at_the_quota_cap_and_stays_resumable(ait_root, tmp_path):
    api = _api({f"v{i}": [thread(f"Ug{i}")] for i in range(10)})
    ledger = comments.Ledger(tmp_path / "ledger.json")
    videos = [{**VIDEO, "video_id": f"v{i}"} for i in range(10)]
    out = comments.ingest(videos, api, ledger, C, "UCself", quota_cap=4)
    assert out["videos_fetched"] == 4 and out["stopped_on_cap"] is True
    ledger.save()
    resumed = comments.ingest(videos, api, ledger, C, "UCself", quota_cap=100)
    assert resumed["videos_fetched"] == 6


def test_the_classification_floor_is_likes_or_replies(ait_root):
    low = comments.normalize(thread(likes=1, replies=0), VIDEO, "UCself")
    by_likes = comments.normalize(thread(likes=5, replies=0), VIDEO, "UCself")
    by_replies = comments.normalize(thread(likes=0, replies=2), VIDEO, "UCself")
    assert not comments.qualifies_for_classification(low, C)
    assert comments.qualifies_for_classification(by_likes, C)
    assert comments.qualifies_for_classification(by_replies, C)


def test_a_comment_row_never_loses_its_topic_join(ait_root):
    video = {**VIDEO, "topic_ids": ["claude-code-mcp-setup"]}
    row = comments.normalize(thread(), video, "UCself")
    assert row["topic_ids"] == ["claude-code-mcp-setup"]


def test_a_crash_mid_ingest_does_not_lose_already_checkpointed_progress(ait_root, tmp_path):
    """The checkpoint inside ingest() is what makes a kill -9 safe, not the caller's final save().

    Without a per-video checkpoint, the ledger only hits disk once the whole ingest() call
    returns, so a crash on video 3 of 3,600 would silently re-spend quota on videos 1 and 2
    tomorrow. That is exactly the failure mode the resumable ledger exists to prevent.
    """
    class ExplodingTransport(FakeTransport):
        def __call__(self, url):
            if "videoId=v2" in url:
                raise RuntimeError("simulated crash on v2")
            return super().__call__(url)

    api = _api({f"v{i}": [thread(f"Ug{i}")] for i in range(5)})
    api.transport = ExplodingTransport({f"v{i}": [thread(f"Ug{i}")] for i in range(5)})
    ledger_path = tmp_path / "ledger.json"
    ledger = comments.Ledger(ledger_path)
    videos = [{**VIDEO, "video_id": f"v{i}"} for i in range(5)]

    with pytest.raises(RuntimeError, match="simulated crash"):
        comments.ingest(videos, api, ledger, C, "UCself", quota_cap=100)

    # v0 and v1 were fully processed and checkpointed to disk before v2 blew up.
    reloaded = comments.Ledger(ledger_path)
    assert reloaded.done("v0") and reloaded.done("v1")
    assert not reloaded.done("v2")
    assert len(comments.load("UCcole")) == 2      # their comments landed too, not just the mark


def test_a_malformed_thread_is_skipped_recorded_as_an_error_and_left_unmarked(ait_root, tmp_path):
    """One bad payload must not abort the whole day's ingest, and must not be silently marked
    done as if we knew it had zero comments — that would be a false zero, not a missing state.
    """
    api = _api({"v0": [thread("Ug0")], "v1": [{"id": "Ugbad"}], "v2": [thread("Ug2")]})
    ledger = comments.Ledger(tmp_path / "ledger.json")
    videos = [{**VIDEO, "video_id": f"v{i}"} for i in range(3)]
    out = comments.ingest(videos, api, ledger, C, "UCself", quota_cap=100)
    assert out["errors"] == 1
    assert out["comments_new"] == 2                 # v0 and v2's single root comment each
    assert ledger.done("v0") and ledger.done("v2")
    assert not ledger.done("v1")                    # unmarked so a later run retries it


def test_quota_exceeded_mid_queue_stops_cleanly_and_stays_resumable(ait_root, tmp_path):
    """A real QuotaExceeded is a clean stop like the cap, not a crash: the video that hit the
    wall is never marked done, and everything already fetched stays checkpointed."""
    from pipeline import youtube
    api = _api({"v0": [thread("Ug0")], "v1": [thread("Ug1")], "v2": [thread("Ug2")]})
    api.ledger.spend(youtube.DAILY_BUDGET - 1, "videos.list")   # room for exactly one more call
    ledger = comments.Ledger(tmp_path / "ledger.json")
    videos = [{**VIDEO, "video_id": f"v{i}"} for i in range(3)]
    out = comments.ingest(videos, api, ledger, C, "UCself", quota_cap=100)
    assert out["videos_fetched"] == 1
    assert out["stopped_on_quota"] is True
    assert ledger.done("v0")
    assert not ledger.done("v1") and not ledger.done("v2")
