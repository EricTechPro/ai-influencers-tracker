"""Root discovery, .env loading, and cached readers for the five hand-edited config files.

Nothing in pipeline/ ever opens a path under config/ for writing. test_anchors.py proves it.
"""
from __future__ import annotations

import functools
import os
import pathlib

from . import util


class ConfigError(RuntimeError):
    pass


def _find_up(start: pathlib.Path, marker: str) -> pathlib.Path:
    start = start.resolve()
    for candidate in (start, *start.parents):
        if (candidate / marker).is_dir():
            return candidate
    raise ConfigError(f"no ancestor of {start} contains a {marker}/ directory")


def root() -> pathlib.Path:
    override = os.environ.get("AIT_ROOT")
    if override:
        return pathlib.Path(override).resolve()
    return _find_up(pathlib.Path(__file__).parent, "config")


def config_dir() -> pathlib.Path:
    return root() / "config"


def raw_dir() -> pathlib.Path:
    return root() / "_raw"


def synth_dir() -> pathlib.Path:
    return root() / "_synthesize"


def db_dir() -> pathlib.Path:
    return root() / "_db"


def load_env(path: pathlib.Path | None = None) -> None:
    """Load KEY=VALUE lines from the repo-root .env with setdefault, so the shell always wins."""
    path = path or (root() / ".env")
    if not path.exists():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def require_env(name: str) -> str:
    load_env()
    value = os.environ.get(name)
    if not value:
        raise ConfigError(f"{name} missing from the environment and from .env")
    return value


@functools.cache
def _load(name: str) -> dict:
    path = config_dir() / name
    data = util.read_json(path)
    if data is None:
        raise ConfigError(f"{path} does not exist. config/ is hand-edited input.")
    return data


def thresholds() -> dict:
    return _load("thresholds.json")


def topics_config() -> dict:
    return _load("topics.json")


def targets() -> dict:
    return _load("targets.json")


def excluded_repo_ids() -> set[int]:
    return {int(i) for i in _load("excluded_repos.json").get("excluded", [])}


def roster() -> list[dict]:
    """Tracked roster rows. Every row must carry a channel_id: the sweep batches on ids."""
    rows = [r for r in _load("channels.json").get("channels", []) if r.get("tracked", True)]
    missing = [r.get("handle") for r in rows if not r.get("channel_id")]
    if missing:
        raise ConfigError(
            f"channel_id missing for {missing}. Run scripts/resolve_channel_ids.py and merge "
            f"the result into config/channels.json by hand."
        )
    return rows


def self_channel(rows: list[dict]) -> dict:
    own = [r for r in rows if r.get("category") == "own"]
    if len(own) != 1:
        raise ConfigError(
            f"config/channels.json must carry exactly one row with category='own', found {len(own)}"
        )
    return own[0]


def reset_caches() -> None:
    _load.cache_clear()
