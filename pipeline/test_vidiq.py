import datetime as dt
import json

import pytest

from pipeline import config, util, vidiq

TODAY = dt.date(2026, 7, 27)


def sse(payload: dict) -> bytes:
    body = {"jsonrpc": "2.0", "id": 1,
            "result": {"content": [{"type": "text", "text": json.dumps(payload)}]}}
    return f"event: message\ndata: {json.dumps(body)}\n\n".encode()


class FakeTransport:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    def __call__(self, url, payload, headers):
        self.calls.append(json.loads(payload))
        return self.replies.pop(0)


def test_the_client_unwraps_an_sse_reply():
    transport = FakeTransport([sse({"subscribers": 219000})])
    client = vidiq.VidIQ("KEY", "http://mcp", transport=transport)
    assert client.call("vidiq_channel_stats", {"channelId": "UCcole"}) == {"subscribers": 219000}
    assert transport.calls[0]["params"]["name"] == "vidiq_channel_stats"


def test_a_tool_error_raises_rather_than_returning_a_shape():
    body = {"jsonrpc": "2.0", "id": 1,
            "result": {"isError": True, "content": [{"type": "text", "text": "out of credits"}]}}
    transport = FakeTransport([f"data: {json.dumps(body)}\n\n".encode()])
    with pytest.raises(vidiq.VidiqError, match="out of credits"):
        vidiq.VidIQ("KEY", "http://mcp", transport=transport).call("vidiq_balance", {})


def test_the_cost_guard_refuses_to_break_the_reserve():
    guard = vidiq.CostGuard(balance=500, reserve=200)
    guard.check(300, "backfill")                       # exactly to the reserve is allowed
    with pytest.raises(vidiq.CostGuardError, match="reserve"):
        guard.check(301, "backfill")


def test_the_cost_guard_refuses_to_break_the_daily_ceiling():
    guard = vidiq.CostGuard(balance=2000, reserve=200, ceiling=400)
    with pytest.raises(vidiq.CostGuardError, match="ceiling"):
        guard.check(405, "keyword sweep")


def test_the_preview_prints_the_bill_before_anything_is_spent():
    guard = vidiq.CostGuard(balance=1141, reserve=200)
    text = guard.preview([("vidiq_channel_stats x72", 360), ("vidiq_keyword_research x25", 125)])
    assert "360" in text and "125" in text and "485" in text and "1141" in text


def test_a_bought_series_is_tagged_and_monotonicity_filtered(ait_root):
    payload = {"history": [
        {"date": "2026-07-25", "subscribers": 218000, "views": 11900000, "videos": 410},
        {"date": "2026-07-26", "subscribers": 219000, "views": 606, "videos": 5},
        {"date": "2026-07-27", "subscribers": 219000, "views": 11991545, "videos": 412}]}
    client = vidiq.VidIQ("KEY", "http://mcp", transport=FakeTransport([sse(payload)]))
    got = vidiq.channel_stats_series(client, "UCcole",
                                     dt.date(2026, 7, 25), dt.date(2026, 7, 27))
    assert [row["status"] for row in got] == ["ok", "corrupt", "ok"]
    assert all(row["source"] == "vidiq_backfill" for row in got)
    assert got[0]["subscriber_bucket"] == 1000


def test_a_snapshotted_point_always_beats_a_bought_one():
    existing = [{"date": "2026-07-27", "status": "ok", "view_count": 11991545,
                 "source": "youtube_api"}]
    bought = [{"date": "2026-07-26", "status": "ok", "view_count": 11900000,
               "source": "vidiq_backfill"},
              {"date": "2026-07-27", "status": "ok", "view_count": 11991000,
               "source": "vidiq_backfill"}]
    merged = vidiq.merge_backfill(existing, bought)
    assert [r["date"] for r in merged] == ["2026-07-26", "2026-07-27"]
    assert merged[1]["source"] == "youtube_api"
    assert merged[1]["view_count"] == 11991545


def test_the_backfill_dry_run_costs_nothing_and_reports_the_bill(ait_root):
    client = vidiq.VidIQ("KEY", "http://mcp", transport=FakeTransport([]))
    plan = vidiq.backfill(config.roster(), client, vidiq.CostGuard(1141, 200), dry_run=True)
    assert plan["channels"] == 3 and plan["credits"] == 15 and plan["spent"] == 0


def test_the_ceiling_fires_mid_backfill_through_the_real_call_path(ait_root):
    """The ceiling must be cumulative across a run, not just checked against one item's cost.

    5 channels at 5 credits each = 25 total. A ceiling of 22 lets the first 4 through (20 spent)
    and must refuse the 5th (20 + 5 = 25 > 22) via backfill()'s own guard.check call, not a
    guard.check the test drives directly. Nothing past the refusal may be spent or written.
    """
    roster = [{"handle": f"ch{i}", "channel_id": f"UCfake{i}"} for i in range(5)]
    payload = {"history": [{"date": "2026-07-27", "subscribers": 1000, "views": 100, "videos": 1}]}
    replies = [sse(payload) for _ in range(4)]      # only the 4 that should succeed
    client = vidiq.VidIQ("KEY", "http://mcp", transport=FakeTransport(replies))
    guard = vidiq.CostGuard(balance=1000, reserve=0, ceiling=22)
    with pytest.raises(vidiq.CostGuardError, match="ceiling"):
        vidiq.backfill(roster, client, guard, dry_run=False)
    written = sorted((config.raw_dir() / "backfill").glob("*.json"))
    assert len(written) == 4
    assert guard.spent == 20


