import json

import pytest

from pipeline import config, util


def test_root_comes_from_ait_root_env(ait_root):
    assert config.root() == ait_root
    assert config.config_dir() == ait_root / "config"
    assert config.raw_dir() == ait_root / "_raw"
    assert config.db_dir() == ait_root / "_db"


def test_thresholds_loads_and_caches(ait_root):
    assert config.thresholds()["scoring"]["weights"]["repo_velocity"] == 40
    assert config.thresholds() is config.thresholds()


def test_roster_returns_only_tracked_rows(write_config):
    write_config("channels.json", {"version": 1, "channels": [
        {"handle": "a", "channel_id": "UCa", "category": "own", "tracked": True},
        {"handle": "b", "channel_id": "UCb", "category": "creator", "tracked": False},
    ]})
    assert [c["handle"] for c in config.roster()] == ["a"]


def test_self_channel_is_the_single_own_row(ait_root):
    assert config.self_channel(config.roster())["channel_id"] == "UCself"


def test_zero_own_rows_fails_loudly(write_config):
    write_config("channels.json", {"version": 1, "channels": [
        {"handle": "a", "channel_id": "UCa", "category": "creator", "tracked": True}]})
    with pytest.raises(config.ConfigError, match="exactly one"):
        config.self_channel(config.roster())


def test_two_own_rows_fails_loudly(write_config):
    write_config("channels.json", {"version": 1, "channels": [
        {"handle": "a", "channel_id": "UCa", "category": "own", "tracked": True},
        {"handle": "b", "channel_id": "UCb", "category": "own", "tracked": True}]})
    with pytest.raises(config.ConfigError, match="exactly one"):
        config.self_channel(config.roster())


def test_roster_row_without_channel_id_fails_loudly(write_config):
    write_config("channels.json", {"version": 1, "channels": [
        {"handle": "a", "channel_id": None, "category": "own", "tracked": True}]})
    with pytest.raises(config.ConfigError, match="channel_id"):
        config.roster()


def test_write_json_is_atomic_and_deterministic(tmp_path):
    path = tmp_path / "out" / "x.json"
    util.write_json(path, {"b": 1, "a": 2})
    first = path.read_bytes()
    util.write_json(path, {"a": 2, "b": 1})
    assert path.read_bytes() == first
    assert json.loads(first) == {"a": 2, "b": 1}
    assert first.endswith(b"\n")
    assert not list(path.parent.glob("*.tmp"))
