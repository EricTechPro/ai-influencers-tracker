import types

from pipeline.bundles import videos


def _ctx(rows):
    return types.SimpleNamespace(
        videos=rows,
        baselines={"UC1": {}},
        comment_stats={},
        topic_index=[],
        thresholds={"traction": {}, "language": {"zh_title_min_share": 0.10}},
        today=None,
        generated_at="2026-07-31T00:00:00Z",
    )


def _row(video_id, title, declared=None):
    return {"video_id": video_id, "channel_id": "UC1", "published_at": "2026-07-01T00:00:00Z",
            "title": title, "duration_s": 600, "type": "long", "view_count": 10,
            "series": [], "tags": [], "default_audio_language": declared}


def _stub(monkeypatch):
    monkeypatch.setattr(videos.multiplier, "for_video", lambda v, b: {"value": None})
    monkeypatch.setattr(videos.traction, "for_video", lambda *a: {})
    monkeypatch.setattr(videos.topics, "match_video", lambda v, i: [])


def test_every_row_carries_a_language_and_the_tier_that_read_it(monkeypatch):
    _stub(monkeypatch)
    out = videos.build(_ctx([_row("a", "矽谷大神筆記術"),
                             _row("b", "How I Use Claude Code"),
                             _row("c", "Claude Code Tutorial", "zh-TW"),
                             _row("d", "🔥")]))
    by_id = {r["video_id"]: r for r in out["videos"]}
    assert (by_id["a"]["lang"], by_id["a"]["lang_tier"]) == ("zh", "derived")
    assert (by_id["b"]["lang"], by_id["b"]["lang_tier"]) == ("en", "derived")
    assert (by_id["c"]["lang"], by_id["c"]["lang_tier"]) == ("zh", "oracle")
    assert (by_id["d"]["lang"], by_id["d"]["lang_tier"]) == ("none", "unread")


def test_a_raw_row_predating_the_field_still_gets_a_language(monkeypatch):
    _stub(monkeypatch)
    row = _row("e", "矽谷大神筆記術")
    del row["default_audio_language"]
    out = videos.build(_ctx([row]))
    assert out["videos"][0]["lang"] == "zh"