def test_backfill_skips_a_channel_already_bought(ait_root):
    """A channel whose backfill file already exists is resumed past, not re-bought."""
    roster = config.roster()
    already_bought = roster[0]
    path = config.raw_dir() / "backfill" / f"{already_bought['channel_id']}.json"
    util.write_json(path, {"channel_id": already_bought["channel_id"], "series": []})

    payload = {"history": [{"date": "2026-07-27", "subscribers": 1000, "views": 100, "videos": 1}]}
    replies = [sse(payload) for _ in range(len(roster) - 1)]   # one fewer: the first is skipped
    client = vidiq.VidIQ("KEY", "http://mcp", transport=FakeTransport(replies))
    guard = vidiq.CostGuard(balance=1141, reserve=200)

    result = vidiq.backfill(roster, client, guard, dry_run=False)

    assert result["channels"] == len(roster) - 1
    assert result["skipped"] == 1
    assert guard.spent == vidiq.CHANNEL_STATS_COST * (len(roster) - 1)
    assert util.read_json(path)["series"] == []          # untouched, not re-bought


def test_the_keyword_sweep_only_touches_leaves(ait_root):
    from pipeline import topics
    leaves = topics.leaves(topics.load())
    replies = [sse({"keyword": t.label, "estimatedMonthlySearches": 8100}) for t in leaves]
    client = vidiq.VidIQ("KEY", "http://mcp", transport=FakeTransport(replies))
    out = vidiq.keyword_sweep(leaves, client, vidiq.CostGuard(1141, 200), TODAY, dry_run=False)
    assert out["credits"] == 5 * len(leaves)
    written = util.read_json(config.raw_dir() / "keywords" / "2026-07-27.json")
    assert set(written["volumes"]) == {t.id for t in leaves}
    assert written["volumes"]["claude-code-mcp-setup"]["volume"] == 8100


def test_the_keyword_sweep_reads_the_live_nested_seed_keyword_volume(ait_root):
    """The live API nests volume under seedKeyword.estimatedMonthlySearch (singular), not the
    flat estimatedMonthlySearches the earlier fixture assumed. Real shape, verified 2026-07-28:
    {"mode": "research", "seedKeyword": {"keyword": ..., "estimatedMonthlySearch": 3763, ...}}."""
    from pipeline import topics
    leaves = topics.leaves(topics.load())
    replies = [sse({"mode": "research",
                    "seedKeyword": {"keyword": t.label, "volume": 53.37, "competition": 34.1,
                                    "overall": 58.4, "estimatedMonthlySearch": 3763},
                    "relatedKeywords": []}) for t in leaves]
    client = vidiq.VidIQ("KEY", "http://mcp", transport=FakeTransport(replies))
    vidiq.keyword_sweep(leaves, client, vidiq.CostGuard(1141, 200), TODAY, dry_run=False)
    written = util.read_json(config.raw_dir() / "keywords" / "2026-07-27.json")
    assert written["volumes"]["claude-code-mcp-setup"]["volume"] == 3763
    assert written["volumes"]["claude-code-mcp-setup"]["state"] == "ok"


def test_the_keyword_sweep_falls_back_to_the_old_flat_key(ait_root):
    """The old top-level estimatedMonthlySearches key must keep working if it ever comes back."""
    from pipeline import topics
    leaves = topics.leaves(topics.load())
    replies = [sse({"keyword": t.label, "estimatedMonthlySearches": 8100}) for t in leaves]
    client = vidiq.VidIQ("KEY", "http://mcp", transport=FakeTransport(replies))
    vidiq.keyword_sweep(leaves, client, vidiq.CostGuard(1141, 200), TODAY, dry_run=False)
    written = util.read_json(config.raw_dir() / "keywords" / "2026-07-27.json")
    assert written["volumes"]["claude-code-mcp-setup"]["volume"] == 8100
    assert written["volumes"]["claude-code-mcp-setup"]["state"] == "ok"


def test_the_keyword_sweep_treats_a_missing_volume_as_unavailable_not_zero(ait_root):
    from pipeline import topics
    leaves = topics.leaves(topics.load())
    replies = [sse({"mode": "research", "seedKeyword": {"keyword": t.label},
                    "relatedKeywords": []}) for t in leaves]
    client = vidiq.VidIQ("KEY", "http://mcp", transport=FakeTransport(replies))
    vidiq.keyword_sweep(leaves, client, vidiq.CostGuard(1141, 200), TODAY, dry_run=False)
    written = util.read_json(config.raw_dir() / "keywords" / "2026-07-27.json")
    row = written["volumes"]["claude-code-mcp-setup"]
    assert row["volume"] is None and row["state"] == "unavailable"
