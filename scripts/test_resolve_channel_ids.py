import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from pipeline import youtube                                    # noqa: E402
from scripts import resolve_channel_ids as r                    # noqa: E402


class FakeTransport:
    def __init__(self, by_handle):
        self.by_handle = by_handle
        self.urls = []

    def __call__(self, url):
        self.urls.append(url)
        handle = url.split("forHandle=")[1].split("&")[0]
        item = self.by_handle.get(handle)
        return json.dumps({"items": [item] if item else []}).encode()


def test_resolves_one_handle_per_call_and_keeps_existing_ids():
    rows = [
        {"handle": "ColeMedin", "channel_id": None, "niche": None},
        {"handle": "erictech", "channel_id": "UCalready", "niche": "claude-code"},
        {"handle": "goneforever", "channel_id": None, "niche": None},
    ]
    transport = FakeTransport({"ColeMedin": {
        "id": "UCcole",
        "snippet": {"title": "Cole Medin", "customUrl": "@colemedin"},
        "statistics": {"subscriberCount": "219000"}}})
    api = youtube.YouTube("KEY", transport=transport)

    resolved, unresolved = r.resolve(rows, api)

    assert len(transport.urls) == 2                    # the already-resolved row is skipped
    assert resolved[0]["channel_id"] == "UCcole"
    assert resolved[0]["subscriber_count"] == 219000
    assert resolved[1]["channel_id"] == "UCalready"
    assert [u["handle"] for u in unresolved] == ["goneforever"]


def test_niche_is_left_null_for_a_human_and_never_guessed():
    rows = [{"handle": "ColeMedin", "channel_id": None, "niche": None}]
    api = youtube.YouTube("KEY", transport=FakeTransport({"ColeMedin": {
        "id": "UCcole", "snippet": {"title": "Cole Medin"}, "statistics": {}}}))
    resolved, _ = r.resolve(rows, api)
    assert resolved[0]["niche"] is None


# --- Handoff override (docs/plans/2026-07-28-handoff.md §2, ticked default): the script
# writes channel_id directly into config/channels.json, behind a timestamped backup.
# It touches channel_id and nothing else; niche is never invented. These tests cover
# that write path, which sits alongside (and never replaces) resolve()'s own tests above.

def test_merge_channel_ids_touches_only_channel_id_field():
    raw = {"version": 1, "channels": [
        {"handle": "ColeMedin", "channel_id": None, "niche": None, "notes": "x"},
        {"handle": "already", "channel_id": "UCkeep", "niche": "n8n", "notes": "y"},
    ]}
    resolved = [
        {"handle": "ColeMedin", "channel_id": "UCcole", "niche": None,
         "resolved_name": "Cole Medin", "subscriber_count": 219000},
        {"handle": "already", "channel_id": "UCkeep", "niche": "n8n"},
    ]

    merged = r.merge_channel_ids(raw, resolved)

    assert merged["channels"][0]["channel_id"] == "UCcole"
    assert merged["channels"][0]["niche"] is None            # never invented
    assert merged["channels"][0]["notes"] == "x"             # untouched
    assert "resolved_name" not in merged["channels"][0]      # review-only field, not merged
    assert "subscriber_count" not in merged["channels"][0]
    assert merged["channels"][1]["channel_id"] == "UCkeep"   # already-set row untouched
    assert raw["channels"][0]["channel_id"] is None          # input dict not mutated


def test_backup_channels_copies_before_any_mutation(tmp_path):
    channels_path = tmp_path / "channels.json"
    channels_path.write_text(json.dumps({"version": 1, "channels": [
        {"handle": "a", "channel_id": None}]}))
    raw_dir = tmp_path / "_raw"

    backup_path = r.backup_channels(channels_path, raw_dir, "20260728-120000")

    assert backup_path == raw_dir / "channels_backup_20260728-120000.json"
    assert json.loads(backup_path.read_text()) == json.loads(channels_path.read_text())


def test_apply_resolution_writes_channel_id_directly_and_backs_up_first(tmp_path):
    channels_path = tmp_path / "channels.json"
    channels_path.write_text(json.dumps({"version": 1, "channels": [
        {"handle": "ColeMedin", "channel_id": None, "niche": None, "notes": "x"},
    ]}))
    raw_dir = tmp_path / "_raw"
    transport = FakeTransport({"ColeMedin": {
        "id": "UCcole", "snippet": {"title": "Cole Medin"},
        "statistics": {"subscriberCount": "219000"}}})
    api = youtube.YouTube("KEY", transport=transport)

    summary = r.apply_resolution(channels_path, raw_dir, api, "20260728-120000")

    on_disk = json.loads(channels_path.read_text())
    assert on_disk["channels"][0]["channel_id"] == "UCcole"
    assert on_disk["channels"][0]["niche"] is None                 # still Eric's to fill
    assert on_disk["channels"][0]["notes"] == "x"                  # untouched

    backup = json.loads(pathlib.Path(summary["backup_path"]).read_text())
    assert backup["channels"][0]["channel_id"] is None             # backup predates the merge
    assert summary["resolved"][0]["channel_id"] == "UCcole"
    assert summary["unresolved"] == []
