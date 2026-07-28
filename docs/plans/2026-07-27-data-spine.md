# AI Influencers Tracker: Data Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build build steps 0 to 8 of `docs/spec.md` §10: every hand-edited config, the free daily sweep, the growth math with its measurement floor, multipliers, traction, comment ingest, the GitHub opportunity engine, and the nine `_db/` bundles that the dashboard will read.

**Architecture:** One Python package, `pipeline/`, standard library only. Two entry points: `python3 -m pipeline.snapshot` (the daily free sweep, writes append-only into `_raw/`) and `python3 -m pipeline.build_data` (pure arithmetic over `_raw/` plus `_synthesize/`, writes `_db/`). Config is read-only input, never written. Every number that can be wrong is test-first.

**Tech Stack:** Python 3.11+, stdlib only (`urllib`, `json`, `datetime`, `statistics`, `decimal`). pytest for tests. No third-party runtime dependency in `pipeline/`.

**Scope boundary:** This plan stops at the bundles. It does not build `web/`. Follow-on plans are listed at the bottom.

## Global Constraints

Every task's requirements implicitly include this section.

- **Python 3.11+**, and `pipeline/` imports **stdlib only**. No `requests`, no `httpx`, no `pydantic`. `web/` may use normal npm dependencies; nothing in this plan touches `web/`.
- **Import direction:** a skill imports `pipeline/`; `pipeline/` imports stdlib. A skill never imports another skill. `pipeline/` never imports a skill or anything under `web/`. Enforced by `test_anchors.py`.
- **`config/` is hand-edited input. The pipeline never opens anything under `config/` for writing.** Enforced by a hash check in `test_anchors.py`.
- **Data flows one direction:** `config/` → `_raw/` → `_synthesize/` → `_db/`. `_raw/` is append-only. `build_data.py` writes only into `_db/` and is idempotent: two runs over the same inputs produce byte-identical output.
- **Missing is a state, never a zero.** No function in this plan may return `0`, `null`, or a blank where the honest answer is `absent`, `corrupt`, `bounded`, `building`, `no_baseline`, or `insufficient_data`.
- **No wall-clock estimates, no imputed inputs.** A missing score component drops its weight out of the denominator; it is never filled with a default.
- **No OAuth anywhere.** No `comments.insert`, no `captions.download`, no `search.list` (100 units, banned). Enforced by `test_anchors.py`.
- **Every band carries `fired`**, the list of threshold comparisons that produced it.
- **Terminology is load-bearing.** Read `docs/CONTEXT.md` before naming anything. `staleness` never `recency`. `bounded` never `unknown`. `trunk`/`fork` for tutorials, `covered`/`split` for reviews. `Leaf`, `Parent`, `Shape`, `Hunch`, `Measurement floor`, `Bucket width` all have exact meanings there.
- **A number lives in `config/thresholds.json` only if changing it changes what the dashboard tells you to do.** Everything else is a module constant.
- **Every date-dependent function takes an explicit `today: datetime.date` argument.** No function reads the wall clock except the CLI entry points. This is what makes the tests deterministic.
- **The worked example must reproduce `71.9`** exactly (spec §5). It is asserted in `pipeline/test_score.py` and again end-to-end in `pipeline/test_build_data.py`.
- **Commits are conventional:** `feat` `fix` `docs` `refactor` `data` `chore` `test`. Commit at the end of every task, and at intermediate points where a step says so.
- **Shell:** `git` commands are prefixed with `rtk` (EricOS convention, and a pass-through for anything it has no filter for). `pytest` and `python3` are invoked bare, matching the commands documented in this project's `CLAUDE.md`.
- **Prose written into this repo avoids em dashes.** Use a period, comma, colon, or parentheses.

---

## Spec conflicts resolved before writing code

Three places where the documents disagree with each other. Each is resolved here, with reasoning, and each carries a step that writes the resolution back into `docs/`.

### C1. `INSUFFICIENT_DATA` cannot be driven by `videos < 3`

`docs/spec.md` §5 says: *"either axis unknown, or videos < 3 → INSUFFICIENT_DATA"*. The same section's canonical worked example gives `mcp-registry-integration` a supply of **2 videos / 90d**, a verdict of `MAKE_THIS_NOW`, and a score of **71.9**. Those cannot both be true: `INSUFFICIENT_DATA` forces `score.value: null` (system.md §4), and `71.9` is declared mandatory in two places (*"every bundle and every UI surface must reproduce 71.9"*). `docs/wireframes.md` §4 also shows `claude-code-plugins` as `INSUFFICIENT` with **3** videos and 3 creators, and `claude-code-hooks-config` as `TOO_EARLY` with **0** videos, neither of which a video-count rule explains.

**Resolution.** The verdict grid's `INSUFFICIENT_DATA` fires **iff an axis is unknown**, which in practice means the demand axis: no vidIQ keyword volume **and** no linked repo velocity. The `videos < 3` rule is the **topic page's** consensus gate (`min_n.topic_page_min_videos`), and it drives `topic_pages.json.state`, which is where *"1 video, need 3"* renders. Two different surfaces, two different states, one word that was doing both jobs.

Task 15 implements this. Task 19 writes it into `docs/decisions.md` as decision 0009 and corrects the sentence in spec §5.

### C2. A window of `N` days is `N` points, so it measures `N-1` days of growth

`docs/spec.md` §6 states the rule as pseudocode: `required = the last window_days calendar dates`, `if len(present) < window_days → building`, `value = newest - oldest`. Under that rule a 7d window needs 7 points and reports the gain between day-6 and day-0, which is six days of growth. The spec's own example message (*"a missed Tuesday makes 7d read 'building, 6 of 7'"*) confirms 7 required points, not 8.

**Resolution.** Implement the rule verbatim: `window_days` required points, `newest - oldest`. It understates growth by one day, and understating is the safe direction under §2. The one exception is the `24h` window, where `window_days = 1` would compare a point to itself and return a fabricated zero. `24h` is therefore implemented as `delta(window_days=2)` and labelled `24h`. Task 7 has a named test for both.

### C3. The `indie` score of `0.66` in system.md §4 is illustrative

`system.md` §4 shows `{"score": 0.66, "owner_type": "Organization", "contributors": 9}`. No formula in the docs produces that from `config/thresholds.json`'s three indie knobs. Unlike `71.9`, that number is not declared canonical anywhere.

**Resolution.** Task 13 defines the formula from the three thresholds that exist, which yields `0.58` for that input. Task 19 updates the example in `system.md` §4 to match. If Eric wants a different curve, it is three numbers in `config/thresholds.json` and no code change.

---

## File Structure

Everything created by this plan. `pipeline/` is flat except for `bundles/`, which is split one module per bundle because `system.md` §11 flags all three ingestion lanes as feeding the bundle writers and asks that each writer stay in its own module.

| File | Responsibility |
|---|---|
| `pyproject.toml` | pytest and ruff configuration. No build system, no dependencies. |
| `test_anchors.py` | Repo-root invariants: import direction, config is never written, no OAuth, thresholds version parity. |
| `pipeline/__init__.py` | Empty. Marks the package. |
| `pipeline/config.py` | Root discovery, `.env` loading, layer path helpers, cached loaders for the five config files, the self-channel guard. |
| `pipeline/util.py` | Dates, ISO formatting, atomic JSON write, JSONL append and read, `sha256` of a tree. |
| `pipeline/topics.py` | Topic tree walking, derived leaves, shape validation, demotion detection, the keyword matcher, `coverage_rate`. |
| `pipeline/youtube.py` | YouTube Data API client with batching and a quota ledger. |
| `pipeline/vidiq.py` | vidIQ MCP client, balance, cost guard, `channel_stats` backfill, keyword sweep. |
| `pipeline/github.py` | GitHub REST client, velocity, indie score, caps, backoff, `partial_run`. |
| `pipeline/firecrawl.py` | One REST call to scrape `github.com/trending`, plus the markdown parser. Failure here is non-critical. |
| `pipeline/growth.py` | `bucket_width`, `delta()`, the measurement floor, `bounded`, monotonicity, the four rank modes, the three-way sort. |
| `pipeline/multiplier.py` | Split short and long baselines, `no_baseline`. |
| `pipeline/traction.py` | Per-video `views_gained`, `share_recent_7d`, `still_growing`. |
| `pipeline/comments.py` | Comment ingest with a resumable ledger, `lag_days`, `answered`, the three indexes. |
| `pipeline/verdict.py` | Supply band, demand band, the verdict grid, `fired`. |
| `pipeline/score.py` | The four normalizers, weights, `out_of`, the 71.9 reproduction. |
| `pipeline/snapshot.py` | Entry point 1. The daily free sweep and gap detection. |
| `pipeline/build_data.py` | Entry point 2. Orchestrates the bundle writers. |
| `pipeline/bundles/*.py` | One writer per bundle: `snapshots`, `video_snapshots`, `videos`, `channels`, `comments`, `opportunities`, `topic_pages`, `meta`. |
| `pipeline/test_*.py` | One test module per source module, beside the code. |
| `pipeline/conftest.py` | Fixtures: a temp `AIT_ROOT` with a fixture config set, a fake HTTP transport. |
| `scripts/resolve_channel_ids.py` | One-time roster resolution. Reads `config/channels.json`, writes a candidate file for a human to merge. |
| `.agents/skills/ait-*/SKILL.md` | Four thin wrappers over `pipeline/`. |
| `~/Library/LaunchAgents/ca.erictech.ait-snapshot.plist` | The 09:00 daily agent. |

New `_raw/` subdirectories this plan introduces, beyond the five already in `_raw/README.md`:

| Path | Why |
|---|---|
| `_raw/videos/<channel_id>.jsonl` | Append-only video metadata observations (title, duration, type, published_at). `_raw/video_snapshots/` holds only the daily counts; the metadata needs a home and duplicating a title 365 times is not it. |
| `_raw/keywords/YYYY-MM-DD.json` | The weekly vidIQ keyword sweep. Paid, so it is durable. |
| `_raw/quota/YYYY-MM-DD.json` | The YouTube quota ledger for the day. |
| `_raw/comments/_ledger.json` | The resumable comment-backfill ledger. |
| `_db/assets/channels/<channel_id>.jpg` | Downloaded avatars. In `_db/` because they are regenerable and safe to delete. |

---

### Task 1: Package skeleton, config loader, and the anchor tests

**Files:**
- Create: `pyproject.toml`
- Create: `pipeline/__init__.py`
- Create: `pipeline/config.py`
- Create: `pipeline/util.py`
- Create: `pipeline/conftest.py`
- Create: `pipeline/test_config.py`
- Create: `test_anchors.py`
- Modify: `.env.example` (create if absent)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `config.root() -> pathlib.Path`, `config.config_dir() / raw_dir() / synth_dir() / db_dir() -> pathlib.Path`
  - `config.load_env(path: pathlib.Path | None = None) -> None`
  - `config.thresholds() -> dict`, `config.topics_config() -> dict`, `config.roster() -> list[dict]`, `config.targets() -> dict`, `config.excluded_repo_ids() -> set[int]`
  - `config.self_channel(roster: list[dict]) -> dict` (raises `ConfigError` on zero or two)
  - `config.ConfigError(RuntimeError)`
  - `util.today() -> datetime.date`, `util.date_str(d) -> str`, `util.parse_ts(value) -> datetime.datetime`, `util.iso_z(t) -> str`, `util.days_between(a, b) -> int`
  - `util.read_json(path, default=None) -> Any`, `util.write_json(path, obj) -> None` (atomic, sorted keys, trailing newline), `util.append_jsonl(path, obj) -> None`, `util.read_jsonl(path) -> Iterator[dict]`
  - `util.tree_hashes(path) -> dict[str, str]`

The root is discovered by walking up from `pipeline/config.py` to the nearest ancestor containing a `config/` directory, and is overridden by the `AIT_ROOT` environment variable so every test can run against a temp tree.

- [ ] **Step 1: Write the failing tests for root discovery, layer paths, and the self-channel guard**

Create `pipeline/conftest.py`:

```python
"""Shared fixtures. Every test runs against a temp AIT_ROOT, never the real repo."""
from __future__ import annotations

import json
import pathlib

import pytest

FIXTURE_THRESHOLDS = {
    "version": 3,
    "supply": {"window_days": 90, "open_max_videos": 2,
               "crowded_min_videos": 5, "crowded_min_creators": 3},
    "demand": {"high_min_keyword_volume": 5000, "high_min_repo_velocity": 100.0,
               "high_requires": "either"},
    "min_n": {"topic_page_min_videos": 3, "topic_page_min_creators": 2,
              "consensus_min_creators": 3},
    "github": {"created_within_days": 90, "min_stars": 100, "max_queries_per_run": 25,
               "max_pages_per_query": 3, "age_days_floor": 1,
               "trending_windows": ["daily", "weekly"],
               "indie": {"user_owner_bonus": 0.5, "max_contributors_for_full_score": 5,
                         "corp_org_penalty": 0.4}},
    "growth": {"windows_hours": [24], "windows_days": [7, 14, 30, 90, 180, 365],
               "subscriber_floor_buckets": 5, "default_rank_mode": "growth",
               "default_window_days": 90,
               "rank_weights": {"subscriber_growth": 50, "subscriber_count": 20,
                                "views_gained": 30}},
    "traction": {"still_growing_min_views_7d": 500, "still_growing_min_share_7d": 0.02,
                 "recent_daily_n": 50, "tail_sweep_days": 7},
    "multiplier": {"baseline_n": 20, "baseline_min_videos": 5, "maturity_days": 14},
    "comments": {"roots_per_video": 100, "replies_per_root": 5, "top_n_per_channel": 50,
                 "page_size": 5, "classify_min_likes": 5, "classify_min_replies": 2,
                 "classify_max_per_run": 2000},
    "scoring": {"weights": {"repo_velocity": 40, "keyword_volume": 25,
                            "supply_gap": 25, "staleness": 10},
                "full_scale": {"repo_velocity_stars_per_day": 300,
                               "keyword_volume_searches": 15000,
                               "supply_gap_max_videos": 12, "staleness_days": 30}},
    "own_content": {"suppress_covered_topics": True, "covered_lookback_days": 365},
    "tier3_qualification": {"min_multiplier": 2.0},
}

FIXTURE_TOPICS = {
    "version": 1,
    "topics": [
        {"id": "claude-code", "label": "Claude Code", "children": [
            {"id": "claude-code-mcp-setup", "label": "Wiring MCP servers into Claude Code",
             "shape": "tutorial",
             "aliases": ["mcp", "model context protocol", ".mcp.json", "claude mcp add"]},
            {"id": "claude-code-subagents", "label": "Subagents and agent teams",
             "shape": "tutorial", "aliases": ["subagent", "agent team"]},
        ]},
        {"id": "models", "label": "Models", "children": [
            {"id": "frontier-model-launches", "label": "Frontier model launches",
             "shape": "review", "aliases": ["just dropped", "first look"]},
        ]},
        {"id": "mcp-registry-integration", "label": "MCP registry integration",
         "shape": "tutorial", "aliases": ["mcp registry"]},
    ],
}

FIXTURE_ROSTER = [
    {"handle": "erictech", "name": "Eric Tech", "channel_id": "UCself",
     "niche": "claude-code", "lang": "en", "category": "own", "tracked": True},
    {"handle": "ColeMedin", "name": "Cole Medin", "channel_id": "UCcole",
     "niche": "ai-agents", "lang": "en", "category": "creator", "tracked": True},
    {"handle": "DanMartell", "name": "Dan Martell", "channel_id": "UCdan",
     "niche": "business", "lang": "en", "category": "creator", "tracked": True},
]


@pytest.fixture
def ait_root(tmp_path, monkeypatch):
    """A temp project root with a complete config/ set and empty data layers."""
    root = tmp_path / "ait"
    (root / "config").mkdir(parents=True)
    for layer in ("_raw", "_synthesize", "_db"):
        (root / layer).mkdir()
    cfg = root / "config"
    (cfg / "thresholds.json").write_text(json.dumps(FIXTURE_THRESHOLDS))
    (cfg / "topics.json").write_text(json.dumps(FIXTURE_TOPICS))
    (cfg / "channels.json").write_text(json.dumps({"version": 1, "channels": FIXTURE_ROSTER}))
    (cfg / "targets.json").write_text(json.dumps(
        {"version": 1, "target": {"mode": "growth", "window_days": 90, "rank": 6},
         "hunches": []}))
    (cfg / "excluded_repos.json").write_text(json.dumps({"version": 1, "excluded": []}))
    monkeypatch.setenv("AIT_ROOT", str(root))
    from pipeline import config
    config.reset_caches()
    yield root
    config.reset_caches()


@pytest.fixture
def write_config(ait_root):
    """Overwrite one config file and drop the loader caches."""
    def _write(name: str, obj) -> pathlib.Path:
        from pipeline import config
        path = ait_root / "config" / name
        path.write_text(json.dumps(obj))
        config.reset_caches()
        return path
    return _write
```

Create `pipeline/test_config.py`:

```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest pipeline/test_config.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'pipeline'`.

- [ ] **Step 3: Create the package skeleton and `pyproject.toml`**

```bash
mkdir -p pipeline
touch pipeline/__init__.py
```

`pyproject.toml`:

```toml
# No build system and no dependencies on purpose: pipeline/ is stdlib only.
# This file exists to configure pytest and ruff.

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["pipeline", "."]
python_files = ["test_*.py"]

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM"]
```

- [ ] **Step 4: Write `pipeline/util.py`**

```python
"""Dates, deterministic JSON IO, and file hashing. Standard library only."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import pathlib
from typing import Any, Iterator

UTC = dt.timezone.utc


def today() -> dt.date:
    """Today in UTC. The only wall-clock read in pipeline/; everything else takes it as an arg."""
    return dt.datetime.now(tz=UTC).date()


def date_str(d: dt.date) -> str:
    return d.strftime("%Y-%m-%d")


def parse_date(text: str) -> dt.date:
    return dt.date.fromisoformat(text)


def parse_ts(value: Any) -> dt.datetime:
    """Parse an epoch number, digit-string, or ISO-8601 string into an aware UTC datetime."""
    if isinstance(value, dt.datetime):
        return value.astimezone(UTC)
    if isinstance(value, (int, float)):
        return dt.datetime.fromtimestamp(float(value), tz=UTC)
    if isinstance(value, str):
        text = value.strip()
        if text.isdigit():
            return dt.datetime.fromtimestamp(float(text), tz=UTC)
        parsed = dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)
    raise ValueError(f"unparseable timestamp: {value!r}")


def iso_z(t: dt.datetime) -> str:
    return t.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def days_between(earlier: dt.datetime | dt.date, later: dt.datetime | dt.date) -> int:
    """Whole days from earlier to later. Negative when later precedes earlier."""
    a = earlier.date() if isinstance(earlier, dt.datetime) else earlier
    b = later.date() if isinstance(later, dt.datetime) else later
    return (b - a).days


def last_n_dates(end: dt.date, n: int) -> list[str]:
    """The n calendar dates ending at `end`, oldest first."""
    return [date_str(end - dt.timedelta(days=i)) for i in range(n - 1, -1, -1)]


def read_json(path: pathlib.Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text())


def write_json(path: pathlib.Path, obj: Any) -> None:
    """Atomic, key-sorted, newline-terminated. Sorting is what makes rebuilds byte-identical."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, indent=2, sort_keys=True, ensure_ascii=False) + "\n")
    os.replace(tmp, path)


def append_jsonl(path: pathlib.Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(obj, sort_keys=True, ensure_ascii=False) + "\n")


def read_jsonl(path: pathlib.Path) -> Iterator[dict]:
    if not path.exists():
        return
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                yield json.loads(line)


def tree_hashes(path: pathlib.Path) -> dict[str, str]:
    """sha256 per file under `path`, keyed by relative posix path. Used by test_anchors."""
    out: dict[str, str] = {}
    for child in sorted(path.rglob("*")):
        if child.is_file():
            out[child.relative_to(path).as_posix()] = hashlib.sha256(child.read_bytes()).hexdigest()
    return out
```

- [ ] **Step 5: Write `pipeline/config.py`**

```python
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
```

- [ ] **Step 6: Run the config tests**

Run: `pytest pipeline/test_config.py -v`
Expected: PASS, 8 tests.

- [ ] **Step 7: Write the anchor tests**

`test_anchors.py` at the repo root, because it walks the whole repo and not just `pipeline/`.

```python
"""Repo-wide invariants. These fail the build rather than allowing a rule to rot quietly."""
from __future__ import annotations

import ast
import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).parent
PIPELINE = ROOT / "pipeline"
SKILLS = ROOT / ".agents" / "skills"

FORBIDDEN_SUBSTRINGS = [
    "oauth", "refresh_token", "client_secret", "comments.insert",
    "captions/download", "search.list",
]


def _python_files(base: pathlib.Path) -> list[pathlib.Path]:
    return [] if not base.exists() else sorted(base.rglob("*.py"))


def _imported_roots(path: pathlib.Path) -> set[str]:
    tree = ast.parse(path.read_text())
    roots: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            roots.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level:                       # relative import, stays inside the package
                continue
            if node.module:
                roots.add(node.module.split(".")[0])
    return roots


@pytest.mark.parametrize("path", _python_files(PIPELINE), ids=lambda p: p.name)
def test_pipeline_imports_stdlib_only(path):
    allowed = set(sys.stdlib_module_names) | {"pipeline"}
    offenders = _imported_roots(path) - allowed
    assert not offenders, f"{path.name} imports non-stdlib {sorted(offenders)}"


@pytest.mark.parametrize("path", _python_files(PIPELINE), ids=lambda p: p.name)
def test_pipeline_never_imports_a_skill_or_the_web(path):
    text = path.read_text()
    assert "skills." not in text and "from web" not in text, f"{path.name} reaches forward"


def test_a_skill_never_imports_another_skill():
    for path in _python_files(SKILLS):
        skill_name = path.relative_to(SKILLS).parts[0]
        for other in {p.name for p in SKILLS.iterdir() if p.is_dir()} - {skill_name}:
            assert other.replace("-", "_") not in _imported_roots(path), (
                f"{path} imports another skill ({other})"
            )


@pytest.mark.parametrize("path", _python_files(PIPELINE) + _python_files(SKILLS),
                         ids=lambda p: p.name)
def test_no_oauth_or_banned_call_anywhere(path):
    text = path.read_text().lower()
    for needle in FORBIDDEN_SUBSTRINGS:
        assert needle not in text, f"{path.name} references {needle!r}, which is cut by design"


def test_thresholds_version_matches_meta_when_meta_exists():
    from pipeline import config, util
    meta = util.read_json(config.db_dir() / "meta.json")
    if meta is None:
        pytest.skip("_db/meta.json not built yet")
    assert meta["thresholds_version"] == config.thresholds()["version"]
```

- [ ] **Step 8: Run the anchor tests**

Run: `pytest test_anchors.py -v`
Expected: PASS. `test_thresholds_version_matches_meta_when_meta_exists` skips. The config-is-never-written anchor arrives in Task 17, once `build_data` exists to run against.

- [ ] **Step 9: Add `GITHUB_TOKEN` to the env template**

Create `.env.example` (the real `.env` is gitignored and is Eric's to edit):

```
# Free, 10,000 units/day. https://console.cloud.google.com/apis/credentials
YOUTUBE_API_KEY=
# Metered. 2,000 renewable credits/month.
VIDIQ_API_KEY=
MCP_VIDIQ_URL=https://mcp.vidiq.com/mcp
# GitHub Trending has no API, so the trending sweep scrapes it.
FIRECRAWL_API_KEY=
# Without this the GitHub sweep drops to the 60 req/hr anonymous limit.
# A classic token with no scopes is enough: every call this project makes is public read.
GITHUB_TOKEN=
```

- [ ] **Step 10: Commit**

```bash
rtk git add pyproject.toml pipeline/ test_anchors.py .env.example
rtk git commit -m "feat(pipeline): package skeleton, config loader, and repo anchor tests"
```

---

### Task 2: The topic tree, derived leaves, shape, and the keyword matcher

**Files:**
- Create: `pipeline/topics.py`
- Create: `pipeline/test_topics.py`

**Interfaces:**
- Consumes: `config.topics_config()`, `config.thresholds()`.
- Produces:
  - `topics.Topic` dataclass: `id, label, shape, aliases, parent_id, children_ids, depth`
  - `topics.load(tree: dict | None = None) -> dict[str, Topic]` (id keyed, whole tree, any depth)
  - `topics.is_leaf(t) -> bool` and `topics.leaves(index) -> list[Topic]` (leaf iff no children; never authored)
  - `topics.validate(index) -> list[str]` (returns warnings, raises `TopicError` on hard failures)
  - `topics.detect_demotions(index, previous_assignments) -> list[dict]`
  - `topics.match_video(video: dict, index) -> list[dict]` (n:m assignments, exactly one `primary`)
  - `topics.coverage_rate(videos, assignments) -> float`
  - `topics.rollup(index, per_leaf_counts) -> dict[str, dict]` (parent navigation counts only)
  - `topics.TopicError(RuntimeError)`

An assignment is `{"topic_id", "primary", "confidence", "method": "keyword", "matched_on": [...], "matched_alias": str}`, exactly the shape `system.md` §4 puts in `videos.json`.

- [ ] **Step 1: Write the failing tests**

`pipeline/test_topics.py`:

```python
import pytest

from pipeline import topics


def test_only_childless_nodes_are_leaves(ait_root):
    index = topics.load()
    assert topics.is_leaf(index["claude-code-mcp-setup"])
    assert not topics.is_leaf(index["claude-code"])
    assert {t.id for t in topics.leaves(index)} == {
        "claude-code-mcp-setup", "claude-code-subagents",
        "frontier-model-launches", "mcp-registry-integration",
    }


def test_a_leaf_at_the_root_is_still_a_leaf(ait_root):
    """Arbitrary depth: mcp-registry-integration has no parent and no children."""
    index = topics.load()
    node = index["mcp-registry-integration"]
    assert node.parent_id is None and node.depth == 0 and topics.is_leaf(node)


def test_arbitrary_depth_is_walked(write_config):
    write_config("topics.json", {"version": 1, "topics": [
        {"id": "a", "label": "A", "children": [
            {"id": "b", "label": "B", "children": [
                {"id": "c", "label": "C", "shape": "tutorial", "aliases": ["deep"]}]}]}]})
    index = topics.load()
    assert index["c"].depth == 2 and index["c"].parent_id == "b"
    assert [t.id for t in topics.leaves(index)] == ["c"]


def test_a_parent_carrying_a_shape_is_a_hard_failure(write_config):
    write_config("topics.json", {"version": 1, "topics": [
        {"id": "a", "label": "A", "shape": "tutorial", "children": [
            {"id": "b", "label": "B", "shape": "tutorial", "aliases": ["x"]}]}]})
    with pytest.raises(topics.TopicError, match="only leaves carry shape"):
        topics.load()


def test_a_leaf_without_a_valid_shape_is_a_hard_failure(write_config):
    write_config("topics.json", {"version": 1, "topics": [
        {"id": "a", "label": "A", "shape": "explainer", "aliases": ["x"]}]})
    with pytest.raises(topics.TopicError, match="tutorial|review"):
        topics.load()


def test_duplicate_ids_are_a_hard_failure(write_config):
    write_config("topics.json", {"version": 1, "topics": [
        {"id": "a", "label": "A", "shape": "review", "aliases": ["x"]},
        {"id": "a", "label": "A again", "shape": "review", "aliases": ["y"]}]})
    with pytest.raises(topics.TopicError, match="duplicate topic id"):
        topics.load()


def test_leaf_becoming_a_parent_warns_and_lists_its_videos(write_config):
    """Adding a child silently demotes a leaf, so the pipeline says so and re-matches."""
    write_config("topics.json", {"version": 1, "topics": [
        {"id": "claude-code", "label": "Claude Code", "children": [
            {"id": "claude-code-mcp-setup", "label": "MCP", "children": [
                {"id": "mcp-http", "label": "HTTP", "shape": "tutorial",
                 "aliases": ["http mcp"]}]}]}]})
    index = topics.load()
    previous = [{"video_id": "v1", "topic_id": "claude-code-mcp-setup"},
                {"video_id": "v2", "topic_id": "claude-code-mcp-setup"}]
    demotions = topics.detect_demotions(index, previous)
    assert demotions == [{"topic_id": "claude-code-mcp-setup",
                          "video_ids": ["v1", "v2"],
                          "new_children": ["mcp-http"]}]


def test_matching_is_n_to_m_with_exactly_one_primary(ait_root):
    index = topics.load()
    video = {"video_id": "v1",
             "title": "Claude Code subagent teams with MCP",
             "description": "wiring the model context protocol",
             "tags": ["agent team"]}
    assignments = topics.match_video(video, index)
    assert {a["topic_id"] for a in assignments} == {
        "claude-code-mcp-setup", "claude-code-subagents"}
    assert sum(1 for a in assignments if a["primary"]) == 1
    assert all(a["method"] == "keyword" for a in assignments)


def test_the_primary_is_the_topic_matched_in_the_title(ait_root):
    index = topics.load()
    video = {"video_id": "v1", "title": "Everything about subagents",
             "description": "also mentions mcp once", "tags": []}
    primary = next(a for a in topics.match_video(video, index) if a["primary"])
    assert primary["topic_id"] == "claude-code-subagents"
    assert primary["matched_on"] == ["title"]


def test_a_parent_is_never_matched(ait_root):
    index = topics.load()
    video = {"video_id": "v1", "title": "Claude Code in 2026", "description": "", "tags": []}
    assert all(topics.is_leaf(index[a["topic_id"]]) for a in topics.match_video(video, index))


def test_an_alias_only_matches_on_a_word_boundary(ait_root):
    """'mcp' must not match 'mcpherson'."""
    index = topics.load()
    video = {"video_id": "v1", "title": "Interview with Sam Mcpherson",
             "description": "", "tags": []}
    assert topics.match_video(video, index) == []


def test_coverage_rate_is_assigned_over_total(ait_root):
    videos = [{"video_id": "v1"}, {"video_id": "v2"}, {"video_id": "v3"}, {"video_id": "v4"}]
    assignments = [{"video_id": "v1", "topic_id": "x"}, {"video_id": "v1", "topic_id": "y"},
                   {"video_id": "v3", "topic_id": "x"}]
    assert topics.coverage_rate(videos, assignments) == 0.5


def test_coverage_rate_of_an_empty_roster_is_none_not_zero(ait_root):
    assert topics.coverage_rate([], []) is None


def test_rollup_counts_reach_every_ancestor(ait_root):
    index = topics.load()
    rolled = topics.rollup(index, {"claude-code-mcp-setup": {"videos": 9, "creators": 7},
                                   "claude-code-subagents": {"videos": 4, "creators": 3}})
    assert rolled["claude-code"] == {"videos": 13, "creators": 10, "leaves": 2}
    assert "claude-code-mcp-setup" not in rolled
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest pipeline/test_topics.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'pipeline.topics'`.

- [ ] **Step 3: Write `pipeline/topics.py`**

```python
"""The topic tree. Only leaves are scoreable, and `scoreable` is derived, never authored.

A node with children exists for navigation and rollup only. Adding a child to a leaf silently
demotes it, which is why detect_demotions exists: the caller warns and re-matches that topic's
videos against the new children.
"""
from __future__ import annotations

import dataclasses
import re
from typing import Iterable

from . import config

SHAPES = ("tutorial", "review")

# Where an alias may be found, most authoritative first. The first field that matches decides
# the primary topic, which is why the order is a constant and not a threshold.
HAYSTACK_FIELDS = ("title", "tags", "description")

# Confidence per matched field. Not in thresholds.json: changing it cannot change a verdict,
# because nothing downstream branches on confidence in this plan.
FIELD_CONFIDENCE = {"title": 0.6, "tags": 0.45, "description": 0.3}


class TopicError(RuntimeError):
    pass


@dataclasses.dataclass(frozen=True)
class Topic:
    id: str
    label: str
    shape: str | None
    aliases: tuple[str, ...]
    parent_id: str | None
    children_ids: tuple[str, ...]
    depth: int


def load(tree: dict | None = None) -> dict[str, Topic]:
    """Flatten config/topics.json into an id-keyed index, validating as it walks."""
    data = tree if tree is not None else config.topics_config()
    index: dict[str, Topic] = {}

    def walk(node: dict, parent_id: str | None, depth: int) -> None:
        node_id = node.get("id")
        if not node_id:
            raise TopicError(f"topic without an id under parent {parent_id!r}")
        if node_id in index:
            raise TopicError(f"duplicate topic id {node_id!r}")
        children = node.get("children") or []
        shape = node.get("shape")
        if children and shape is not None:
            raise TopicError(
                f"{node_id!r} has children and a shape: only leaves carry shape"
            )
        if not children and shape not in SHAPES:
            raise TopicError(
                f"leaf {node_id!r} has shape {shape!r}, expected one of tutorial|review"
            )
        index[node_id] = Topic(
            id=node_id,
            label=node.get("label") or node_id,
            shape=shape,
            aliases=tuple(a.lower() for a in (node.get("aliases") or [])),
            parent_id=parent_id,
            children_ids=tuple(c["id"] for c in children),
            depth=depth,
        )
        for child in children:
            walk(child, node_id, depth + 1)

    for root_node in data.get("topics", []):
        walk(root_node, None, 0)
    return index


def is_leaf(topic: Topic) -> bool:
    return not topic.children_ids


def leaves(index: dict[str, Topic]) -> list[Topic]:
    return [t for t in index.values() if is_leaf(t)]


def ancestors(index: dict[str, Topic], topic_id: str) -> list[str]:
    out: list[str] = []
    current = index[topic_id].parent_id
    while current:
        out.append(current)
        current = index[current].parent_id
    return out


def detect_demotions(index: dict[str, Topic], previous_assignments: Iterable[dict]) -> list[dict]:
    """Topics that carry videos and have since gained children. The caller warns and re-matches."""
    carried: dict[str, list[str]] = {}
    for row in previous_assignments:
        carried.setdefault(row["topic_id"], []).append(row["video_id"])
    out = []
    for topic_id, video_ids in sorted(carried.items()):
        topic = index.get(topic_id)
        if topic is not None and not is_leaf(topic):
            out.append({"topic_id": topic_id,
                        "video_ids": sorted(video_ids),
                        "new_children": list(topic.children_ids)})
    return out


def _haystacks(video: dict) -> dict[str, str]:
    tags = video.get("tags") or []
    return {
        "title": (video.get("title") or "").lower(),
        "tags": " ".join(tags).lower(),
        "description": (video.get("description") or "").lower(),
    }


def _alias_hits(alias: str, haystacks: dict[str, str]) -> list[str]:
    pattern = re.compile(rf"(?<!\w){re.escape(alias)}(?!\w)")
    return [field for field in HAYSTACK_FIELDS if pattern.search(haystacks[field])]


def match_video(video: dict, index: dict[str, Topic]) -> list[dict]:
    """n:m keyword assignment over leaves only. Exactly one row carries primary=True."""
    haystacks = _haystacks(video)
    rows: list[dict] = []
    for topic in leaves(index):
        best: tuple[int, str, str] | None = None      # (field rank, field, alias)
        for alias in topic.aliases:
            for field in _alias_hits(alias, haystacks):
                candidate = (HAYSTACK_FIELDS.index(field), field, alias)
                if best is None or candidate < best:
                    best = candidate
        if best is None:
            continue
        matched_on = sorted(
            {f for alias in topic.aliases for f in _alias_hits(alias, haystacks)},
            key=HAYSTACK_FIELDS.index,
        )
        rows.append({
            "topic_id": topic.id,
            "primary": False,
            "confidence": FIELD_CONFIDENCE[best[1]],
            "method": "keyword",
            "matched_on": matched_on,
            "matched_alias": best[2],
        })
    if rows:
        rows.sort(key=lambda r: (-r["confidence"], r["topic_id"]))
        rows[0]["primary"] = True
    return rows


def coverage_rate(videos: list[dict], assignments: Iterable[dict]) -> float | None:
    """Assigned videos over total. None on an empty roster: missing is a state, never a zero."""
    total = len({v["video_id"] for v in videos})
    if not total:
        return None
    assigned = len({a["video_id"] for a in assignments})
    return assigned / total


def rollup(index: dict[str, Topic], per_leaf: dict[str, dict]) -> dict[str, dict]:
    """Sum leaf counts into every ancestor. Parents get counts and never a score or a verdict."""
    out: dict[str, dict] = {}
    for leaf_id, counts in per_leaf.items():
        for parent_id in ancestors(index, leaf_id):
            bucket = out.setdefault(parent_id, {"videos": 0, "creators": 0, "leaves": 0})
            bucket["videos"] += counts.get("videos", 0)
            bucket["creators"] += counts.get("creators", 0)
            bucket["leaves"] += 1
    return out
```

Note on `rollup`'s `creators`: it sums per-leaf creator counts, so a creator covering two leaves counts twice. That is deliberate and matches the wireframe's parent page (`7 leaf topics, 61 videos, 22 creators`), which is a sum over leaves and not a distinct count. If a distinct count is wanted later it needs the creator ids, not the counts.

- [ ] **Step 4: Run the tests**

Run: `pytest pipeline/test_topics.py -v`
Expected: PASS, 14 tests.

- [ ] **Step 5: Run the whole suite and the linter**

Run: `pytest -q && ruff check pipeline test_anchors.py`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
rtk git add pipeline/topics.py pipeline/test_topics.py
rtk git commit -m "feat(topics): topic tree with derived leaves, shape validation, keyword matcher"
```

---

### Task 3: The YouTube Data API client and the quota ledger

**Files:**
- Create: `pipeline/youtube.py`
- Create: `pipeline/test_youtube.py`

**Interfaces:**
- Consumes: `config.require_env("YOUTUBE_API_KEY")`, `config.raw_dir()`, `util.write_json`.
- Produces:
  - `youtube.YouTube(api_key: str, transport=None, ledger: QuotaLedger | None = None)`
  - `.channels(ids: list[str]) -> dict[str, dict]` (batches 50 ids per call, 1 unit each; missing ids are simply absent from the returned dict)
  - `.uploads_playlist_id(channel_item: dict) -> str`
  - `.playlist_items(playlist_id, known_ids: set[str], max_pages: int = 5) -> list[dict]` (stops on the first known id)
  - `.videos(ids: list[str]) -> dict[str, dict]` (batches 50, 1 unit each)
  - `.comment_threads(video_id, max_roots: int) -> list[dict]` (100 per page, 1 unit each)
  - `youtube.QuotaLedger(path)` with `.spend(units, call)`, `.total`, `.by_call`, `.save()`
  - `youtube.QuotaExceeded(RuntimeError)`, `youtube.YouTubeError(RuntimeError)`

`transport` is a callable `(url: str) -> bytes`. The default hits the network; every test injects a fake. Per the project's rule 5, the transport itself is not tested, but batching, quota arithmetic, and the absent-channel path are.

`DAILY_BUDGET = 9500` is a module constant, not a threshold: changing it cannot change what the dashboard tells you to do.

- [ ] **Step 1: Write the failing tests**

`pipeline/test_youtube.py`:

```python
import json

import pytest

from pipeline import youtube


class FakeTransport:
    """Records every URL and replies from a queue of dicts."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.urls = []

    def __call__(self, url):
        self.urls.append(url)
        return json.dumps(self.replies.pop(0)).encode()


def _channel_item(cid, subs="219000", views="11991545", videos="412"):
    return {"id": cid,
            "snippet": {"title": cid, "thumbnails": {"high": {"url": f"http://x/{cid}.jpg"}}},
            "statistics": {"subscriberCount": subs, "viewCount": views, "videoCount": videos},
            "contentDetails": {"relatedPlaylists": {"uploads": "UU" + cid[2:]}}}


def test_channels_batches_fifty_ids_per_call(ait_root):
    ids = [f"UC{i:03d}" for i in range(72)]
    transport = FakeTransport([
        {"items": [_channel_item(c) for c in ids[:50]]},
        {"items": [_channel_item(c) for c in ids[50:]]},
    ])
    api = youtube.YouTube("KEY", transport=transport)
    got = api.channels(ids)
    assert len(transport.urls) == 2
    assert len(got) == 72
    assert api.ledger.total == 2


def test_a_channel_missing_from_a_200_response_is_simply_absent(ait_root):
    transport = FakeTransport([{"items": [_channel_item("UCa")]}])
    api = youtube.YouTube("KEY", transport=transport)
    got = api.channels(["UCa", "UCgoneprivate"])
    assert set(got) == {"UCa"}


def test_videos_batches_fifty_and_charges_one_unit_per_call(ait_root):
    ids = [f"v{i}" for i in range(120)]
    transport = FakeTransport([
        {"items": [{"id": i} for i in ids[:50]]},
        {"items": [{"id": i} for i in ids[50:100]]},
        {"items": [{"id": i} for i in ids[100:]]},
    ])
    api = youtube.YouTube("KEY", transport=transport)
    assert len(api.videos(ids)) == 120
    assert api.ledger.total == 3
    assert api.ledger.by_call["videos.list"] == 3


def test_playlist_items_stops_at_the_first_known_id(ait_root):
    page = {"items": [{"contentDetails": {"videoId": "new1"}},
                      {"contentDetails": {"videoId": "new2"}},
                      {"contentDetails": {"videoId": "old1"}}],
            "nextPageToken": "PAGE2"}
    transport = FakeTransport([page])
    api = youtube.YouTube("KEY", transport=transport)
    got = api.playlist_items("UUx", known_ids={"old1"})
    assert [g["contentDetails"]["videoId"] for g in got] == ["new1", "new2"]
    assert len(transport.urls) == 1          # never asked for page 2


def test_quota_is_refused_once_the_daily_budget_is_gone(ait_root):
    api = youtube.YouTube("KEY", transport=FakeTransport([]))
    api.ledger.spend(youtube.DAILY_BUDGET, "videos.list")
    with pytest.raises(youtube.QuotaExceeded):
        api.channels(["UCa"])


def test_the_ledger_persists_and_reloads(ait_root, tmp_path):
    path = tmp_path / "quota-2026-07-27.json"
    ledger = youtube.QuotaLedger(path)
    ledger.spend(2, "channels.list")
    ledger.spend(72, "videos.list")
    ledger.save()
    assert youtube.QuotaLedger(path).total == 74
    assert youtube.QuotaLedger(path).by_call["videos.list"] == 72


def test_search_list_is_not_callable(ait_root):
    """100 units a call. Banned by spec §8, and there is deliberately no method for it."""
    assert not hasattr(youtube.YouTube("KEY"), "search")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest pipeline/test_youtube.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'pipeline.youtube'`.

- [ ] **Step 3: Write `pipeline/youtube.py`**

```python
"""YouTube Data API v3 over urllib, with id batching and a persisted quota ledger.

Two calls are deliberately absent and must stay absent:
  search.list       100 units. 100 searches would eat the entire day.
  captions.download 200 units, and only works on videos you own.
"""
from __future__ import annotations

import json
import pathlib
import urllib.error
import urllib.parse
import urllib.request

from . import config, util

API = "https://www.googleapis.com/youtube/v3"
BATCH = 50            # channels.list and videos.list both accept 50 ids for 1 unit
PAGE = 100            # commentThreads and playlistItems max page size
DAILY_BUDGET = 9500   # of 10,000, leaving headroom for a manual call


class YouTubeError(RuntimeError):
    pass


class QuotaExceeded(RuntimeError):
    pass


class QuotaLedger:
    """Units spent today, by call. Persisted so a second run in one day sees the first."""

    def __init__(self, path: pathlib.Path | None = None):
        self.path = path
        data = util.read_json(path, default={}) if path else {}
        self.by_call: dict[str, int] = dict(data.get("by_call", {}))

    @property
    def total(self) -> int:
        return sum(self.by_call.values())

    def spend(self, units: int, call: str) -> None:
        if self.total + units > DAILY_BUDGET:
            raise QuotaExceeded(
                f"{call} needs {units} units, {DAILY_BUDGET - self.total} left of {DAILY_BUDGET}"
            )
        self.by_call[call] = self.by_call.get(call, 0) + units

    def save(self) -> None:
        if self.path:
            util.write_json(self.path, {"by_call": self.by_call, "total": self.total})


def _default_transport(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        raise YouTubeError(f"HTTP {exc.code}: {exc.read().decode(errors='replace')[:500]}") from exc
    except urllib.error.URLError as exc:
        raise YouTubeError(f"network error: {exc}") from exc


def ledger_path_for(date_str: str) -> pathlib.Path:
    return config.raw_dir() / "quota" / f"{date_str}.json"


class YouTube:
    def __init__(self, api_key: str, transport=None, ledger: QuotaLedger | None = None):
        self.api_key = api_key
        self.transport = transport or _default_transport
        self.ledger = ledger or QuotaLedger(None)

    def _get(self, path: str, params: dict, units: int, call: str) -> dict:
        self.ledger.spend(units, call)
        query = urllib.parse.urlencode({**params, "key": self.api_key})
        body = self.transport(f"{API}/{path}?{query}")
        try:
            return json.loads(body)
        except json.JSONDecodeError as exc:
            raise YouTubeError(f"{call} returned non-JSON: {body[:300]!r}") from exc

    def channels(self, ids: list[str]) -> dict[str, dict]:
        """id -> item. An id missing from the reply is absent, which is how a private channel reads."""
        out: dict[str, dict] = {}
        for start in range(0, len(ids), BATCH):
            chunk = ids[start:start + BATCH]
            data = self._get("channels", {
                "part": "snippet,statistics,contentDetails",
                "id": ",".join(chunk), "maxResults": BATCH,
            }, 1, "channels.list")
            for item in data.get("items", []):
                out[item["id"]] = item
        return out

    @staticmethod
    def uploads_playlist_id(channel_item: dict) -> str:
        return channel_item["contentDetails"]["relatedPlaylists"]["uploads"]

    def playlist_items(self, playlist_id: str, known_ids: set[str],
                       max_pages: int = 5) -> list[dict]:
        """New uploads, newest first, stopping at the first id already held."""
        out: list[dict] = []
        token = None
        for _ in range(max_pages):
            params = {"part": "contentDetails", "playlistId": playlist_id, "maxResults": PAGE}
            if token:
                params["pageToken"] = token
            data = self._get("playlistItems", params, 1, "playlistItems.list")
            for item in data.get("items", []):
                if item["contentDetails"]["videoId"] in known_ids:
                    return out
                out.append(item)
            token = data.get("nextPageToken")
            if not token:
                break
        return out

    def videos(self, ids: list[str]) -> dict[str, dict]:
        out: dict[str, dict] = {}
        for start in range(0, len(ids), BATCH):
            chunk = ids[start:start + BATCH]
            data = self._get("videos", {
                "part": "snippet,statistics,contentDetails",
                "id": ",".join(chunk), "maxResults": BATCH,
            }, 1, "videos.list")
            for item in data.get("items", []):
                out[item["id"]] = item
        return out

    def comment_threads(self, video_id: str, max_roots: int) -> list[dict]:
        """Root threads with their inline replies. 1 unit per page of 100."""
        out: list[dict] = []
        token = None
        while len(out) < max_roots:
            params = {"part": "snippet,replies", "videoId": video_id,
                      "maxResults": min(PAGE, max_roots - len(out)), "order": "relevance"}
            if token:
                params["pageToken"] = token
            try:
                data = self._get("commentThreads", params, 1, "commentThreads.list")
            except YouTubeError as exc:
                if "commentsDisabled" in str(exc) or "HTTP 403" in str(exc):
                    return out
                raise
            out.extend(data.get("items", []))
            token = data.get("nextPageToken")
            if not token:
                break
        return out
```

- [ ] **Step 4: Run the tests**

Run: `pytest pipeline/test_youtube.py -v`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
rtk git add pipeline/youtube.py pipeline/test_youtube.py
rtk git commit -m "feat(youtube): batched Data API client with a persisted quota ledger"
```

---

### Task 4: Resolve `channel_id` and `niche` on the roster

This is build step 0's blocker. `config/channels.json` is private, gitignored, and Read-denied to agents by `.claude/settings.json`. The script therefore reads it as a subprocess and writes a **candidate file outside `config/`** for a human to merge. Nothing here writes into `config/`.

**Files:**
- Create: `scripts/resolve_channel_ids.py`
- Create: `scripts/test_resolve_channel_ids.py`

**Interfaces:**
- Consumes: `youtube.YouTube`, `config.load_env`, `config.config_dir()`.
- Produces:
  - `resolve_channel_ids.resolve(rows, api) -> tuple[list[dict], list[dict]]` (resolved rows, unresolved rows)
  - CLI: `python3 scripts/resolve_channel_ids.py --out _raw/roster_candidates.json`

`channels.list?forHandle=` does **not** batch: passing two handles returns zero items (verified, spec §12). So resolution is one call per unresolved handle, one time only, and the result is pasted into `config/channels.json` by hand.

- [ ] **Step 1: Write the failing test**

`scripts/test_resolve_channel_ids.py`:

```python
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pytest scripts/test_resolve_channel_ids.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'scripts'`.

- [ ] **Step 3: Write the script**

```bash
mkdir -p scripts && touch scripts/__init__.py
```

`scripts/resolve_channel_ids.py`:

```python
"""One-time roster resolution: handle -> channel_id, plus subscriber counts for review.

Writes a CANDIDATE file. It never touches config/channels.json: that file is hand-edited, private,
and the pipeline is forbidden from writing anywhere under config/.

    python3 scripts/resolve_channel_ids.py --out _raw/roster_candidates.json
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from pipeline import config, util, youtube      # noqa: E402


def resolve(rows: list[dict], api: youtube.YouTube) -> tuple[list[dict], list[dict]]:
    """forHandle does not batch, so this is one call per unresolved handle. One time only."""
    resolved, unresolved = [], []
    for row in rows:
        out = dict(row)
        if out.get("channel_id"):
            resolved.append(out)
            continue
        data = api._get("channels", {"part": "snippet,statistics",
                                     "forHandle": out["handle"]}, 1, "channels.list")
        items = data.get("items") or []
        if not items:
            unresolved.append(out)
            continue
        item = items[0]
        subs = item.get("statistics", {}).get("subscriberCount")
        out["channel_id"] = item["id"]
        out["resolved_name"] = item.get("snippet", {}).get("title")
        out["subscriber_count"] = int(subs) if subs is not None else None
        out.setdefault("niche", None)          # a human sets niche. Never guessed.
        resolved.append(out)
    return resolved, unresolved


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="_raw/roster_candidates.json")
    args = parser.parse_args()

    config.load_env()
    raw = util.read_json(config.config_dir() / "channels.json")
    if raw is None:
        print("config/channels.json not found. Copy config/channels.example.json first.")
        return 1
    rows = raw.get("channels", [])
    api = youtube.YouTube(config.require_env("YOUTUBE_API_KEY"))
    resolved, unresolved = resolve(rows, api)

    out_path = config.root() / args.out
    util.write_json(out_path, {"resolved": resolved, "unresolved": unresolved})
    print(f"resolved {len(resolved)} of {len(rows)}, {api.ledger.total} quota units")
    if unresolved:
        print("UNRESOLVED, fix the handle by hand:")
        for row in unresolved:
            print(f"  {row.get('handle')}")
    print(f"\nwrote {out_path}")
    print("Merge channel_id into config/channels.json by hand, then set niche on every row.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run the tests**

Run: `pytest scripts/test_resolve_channel_ids.py -v`
Expected: PASS, 2 tests.

- [ ] **Step 5: Run it against the real roster**

Requires `YOUTUBE_API_KEY` in `.env`. Costs 1 quota unit per unresolved handle, roughly 72 of 10,000.

Run: `python3 scripts/resolve_channel_ids.py`
Expected: `resolved 72 of 72, 72 quota units` and `_raw/roster_candidates.json` on disk.

- [ ] **Step 6: HUMAN GATE. Eric merges the roster and finishes the config pass**

This is not an agent step. Three things, all in `config/`, all by hand:

1. **`config/channels.json`**: paste `channel_id` onto every row from `_raw/roster_candidates.json`, and set `niche` on all 72. `niche` is the leaderboard's peer filter; the wireframe uses `ai-agents`, `claude-code`, `n8n`, `no-code`, `chinese`, `business`. Confirm exactly one row has `category: "own"`.
2. **`config/topics.json`**: a pass over the 24 drafted leaves. Cut, rename, merge, and fix the `shape` tags. Every leaf needs `shape` set to `tutorial` or `review`, and no parent may carry one. The file is the input nothing else works without.
3. **`.env`**: add `GITHUB_TOKEN`. A classic token with no scopes is enough; every GitHub call here is public read.

Verify the result loads:

```bash
python3 -c "from pipeline import config, topics; r=config.roster(); \
print(len(r), 'channels,', config.self_channel(r)['handle'], 'is self'); \
i=topics.load(); print(len(topics.leaves(i)), 'leaves of', len(i), 'topics')"
```

Expected: `72 channels, erictech is self` and a leaf count between 15 and 25.

- [ ] **Step 7: Commit**

`config/channels.json` is gitignored and must not appear in the diff. Check before committing.

```bash
rtk git status --short
rtk git add scripts/ config/topics.json
rtk git commit -m "feat(roster): one-time channel_id resolution script, plus the reviewed topic tree"
```

---

### Task 5: The daily channel sweep, with `status`, gap detection, and the self-channel guard

**Files:**
- Create: `pipeline/snapshot.py`
- Create: `pipeline/test_snapshot.py`

**Interfaces:**
- Consumes: `config.roster()`, `config.self_channel()`, `youtube.YouTube`, `growth.bucket_width` (Task 7 provides the real one; this task ships it inside `growth.py` as its first function so the import exists).
- Produces:
  - `snapshot.channel_rows(roster, api, today) -> dict[str, dict]` (one row per roster channel, always, `status` in `ok | absent`)
  - `snapshot.snapshot_path(date_str) -> pathlib.Path`
  - `snapshot.write_channel_snapshot(rows, today) -> pathlib.Path` (idempotent: a second run the same day overwrites with identical bytes)
  - `snapshot.present_dates() -> list[str]`, `snapshot.missing_dates(today, days) -> list[str]`
  - `snapshot.run(today=None, dry_run=False) -> dict` (the CLI summary; the full sweep lands in Task 19)

The snapshot row is exactly `system.md` §4's series element: `date, status, view_count, subscriber_count, subscriber_bucket, video_count, source`.

`bucket_width` lands here rather than in Task 7 because the snapshot row carries it. Task 7 owns everything else in `growth.py`.

- [ ] **Step 1: Write the failing tests**

`pipeline/test_snapshot.py`:

```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest pipeline/test_snapshot.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'pipeline.snapshot'`.

- [ ] **Step 3: Add `bucket_width` to a new `pipeline/growth.py`**

Only this one function. Task 7 fills in the rest.

```python
"""Growth math. Everything here is Derived tier and must render its own formula.

YouTube rounds subscriberCount to three significant figures for every channel you do not own,
so the bucket width is always about 0.1% of the count. Counts below 1,000 are exact.
"""
from __future__ import annotations


def bucket_width(subscriber_count: int | None) -> int | None:
    """The rounding granularity YouTube applied. 219,000 -> 1,000. 2,380 -> 10. None -> None."""
    if subscriber_count is None:
        return None
    count = int(subscriber_count)
    if count < 1000:
        return 1
    return 10 ** (len(str(count)) - 3)
```

- [ ] **Step 4: Write `pipeline/snapshot.py`**

```python
"""Entry point 1: the daily free sweep. Appends to _raw/, never edits and never deletes.

A channel that vanishes from a 200 response has gone private. It is written as status "absent"
with null counts, never as a zero and never omitted, because omitting it would let the gap
detector heal a hole that is not a hole.
"""
from __future__ import annotations

import argparse
import datetime as dt
import pathlib

from . import config, growth, util, youtube


def snapshot_path(date_str: str) -> pathlib.Path:
    return config.raw_dir() / "snapshots" / f"{date_str}.json"


def _stat(item: dict, key: str) -> int | None:
    value = item.get("statistics", {}).get(key)
    return int(value) if value is not None else None


def channel_rows(roster: list[dict], api: youtube.YouTube, today: dt.date) -> dict[str, dict]:
    """One row per roster channel, always. Absent is a state, not an omission."""
    date_string = util.date_str(today)
    ids = [row["channel_id"] for row in roster]
    fetched = api.channels(ids)
    out: dict[str, dict] = {}
    for channel_id in ids:
        item = fetched.get(channel_id)
        if item is None:
            out[channel_id] = {"date": date_string, "status": "absent", "view_count": None,
                               "subscriber_count": None, "subscriber_bucket": None,
                               "video_count": None, "source": "youtube_api"}
            continue
        subscribers = _stat(item, "subscriberCount")
        out[channel_id] = {"date": date_string, "status": "ok",
                           "view_count": _stat(item, "viewCount"),
                           "subscriber_count": subscribers,
                           "subscriber_bucket": growth.bucket_width(subscribers),
                           "video_count": _stat(item, "videoCount"),
                           "source": "youtube_api"}
    return out


def write_channel_snapshot(rows: dict[str, dict], today: dt.date) -> pathlib.Path:
    date_string = util.date_str(today)
    path = snapshot_path(date_string)
    util.write_json(path, {"date": date_string, "channels": rows})
    return path


def present_dates() -> list[str]:
    directory = config.raw_dir() / "snapshots"
    if not directory.exists():
        return []
    return sorted(p.stem for p in directory.glob("*.json"))


def missing_dates(today: dt.date, days: int) -> list[str]:
    """Calendar dates in the last `days` with no snapshot file. A hole is expected, not fatal."""
    present = set(present_dates())
    return [d for d in util.last_n_dates(today, days) if d not in present]


def run(today: dt.date | None = None, dry_run: bool = False) -> dict:
    today = today or util.today()
    date_string = util.date_str(today)
    roster = config.roster()
    config.self_channel(roster)                      # fails loudly on zero or two
    ledger = youtube.QuotaLedger(youtube.ledger_path_for(date_string))
    batches = -(-len(roster) // youtube.BATCH)
    if dry_run:
        return {"date": date_string, "channels": len(roster),
                "would_spend_units": batches,
                "missing_dates": missing_dates(today, 30)}

    api = youtube.YouTube(config.require_env("YOUTUBE_API_KEY"), ledger=ledger)
    rows = channel_rows(roster, api, today)
    write_channel_snapshot(rows, today)
    ledger.save()
    absent = [cid for cid, row in rows.items() if row["status"] == "absent"]
    return {"date": date_string, "channels": len(rows), "absent": absent,
            "units": ledger.total, "missing_dates": missing_dates(today, 30)}


def main() -> int:
    parser = argparse.ArgumentParser(description="the daily free sweep")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--date", help="YYYY-MM-DD, defaults to today UTC")
    args = parser.parse_args()
    day = util.parse_date(args.date) if args.date else None
    summary = run(today=day, dry_run=args.dry_run)
    for key, value in summary.items():
        print(f"{key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 5: Run the tests**

Run: `pytest pipeline/test_snapshot.py -v`
Expected: PASS, 7 tests.

- [ ] **Step 6: Run one real sweep**

Run: `python3 -m pipeline.snapshot --dry-run`
Expected: `channels: 72`, `would_spend_units: 2`, and a `missing_dates` list.

Run: `python3 -m pipeline.snapshot`
Expected: `units: 2`, `absent: []`, and `_raw/snapshots/<today>.json` holding 72 rows.

- [ ] **Step 7: Commit**

```bash
rtk git add pipeline/snapshot.py pipeline/test_snapshot.py pipeline/growth.py
rtk git commit -m "feat(snapshot): daily channel sweep with absent status and gap detection"
```

---

### Task 6: The per-video sweep and the append-only video registry

**Files:**
- Modify: `pipeline/snapshot.py` (add the video half of the sweep)
- Create: `pipeline/test_video_sweep.py`

**Interfaces:**
- Consumes: `youtube.YouTube.playlist_items`, `.videos`, `config.thresholds()["traction"]`.
- Produces:
  - `snapshot.known_video_ids(channel_id) -> set[str]`
  - `snapshot.registry_path(channel_id) -> pathlib.Path` (`_raw/videos/<channel_id>.jsonl`)
  - `snapshot.record_video_metadata(channel_id, items) -> int` (appends only genuinely new or changed observations)
  - `snapshot.registry(channel_id) -> dict[str, dict]` (last observation wins)
  - `snapshot.video_ids_to_sweep(channel_id, today, thresholds) -> list[str]` (the `recent_daily_n` newest every day, plus everything older on a `tail_sweep_days` cadence)
  - `snapshot.video_rows(video_ids, api, today) -> dict[str, dict]`
  - `snapshot.write_video_snapshot(rows, today) -> pathlib.Path`
  - `snapshot.classify_duration(iso8601: str) -> tuple[int, str]` (seconds, `long` or `short`)

Why a separate registry: `_raw/video_snapshots/` holds the daily counts, and writing a title, duration, and publish date into it 365 times over would be the wrong shape. `_raw/videos/<channel_id>.jsonl` is append-only, one line per new or changed observation, each stamped `seen_at`. The reader takes the last line per `video_id`.

Why the two-tier sweep: `config/thresholds.json` says it outright, `"NO VIDEO IS EVER DROPPED. traction.recent_daily_n gets a daily snapshot; every older video is swept every traction.tail_sweep_days"`. 72 channels x 50 recent videos is 3,600 videos, which is 72 units, matching the quota table in spec §12.

- [ ] **Step 1: Write the failing tests**

`pipeline/test_video_sweep.py`:

```python
import datetime as dt
import json

from pipeline import config, snapshot, util

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest pipeline/test_video_sweep.py -v`
Expected: FAIL, `AttributeError: module 'pipeline.snapshot' has no attribute 'classify_duration'`.

- [ ] **Step 3: Extend `pipeline/snapshot.py`**

Add these to the existing module:

```python
import re

_DURATION = re.compile(r"P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?")
SHORT_MAX_SECONDS = 180    # a constant, not a threshold: it is YouTube's own Shorts boundary


def classify_duration(iso8601: str) -> tuple[int, str]:
    """ISO-8601 duration -> (seconds, "short"|"long"). Shorts and long-form get separate baselines."""
    match = _DURATION.fullmatch(iso8601 or "")
    if not match:
        raise ValueError(f"unparseable duration {iso8601!r}")
    days, hours, minutes, seconds = (int(g or 0) for g in match.groups())
    total = ((days * 24 + hours) * 60 + minutes) * 60 + seconds
    return total, ("short" if total <= SHORT_MAX_SECONDS else "long")


def registry_path(channel_id: str) -> pathlib.Path:
    return config.raw_dir() / "videos" / f"{channel_id}.jsonl"


def registry(channel_id: str) -> dict[str, dict]:
    """video_id -> the last observation. The file is append-only; the reader takes the newest."""
    out: dict[str, dict] = {}
    for row in util.read_jsonl(registry_path(channel_id)):
        out[row["video_id"]] = row
    return out


def known_video_ids(channel_id: str) -> set[str]:
    return set(registry(channel_id))


def _observation(channel_id: str, item: dict, seen_at: str) -> dict:
    snippet = item.get("snippet", {})
    duration_s, kind = classify_duration(item.get("contentDetails", {}).get("duration", ""))
    return {"video_id": item["id"], "channel_id": channel_id,
            "title": snippet.get("title"), "description": snippet.get("description") or "",
            "tags": snippet.get("tags") or [], "published_at": snippet.get("publishedAt"),
            "duration_s": duration_s, "type": kind, "seen_at": seen_at}


def record_video_metadata(channel_id: str, items: list[dict],
                          seen_at: str | None = None) -> int:
    """Append an observation only when the video is new or its metadata changed. Returns the count."""
    seen_at = seen_at or util.iso_z(dt.datetime.now(tz=util.UTC))
    current = registry(channel_id)
    written = 0
    for item in items:
        observation = _observation(channel_id, item, seen_at)
        previous = current.get(observation["video_id"])
        if previous is not None:
            comparable = {k: v for k, v in observation.items() if k != "seen_at"}
            if all(previous.get(k) == v for k, v in comparable.items()):
                continue
        util.append_jsonl(registry_path(channel_id), observation)
        current[observation["video_id"]] = observation
        written += 1
    return written


def video_ids_to_sweep(channel_id: str, today: dt.date, traction_thresholds: dict,
                       include_tail: bool | None = None) -> list[str]:
    """The newest recent_daily_n every day, plus the whole tail every tail_sweep_days.

    NO VIDEO IS EVER DROPPED: a two-year-old video that goes viral is caught within a week and
    rejoins daily tracking, because the tail sweep re-reads it and traction sees the jump.
    """
    rows = list(registry(channel_id).values())
    rows.sort(key=lambda r: r.get("published_at") or "", reverse=True)
    recent_n = traction_thresholds["recent_daily_n"]
    if include_tail is None:
        include_tail = today.toordinal() % traction_thresholds["tail_sweep_days"] == 0
    chosen = rows if include_tail else rows[:recent_n]
    return [r["video_id"] for r in chosen]


def video_rows(video_ids: list[str], api: youtube.YouTube, today: dt.date) -> dict[str, dict]:
    """One row per requested id. A deleted video is absent, never a zero."""
    date_string = util.date_str(today)
    fetched = api.videos(video_ids)
    out: dict[str, dict] = {}
    for video_id in video_ids:
        item = fetched.get(video_id)
        if item is None:
            out[video_id] = {"date": date_string, "status": "absent",
                             "view_count": None, "source": "youtube_api"}
            continue
        views = item.get("statistics", {}).get("viewCount")
        out[video_id] = {"date": date_string, "status": "ok",
                         "view_count": int(views) if views is not None else None,
                         "source": "youtube_api"}
    return out


def video_snapshot_path(date_str: str) -> pathlib.Path:
    return config.raw_dir() / "video_snapshots" / f"{date_str}.json"


def write_video_snapshot(rows: dict[str, dict], today: dt.date) -> pathlib.Path:
    date_string = util.date_str(today)
    path = video_snapshot_path(date_string)
    util.write_json(path, {"date": date_string, "videos": rows})
    return path
```

- [ ] **Step 4: Split the fetch out of `channel_rows`, then rewrite `run()`**

The uploads pass needs the channel items that `channel_rows` already fetched, and fetching them twice would double the sweep's cost. Split the call out so `channel_rows` becomes pure and takes the already-fetched dict:

```python
def fetch_channels(roster: list[dict], api: youtube.YouTube) -> dict[str, dict]:
    return api.channels([row["channel_id"] for row in roster])


def channel_rows(roster: list[dict], fetched: dict[str, dict], today: dt.date) -> dict[str, dict]:
    """One row per roster channel, always. Absent is a state, not an omission."""
    date_string = util.date_str(today)
    out: dict[str, dict] = {}
    for row in roster:
        channel_id = row["channel_id"]
        item = fetched.get(channel_id)
        if item is None:
            out[channel_id] = {"date": date_string, "status": "absent", "view_count": None,
                               "subscriber_count": None, "subscriber_bucket": None,
                               "video_count": None, "source": "youtube_api"}
            continue
        subscribers = _stat(item, "subscriberCount")
        out[channel_id] = {"date": date_string, "status": "ok",
                           "view_count": _stat(item, "viewCount"),
                           "subscriber_count": subscribers,
                           "subscriber_bucket": growth.bucket_width(subscribers),
                           "video_count": _stat(item, "videoCount"),
                           "source": "youtube_api"}
    return out
```

```python
def run(today: dt.date | None = None, dry_run: bool = False) -> dict:
    today = today or util.today()
    date_string = util.date_str(today)
    roster = config.roster()
    config.self_channel(roster)
    traction_thresholds = config.thresholds()["traction"]
    ledger = youtube.QuotaLedger(youtube.ledger_path_for(date_string))
    if dry_run:
        return {"date": date_string, "channels": len(roster),
                "would_spend_units": -(-len(roster) // youtube.BATCH),
                "missing_dates": missing_dates(today, 30)}

    api = youtube.YouTube(config.require_env("YOUTUBE_API_KEY"), ledger=ledger)
    fetched = fetch_channels(roster, api)
    rows = channel_rows(roster, fetched, today)
    write_channel_snapshot(rows, today)

    new_videos = 0
    for channel_id, item in fetched.items():
        uploads = api.playlist_items(api.uploads_playlist_id(item),
                                     known_ids=known_video_ids(channel_id))
        ids = [i["contentDetails"]["videoId"] for i in uploads]
        if ids:
            new_videos += record_video_metadata(channel_id, list(api.videos(ids).values()))

    to_sweep: list[str] = []
    for row in roster:
        to_sweep.extend(video_ids_to_sweep(row["channel_id"], today, traction_thresholds))
    write_video_snapshot(video_rows(to_sweep, api, today), today)

    ledger.save()
    return {"date": date_string, "channels": len(rows),
            "absent": [c for c, r in rows.items() if r["status"] == "absent"],
            "new_videos": new_videos, "videos_swept": len(to_sweep),
            "units": ledger.total, "missing_dates": missing_dates(today, 30)}
```

Update `pipeline/test_snapshot.py`'s three `channel_rows` tests to pass `fetch_channels(...)` explicitly, and the dry-run test is unchanged.

- [ ] **Step 5: Run both test modules**

Run: `pytest pipeline/test_snapshot.py pipeline/test_video_sweep.py -v`
Expected: PASS, 14 tests.

- [ ] **Step 6: Run a real sweep and check the quota**

Run: `python3 -m pipeline.snapshot`
Expected on a cold registry: a large `new_videos`, `videos_swept` near 3,600 once the registry fills, and `units` under 250. On day one the uploads pass walks back further, so allow up to 5 pages per channel and confirm `units` stays under 1,000.

- [ ] **Step 7: Commit**

```bash
rtk git add pipeline/snapshot.py pipeline/test_snapshot.py pipeline/test_video_sweep.py
rtk git commit -m "feat(snapshot): per-video sweep, append-only video registry, two-tier cadence"
```

---

### Task 7: `delta()`, the `building` state, and the monotonicity filter

**Files:**
- Modify: `pipeline/growth.py`
- Create: `pipeline/test_growth.py`

**Interfaces:**
- Consumes: `util.last_n_dates`, `config.thresholds()["growth"]`.
- Produces:
  - `growth.load_series(series: list[dict]) -> dict[str, dict]` (date-keyed, last write wins)
  - `growth.filter_monotonic(series: list[dict], keys=("view_count", "video_count")) -> list[dict]` (marks violators `status: "corrupt"`; never repairs, never averages)
  - `growth.delta(series, metric, window_days, today) -> dict` returning one of:
    - `{"state": "ok", "value": int, "from": str, "to": str}`
    - `{"state": "building", "have": int, "need": int, "value": None}`
    - `{"state": "insufficient_data", "value": None}` (no usable points at all)
  - `growth.delta_24h(series, metric, today) -> dict` (`delta(window_days=2)` labelled `24h`)
  - `growth.views_gained(series, window_days, today) -> dict`

**The window rule, verbatim from spec §6 and resolved in C2:** a `window_days` window requires exactly `window_days` calendar dates, all with `status == "ok"`, and returns `newest - oldest`. Any shortfall returns `building, N of M` and **no number**. `24h` is the one special case: `window_days=1` would compare a point to itself, so it is implemented as a 2-point window.

- [ ] **Step 1: Write the failing tests**

`pipeline/test_growth.py`:

```python
import datetime as dt

from pipeline import growth

TODAY = dt.date(2026, 7, 27)


def series(pairs, metric="view_count", status="ok"):
    return [{"date": d, "status": status, metric: v} for d, v in pairs]


def test_a_complete_window_returns_newest_minus_oldest():
    s = series([("2026-07-25", 100), ("2026-07-26", 150), ("2026-07-27", 400)])
    assert growth.delta(s, "view_count", 3, TODAY) == {
        "state": "ok", "value": 300, "from": "2026-07-25", "to": "2026-07-27"}


def test_a_missing_tuesday_makes_7d_read_building_6_of_7():
    dates = [f"2026-07-{d}" for d in (21, 22, 23, 24, 26, 27)]      # 25 is missing
    s = series([(d, 100) for d in dates])
    assert growth.delta(s, "view_count", 7, TODAY) == {
        "state": "building", "have": 6, "need": 7, "value": None}


def test_no_branch_returns_a_number_over_fewer_days_than_requested():
    s = series([("2026-07-26", 100), ("2026-07-27", 900)])
    for window in (3, 7, 30, 90):
        assert growth.delta(s, "view_count", window, TODAY)["value"] is None


def test_an_absent_point_does_not_count_as_present():
    s = (series([("2026-07-25", 100), ("2026-07-27", 300)])
         + [{"date": "2026-07-26", "status": "absent", "view_count": None}])
    assert growth.delta(s, "view_count", 3, TODAY)["state"] == "building"


def test_an_empty_series_is_insufficient_data_not_zero():
    assert growth.delta([], "view_count", 7, TODAY) == {
        "state": "insufficient_data", "value": None}


def test_24h_uses_two_points_and_never_compares_a_point_to_itself():
    s = series([("2026-07-26", 100), ("2026-07-27", 791)])
    assert growth.delta_24h(s, "view_count", TODAY) == {
        "state": "ok", "value": 691, "from": "2026-07-26", "to": "2026-07-27"}
    one_point = series([("2026-07-27", 791)])
    assert growth.delta_24h(one_point, "view_count", TODAY) == {
        "state": "building", "have": 1, "need": 2, "value": None}


def test_the_monotonicity_filter_rejects_the_real_corrupt_series():
    """Observed 2026-07-27 on a live vidIQ series: views 21,103 -> 606, videos 19 -> 5."""
    s = [{"date": "2026-07-24", "status": "ok", "view_count": 20000, "video_count": 18},
         {"date": "2026-07-25", "status": "ok", "view_count": 21103, "video_count": 19},
         {"date": "2026-07-26", "status": "ok", "view_count": 606, "video_count": 5},
         {"date": "2026-07-27", "status": "ok", "view_count": 21500, "video_count": 20}]
    filtered = growth.filter_monotonic(s)
    assert [row["status"] for row in filtered] == ["ok", "ok", "corrupt", "ok"]
    assert filtered[2]["view_count"] == 606          # stored as it arrived, never repaired


def test_a_corrupt_point_is_not_consumed_by_delta():
    s = [{"date": "2026-07-25", "status": "ok", "view_count": 100},
         {"date": "2026-07-26", "status": "corrupt", "view_count": 5},
         {"date": "2026-07-27", "status": "ok", "view_count": 300}]
    assert growth.delta(s, "view_count", 3, TODAY)["state"] == "building"


def test_subscriber_count_is_not_subject_to_monotonicity():
    """People unsubscribe, and 3-sig-fig rounding wobbles. Only views and videos are monotonic."""
    s = [{"date": "2026-07-26", "status": "ok", "view_count": 100, "subscriber_count": 220000},
         {"date": "2026-07-27", "status": "ok", "view_count": 200, "subscriber_count": 219000}]
    assert [row["status"] for row in growth.filter_monotonic(s)] == ["ok", "ok"]


def test_the_filter_compares_against_the_last_good_point_not_the_previous_one():
    s = [{"date": "2026-07-25", "status": "ok", "view_count": 100},
         {"date": "2026-07-26", "status": "ok", "view_count": 5},
         {"date": "2026-07-27", "status": "ok", "view_count": 50}]
    assert [row["status"] for row in growth.filter_monotonic(s)] == ["ok", "corrupt", "corrupt"]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest pipeline/test_growth.py -v`
Expected: FAIL, `AttributeError: module 'pipeline.growth' has no attribute 'delta'`.

- [ ] **Step 3: Extend `pipeline/growth.py`**

```python
import datetime as dt

from . import util

MONOTONIC_KEYS = ("view_count", "video_count")


def load_series(series: list[dict]) -> dict[str, dict]:
    """Date-keyed view of a series. A later write for the same date wins."""
    return {row["date"]: row for row in sorted(series, key=lambda r: r["date"])}


def filter_monotonic(series: list[dict], keys: tuple[str, ...] = MONOTONIC_KEYS) -> list[dict]:
    """Mark any point that goes backwards on a monotonic metric as corrupt.

    The value is left exactly as it arrived. Correcting it on the way in would make the error
    invisible on the way out. Comparison is against the last point that survived, so a single
    corrupt reading cannot rehabilitate the ones after it.
    """
    out: list[dict] = []
    last_good: dict | None = None
    for row in sorted(series, key=lambda r: r["date"]):
        row = dict(row)
        if row.get("status") != "ok":
            out.append(row)
            continue
        if last_good is not None:
            for key in keys:
                current, previous = row.get(key), last_good.get(key)
                if current is not None and previous is not None and current < previous:
                    row["status"] = "corrupt"
                    break
        if row["status"] == "ok":
            last_good = row
        out.append(row)
    return out


def delta(series: list[dict], metric: str, window_days: int, today: dt.date) -> dict:
    """newest - oldest over exactly window_days consecutive dates, or building, or insufficient.

    Spec §6: no branch may return a number computed over fewer days than requested. A window of
    N dates spans N-1 days of growth, which understates rather than overstates. That is the
    stated rule, and understating is the safe direction.
    """
    by_date = load_series(series)
    usable = {d: r for d, r in by_date.items()
              if r.get("status") == "ok" and r.get(metric) is not None}
    if not usable:
        return {"state": "insufficient_data", "value": None}
    required = util.last_n_dates(today, window_days)
    present = [d for d in required if d in usable]
    if len(present) < window_days:
        return {"state": "building", "have": len(present), "need": window_days, "value": None}
    oldest, newest = present[0], present[-1]
    return {"state": "ok", "value": usable[newest][metric] - usable[oldest][metric],
            "from": oldest, "to": newest}


def delta_24h(series: list[dict], metric: str, today: dt.date) -> dict:
    """A 24h delta needs two points. window_days=1 would compare a point to itself."""
    return delta(series, metric, 2, today)


def views_gained(series: list[dict], window_days: int, today: dt.date) -> dict:
    return delta(series, "view_count", window_days, today)
```

- [ ] **Step 4: Run the tests**

Run: `pytest pipeline/test_growth.py -v`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
rtk git add pipeline/growth.py pipeline/test_growth.py
rtk git commit -m "feat(growth): window rule with building state and the monotonicity filter"
```

---

### Task 8: The measurement floor, `bounded`, the four rank modes, and the three-way sort

The highest-risk single task in the spine. Before this exists, a 219,000-subscriber channel that grew 2,000 in a week renders `+2,000` against a plus-or-minus 1,000 bucket: a number that is half noise and looks exact.

**Files:**
- Modify: `pipeline/growth.py`
- Create: `pipeline/test_growth_floor.py`

**Interfaces:**
- Consumes: `growth.bucket_width`, `growth.delta`, `config.thresholds()["growth"]`.
- Produces:
  - `growth.measurement_floor(subscriber_count, thresholds) -> int | None` (`subscriber_floor_buckets * bucket_width`)
  - `growth.subscriber_delta(series, window_days, today, thresholds) -> dict`, states `ok | bounded | building | insufficient_data`. `bounded` carries `upper` and `bucket` and **no** `value`.
  - `growth.subscriber_growth_rate(series, window_days, today, thresholds) -> dict` (same states; `bounded` carries `upper` as a rate)
  - `growth.subs_per_1k_views(sub_cell, views_cell) -> dict` (inherits the floor: bounded numerator gives a bounded result)
  - `growth.rank_value(cell) -> tuple[int, float]` (tier, magnitude), tiers `2=ok`, `1=bounded`, `0=insufficient_data | building`
  - `growth.sort_rows(rows, key, descending=True) -> list` (partitioned: every `ok` row, then every `bounded` row, then everything unmeasured, in both directions)
  - `growth.rank_modes(channel, window_days, thresholds) -> dict[str, dict]` for `growth | general | subscribers | views`

**The rule that makes the ordering honest:** `bounded` sorts **below** every `ok` row and **above** `insufficient_data`, ordered among itself by `upper` in the direction of the sort. `sortable-table`'s two-way nulls-last rule cannot express three tiers, which is why this is its own comparator rather than a null.

**The `general` composite never imputes.** A `bounded` subscriber delta drops its weight out of the denominator, so the row renders `x / 50` rather than contributing a guessed value. One rule, used here and in the opportunity score.

- [ ] **Step 1: Write the failing tests**

`pipeline/test_growth_floor.py`:

```python
import datetime as dt

from pipeline import growth
from pipeline.conftest import FIXTURE_THRESHOLDS as T

TODAY = dt.date(2026, 7, 27)
GROWTH = T["growth"]


def subs_series(pairs):
    return [{"date": d, "status": "ok", "subscriber_count": v, "view_count": i * 1000}
            for i, (d, v) in enumerate(pairs)]


def test_bucket_width_across_the_real_roster():
    assert growth.bucket_width(2930000) == 10000      # Dan Martell
    assert growth.bucket_width(219000) == 1000        # Cole Medin
    assert growth.bucket_width(68700) == 100          # Eric Tech
    assert growth.bucket_width(2380) == 10            # AI Systems by Jimi
    assert growth.bucket_width(847) == 1              # below 1,000 YouTube is exact
    assert growth.bucket_width(None) is None


def test_the_floor_is_five_buckets_and_differs_per_channel():
    assert growth.measurement_floor(219000, GROWTH) == 5000
    assert growth.measurement_floor(2930000, GROWTH) == 50000
    assert growth.measurement_floor(2380, GROWTH) == 50


def test_a_delta_clearing_its_floor_renders_a_number_with_its_bucket():
    s = subs_series([(f"2026-0{5 if d > 27 else 7}-{d:02d}", v) for d, v in
                     [(25, 204000), (26, 210000), (27, 219000)]])
    cell = growth.subscriber_delta(s, 3, TODAY, GROWTH)
    assert cell == {"state": "ok", "value": 15000, "bucket": 1000,
                    "from": "2026-07-25", "to": "2026-07-27"}


def test_a_delta_below_its_floor_is_bounded_and_carries_no_value():
    """Cole Medin, 219,000, bucket 1,000, floor 5,000. A 2,000 week is 2 buckets."""
    s = subs_series([("2026-07-25", 217000), ("2026-07-26", 218000), ("2026-07-27", 219000)])
    assert growth.subscriber_delta(s, 3, TODAY, GROWTH) == {
        "state": "bounded", "upper": 5000, "value": None, "bucket": 1000,
        "from": "2026-07-25", "to": "2026-07-27"}


def test_bounded_is_never_blank_and_never_zero():
    s = subs_series([("2026-07-26", 219000), ("2026-07-27", 219000)])
    cell = growth.subscriber_delta(s, 2, TODAY, GROWTH)
    assert cell["state"] == "bounded" and cell["value"] is None and cell["upper"] == 5000


def test_a_small_channel_is_measurable_over_a_week_where_a_huge_one_is_not():
    small = subs_series([(f"2026-07-{d}", 2380 + (d - 21) * 30) for d in range(21, 28)])
    huge = subs_series([(f"2026-07-{d}", 2930000 + (d - 21) * 1000) for d in range(21, 28)])
    assert growth.subscriber_delta(small, 7, TODAY, GROWTH)["state"] == "ok"
    assert growth.subscriber_delta(huge, 7, TODAY, GROWTH)["state"] == "bounded"


def test_an_incomplete_window_is_building_before_the_floor_is_even_considered():
    s = subs_series([("2026-07-27", 219000)])
    assert growth.subscriber_delta(s, 7, TODAY, GROWTH)["state"] == "building"


def test_the_growth_rate_bounds_as_a_rate():
    s = subs_series([("2026-07-26", 2930000), ("2026-07-27", 2930000)])
    cell = growth.subscriber_growth_rate(s, 2, TODAY, GROWTH)
    assert cell["state"] == "bounded"
    assert round(cell["upper"], 5) == round(50000 / 2930000, 5)
    assert cell["value"] is None


def test_subs_per_1k_views_inherits_the_floor():
    bounded = {"state": "bounded", "upper": 5000, "value": None, "bucket": 1000}
    views = {"state": "ok", "value": 1000000}
    out = growth.subs_per_1k_views(bounded, views)
    assert out == {"state": "bounded", "upper": 5.0, "value": None}

    ok = {"state": "ok", "value": 15000, "bucket": 1000}
    assert growth.subs_per_1k_views(ok, views) == {"state": "ok", "value": 15.0}


def test_subs_per_1k_views_with_unmeasured_views_is_not_a_number():
    ok = {"state": "ok", "value": 15000, "bucket": 1000}
    building = {"state": "building", "have": 3, "need": 7, "value": None}
    assert growth.subs_per_1k_views(ok, building)["state"] == "building"


def test_ok_beats_bounded_beats_unmeasured_descending():
    rows = [
        {"h": "insufficient", "cell": {"state": "insufficient_data", "value": None}},
        {"h": "bounded-small", "cell": {"state": "bounded", "upper": 500, "value": None}},
        {"h": "ok-low", "cell": {"state": "ok", "value": 2100}},
        {"h": "bounded-big", "cell": {"state": "bounded", "upper": 50000, "value": None}},
        {"h": "ok-high", "cell": {"state": "ok", "value": 53000}},
        {"h": "building", "cell": {"state": "building", "have": 2, "need": 7, "value": None}},
    ]
    ordered = [r["h"] for r in growth.sort_rows(rows, key=lambda r: r["cell"], descending=True)]
    assert ordered[:2] == ["ok-high", "ok-low"]
    assert ordered[2:4] == ["bounded-big", "bounded-small"]
    assert set(ordered[4:]) == {"insufficient", "building"}


def test_unmeasured_rows_sort_last_in_both_directions():
    rows = [
        {"h": "insufficient", "cell": {"state": "insufficient_data", "value": None}},
        {"h": "ok-low", "cell": {"state": "ok", "value": 2100}},
        {"h": "bounded", "cell": {"state": "bounded", "upper": 500, "value": None}},
    ]
    up = [r["h"] for r in growth.sort_rows(rows, key=lambda r: r["cell"], descending=False)]
    assert up == ["ok-low", "bounded", "insufficient"]


def test_all_four_rank_modes_produce_a_total_order():
    channels = [
        {"channel_id": "UCa", "subscriber_count": 219000,
         "subscriber_growth_rate": {"state": "ok", "value": 0.074},
         "subscriber_delta": {"state": "ok", "value": 15000},
         "views_gained": {"state": "ok", "value": 3100000}},
        {"channel_id": "UCb", "subscriber_count": 2930000,
         "subscriber_growth_rate": {"state": "bounded", "upper": 0.017, "value": None},
         "subscriber_delta": {"state": "bounded", "upper": 50000, "value": None},
         "views_gained": {"state": "ok", "value": 12100000}},
        {"channel_id": "UCc", "subscriber_count": 2380,
         "subscriber_growth_rate": {"state": "insufficient_data", "value": None},
         "subscriber_delta": {"state": "insufficient_data", "value": None},
         "views_gained": {"state": "insufficient_data", "value": None}},
    ]
    for mode in ("growth", "general", "subscribers", "views"):
        ranks = growth.rank(channels, mode, GROWTH)
        assert sorted(ranks.values()) == [1, 2, 3], mode


def test_the_general_composite_drops_a_bounded_weight_instead_of_guessing():
    row = {"subscriber_count": 2930000,
           "subscriber_growth_rate": {"state": "bounded", "upper": 0.017, "value": None},
           "views_gained": {"state": "ok", "value": 12100000}}
    composite = growth.general_composite(row, GROWTH, maxima={"subscriber_count": 2930000,
                                                              "views_gained": 12100000})
    assert composite["out_of"] == 50            # 100 minus the 50-point growth weight
    assert composite["excluded"] == ["subscriber_growth"]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest pipeline/test_growth_floor.py -v`
Expected: FAIL, `AttributeError: module 'pipeline.growth' has no attribute 'measurement_floor'`.

- [ ] **Step 3: Extend `pipeline/growth.py`**

```python
from typing import Callable

UNMEASURED = ("building", "insufficient_data", "no_baseline", "unavailable")


def measurement_floor(subscriber_count: int | None, growth_thresholds: dict) -> int | None:
    """5x the channel's bucket width. Below this a delta is bounded, never a bare number."""
    bucket = bucket_width(subscriber_count)
    if bucket is None:
        return None
    return growth_thresholds["subscriber_floor_buckets"] * bucket


def subscriber_delta(series: list[dict], window_days: int, today: dt.date,
                     growth_thresholds: dict) -> dict:
    """ok | bounded | building | insufficient_data. Bounded carries upper and never a value."""
    cell = delta(series, "subscriber_count", window_days, today)
    if cell["state"] != "ok":
        return cell
    by_date = load_series(series)
    newest = by_date[cell["to"]]["subscriber_count"]
    bucket = bucket_width(newest)
    floor = measurement_floor(newest, growth_thresholds)
    if cell["value"] >= floor:
        return {"state": "ok", "value": cell["value"], "bucket": bucket,
                "from": cell["from"], "to": cell["to"]}
    return {"state": "bounded", "upper": floor, "value": None, "bucket": bucket,
            "from": cell["from"], "to": cell["to"]}


def subscriber_growth_rate(series: list[dict], window_days: int, today: dt.date,
                           growth_thresholds: dict) -> dict:
    """The delta over the oldest count in the window. Bounded bounds the rate, not the delta."""
    cell = subscriber_delta(series, window_days, today, growth_thresholds)
    if cell["state"] in UNMEASURED:
        return cell
    base = load_series(series)[cell["from"]]["subscriber_count"]
    if not base:
        return {"state": "insufficient_data", "value": None}
    if cell["state"] == "bounded":
        return {"state": "bounded", "upper": cell["upper"] / base, "value": None,
                "bucket": cell["bucket"], "from": cell["from"], "to": cell["to"]}
    return {"state": "ok", "value": cell["value"] / base, "bucket": cell["bucket"],
            "from": cell["from"], "to": cell["to"]}


def subs_per_1k_views(sub_cell: dict, views_cell: dict) -> dict:
    """The conversion metric. Its numerator carries the floor, so the result inherits it."""
    if views_cell.get("state") != "ok" or not views_cell.get("value"):
        return {"state": views_cell.get("state", "insufficient_data"), "value": None}
    per_1k = views_cell["value"] / 1000
    if sub_cell.get("state") == "ok":
        return {"state": "ok", "value": sub_cell["value"] / per_1k}
    if sub_cell.get("state") == "bounded":
        return {"state": "bounded", "upper": sub_cell["upper"] / per_1k, "value": None}
    return {"state": sub_cell.get("state", "insufficient_data"), "value": None}


def rank_value(cell: dict) -> tuple[int, float]:
    """(tier, magnitude). Tier 2 is measured, 1 is bounded, 0 is unmeasured."""
    state = cell.get("state")
    if state == "ok":
        return (2, float(cell.get("value") or 0))
    if state == "bounded":
        return (1, float(cell.get("upper") or 0))
    return (0, 0.0)


def sort_rows(rows: list, key: Callable[[object], dict], descending: bool = True) -> list:
    """Partitioned sort: ok, then bounded, then unmeasured, in BOTH directions.

    A plain reversible key cannot express this: reversing would put the unmeasured rows first.
    """
    tiers: dict[int, list] = {2: [], 1: [], 0: []}
    for row in rows:
        tier, magnitude = rank_value(key(row))
        tiers[tier].append((magnitude, row))
    out = []
    for tier in (2, 1, 0):
        bucket = tiers[tier]
        if tier:
            bucket.sort(key=lambda pair: pair[0], reverse=descending)
        out.extend(row for _, row in bucket)
    return out


def general_composite(row: dict, growth_thresholds: dict, maxima: dict) -> dict:
    """Weighted composite of subscriber growth, subscriber count, and views gained.

    A bounded or unmeasured input DROPS ITS WEIGHT rather than contributing a guess, and the
    reduced denominator is returned so the row can render x / 50. Never impute a missing input.
    """
    weights = growth_thresholds["rank_weights"]
    parts = {
        "subscriber_growth": (row.get("subscriber_growth_rate", {}), None),
        "subscriber_count": ({"state": "ok", "value": row.get("subscriber_count")},
                             maxima.get("subscriber_count")),
        "views_gained": (row.get("views_gained", {}), maxima.get("views_gained")),
    }
    points, out_of, excluded = 0.0, 0, []
    for key, (cell, scale) in parts.items():
        weight = weights[key]
        usable = cell.get("state") == "ok" and cell.get("value") is not None
        if key == "subscriber_growth":
            scale = 1.0                      # already a rate
        if not usable or not scale:
            excluded.append(key)
            continue
        out_of += weight
        points += weight * min(1.0, cell["value"] / scale)
    return {"value": points if out_of else None, "out_of": out_of, "excluded": excluded}


def rank(channels: list[dict], mode: str, growth_thresholds: dict) -> dict[str, int]:
    """channel_id -> 1-based rank, for one of the four modes. Always a total order."""
    maxima = {
        "subscriber_count": max((c.get("subscriber_count") or 0 for c in channels), default=0),
        "views_gained": max((c.get("views_gained", {}).get("value") or 0 for c in channels),
                            default=0),
    }
    def composite_cell(channel: dict) -> dict:
        composite = general_composite(channel, growth_thresholds, maxima)
        state = "ok" if composite["out_of"] else "insufficient_data"
        # Scaled to the reduced denominator so a row measured on 50 points is comparable
        # to one measured on 100 without ever imputing the missing input.
        value = (composite["value"] / composite["out_of"]) if composite["out_of"] else None
        return {"state": state, "value": value, "out_of": composite["out_of"],
                "excluded": composite["excluded"]}

    keys = {
        "growth": lambda c: c.get("subscriber_growth_rate", {}),
        "subscribers": lambda c: {"state": "ok", "value": c.get("subscriber_count")},
        "views": lambda c: c.get("views_gained", {}),
        "general": composite_cell,
    }
    if mode not in keys:
        raise ValueError(f"unknown rank mode {mode!r}")
    ordered = sort_rows(channels, key=keys[mode], descending=True)
    return {c["channel_id"]: i + 1 for i, c in enumerate(ordered)}
```

- [ ] **Step 4: Run the tests**

Run: `pytest pipeline/test_growth_floor.py -v`
Expected: PASS, 14 tests.

- [ ] **Step 5: Run the full suite**

Run: `pytest -q && ruff check pipeline test_anchors.py scripts`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
rtk git add pipeline/growth.py pipeline/test_growth_floor.py
rtk git commit -m "feat(growth): per-channel measurement floor, bounded state, four rank modes"
```

---

### Task 9: vidIQ, the cost guard, the 360-credit backfill, and the weekly keyword sweep

This task spends real money. The backfill is **360 credits, once**, and it is what makes the leaderboard work on day one instead of day 91.

**Files:**
- Create: `pipeline/vidiq.py`
- Create: `pipeline/test_vidiq.py`

**Interfaces:**
- Consumes: `config.require_env("VIDIQ_API_KEY")`, `config.roster()`, `topics.leaves()`, `growth.filter_monotonic`.
- Produces:
  - `vidiq.VidIQ(api_key, url, transport=None)` with `.call(tool, arguments) -> dict` and `.call_text(tool, arguments) -> str`
  - `vidiq.balance(client) -> dict` (0 credits)
  - `vidiq.CostGuard(balance, reserve=200, ceiling=400)` with `.check(cost, label) -> None` (raises `CostGuardError`) and `.preview(rows) -> str`
  - `vidiq.channel_stats_series(client, channel_id, start, end) -> list[dict]` (daily points, tagged `source: "vidiq_backfill"`)
  - `vidiq.backfill(roster, client, guard, days=365, dry_run=True) -> dict`
  - `vidiq.keyword_sweep(leaf_topics, client, guard, today, dry_run=True) -> dict` (writes `_raw/keywords/<date>.json`)
  - `vidiq.merge_backfill(existing_series, bought_series) -> list[dict]` (a snapshotted point always wins over a bought one; the `source` tag survives)
  - `vidiq.VidiqError`, `vidiq.CostGuardError`

**Costs, from spec §8:** `vidiq_channel_stats` is 5 credits per channel, 72 channels, 360 once. `vidiq_keyword_research` is 5 per leaf, 25 leaves, 125 weekly. The guard refuses any run that would take the balance below its reserve.

**Wire format:** JSON-RPC `tools/call` POSTed to `MCP_VIDIQ_URL`, replying as SSE `data:` lines. The same shape `.agents/skills/yt-watchlist/scripts/run_watchlist.py` and `si-research-ig`'s `insta_toolkit/vidiq.py` already use, reimplemented here because `pipeline/` shares no code with another project.

- [ ] **Step 1: Write the failing tests**

`pipeline/test_vidiq.py`:

```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest pipeline/test_vidiq.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'pipeline.vidiq'`.

- [ ] **Step 3: Write `pipeline/vidiq.py`**

```python
"""vidIQ MCP client and the two calls nothing else sells: purchased daily history and keyword volume.

Everything here is metered, so nothing runs without passing the cost guard first, and every run
prints its bill before it spends. The si-refresh guard pattern, reimplemented rather than shared.
"""
from __future__ import annotations

import datetime as dt
import json
import urllib.error
import urllib.request

from . import config, growth, util

DEFAULT_URL = "https://mcp.vidiq.com/mcp"
CHANNEL_STATS_COST = 5
KEYWORD_COST = 5
DEFAULT_RESERVE = 200      # credits never spent, so a surgical backfill is always affordable
DEFAULT_CEILING = 400      # most a single run may spend


class VidiqError(RuntimeError):
    pass


class CostGuardError(RuntimeError):
    pass


def _default_transport(url: str, payload: bytes, headers: dict) -> bytes:
    request = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        raise VidiqError(f"HTTP {exc.code}: {exc.read().decode(errors='replace')[:500]}") from exc
    except urllib.error.URLError as exc:
        raise VidiqError(f"network error: {exc}") from exc


class VidIQ:
    def __init__(self, api_key: str, url: str = DEFAULT_URL, transport=None):
        self.api_key = api_key
        self.url = url
        self.transport = transport or _default_transport
        self._request_id = 0

    def _envelope(self, tool: str, arguments: dict) -> dict:
        self._request_id += 1
        payload = json.dumps({"jsonrpc": "2.0", "id": self._request_id, "method": "tools/call",
                              "params": {"name": tool, "arguments": arguments}}).encode()
        headers = {"Authorization": f"Bearer {self.api_key}",
                   "Content-Type": "application/json",
                   "Accept": "application/json, text/event-stream"}
        body = self.transport(self.url, payload, headers).decode("utf-8")
        lines = [line[6:] for line in body.splitlines() if line.startswith("data: ")]
        if not lines:
            raise VidiqError(f"{tool} returned no SSE data: {body[:300]}")
        message = json.loads(lines[-1])
        if "error" in message:
            raise VidiqError(f"{tool} error: {message['error']}")
        result = message.get("result") or {}
        if result.get("isError"):
            texts = " ".join(c.get("text", "") for c in result.get("content") or [])
            raise VidiqError(f"{tool} tool error: {texts[:300]}")
        return result

    def call(self, tool: str, arguments: dict) -> dict:
        result = self._envelope(tool, arguments)
        if "structuredContent" in result:
            return result["structuredContent"]
        content = result.get("content") or []
        if content and content[0].get("type") == "text":
            text = content[0].get("text") or "{}"
            try:
                return json.loads(text)
            except json.JSONDecodeError as exc:
                raise VidiqError(f"{tool} returned non-JSON text: {text[:200]}") from exc
        return result

    def call_text(self, tool: str, arguments: dict) -> str:
        content = self._envelope(tool, arguments).get("content") or []
        if content and content[0].get("type") == "text":
            return content[0].get("text") or ""
        raise VidiqError(f"{tool} returned no text content")


def client_from_env() -> VidIQ:
    config.load_env()
    import os
    return VidIQ(config.require_env("VIDIQ_API_KEY"),
                 os.environ.get("MCP_VIDIQ_URL") or DEFAULT_URL)


def balance(client: VidIQ) -> dict:
    """Free. totalCredits = renewableCredits + addOnCredits."""
    return client.call("vidiq_balance", {})


class CostGuard:
    def __init__(self, balance: int, reserve: int = DEFAULT_RESERVE,
                 ceiling: int = DEFAULT_CEILING):
        self.balance = balance
        self.reserve = reserve
        self.ceiling = ceiling
        self.spent = 0

    def check(self, cost: int, label: str) -> None:
        if cost > self.ceiling:
            raise CostGuardError(
                f"{label} costs {cost}, over the {self.ceiling}-credit per-run ceiling")
        if self.balance - self.spent - cost < self.reserve:
            raise CostGuardError(
                f"{label} costs {cost}, which breaks the {self.reserve}-credit reserve "
                f"(balance {self.balance - self.spent})")

    def record(self, cost: int) -> None:
        self.spent += cost

    def preview(self, rows: list[tuple[str, int]]) -> str:
        """The free pre-flight table. Printed before anything is spent, every time."""
        total = sum(cost for _, cost in rows)
        lines = [f"{'call':<34}{'credits':>9}"]
        lines += [f"{label:<34}{cost:>9}" for label, cost in rows]
        lines.append(f"{'total':<34}{total:>9}")
        lines.append(f"{'balance now':<34}{self.balance:>9}")
        lines.append(f"{'balance after':<34}{self.balance - total:>9}")
        lines.append(f"{'reserve floor':<34}{self.reserve:>9}")
        return "\n".join(lines)


def _history_rows(payload: dict) -> list[dict]:
    """vidIQ has returned this under a few keys; take the first list of dated points."""
    for key in ("history", "dailyStats", "daily", "series", "points"):
        rows = payload.get(key)
        if isinstance(rows, list) and rows:
            return rows
    raise VidiqError(f"no daily history in the reply, keys were {sorted(payload)}")


def channel_stats_series(client: VidIQ, channel_id: str, start: dt.date,
                         end: dt.date) -> list[dict]:
    """One call, ~365 consecutive daily points, tagged and monotonicity-filtered."""
    payload = client.call("vidiq_channel_stats", {
        "channelId": channel_id, "from": util.date_str(start), "to": util.date_str(end)})
    rows = []
    for point in _history_rows(payload):
        subscribers = point.get("subscribers", point.get("subscriberCount"))
        rows.append({
            "date": str(point.get("date"))[:10],
            "status": "ok",
            "view_count": point.get("views", point.get("viewCount")),
            "subscriber_count": subscribers,
            "subscriber_bucket": growth.bucket_width(subscribers),
            "video_count": point.get("videos", point.get("videoCount")),
            "source": "vidiq_backfill",
        })
    return growth.filter_monotonic(rows)


def merge_backfill(existing: list[dict], bought: list[dict]) -> list[dict]:
    """A point we snapshotted ourselves always wins. The source tag is what makes that auditable."""
    by_date = {row["date"]: row for row in bought}
    by_date.update({row["date"]: row for row in existing})
    return [by_date[d] for d in sorted(by_date)]


def backfill(roster: list[dict], client: VidIQ, guard: CostGuard, days: int = 365,
             today: dt.date | None = None, dry_run: bool = True) -> dict:
    """Buy the daily history for every roster channel. 5 credits each, 360 for 72, once."""
    today = today or util.today()
    start = today - dt.timedelta(days=days)
    cost = CHANNEL_STATS_COST * len(roster)
    print(guard.preview([(f"vidiq_channel_stats x{len(roster)}", cost)]))
    if dry_run:
        return {"channels": len(roster), "credits": cost, "spent": 0, "dry_run": True}

    written = 0
    for row in roster:
        guard.check(CHANNEL_STATS_COST, f"channel_stats {row['handle']}")
        series = channel_stats_series(client, row["channel_id"], start, today)
        guard.record(CHANNEL_STATS_COST)
        path = config.raw_dir() / "backfill" / f"{row['channel_id']}.json"
        util.write_json(path, {"channel_id": row["channel_id"], "series": series})
        written += 1
    return {"channels": written, "credits": cost, "spent": guard.spent, "dry_run": False}


def keyword_sweep(leaf_topics: list, client: VidIQ, guard: CostGuard,
                  today: dt.date, dry_run: bool = True) -> dict:
    """Weekly search volume, one call per LEAF. Parents are never swept: they are not filmable."""
    cost = KEYWORD_COST * len(leaf_topics)
    print(guard.preview([(f"vidiq_keyword_research x{len(leaf_topics)}", cost)]))
    if dry_run:
        return {"topics": len(leaf_topics), "credits": cost, "spent": 0, "dry_run": True}

    volumes: dict[str, dict] = {}
    for topic in leaf_topics:
        guard.check(KEYWORD_COST, f"keyword {topic.id}")
        payload = client.call("vidiq_keyword_research",
                              {"keyword": topic.label, "includeRelated": False})
        guard.record(KEYWORD_COST)
        volume = payload.get("estimatedMonthlySearches")
        volumes[topic.id] = {"keyword": topic.label,
                             "volume": int(volume) if volume is not None else None,
                             "state": "ok" if volume is not None else "unavailable"}
    util.write_json(config.raw_dir() / "keywords" / f"{util.date_str(today)}.json",
                    {"date": util.date_str(today), "volumes": volumes})
    return {"topics": len(volumes), "credits": cost, "spent": guard.spent, "dry_run": False}
```

- [ ] **Step 4: Run the tests**

Run: `pytest pipeline/test_vidiq.py -v`
Expected: PASS, 9 tests.

- [ ] **Step 5: Preview the real bill, then spend**

Run the dry run first. It costs nothing and prints the table.

```bash
python3 -c "from pipeline import config, vidiq; c=vidiq.client_from_env(); \
b=vidiq.balance(c); print(b); \
vidiq.backfill(config.roster(), c, vidiq.CostGuard(b['totalCredits'], 200, 400), dry_run=True)"
```

Expected: a balance near 1,141 and a preview reading `vidiq_channel_stats x72  360`, `balance after 781`.

The per-run ceiling of 400 covers 360 in one go. Re-run with `dry_run=False` **only after Eric has seen the preview and said go**. Then confirm the ledger: balance before minus balance after must equal 360.

- [ ] **Step 6: Verify the bought history merged cleanly**

```bash
python3 -c "from pipeline import config, util; import pathlib; \
files=sorted((config.raw_dir()/'backfill').glob('*.json')); \
print(len(files),'channels'); \
s=util.read_json(files[0])['series']; \
print(len(s),'points', s[0]['date'],'->',s[-1]['date'], \
sum(1 for r in s if r['status']=='corrupt'),'corrupt')"
```

Expected: 72 channels, roughly 365 points each, and a small or zero corrupt count.

- [ ] **Step 7: Commit**

```bash
rtk git add pipeline/vidiq.py pipeline/test_vidiq.py
rtk git commit -m "feat(vidiq): MCP client, cost guard, 360-credit history backfill, keyword sweep"
```

---

### Task 10: Multipliers from free exact view counts

**Files:**
- Create: `pipeline/multiplier.py`
- Create: `pipeline/test_multiplier.py`

**Interfaces:**
- Consumes: `config.thresholds()["multiplier"]`, the video registry rows from Task 6.
- Produces:
  - `multiplier.baseline(videos, kind, today, thresholds) -> dict` with `state` in `ok | no_baseline`, plus `value` and `n`
  - `multiplier.baselines(videos, today, thresholds) -> dict[str, dict]` keyed `short` and `long`
  - `multiplier.for_video(video, baselines) -> dict` matching `videos.json`'s `multiplier` block: `{"value", "state", "baseline", "baseline_n", "source": "computed"}`

`vidiq_outliers` is dropped and nothing here may reintroduce it: it returns a capped global top-100, drops Shorts entirely, and squeezes out exactly the small channels the feature exists to find.

- [ ] **Step 1: Write the failing tests**

`pipeline/test_multiplier.py`:

```python
import datetime as dt

from pipeline import multiplier
from pipeline.conftest import FIXTURE_THRESHOLDS as T

TODAY = dt.date(2026, 7, 27)
M = T["multiplier"]


def video(vid, views, kind="long", days_old=60):
    published = (TODAY - dt.timedelta(days=days_old)).isoformat() + "T00:00:00Z"
    return {"video_id": vid, "view_count": views, "type": kind, "published_at": published}


def test_the_baseline_is_the_median_of_the_last_twenty_mature_uploads():
    videos = [video(f"v{i}", 1000 * i, days_old=100 - i) for i in range(1, 26)]
    got = multiplier.baseline(videos, "long", TODAY, M)
    assert got["state"] == "ok" and got["n"] == 20
    assert got["value"] == 15500          # median of the 20 newest mature uploads


def test_videos_younger_than_maturity_days_are_excluded():
    """A three-day-old upload has not accumulated views and would drag the baseline down."""
    mature = [video(f"v{i}", 30000, days_old=30) for i in range(6)]
    fresh = [video("brand-new", 12, days_old=3)]
    got = multiplier.baseline(mature + fresh, "long", TODAY, M)
    assert got["value"] == 30000 and got["n"] == 6


def test_shorts_and_long_form_get_separate_baselines():
    videos = ([video(f"L{i}", 100000, "long") for i in range(6)]
              + [video(f"S{i}", 4000, "short") for i in range(6)])
    got = multiplier.baselines(videos, TODAY, M)
    assert got["long"]["value"] == 100000
    assert got["short"]["value"] == 4000


def test_too_few_mature_uploads_is_no_baseline_and_never_low():
    videos = [video(f"v{i}", 30000) for i in range(4)]        # baseline_min_videos is 5
    got = multiplier.baseline(videos, "long", TODAY, M)
    assert got == {"state": "no_baseline", "value": None, "n": 4}


def test_a_video_with_no_baseline_is_unknown_not_zero():
    baselines = {"long": {"state": "no_baseline", "value": None, "n": 2},
                 "short": {"state": "no_baseline", "value": None, "n": 0}}
    got = multiplier.for_video(video("v1", 146102), baselines)
    assert got == {"value": None, "state": "no_baseline", "baseline": None,
                   "baseline_n": 2, "source": "computed"}


def test_the_multiplier_is_views_over_the_matching_baseline():
    baselines = {"long": {"state": "ok", "value": 30400, "n": 20},
                 "short": {"state": "ok", "value": 5000, "n": 20}}
    got = multiplier.for_video(video("v1", 146102), baselines)
    assert round(got["value"], 1) == 4.8 and got["baseline"] == 30400
    assert got["state"] == "ok" and got["source"] == "computed"


def test_a_short_is_measured_against_the_short_baseline():
    baselines = {"long": {"state": "ok", "value": 30400, "n": 20},
                 "short": {"state": "ok", "value": 5000, "n": 20}}
    got = multiplier.for_video(video("s1", 15000, "short"), baselines)
    assert got["value"] == 3.0 and got["baseline"] == 5000
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest pipeline/test_multiplier.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'pipeline.multiplier'`.

- [ ] **Step 3: Write `pipeline/multiplier.py`**

```python
"""A video's views over its channel's own baseline. Free, exact, and computed at every window.

Nothing paid can improve this: viewCount is exact, and the multiplier is built from it.
Shorts and long-form carry separate baselines because mixing two distributions makes both wrong.
"""
from __future__ import annotations

import datetime as dt
import statistics

from . import util

KINDS = ("long", "short")


def baseline(videos: list[dict], kind: str, today: dt.date, thresholds: dict) -> dict:
    """Median view count of the last baseline_n mature uploads of one kind."""
    mature = [
        v for v in videos
        if v.get("type") == kind
        and v.get("view_count") is not None
        and util.days_between(util.parse_ts(v["published_at"]).date(), today)
        >= thresholds["maturity_days"]
    ]
    mature.sort(key=lambda v: v["published_at"], reverse=True)
    sample = mature[:thresholds["baseline_n"]]
    if len(sample) < thresholds["baseline_min_videos"]:
        return {"state": "no_baseline", "value": None, "n": len(sample)}
    return {"state": "ok",
            "value": statistics.median(v["view_count"] for v in sample),
            "n": len(sample)}


def baselines(videos: list[dict], today: dt.date, thresholds: dict) -> dict[str, dict]:
    return {kind: baseline(videos, kind, today, thresholds) for kind in KINDS}


def for_video(video: dict, channel_baselines: dict[str, dict]) -> dict:
    """The videos.json multiplier block. no_baseline renders as unknown, never as low."""
    base = channel_baselines.get(video.get("type"), {"state": "no_baseline", "value": None, "n": 0})
    if base["state"] != "ok" or video.get("view_count") is None:
        return {"value": None, "state": "no_baseline", "baseline": None,
                "baseline_n": base.get("n", 0), "source": "computed"}
    return {"value": video["view_count"] / base["value"], "state": "ok",
            "baseline": base["value"], "baseline_n": base["n"], "source": "computed"}
```

- [ ] **Step 4: Run the tests**

Run: `pytest pipeline/test_multiplier.py -v`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
rtk git add pipeline/multiplier.py pipeline/test_multiplier.py
rtk git commit -m "feat(multiplier): split short and long baselines computed from exact view counts"
```

---

### Task 11: Per-video traction and `still pulling views`

**Files:**
- Create: `pipeline/traction.py`
- Create: `pipeline/test_traction.py`

**Interfaces:**
- Consumes: `growth.delta`, `growth.delta_24h`, `config.thresholds()["traction"]`.
- Produces:
  - `traction.for_video(series, total_views, today, thresholds) -> dict` matching `videos.json`'s `traction` block: `{"views_gained": {"24h", "7d", "30d"}, "share_recent_7d", "still_growing"}`

**Both conditions, never one:** `views_gained(7d) >= 500` **and** `share_recent_7d >= 0.02`. The second is what separates a genuinely resurgent old video from a 150,000-view back-catalogue video trickling 300 a week. When the 7d window is incomplete, `still_growing` is `None`, not `False`: unmeasured is a state.

- [ ] **Step 1: Write the failing tests**

`pipeline/test_traction.py`:

```python
import datetime as dt

from pipeline import traction
from pipeline.conftest import FIXTURE_THRESHOLDS as T

TODAY = dt.date(2026, 7, 27)
TR = T["traction"]


def series(values, start=dt.date(2026, 6, 28)):
    return [{"date": (start + dt.timedelta(days=i)).isoformat(), "status": "ok",
             "view_count": v} for i, v in enumerate(values)]


def test_views_gained_is_reported_for_all_three_windows():
    s = series(list(range(100000, 100030)))          # 30 consecutive days, +1/day
    got = traction.for_video(s, total_views=100029, today=TODAY, thresholds=TR)
    assert got["views_gained"]["24h"]["value"] == 1
    assert got["views_gained"]["7d"]["value"] == 6
    assert got["views_gained"]["30d"]["value"] == 29


def test_a_launch_week_video_is_still_growing():
    s = series([140000 + i * 900 for i in range(30)])
    got = traction.for_video(s, total_views=166100, today=TODAY, thresholds=TR)
    assert got["views_gained"]["7d"]["value"] == 5400
    assert round(got["share_recent_7d"], 3) == 0.033
    assert got["still_growing"] is True


def test_a_big_back_catalogue_video_trickling_is_not_growing():
    """150,000 views gaining 300 a week clears neither bar it needs to clear."""
    s = series([150000 + i * 43 for i in range(30)])
    got = traction.for_video(s, total_views=151247, today=TODAY, thresholds=TR)
    assert got["views_gained"]["7d"]["value"] == 258
    assert got["still_growing"] is False


def test_volume_alone_is_not_enough_without_share():
    """+600 in a week on a 1,000,000-view video is 0.06%, under the 2% floor."""
    s = series([1000000 + i * 100 for i in range(30)])
    got = traction.for_video(s, total_views=1002900, today=TODAY, thresholds=TR)
    assert got["views_gained"]["7d"]["value"] == 600
    assert got["share_recent_7d"] < 0.02
    assert got["still_growing"] is False


def test_share_alone_is_not_enough_without_volume():
    """A tiny video can clear 2% on 70 views, which is noise."""
    s = series([1000 + i * 10 for i in range(30)])
    got = traction.for_video(s, total_views=1290, today=TODAY, thresholds=TR)
    assert got["share_recent_7d"] >= 0.02
    assert got["views_gained"]["7d"]["value"] < 500
    assert got["still_growing"] is False


def test_an_incomplete_seven_day_window_leaves_still_growing_unknown():
    s = series([140000, 141000, 142000], start=dt.date(2026, 7, 25))
    got = traction.for_video(s, total_views=142000, today=TODAY, thresholds=TR)
    assert got["views_gained"]["7d"]["state"] == "building"
    assert got["still_growing"] is None
    assert got["share_recent_7d"] is None


def test_a_deleted_video_with_no_usable_points_is_insufficient_not_zero():
    s = [{"date": "2026-07-27", "status": "absent", "view_count": None}]
    got = traction.for_video(s, total_views=None, today=TODAY, thresholds=TR)
    assert got["views_gained"]["7d"]["state"] == "insufficient_data"
    assert got["still_growing"] is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest pipeline/test_traction.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'pipeline.traction'`.

- [ ] **Step 3: Write `pipeline/traction.py`**

```python
"""Per-video traction. Free and exact, because it is built from daily videos.list counts.

still_growing needs BOTH conditions. Volume alone promotes any large back catalogue; share alone
promotes noise on a tiny video.
"""
from __future__ import annotations

import datetime as dt

from . import growth


def for_video(series: list[dict], total_views: int | None, today: dt.date,
              thresholds: dict) -> dict:
    gained = {
        "24h": growth.delta_24h(series, "view_count", today),
        "7d": growth.delta(series, "view_count", 7, today),
        "30d": growth.delta(series, "view_count", 30, today),
    }
    week = gained["7d"]
    share = None
    if week["state"] == "ok" and total_views:
        share = week["value"] / total_views

    if week["state"] != "ok" or share is None:
        still_growing = None                       # unmeasured, not False
    else:
        still_growing = (week["value"] >= thresholds["still_growing_min_views_7d"]
                         and share >= thresholds["still_growing_min_share_7d"])

    return {"views_gained": gained, "share_recent_7d": share, "still_growing": still_growing}
```

- [ ] **Step 4: Run the tests**

Run: `pytest pipeline/test_traction.py -v`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
rtk git add pipeline/traction.py pipeline/test_traction.py
rtk git commit -m "feat(traction): per-video views gained and the two-condition still_growing"
```

---

### Task 12: Comment ingest, the lag column, `answered`, and the resumable ledger

Comments moved from step 10 to step 6 because they are nearly free (1 unit per 100), they feed the channel page, and the corpus has to be warm long before the unserved-branch check.

**Files:**
- Create: `pipeline/comments.py`
- Create: `pipeline/test_comments.py`

**Interfaces:**
- Consumes: `youtube.YouTube.comment_threads`, `config.thresholds()["comments"]`, `config.self_channel()`.
- Produces:
  - `comments.normalize(thread, video, self_channel_id) -> dict` (one root comment row)
  - `comments.lag_days(comment_published_at, video_published_at) -> int` (never negative)
  - `comments.is_answered(thread, self_channel_id) -> bool` (detected, never declared)
  - `comments.store_path(channel_id) -> pathlib.Path` (`_raw/comments/<channel_id>.jsonl`)
  - `comments.append_new(channel_id, rows) -> int` (dedupes on `comment_id`)
  - `comments.load(channel_id) -> dict[str, dict]`
  - `comments.Ledger(path)` with `.done(video_id) -> bool`, `.mark(video_id, count)`, `.save()`
  - `comments.ingest(videos, api, ledger, thresholds, self_channel_id, quota_cap) -> dict` (resumable, stops cleanly at the cap)
  - `comments.qualifies_for_classification(row, thresholds) -> bool` (likes floor **or** replies floor)

A row carries `category: None` until step 12's classifier runs. It renders as `unsorted`, never hidden. `lag_days` is pure subtraction of two Oracle timestamps, so it is Derived and free, and the UI renders it **instead of** the comment's absolute date.

- [ ] **Step 1: Write the failing tests**

`pipeline/test_comments.py`:

```python
import datetime as dt
import json

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest pipeline/test_comments.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'pipeline.comments'`.

- [ ] **Step 3: Write `pipeline/comments.py`**

```python
"""Comment ingest. Nearly free: commentThreads.list is 1 unit per 100 roots.

Two rules the schema enforces rather than the UI:
  a category never ships without the comment text beside it, and
  recency renders as lag from the video's publish date, never as an absolute date.
"""
from __future__ import annotations

import pathlib

from . import config, util


def store_path(channel_id: str) -> pathlib.Path:
    return config.raw_dir() / "comments" / f"{channel_id}.jsonl"


def ledger_path() -> pathlib.Path:
    return config.raw_dir() / "comments" / "_ledger.json"


def lag_days(comment_published_at: str, video_published_at: str) -> int:
    """Days between the video going up and the comment being posted. Never negative."""
    return max(0, util.days_between(util.parse_ts(video_published_at),
                                    util.parse_ts(comment_published_at)))


def is_answered(thread: dict, self_channel_id: str) -> bool:
    """Detected, never declared. The sweep already reads threads, so this costs nothing extra."""
    replies = (thread.get("replies") or {}).get("comments") or []
    return any((r.get("snippet", {}).get("authorChannelId") or {}).get("value") == self_channel_id
               for r in replies)


def normalize(thread: dict, video: dict, self_channel_id: str) -> dict:
    top = thread["snippet"]["topLevelComment"]
    snippet = top["snippet"]
    published = snippet.get("publishedAt")
    return {
        "comment_id": top.get("id") or thread["id"],
        "video_id": video["video_id"],
        "channel_id": video.get("channel_id"),
        "video_title": video.get("title"),
        "video_url": f"https://youtu.be/{video['video_id']}",
        "video_published_at": video.get("published_at"),
        "author": snippet.get("authorDisplayName"),
        "author_channel_id": (snippet.get("authorChannelId") or {}).get("value"),
        "text": snippet.get("textOriginal") or "",
        "like_count": snippet.get("likeCount") or 0,
        "reply_count": thread["snippet"].get("totalReplyCount") or 0,
        "published_at": published,
        "answered": is_answered(thread, self_channel_id),
        "lag_days": lag_days(published, video["published_at"]),
        "topic_ids": list(video.get("topic_ids") or []),
        "category": None,        # step 12 fills this. Until then the row renders as "unsorted".
    }


def load(channel_id: str) -> dict[str, dict]:
    return {row["comment_id"]: row for row in util.read_jsonl(store_path(channel_id))}


def append_new(channel_id: str, rows: list[dict]) -> int:
    """Append rows whose comment_id is not already held. Returns how many landed."""
    known = set(load(channel_id))
    written = 0
    for row in rows:
        if row["comment_id"] in known:
            continue
        util.append_jsonl(store_path(channel_id), row)
        known.add(row["comment_id"])
        written += 1
    return written


class Ledger:
    """Which videos have had their comments pulled. Makes a 3,600-video backfill killable."""

    def __init__(self, path: pathlib.Path | None = None):
        self.path = path or ledger_path()
        self.rows: dict[str, dict] = dict(util.read_json(self.path, default={}))

    def done(self, video_id: str) -> bool:
        return video_id in self.rows

    def mark(self, video_id: str, count: int) -> None:
        self.rows[video_id] = {"comments": count}

    def save(self) -> None:
        util.write_json(self.path, self.rows)


def qualifies_for_classification(row: dict, comment_thresholds: dict) -> bool:
    """The classification floor is likes OR replies. Everything below renders as unsorted."""
    return (row.get("like_count", 0) >= comment_thresholds["classify_min_likes"]
            or row.get("reply_count", 0) >= comment_thresholds["classify_min_replies"])


def ingest(videos: list[dict], api, ledger: Ledger, comment_thresholds: dict,
           self_channel_id: str, quota_cap: int) -> dict:
    """Fetch roots for every video not already in the ledger, stopping cleanly at the cap."""
    fetched = new_rows = 0
    stopped = False
    for video in videos:
        if ledger.done(video["video_id"]):
            continue
        if fetched >= quota_cap:
            stopped = True
            break
        threads = api.comment_threads(video["video_id"], comment_thresholds["roots_per_video"])
        rows = [normalize(t, video, self_channel_id) for t in threads]
        new_rows += append_new(video["channel_id"], rows)
        ledger.mark(video["video_id"], len(rows))
        fetched += 1
    return {"videos_fetched": fetched, "comments_new": new_rows, "stopped_on_cap": stopped}
```

- [ ] **Step 4: Run the tests**

Run: `pytest pipeline/test_comments.py -v`
Expected: PASS, 10 tests.

- [ ] **Step 5: Wire ingest into the daily sweep**

In `pipeline/snapshot.py`'s `run()`, after the video snapshot is written and before `ledger.save()`:

```python
    from . import comments as comments_module
    self_row = config.self_channel(roster)
    comment_ledger = comments_module.Ledger()
    all_videos = [
        {**row, "video_id": vid}
        for r in roster
        for vid, row in registry(r["channel_id"]).items()
    ]
    remaining = youtube.DAILY_BUDGET - ledger.total - 500        # keep 500 units in hand
    comment_summary = comments_module.ingest(
        all_videos, api, comment_ledger, config.thresholds()["comments"],
        self_row["channel_id"], quota_cap=max(0, remaining))
    comment_ledger.save()
```

and add `"comments": comment_summary` to the returned summary.

The one-time backfill is roughly 3,600 units and fits inside a single day, but the ledger means a kill costs nothing: the next run resumes where it stopped.

- [ ] **Step 6: Run the sweep and watch the quota**

Run: `python3 -m pipeline.snapshot`
Expected: `units` under 4,000 on the first comment-backfill day, under 250 in steady state, and `comments: {'videos_fetched': N, ...}`.

- [ ] **Step 7: Commit**

```bash
rtk git add pipeline/comments.py pipeline/test_comments.py pipeline/snapshot.py
rtk git commit -m "feat(comments): resumable ingest, lag column, answered detection"
```

---

### Task 13: GitHub velocity, the indie score, caps, and backoff

GitHub star velocity is **the only leading signal in the product**. Every YouTube signal is lagging by construction: a video existing means someone already made it.

**Files:**
- Create: `pipeline/github.py`
- Create: `pipeline/test_github.py`

**Interfaces:**
- Consumes: `config.require_env("GITHUB_TOKEN")`, `config.thresholds()["github"]`, `config.excluded_repo_ids()`, `topics.leaves()`.
- Produces:
  - `github.GitHub(token, transport=None)` with `.search_repositories(query, page) -> dict`, `.repo(repo_id) -> dict`, `.contributor_count(full_name) -> int | None`
  - `github.velocity(stars, age_days, github_thresholds) -> float`
  - `github.indie_score(owner_type, contributors, indie_thresholds) -> dict` (`{"score", "owner_type", "contributors", "trust": "derived"}`)
  - `github.build_queries(leaf_topics, today, github_thresholds) -> list[str]`
  - `github.normalize(item, today, github_thresholds) -> dict` (keyed on numeric `github_id`, never `full_name`)
  - `github.sweep(client, queries, today, github_thresholds, excluded_ids) -> dict` (`{"repos": [...], "partial_run": bool, "queries_run": int}`)
  - `github.link_topics(repos, topic_index) -> dict[str, list[dict]]` (topic_id -> repos, via the same alias matcher videos use)
  - `github.RateLimited(RuntimeError)`

**Two non-negotiables.** Repos key on the numeric `id`: a rename changes `full_name`, which forks the star history and reads as a brand-new spike, firing a false `MAKE_THIS_NOW`. And `age_days_floor` is 1 because a repo created today has `age_days == 0`, and `stars / 0` is infinity, which sorts first forever.

**The indie score ranks, it never filters.** A silent drop is the same class of error as rendering missing data as zero.

- [ ] **Step 1: Write the failing tests**

`pipeline/test_github.py`:

```python
import datetime as dt
import json

import pytest

from pipeline import github, topics
from pipeline.conftest import FIXTURE_THRESHOLDS as T

TODAY = dt.date(2026, 7, 27)
G = T["github"]


def item(repo_id=123456, full_name="x/mcp-registry", stars=12496,
         created="2026-06-10T00:00:00Z", owner_type="Organization",
         description="an mcp registry", topic_list=("ai", "mcp")):
    return {"id": repo_id, "full_name": full_name, "stargazers_count": stars,
            "created_at": created, "owner": {"type": owner_type, "login": full_name.split("/")[0]},
            "description": description, "topics": list(topic_list),
            "html_url": f"https://github.com/{full_name}"}


class FakeTransport:
    def __init__(self, pages, fail_with=None):
        self.pages = list(pages)
        self.fail_with = fail_with
        self.urls = []

    def __call__(self, url, headers):
        self.urls.append(url)
        if self.fail_with and len(self.urls) > self.fail_with["after"]:
            raise github.RateLimited("secondary rate limit")
        return json.dumps(self.pages.pop(0)).encode()


def test_velocity_is_stars_over_age_with_a_one_day_floor():
    assert round(github.velocity(12496, 47, G), 1) == 265.9
    assert github.velocity(500, 0, G) == 500.0        # never infinity, never top of the table
    assert github.velocity(198246, 2593, G) < 80


def test_an_evergreen_cannot_be_returned_because_the_query_excludes_it():
    queries = github.build_queries([], TODAY, G)
    assert all("created:>2026-04-28" in q for q in queries)


def test_queries_are_capped_and_derive_from_leaf_aliases(ait_root):
    leaves = topics.leaves(topics.load())
    queries = github.build_queries(leaves, TODAY, {**G, "max_queries_per_run": 3})
    assert len(queries) == 3
    assert all("stars:>=100" in q for q in queries)


def test_a_repo_is_keyed_on_its_numeric_id_never_full_name():
    row = github.normalize(item(), TODAY, G)
    assert row["github_id"] == 123456
    renamed = github.normalize(item(full_name="x/mcp-registry-v2"), TODAY, G)
    assert renamed["github_id"] == row["github_id"]


def test_normalize_computes_age_and_velocity():
    row = github.normalize(item(created="2026-06-10T00:00:00Z"), TODAY, G)
    assert row["age_days"] == 47
    assert round(row["velocity"], 1) == 265.9


def test_the_indie_score_is_a_number_and_never_a_gate():
    user_repo = github.indie_score("User", 3, G["indie"])
    org_repo = github.indie_score("Organization", 9, G["indie"])
    assert user_repo["score"] > org_repo["score"]
    assert 0.0 <= org_repo["score"] <= 1.0
    assert org_repo["trust"] == "derived"


def test_a_corporate_repo_is_scored_low_and_still_returned(ait_root):
    pages = [{"items": [item(owner_type="Organization", full_name="bigcorp/thing")]}]
    client = github.GitHub("TOKEN", transport=FakeTransport(pages))
    out = github.sweep(client, ["q"], TODAY, {**G, "max_pages_per_query": 1}, excluded_ids=set())
    assert len(out["repos"]) == 1              # scored, not filtered
    assert out["repos"][0]["indie"]["score"] < 1.0


def test_an_excluded_repo_id_is_dropped(ait_root):
    pages = [{"items": [item(repo_id=999), item(repo_id=123456)]}]
    client = github.GitHub("TOKEN", transport=FakeTransport(pages))
    out = github.sweep(client, ["q"], TODAY, {**G, "max_pages_per_query": 1},
                       excluded_ids={999})
    assert [r["github_id"] for r in out["repos"]] == [123456]


def test_zero_results_is_not_an_error(ait_root):
    client = github.GitHub("TOKEN", transport=FakeTransport([{"items": []}]))
    out = github.sweep(client, ["q"], TODAY, {**G, "max_pages_per_query": 1}, excluded_ids=set())
    assert out["repos"] == [] and out["partial_run"] is False


def test_a_403_backs_off_and_sets_partial_run(ait_root):
    pages = [{"items": [item()]}, {"items": [item(repo_id=2)]}]
    transport = FakeTransport(pages, fail_with={"after": 1})
    client = github.GitHub("TOKEN", transport=transport, sleep=lambda _: None)
    out = github.sweep(client, ["q1", "q2"], TODAY, {**G, "max_pages_per_query": 1},
                       excluded_ids=set())
    assert out["partial_run"] is True
    assert len(out["repos"]) == 1              # what was collected is kept, not discarded


def test_pages_are_capped_per_query(ait_root):
    pages = [{"items": [item(repo_id=i)]} for i in range(10)]
    transport = FakeTransport(pages)
    client = github.GitHub("TOKEN", transport=transport)
    github.sweep(client, ["q"], TODAY, {**G, "max_pages_per_query": 3}, excluded_ids=set())
    assert len(transport.urls) == 3


def test_repos_link_to_leaves_through_the_same_alias_matcher(ait_root):
    index = topics.load()
    repos = [github.normalize(item(full_name="x/mcp-registry",
                                   description="a model context protocol registry"), TODAY, G)]
    linked = github.link_topics(repos, index)
    assert linked["claude-code-mcp-setup"][0]["github_id"] == 123456
    assert "claude-code" not in linked          # parents are never linked
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest pipeline/test_github.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'pipeline.github'`.

- [ ] **Step 3: Write `pipeline/github.py`**

```python
"""GitHub REST: the velocity sweep and the indie signal. The only leading signal in the product.

stars_30d does not exist in the API, so the metric is new-repo velocity, which is free and
immediate. Two properties fall out of the created:> query for nothing: evergreens are excluded
by the query itself, and lifetime-average velocity self-corrects, because a young repo's average
is close to its current rate while an old repo's is dragged down by years of slow accumulation.
"""
from __future__ import annotations

import datetime as dt
import json
import time
import urllib.error
import urllib.parse
import urllib.request

from . import topics as topics_module
from . import util

API = "https://api.github.com"
SEARCH_SORT = "stars"

# Qualifiers scoping the sweep to this niche. A constant, not a threshold: changing it changes
# WHAT is looked at, not what a number means. Leaf aliases are appended to these.
TOPIC_QUALIFIERS = ("ai", "llm", "agents", "mcp", "rag", "automation", "ai-agents", "claude")

BACKOFF_SECONDS = (2, 8, 30)


class GitHubError(RuntimeError):
    pass


class RateLimited(RuntimeError):
    pass


def _default_transport(url: str, headers: dict) -> bytes:
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        if exc.code in (403, 429):
            raise RateLimited(f"HTTP {exc.code}: {exc.read().decode(errors='replace')[:200]}")
        raise GitHubError(f"HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise GitHubError(f"network error: {exc}") from exc


class GitHub:
    def __init__(self, token: str, transport=None, sleep=time.sleep):
        self.token = token
        self.transport = transport or _default_transport
        self.sleep = sleep

    def _get(self, path: str, params: dict | None = None) -> dict:
        url = f"{API}{path}"
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"
        headers = {"Accept": "application/vnd.github+json",
                   "User-Agent": "ai-influencers-tracker",
                   "X-GitHub-Api-Version": "2022-11-28"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return json.loads(self.transport(url, headers))

    def search_repositories(self, query: str, page: int = 1, per_page: int = 100) -> dict:
        return self._get("/search/repositories",
                         {"q": query, "sort": SEARCH_SORT, "order": "desc",
                          "per_page": per_page, "page": page})

    def repo(self, repo_id: int) -> dict:
        """By numeric id. A rename changes full_name; the id survives it."""
        return self._get(f"/repositories/{repo_id}")

    def contributor_count(self, full_name: str) -> int | None:
        try:
            rows = self._get(f"/repos/{full_name}/contributors", {"per_page": 100, "anon": "1"})
        except (GitHubError, RateLimited):
            return None
        return len(rows) if isinstance(rows, list) else None


def velocity(stars: int, age_days: int, github_thresholds: dict) -> float:
    """stars / max(age_days, floor). The floor is not cosmetic: stars/0 sorts first forever."""
    return stars / max(age_days, github_thresholds["age_days_floor"])


def indie_score(owner_type: str | None, contributors: int | None, indie_thresholds: dict) -> dict:
    """How grassroots a repo looks. It SCORES, it never filters: a silent drop is the same class
    of error as rendering missing data as zero."""
    bonus = indie_thresholds["user_owner_bonus"]
    owner_part = bonus if owner_type == "User" else bonus * (1 - indie_thresholds["corp_org_penalty"])
    if contributors is None:
        contributor_part = None
        score = owner_part
    else:
        full = indie_thresholds["max_contributors_for_full_score"]
        contributor_part = (1 - bonus) * min(1.0, full / max(contributors, 1))
        score = owner_part + contributor_part
    return {"score": round(min(1.0, max(0.0, score)), 2), "owner_type": owner_type,
            "contributors": contributors, "trust": "derived"}


def build_queries(leaf_topics: list, today: dt.date, github_thresholds: dict) -> list[str]:
    """created:> excludes every evergreen by construction, so no maintained list is needed."""
    since = util.date_str(today - dt.timedelta(days=github_thresholds["created_within_days"]))
    stars = github_thresholds["min_stars"]
    base = [f"created:>{since} stars:>={stars} topic:{q}" for q in TOPIC_QUALIFIERS]
    for topic in leaf_topics:
        for alias in topic.aliases[:1]:
            base.append(f"created:>{since} stars:>={stars} {alias} in:name,description")
    return base[:github_thresholds["max_queries_per_run"]]


def normalize(item: dict, today: dt.date, github_thresholds: dict) -> dict:
    created = util.parse_ts(item["created_at"]).date()
    age_days = max(0, util.days_between(created, today))
    stars = item.get("stargazers_count") or 0
    return {"github_id": item["id"], "full_name": item["full_name"],
            "url": item.get("html_url"), "description": item.get("description") or "",
            "repo_topics": item.get("topics") or [],
            "stars": stars, "created_at": item["created_at"], "age_days": age_days,
            "velocity": velocity(stars, age_days, github_thresholds),
            "owner_type": (item.get("owner") or {}).get("type"),
            "discovered_via": item.get("discovered_via", "search")}


def sweep(client: GitHub, queries: list[str], today: dt.date, github_thresholds: dict,
          excluded_ids: set[int], with_contributors: bool = False) -> dict:
    """Run the capped search sweep. A 403 backs off, then truncates and flags partial_run.

    Everything collected before the truncation is KEPT. Discarding it would turn a rate limit
    into missing data, and missing data is exactly what this project refuses to invent around.
    """
    seen: dict[int, dict] = {}
    partial = False
    queries_run = 0
    for query in queries:
        queries_run += 1
        for page in range(1, github_thresholds["max_pages_per_query"] + 1):
            try:
                data = _with_backoff(client, query, page)
            except RateLimited:
                partial = True
                return {"repos": _finish(seen, client, github_thresholds, with_contributors),
                        "partial_run": partial, "queries_run": queries_run}
            items = data.get("items") or []
            for item in items:
                if item["id"] in excluded_ids:
                    continue
                seen[item["id"]] = normalize(item, today, github_thresholds)
            if len(items) < 100:
                break
    return {"repos": _finish(seen, client, github_thresholds, with_contributors),
            "partial_run": partial, "queries_run": queries_run}


def _with_backoff(client: GitHub, query: str, page: int) -> dict:
    last: Exception | None = None
    for wait in BACKOFF_SECONDS:
        try:
            return client.search_repositories(query, page)
        except RateLimited as exc:
            last = exc
            client.sleep(wait)
    raise last if last else RateLimited("exhausted backoff")


def _finish(seen: dict[int, dict], client: GitHub, github_thresholds: dict,
            with_contributors: bool) -> list[dict]:
    rows = []
    for repo in sorted(seen.values(), key=lambda r: -r["velocity"]):
        contributors = client.contributor_count(repo["full_name"]) if with_contributors else None
        repo["indie"] = indie_score(repo["owner_type"], contributors, github_thresholds["indie"])
        rows.append(repo)
    return rows


def link_topics(repos: list[dict], topic_index: dict) -> dict[str, list[dict]]:
    """topic_id -> repos, using the same alias matcher videos use. Leaves only."""
    linked: dict[str, list[dict]] = {}
    for repo in repos:
        pseudo_video = {"video_id": repo["full_name"], "title": repo["full_name"],
                        "description": repo["description"],
                        "tags": repo.get("repo_topics", [])}
        for assignment in topics_module.match_video(pseudo_video, topic_index):
            linked.setdefault(assignment["topic_id"], []).append(repo)
    return linked
```

- [ ] **Step 4: Run the tests**

Run: `pytest pipeline/test_github.py -v`
Expected: PASS, 12 tests. If `test_the_indie_score_is_a_number_and_never_a_gate` disagrees with the fixture numbers, the formula is the source of truth and the doc example is not (conflict C3).

- [ ] **Step 5: Run one real sweep**

Requires `GITHUB_TOKEN`.

```bash
python3 -c "from pipeline import config, github, topics, util; import datetime as dt; \
config.load_env(); g=config.thresholds()['github']; \
c=github.GitHub(config.require_env('GITHUB_TOKEN')); \
q=github.build_queries(topics.leaves(topics.load()), util.today(), g); \
out=github.sweep(c, q, util.today(), g, config.excluded_repo_ids()); \
print(out['queries_run'],'queries,',len(out['repos']),'repos, partial:',out['partial_run']); \
[print(f\"{r['full_name']:<40}{r['velocity']:>8.1f}/day  {r['stars']:>7} stars  {r['age_days']:>4}d\") \
 for r in out['repos'][:10]]"
```

Expected: a top-10 by velocity, none older than 90 days, no `Infinity`, and `partial: False`.

- [ ] **Step 6: Commit**

```bash
rtk git add pipeline/github.py pipeline/test_github.py
rtk git commit -m "feat(github): capped velocity sweep, indie score, backoff and partial_run"
```

---

### Task 14: The GitHub Trending sweep, via Firecrawl

`github.com/trending` has **no API**, and it is a curated human artifact that the search API cannot express. It is also how new topics enter the system, because there is no proposal queue: Eric reviews the trending sweep and adds leaves to `config/topics.json` himself.

**Files:**
- Create: `pipeline/firecrawl.py`
- Create: `pipeline/test_firecrawl.py`
- Modify: `pipeline/snapshot.py` (add the GitHub half of the sweep)

**Interfaces:**
- Consumes: `config.require_env("FIRECRAWL_API_KEY")`, `github.GitHub.repo`.
- Produces:
  - `firecrawl.scrape_markdown(url, api_key, transport=None) -> str`
  - `firecrawl.parse_trending(markdown) -> list[str]` (owner/repo, in page order)
  - `firecrawl.trending_sweep(client, github_client, today, github_thresholds) -> dict` (`{"repos": [...], "ok": bool, "reason": str | None}`)
  - `snapshot.write_repo_snapshot(payload, today) -> pathlib.Path` (`_raw/repos/<date>.json`)

**A failed trending scrape is non-critical.** Discovery degrades, data stays clean. It sets `ok: False` with a reason and the sweep carries on with the search results. It must never raise into the daily job.

Endpoint, confirmed against the current Firecrawl docs: `POST https://api.firecrawl.dev/v2/scrape`, `Authorization: Bearer <key>`, body `{"url": ..., "formats": ["markdown"]}`, reply `{"data": {"markdown": "..."}}`.

- [ ] **Step 1: Write the failing tests**

`pipeline/test_firecrawl.py`:

```python
import datetime as dt
import json

from pipeline import firecrawl, github
from pipeline.conftest import FIXTURE_THRESHOLDS as T

TODAY = dt.date(2026, 7, 27)
G = T["github"]

TRENDING_MD = """
# Trending

[![](x)](/trending)

## [modelcontextprotocol / **registry**](/modelcontextprotocol/registry)

A community registry for MCP servers

Go  12,496 stars  1,204 stars today

## [someone / **agent-lab**](/someone/agent-lab)

Python  8,120 stars

## [Sign in](/login?return_to=%2Ftrending)
"""


def test_the_parser_finds_repos_and_ignores_chrome():
    assert firecrawl.parse_trending(TRENDING_MD) == [
        "modelcontextprotocol/registry", "someone/agent-lab"]


def test_the_parser_returns_empty_on_an_unrecognisable_page():
    assert firecrawl.parse_trending("# 502 Bad Gateway") == []


def test_scrape_unwraps_the_data_envelope():
    def transport(url, payload, headers):
        assert headers["Authorization"] == "Bearer KEY"
        assert json.loads(payload)["formats"] == ["markdown"]
        return json.dumps({"success": True, "data": {"markdown": "# hi"}}).encode()

    assert firecrawl.scrape_markdown("https://github.com/trending", "KEY", transport) == "# hi"


def test_a_failed_scrape_is_non_critical_and_never_raises(ait_root):
    def transport(url, payload, headers):
        raise firecrawl.FirecrawlError("502")

    out = firecrawl.trending_sweep(
        lambda url: firecrawl.scrape_markdown(url, "KEY", transport),
        github_client=None, today=TODAY, github_thresholds=G)
    assert out["ok"] is False and out["repos"] == []
    assert "502" in out["reason"]


def test_trending_repos_are_resolved_to_numeric_ids_and_tagged(ait_root):
    class FakeGitHub:
        def repo(self, ref):
            return {"id": 777, "full_name": ref, "stargazers_count": 12496,
                    "created_at": "2026-06-10T00:00:00Z",
                    "owner": {"type": "Organization"}, "topics": ["mcp"],
                    "description": "registry", "html_url": f"https://github.com/{ref}"}

        def contributor_count(self, full_name):
            return 9

    out = firecrawl.trending_sweep(lambda url: TRENDING_MD, FakeGitHub(), TODAY, G)
    assert out["ok"] is True
    assert out["repos"][0]["github_id"] == 777
    assert out["repos"][0]["discovered_via"] == "trending"
    assert out["repos"][0]["indie"]["contributors"] == 9
```

Note the third test resolves `/owner/name` through `GET /repos/{owner}/{repo}`, not `/repositories/{id}`, because trending only gives a path. The numeric id from that response is what everything downstream keys on. Add `GitHub.repo_by_name(full_name)` in Task 13's module if it is not already there:

```python
    def repo_by_name(self, full_name: str) -> dict:
        return self._get(f"/repos/{full_name}")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest pipeline/test_firecrawl.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'pipeline.firecrawl'`.

- [ ] **Step 3: Write `pipeline/firecrawl.py`**

```python
"""One Firecrawl call: github.com/trending, which has no API and is a curated human artifact.

This is additive to the search sweep, never a replacement: search finds new repos by stars and
cannot express "what is hot right now". Failure here is NON-CRITICAL by design.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import urllib.error
import urllib.request

from . import github as github_module

SCRAPE_URL = "https://api.firecrawl.dev/v2/scrape"
TRENDING_URLS = {
    "daily": "https://github.com/trending?since=daily",
    "weekly": "https://github.com/trending?since=weekly",
}

# GitHub renders each row as a heading link: [owner / **repo**](/owner/repo)
_ROW = re.compile(r"\]\(/([A-Za-z0-9][\w.-]*)/([\w.-]+)\)")
_CHROME = {"login", "trending", "collections", "topics", "sponsors", "features"}


class FirecrawlError(RuntimeError):
    pass


def _default_transport(url: str, payload: bytes, headers: dict) -> bytes:
    request = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        raise FirecrawlError(f"HTTP {exc.code}: {exc.read().decode(errors='replace')[:200]}") from exc
    except urllib.error.URLError as exc:
        raise FirecrawlError(f"network error: {exc}") from exc


def scrape_markdown(url: str, api_key: str, transport=None) -> str:
    transport = transport or _default_transport
    payload = json.dumps({"url": url, "formats": ["markdown"]}).encode()
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = json.loads(transport(SCRAPE_URL, payload, headers))
    markdown = (body.get("data") or {}).get("markdown")
    if markdown is None:
        raise FirecrawlError(f"no markdown in the reply: {str(body)[:200]}")
    return markdown


def parse_trending(markdown: str) -> list[str]:
    """owner/repo in page order, deduped, with GitHub's own navigation filtered out."""
    out: list[str] = []
    for owner, name in _ROW.findall(markdown):
        if owner in _CHROME or name in _CHROME:
            continue
        full_name = f"{owner}/{name}"
        if full_name not in out:
            out.append(full_name)
    return out


def trending_sweep(scraper, github_client, today: dt.date, github_thresholds: dict,
                   windows: tuple[str, ...] = ("daily", "weekly")) -> dict:
    """Scrape, resolve each repo to its numeric id, and score it. Never raises into the sweep."""
    names: list[str] = []
    try:
        for window in windows:
            names.extend(n for n in parse_trending(scraper(TRENDING_URLS[window]))
                         if n not in names)
    except Exception as exc:                              # non-critical by design
        return {"repos": [], "ok": False, "reason": f"{type(exc).__name__}: {exc}"}

    repos = []
    for full_name in names:
        try:
            item = github_client.repo_by_name(full_name)
        except Exception:
            continue
        item["discovered_via"] = "trending"
        row = github_module.normalize(item, today, github_thresholds)
        row["indie"] = github_module.indie_score(
            row["owner_type"], github_client.contributor_count(full_name),
            github_thresholds["indie"])
        repos.append(row)
    return {"repos": repos, "ok": True, "reason": None}
```

- [ ] **Step 4: Run the tests**

Run: `pytest pipeline/test_firecrawl.py -v`
Expected: PASS, 5 tests. Add `repo_by_name` to `pipeline/github.py` if the resolution test fails on it.

- [ ] **Step 5: Wire both GitHub passes into the daily sweep**

In `pipeline/snapshot.py`, add:

```python
def write_repo_snapshot(payload: dict, today: dt.date) -> pathlib.Path:
    path = config.raw_dir() / "repos" / f"{util.date_str(today)}.json"
    util.write_json(path, payload)
    return path
```

and in `run()`, after comment ingest:

```python
    from . import firecrawl, github as github_module, topics as topics_module
    github_thresholds = config.thresholds()["github"]
    gh = github_module.GitHub(os.environ.get("GITHUB_TOKEN", ""))
    leaf_topics = topics_module.leaves(topics_module.load())
    search = github_module.sweep(
        gh, github_module.build_queries(leaf_topics, today, github_thresholds),
        today, github_thresholds, config.excluded_repo_ids(), with_contributors=True)
    trending = firecrawl.trending_sweep(
        lambda url: firecrawl.scrape_markdown(url, os.environ.get("FIRECRAWL_API_KEY", "")),
        gh, today, github_thresholds)
    write_repo_snapshot({"date": util.date_str(today),
                         "search": search["repos"], "trending": trending["repos"],
                         "partial_run": search["partial_run"],
                         "trending_ok": trending["ok"], "trending_reason": trending["reason"]},
                        today)
```

Add `"partial_run": search["partial_run"]` and `"trending_ok": trending["ok"]` to the summary `run()` returns.

- [ ] **Step 6: Run the sweep end to end**

Run: `python3 -m pipeline.snapshot`
Expected: `_raw/repos/<today>.json` exists with a non-empty `search` list, `partial_run: false`, and `trending_ok: true`. If Firecrawl is down, the run still completes and `trending_ok` reads `false` with a reason, which is the required behaviour.

- [ ] **Step 7: Commit**

```bash
rtk git add pipeline/firecrawl.py pipeline/test_firecrawl.py pipeline/github.py pipeline/snapshot.py
rtk git commit -m "feat(github): trending sweep via Firecrawl, non-critical on failure"
```

---

### Task 15: The verdict grid

One supply vocabulary, one demand vocabulary, one cell. **Parents are never banded**: only leaves reach this function.

**Files:**
- Create: `pipeline/verdict.py`
- Create: `pipeline/test_verdict.py`

**Interfaces:**
- Consumes: `config.thresholds()["supply"]`, `["demand"]`.
- Produces:
  - `verdict.supply_band(videos, creators, supply_thresholds) -> dict` (`{"band", "videos", "creators", "window_days", "fired"}`)
  - `verdict.demand_band(keyword_volume, repo_velocity, demand_thresholds) -> dict` (`{"band", "keyword_volume", "repo_velocity", "fired"}`)
  - `verdict.decide(supply, demand) -> str`
  - `verdict.for_topic(topic, videos, creators, keyword_volume, repo_velocity, thresholds) -> dict`

```
                    OPEN             MID              CROWDED
  HIGH DEMAND    MAKE_THIS_NOW    MAKE_THIS_NOW    ONLY_IF_UNSERVED
  LOW  DEMAND    TOO_EARLY        TOO_EARLY        SKIP
  UNKNOWN                     INSUFFICIENT_DATA
```

Per conflict C1, `INSUFFICIENT_DATA` fires when an axis is **unknown**, not when the video count is low. `min_n.topic_page_min_videos` drives the topic page's own state instead, which is what renders *"1 video, need 3"*.

- [ ] **Step 1: Write the failing tests**

`pipeline/test_verdict.py`:

```python
import pytest

from pipeline import verdict
from pipeline.conftest import FIXTURE_THRESHOLDS as T

S, D = T["supply"], T["demand"]


def test_supply_bands_at_every_boundary():
    assert verdict.supply_band(0, 0, S)["band"] == "OPEN"
    assert verdict.supply_band(2, 2, S)["band"] == "OPEN"       # open_max_videos is 2
    assert verdict.supply_band(3, 2, S)["band"] == "MID"
    assert verdict.supply_band(4, 9, S)["band"] == "MID"
    assert verdict.supply_band(5, 3, S)["band"] == "CROWDED"    # both minimums must be met
    assert verdict.supply_band(5, 2, S)["band"] == "MID"        # creators short
    assert verdict.supply_band(9, 7, S)["band"] == "CROWDED"


def test_every_band_reports_the_comparison_that_fired():
    assert verdict.supply_band(2, 2, S)["fired"] == ["videos <= 2"]
    assert verdict.supply_band(9, 7, S)["fired"] == ["videos >= 5", "creators >= 3"]


def test_demand_is_high_on_either_axis():
    assert verdict.demand_band(8100, None, D)["band"] == "HIGH"
    assert verdict.demand_band(None, 266.0, D)["band"] == "HIGH"
    assert verdict.demand_band(100, 12.0, D)["band"] == "LOW"
    assert verdict.demand_band(5000, None, D)["fired"] == ["keyword_volume >= 5000"]
    assert verdict.demand_band(None, 100.0, D)["fired"] == ["repo_velocity >= 100.0"]


def test_demand_with_neither_axis_known_is_unknown_not_low():
    assert verdict.demand_band(None, None, D)["band"] == "UNKNOWN"


def test_all_six_cells_of_the_grid():
    grid = {
        ("HIGH", "OPEN"): "MAKE_THIS_NOW",
        ("HIGH", "MID"): "MAKE_THIS_NOW",
        ("HIGH", "CROWDED"): "ONLY_IF_UNSERVED",
        ("LOW", "OPEN"): "TOO_EARLY",
        ("LOW", "MID"): "TOO_EARLY",
        ("LOW", "CROWDED"): "SKIP",
    }
    for (demand, supply), expected in grid.items():
        assert verdict.decide({"band": supply}, {"band": demand}) == expected


def test_an_unknown_demand_axis_is_insufficient_data_in_every_supply_band():
    for supply in ("OPEN", "MID", "CROWDED"):
        assert verdict.decide({"band": supply}, {"band": "UNKNOWN"}) == "INSUFFICIENT_DATA"


def test_the_canonical_worked_example_lands_on_make_this_now():
    """2 videos / 90d, repo velocity 266. Spec §5's example, which must also score 71.9."""
    row = verdict.for_topic(topic_id="mcp-registry-integration", videos=2, creators=2,
                            keyword_volume=8100, repo_velocity=266.0, thresholds=T)
    assert row["verdict"] == "MAKE_THIS_NOW"
    assert row["supply"]["band"] == "OPEN" and row["demand"]["band"] == "HIGH"
    assert row["supply"]["window_days"] == 90


def test_a_low_video_count_does_not_by_itself_make_a_topic_insufficient():
    """Conflict C1: videos < 3 governs the TOPIC PAGE state, not the verdict."""
    row = verdict.for_topic("t", videos=1, creators=1, keyword_volume=8100,
                            repo_velocity=None, thresholds=T)
    assert row["verdict"] == "MAKE_THIS_NOW"


def test_a_parent_topic_can_never_be_banded():
    with pytest.raises(verdict.NotScoreable):
        verdict.for_topic("claude-code", videos=61, creators=22, keyword_volume=1,
                          repo_velocity=1, thresholds=T, is_leaf=False)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest pipeline/test_verdict.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'pipeline.verdict'`.

- [ ] **Step 3: Write `pipeline/verdict.py`**

```python
"""The verdict grid. One supply vocabulary, one demand vocabulary, one cell.

Only leaves reach this function. "Claude Code" can never win a MAKE_THIS_NOW, which is the
entire point of the tree having a leaf rule at all.
"""
from __future__ import annotations

GRID = {
    ("HIGH", "OPEN"): "MAKE_THIS_NOW",
    ("HIGH", "MID"): "MAKE_THIS_NOW",
    ("HIGH", "CROWDED"): "ONLY_IF_UNSERVED",
    ("LOW", "OPEN"): "TOO_EARLY",
    ("LOW", "MID"): "TOO_EARLY",
    ("LOW", "CROWDED"): "SKIP",
}
INSUFFICIENT = "INSUFFICIENT_DATA"


class NotScoreable(RuntimeError):
    pass


def supply_band(videos: int, creators: int, supply_thresholds: dict) -> dict:
    fired: list[str] = []
    open_max = supply_thresholds["open_max_videos"]
    crowded_videos = supply_thresholds["crowded_min_videos"]
    crowded_creators = supply_thresholds["crowded_min_creators"]
    if videos <= open_max:
        band = "OPEN"
        fired.append(f"videos <= {open_max}")
    elif videos >= crowded_videos and creators >= crowded_creators:
        band = "CROWDED"
        fired.extend([f"videos >= {crowded_videos}", f"creators >= {crowded_creators}"])
    else:
        band = "MID"
        fired.append(f"videos > {open_max}")
    return {"band": band, "videos": videos, "creators": creators,
            "window_days": supply_thresholds["window_days"], "fired": fired}


def demand_band(keyword_volume: int | None, repo_velocity: float | None,
                demand_thresholds: dict) -> dict:
    """HIGH on EITHER axis. Neither axis known is UNKNOWN, which is not the same as LOW."""
    min_volume = demand_thresholds["high_min_keyword_volume"]
    min_velocity = demand_thresholds["high_min_repo_velocity"]
    fired: list[str] = []
    if keyword_volume is None and repo_velocity is None:
        band = "UNKNOWN"
    else:
        if keyword_volume is not None and keyword_volume >= min_volume:
            fired.append(f"keyword_volume >= {min_volume}")
        if repo_velocity is not None and repo_velocity >= min_velocity:
            fired.append(f"repo_velocity >= {min_velocity}")
        band = "HIGH" if fired else "LOW"
        if not fired:
            fired.append(f"keyword_volume < {min_volume} and repo_velocity < {min_velocity}")
    return {"band": band, "keyword_volume": keyword_volume,
            "repo_velocity": repo_velocity, "fired": fired}


def decide(supply: dict, demand: dict) -> str:
    if demand["band"] == "UNKNOWN" or supply["band"] == "UNKNOWN":
        return INSUFFICIENT
    return GRID[(demand["band"], supply["band"])]


def for_topic(topic_id: str, videos: int, creators: int, keyword_volume: int | None,
              repo_velocity: float | None, thresholds: dict, is_leaf: bool = True) -> dict:
    if not is_leaf:
        raise NotScoreable(f"{topic_id} is a parent: parents are never scored or banded")
    supply = supply_band(videos, creators, thresholds["supply"])
    demand = demand_band(keyword_volume, repo_velocity, thresholds["demand"])
    return {"topic_id": topic_id, "supply": supply, "demand": demand,
            "verdict": decide(supply, demand)}
```

- [ ] **Step 4: Run the tests**

Run: `pytest pipeline/test_verdict.py -v`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
rtk git add pipeline/verdict.py pipeline/test_verdict.py
rtk git commit -m "feat(verdict): supply and demand bands with fired comparisons"
```

---

### Task 16: The 0 to 100 opportunity score, reproducing 71.9

Verdict and score answer different questions from the same four numbers and **cannot disagree**. Verdict is the cell, what kind of opportunity. Score is how strong.

**Files:**
- Create: `pipeline/score.py`
- Create: `pipeline/test_score.py`

**Interfaces:**
- Consumes: `config.thresholds()["scoring"]`, the verdict row from Task 15.
- Produces:
  - `score.normalize(key, raw, full_scale) -> float | None` (2 decimal places)
  - `score.component(key, raw, raw_label, source, scoring_thresholds) -> dict`
  - `score.compute(components, verdict_value) -> dict` (`{"value", "out_of", "components"}`)
  - `score.for_topic(verdict_row, inputs, thresholds) -> dict` where `inputs` is `{"repo_velocity", "keyword_volume", "supply_gap", "staleness"}`, each `None` when absent

**Rounding is part of the contract.** `norm` rounds to 2 decimal places, `points = norm * weight` rounds to 1, and `value` is the sum of the rounded points. That is what makes the canonical example land on exactly `71.9` rather than `71.8`. `decimal.ROUND_HALF_UP` is used so `20.75` becomes `20.8` deterministically instead of depending on binary float representation.

```
repo_velocity    min(1, stars_per_day / 300)          weight 40   the only leading signal
keyword_volume   min(1, volume / 15000)               weight 25
supply_gap       max(0, 1 - videos / 12)              weight 25
staleness        min(1, days_since_newest / 30)       weight 10   1.0 when there are zero videos
```

- [ ] **Step 1: Write the failing tests**

`pipeline/test_score.py`:

```python
import pytest

from pipeline import score, verdict
from pipeline.conftest import FIXTURE_THRESHOLDS as T

SC = T["scoring"]


def canonical_inputs():
    """The real 2026-07-27 numbers from spec §5."""
    return {"repo_velocity": 266.0, "keyword_volume": 8100,
            "supply_gap": 2, "staleness": 6}


def test_the_weights_sum_to_one_hundred():
    assert sum(SC["weights"].values()) == 100


def test_each_component_normalizes_and_caps_at_one():
    assert score.normalize("repo_velocity", 266.0, SC["full_scale"]) == 0.89
    assert score.normalize("repo_velocity", 9000.0, SC["full_scale"]) == 1.0
    assert score.normalize("keyword_volume", 8100, SC["full_scale"]) == 0.54
    assert score.normalize("keyword_volume", 99000, SC["full_scale"]) == 1.0
    assert score.normalize("supply_gap", 2, SC["full_scale"]) == 0.83
    assert score.normalize("supply_gap", 40, SC["full_scale"]) == 0.0
    assert score.normalize("staleness", 6, SC["full_scale"]) == 0.2
    assert score.normalize("staleness", 400, SC["full_scale"]) == 1.0


def test_the_worked_example_reproduces_71_point_9():
    """Declared canonical in spec §5: every bundle and every UI surface must reproduce this."""
    row = verdict.for_topic("mcp-registry-integration", videos=2, creators=2,
                            keyword_volume=8100, repo_velocity=266.0, thresholds=T)
    out = score.for_topic(row, canonical_inputs(), T)
    assert out["value"] == 71.9
    assert out["out_of"] == 100
    points = {c["key"]: c["points"] for c in out["components"]}
    assert points == {"repo_velocity": 35.6, "keyword_volume": 13.5,
                      "supply_gap": 20.8, "staleness": 2.0}


def test_every_component_carries_its_raw_label_and_source():
    row = verdict.for_topic("t", 2, 2, 8100, 266.0, T)
    by_key = {c["key"]: c for c in score.for_topic(row, canonical_inputs(), T)["components"]}
    assert by_key["repo_velocity"]["raw_label"] == "266 stars/day"
    assert by_key["repo_velocity"]["source"] == "github"
    assert by_key["keyword_volume"]["raw_label"] == "8,100 searches/mo"
    assert by_key["supply_gap"]["raw_label"] == "2 videos / 90d"
    assert by_key["staleness"]["raw_label"] == "newest 6d ago"


def test_a_missing_component_drops_its_weight_and_out_of_reads_75():
    row = verdict.for_topic("t", 2, 2, None, 266.0, T)
    out = score.for_topic(row, {**canonical_inputs(), "keyword_volume": None}, T)
    assert out["out_of"] == 75
    missing = next(c for c in out["components"] if c["key"] == "keyword_volume")
    assert missing["state"] == "no_data" and missing["points"] is None
    assert out["value"] == 58.4                # 35.6 + 20.8 + 2.0


def test_insufficient_data_scores_null_not_zero():
    row = verdict.for_topic("t", 1, 1, None, None, T)
    out = score.for_topic(row, {"repo_velocity": None, "keyword_volume": None,
                                "supply_gap": 1, "staleness": 41}, T)
    assert row["verdict"] == "INSUFFICIENT_DATA"
    assert out["value"] is None and out["out_of"] is None


def test_a_topic_with_zero_videos_gets_staleness_norm_one():
    row = verdict.for_topic("t", 0, 0, 8100, None, T)
    out = score.for_topic(row, {"repo_velocity": None, "keyword_volume": 8100,
                                "supply_gap": 0, "staleness": None}, T)
    stale = next(c for c in out["components"] if c["key"] == "staleness")
    assert stale["norm"] == 1.0 and stale["raw_label"] == "never covered"


def test_the_score_never_contradicts_its_own_verdict():
    """A MAKE_THIS_NOW must outscore a SKIP built from the same machinery."""
    make = verdict.for_topic("a", 2, 2, 8100, 266.0, T)
    skip = verdict.for_topic("b", 14, 9, 100, 5.0, T)
    make_score = score.for_topic(make, canonical_inputs(), T)["value"]
    skip_score = score.for_topic(
        skip, {"repo_velocity": 5.0, "keyword_volume": 100, "supply_gap": 14,
               "staleness": 1}, T)["value"]
    assert make["verdict"] == "MAKE_THIS_NOW" and skip["verdict"] == "SKIP"
    assert make_score > skip_score


def test_the_indie_score_and_the_hunch_flag_never_enter_the_score():
    row = verdict.for_topic("t", 2, 2, 8100, 266.0, T)
    plain = score.for_topic(row, canonical_inputs(), T)
    with_extras = score.for_topic(row, {**canonical_inputs(), "indie": 1.0, "hunch": True}, T)
    assert plain["value"] == with_extras["value"]
    assert {c["key"] for c in with_extras["components"]} == set(SC["weights"])


def test_normalize_rejects_an_unknown_component():
    with pytest.raises(KeyError):
        score.normalize("vibes", 1, SC["full_scale"])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest pipeline/test_score.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'pipeline.score'`.

- [ ] **Step 3: Write `pipeline/score.py`**

```python
"""The 0-100 opportunity score. Four weighted components, none of them an estimate.

repo_velocity carries 40 because it is the only leading signal in the product. All four are
Derived tier and render their own formula, which is why every component ships raw, norm, weight,
points and source rather than just a number.

Rounding is part of the contract: norm to 2dp, points to 1dp, value is the sum of the rounded
points. That is what makes the canonical example land on exactly 71.9.
"""
from __future__ import annotations

import decimal

SOURCES = {"repo_velocity": "github", "keyword_volume": "vidiq",
           "supply_gap": "youtube", "staleness": "youtube"}


def _round(value: float, places: int) -> float:
    quantum = decimal.Decimal(1).scaleb(-places)
    return float(decimal.Decimal(repr(value)).quantize(quantum, rounding=decimal.ROUND_HALF_UP))


def normalize(key: str, raw: float, full_scale: dict) -> float:
    if key == "repo_velocity":
        norm = min(1.0, raw / full_scale["repo_velocity_stars_per_day"])
    elif key == "keyword_volume":
        norm = min(1.0, raw / full_scale["keyword_volume_searches"])
    elif key == "supply_gap":
        norm = max(0.0, 1 - raw / full_scale["supply_gap_max_videos"])
    elif key == "staleness":
        norm = min(1.0, raw / full_scale["staleness_days"])
    else:
        raise KeyError(f"unknown score component {key!r}")
    return _round(norm, 2)


def _raw_label(key: str, raw, window_days: int) -> str:
    if key == "repo_velocity":
        return f"{raw:,.0f} stars/day"
    if key == "keyword_volume":
        return f"{raw:,} searches/mo"
    if key == "supply_gap":
        return f"{raw} videos / {window_days}d"
    return "never covered" if raw is None else f"newest {raw}d ago"


def for_topic(verdict_row: dict, inputs: dict, thresholds: dict) -> dict:
    """The opportunities.json score block. INSUFFICIENT_DATA scores null, never zero."""
    scoring = thresholds["scoring"]
    weights, full_scale = scoring["weights"], scoring["full_scale"]
    window_days = verdict_row["supply"]["window_days"]

    if verdict_row["verdict"] == "INSUFFICIENT_DATA":
        return {"value": None, "out_of": None,
                "components": [{"key": key, "raw": inputs.get(key), "raw_label": None,
                                "norm": None, "weight": weights[key], "points": None,
                                "source": SOURCES[key], "state": "no_data"}
                               for key in weights]}

    components, out_of, total = [], 0, 0.0
    for key, weight in weights.items():
        raw = inputs.get(key)
        # A topic nobody has covered is maximally stale, and that is a fact, not a gap.
        zero_videos = key == "staleness" and raw is None and verdict_row["supply"]["videos"] == 0
        if raw is None and not zero_videos:
            components.append({"key": key, "raw": None, "raw_label": None, "norm": None,
                               "weight": weight, "points": None, "source": SOURCES[key],
                               "state": "no_data"})
            continue
        norm = 1.0 if zero_videos else normalize(key, raw, full_scale)
        points = _round(norm * weight, 1)
        out_of += weight
        total += points
        components.append({"key": key, "raw": raw, "raw_label": _raw_label(key, raw, window_days),
                           "norm": norm, "weight": weight, "points": points,
                           "source": SOURCES[key], "state": "ok"})
    return {"value": _round(total, 1) if out_of else None,
            "out_of": out_of or None, "components": components}
```

- [ ] **Step 4: Run the tests**

Run: `pytest pipeline/test_score.py -v`
Expected: PASS, 10 tests, including `test_the_worked_example_reproduces_71_point_9`. If it lands on 71.8, the rounding order is wrong: norm rounds first, then points, and only then does the sum happen.

- [ ] **Step 5: Commit**

```bash
rtk git add pipeline/score.py pipeline/test_score.py
rtk git commit -m "feat(score): four-component opportunity score reproducing the canonical 71.9"
```

---

### Task 17: `build_data`, the reader layer, and the first four bundles

`build_data.py` is pure arithmetic over `_raw/` and `_synthesize/`. It writes only `_db/`, it never writes backwards, and running it twice on the same inputs produces byte-identical output. **Deleting `_db/` must be boring.** That property is the test of whether the design is right.

**Files:**
- Create: `pipeline/read.py`
- Create: `pipeline/bundles/__init__.py`
- Create: `pipeline/bundles/snapshots.py`
- Create: `pipeline/bundles/videos.py`
- Create: `pipeline/bundles/channels.py`
- Create: `pipeline/build_data.py`
- Create: `pipeline/test_build_data.py`
- Create: `pipeline/test_own.py`
- Modify: `test_anchors.py` (add the config-is-never-written anchor)

**Interfaces:**
- Consumes: everything built so far.
- Produces:
  - `read.channel_series(channel_id) -> list[dict]` (every `_raw/snapshots/*.json` plus the vidIQ backfill, merged by `vidiq.merge_backfill`, then `growth.filter_monotonic`)
  - `read.video_series(video_id) -> list[dict]`, `read.all_videos() -> list[dict]` (registry rows joined to their newest count)
  - `read.repos(today) -> dict` (the newest `_raw/repos/*.json`), `read.keyword_volumes() -> dict[str, dict]`
  - `bundles.snapshots.build(ctx) -> dict` and `bundles.snapshots.write(ctx) -> None`, same pair for `videos` and `channels`
  - `build_data.Context` dataclass carrying `today`, `thresholds`, `roster`, `topic_index`, `self_channel_id`, and the read caches
  - `build_data.build(today=None) -> dict` (the summary)
  - `bundles.channels.own_coverage(topic_id, own_videos, today, own_thresholds) -> dict` (suppression is a filter, never a deletion)

Bundle versions come straight from `system.md` §4: `snapshots` 3, `video_snapshots` 1, `videos` 2, `channels` 3, `comments` 2, `opportunities` 3, `topic_pages` 3, `meta` 3.

- [ ] **Step 1: Write the failing tests for the reader and the first three bundles**

`pipeline/test_build_data.py` (part one; part two arrives in Task 18):

```python
import datetime as dt

from pipeline import build_data, config, snapshot, util, vidiq

TODAY = dt.date(2026, 7, 27)


def seed_snapshots(days=8):
    """A clean run of daily channel snapshots ending on TODAY."""
    for i in range(days):
        day = TODAY - dt.timedelta(days=i)
        rows = {}
        for cid, subs, views in (("UCself", 68700, 4102880), ("UCcole", 219000, 11991545),
                                 ("UCdan", 2930000, 90000000)):
            rows[cid] = {"date": util.date_str(day), "status": "ok",
                         "view_count": views - i * 40000,
                         "subscriber_count": subs - i * 900,
                         "subscriber_bucket": None, "video_count": 400 - i,
                         "source": "youtube_api"}
        snapshot.write_channel_snapshot(rows, day)


def test_the_reader_merges_the_bought_history_under_the_snapshotted_one(ait_root):
    seed_snapshots(days=2)
    util.write_json(config.raw_dir() / "backfill" / "UCcole.json", {
        "channel_id": "UCcole",
        "series": [{"date": "2026-07-20", "status": "ok", "view_count": 1, "subscriber_count": 1,
                    "subscriber_bucket": 1, "video_count": 1, "source": "vidiq_backfill"},
                   {"date": "2026-07-27", "status": "ok", "view_count": 999,
                    "subscriber_count": 999, "subscriber_bucket": 1, "video_count": 1,
                    "source": "vidiq_backfill"}]})
    from pipeline import read
    series = read.channel_series("UCcole")
    by_date = {row["date"]: row for row in series}
    assert by_date["2026-07-20"]["source"] == "vidiq_backfill"
    assert by_date["2026-07-27"]["source"] == "youtube_api"     # ours always wins


def test_the_snapshots_bundle_reports_present_and_missing_dates(ait_root):
    seed_snapshots(days=3)
    (config.raw_dir() / "snapshots" / "2026-07-26.json").unlink()
    build_data.build(today=TODAY)
    bundle = util.read_json(config.db_dir() / "snapshots.json")
    assert bundle["version"] == 3
    assert "2026-07-26" in bundle["dates_missing"]
    assert bundle["channels"]["UCcole"]["handle"] == "ColeMedin"


def test_a_channel_row_carries_bounded_states_and_never_a_bare_number(ait_root):
    seed_snapshots(days=8)
    build_data.build(today=TODAY)
    channels = util.read_json(config.db_dir() / "channels.json")
    by_id = {c["channel_id"]: c for c in channels["channels"]}

    dan = by_id["UCdan"]["subscriber_delta"]["7d"]
    assert dan["state"] == "bounded" and dan["value"] is None and dan["upper"] == 50000
    assert dan["bucket"] == 10000

    self_row = by_id["UCself"]["subscriber_delta"]["7d"]
    assert self_row["state"] == "ok" and self_row["value"] == 5400   # 6 days x 900, floor is 500


def test_the_self_channel_is_ranked_inline_and_flagged(ait_root):
    seed_snapshots(days=8)
    build_data.build(today=TODAY)
    channels = util.read_json(config.db_dir() / "channels.json")
    assert channels["self_channel_id"] == "UCself"
    self_row = next(c for c in channels["channels"] if c["is_self"])
    assert set(self_row["rank"]) == {"growth", "general", "subscribers", "views"}
    assert self_row["rank"]["growth"]["90d"] >= 1


def test_subscriber_daily_is_owner_only_for_everyone_else(ait_root):
    seed_snapshots(days=8)
    build_data.build(today=TODAY)
    channels = util.read_json(config.db_dir() / "channels.json")
    other = next(c for c in channels["channels"] if not c["is_self"])
    assert other["subscriber_daily"] == {"state": "unavailable", "reason": "owner_only"}


def test_rebuilding_is_byte_identical(ait_root):
    seed_snapshots(days=8)
    build_data.build(today=TODAY)
    before = util.tree_hashes(config.db_dir())
    build_data.build(today=TODAY)
    assert util.tree_hashes(config.db_dir()) == before


def test_deleting_the_db_layer_is_boring(ait_root):
    import shutil
    seed_snapshots(days=8)
    build_data.build(today=TODAY)
    before = util.tree_hashes(config.db_dir())
    shutil.rmtree(config.db_dir())
    build_data.build(today=TODAY)
    assert util.tree_hashes(config.db_dir()) == before
```

`pipeline/test_own.py`:

```python
import datetime as dt

from pipeline import bundles
from pipeline.conftest import FIXTURE_THRESHOLDS as T

TODAY = dt.date(2026, 7, 27)
OWN = T["own_content"]


def test_a_covered_topic_is_suppressed_but_never_deleted():
    own_videos = [{"video_id": "mine1", "published_at": "2026-05-14T00:00:00Z",
                   "topic_ids": ["claude-code-mcp-setup"]}]
    row = bundles.channels.own_coverage("claude-code-mcp-setup", own_videos, TODAY, OWN)
    assert row == {"covered": True, "video_id": "mine1",
                   "published_at": "2026-05-14T00:00:00Z", "suppressed": True}


def test_an_uncovered_topic_is_not_suppressed():
    row = bundles.channels.own_coverage("claude-code-subagents", [], TODAY, OWN)
    assert row == {"covered": False, "video_id": None, "published_at": None,
                   "suppressed": False}


def test_coverage_older_than_the_lookback_no_longer_suppresses():
    own_videos = [{"video_id": "old", "published_at": "2024-01-01T00:00:00Z",
                   "topic_ids": ["claude-code-mcp-setup"]}]
    row = bundles.channels.own_coverage("claude-code-mcp-setup", own_videos, TODAY, OWN)
    assert row["covered"] is True and row["suppressed"] is False


def test_suppression_can_be_switched_off_wholesale():
    own_videos = [{"video_id": "mine1", "published_at": "2026-05-14T00:00:00Z",
                   "topic_ids": ["claude-code-mcp-setup"]}]
    row = bundles.channels.own_coverage("claude-code-mcp-setup", own_videos, TODAY,
                                        {**OWN, "suppress_covered_topics": False})
    assert row["covered"] is True and row["suppressed"] is False
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest pipeline/test_build_data.py pipeline/test_own.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'pipeline.build_data'`.

- [ ] **Step 3: Write `pipeline/read.py`**

```python
"""The read layer over _raw/ and _synthesize/. Nothing here writes anything, anywhere."""
from __future__ import annotations

import functools

from . import config, growth, snapshot, util, vidiq


def _snapshot_files():
    directory = config.raw_dir() / "snapshots"
    return sorted(directory.glob("*.json")) if directory.exists() else []


@functools.cache
def _all_channel_rows() -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for path in _snapshot_files():
        for channel_id, row in (util.read_json(path) or {}).get("channels", {}).items():
            out.setdefault(channel_id, []).append(row)
    return out


def channel_series(channel_id: str) -> list[dict]:
    """Snapshotted points merged over the bought history, then monotonicity filtered."""
    ours = _all_channel_rows().get(channel_id, [])
    bought = (util.read_json(config.raw_dir() / "backfill" / f"{channel_id}.json",
                             default={}) or {}).get("series", [])
    merged = vidiq.merge_backfill(ours, bought)
    for row in merged:
        if row.get("subscriber_bucket") is None:
            row["subscriber_bucket"] = growth.bucket_width(row.get("subscriber_count"))
    return growth.filter_monotonic(merged)


@functools.cache
def _all_video_rows() -> dict[str, list[dict]]:
    directory = config.raw_dir() / "video_snapshots"
    out: dict[str, list[dict]] = {}
    for path in sorted(directory.glob("*.json")) if directory.exists() else []:
        for video_id, row in (util.read_json(path) or {}).get("videos", {}).items():
            out.setdefault(video_id, []).append(row)
    return out


def video_series(video_id: str) -> list[dict]:
    return growth.filter_monotonic(sorted(_all_video_rows().get(video_id, []),
                                          key=lambda r: r["date"]))


def all_videos(roster: list[dict]) -> list[dict]:
    """Registry metadata joined to the newest observed count. One row per video, ever seen."""
    out = []
    for channel_row in roster:
        for video_id, meta in snapshot.registry(channel_row["channel_id"]).items():
            series = video_series(video_id)
            newest = next((r for r in reversed(series) if r["status"] == "ok"), None)
            out.append({**meta, "video_id": video_id,
                        "view_count": newest["view_count"] if newest else None,
                        "series": series})
    return out


def repos(today) -> dict:
    directory = config.raw_dir() / "repos"
    files = sorted(directory.glob("*.json")) if directory.exists() else []
    return util.read_json(files[-1]) if files else {"search": [], "trending": [],
                                                    "partial_run": False, "trending_ok": None}


def keyword_volumes() -> dict[str, dict]:
    directory = config.raw_dir() / "keywords"
    files = sorted(directory.glob("*.json")) if directory.exists() else []
    return (util.read_json(files[-1]) or {}).get("volumes", {}) if files else {}


def reset_caches() -> None:
    _all_channel_rows.cache_clear()
    _all_video_rows.cache_clear()
```

- [ ] **Step 4: Write the three bundle writers and `build_data.py`**

`pipeline/bundles/__init__.py`:

```python
from . import channels, snapshots, videos      # noqa: F401
```

`pipeline/bundles/snapshots.py`:

```python
"""snapshots.json and video_snapshots.json: the growth history, exactly as recorded."""
from __future__ import annotations

from .. import config, read, snapshot, util

VERSION = 3
VIDEO_VERSION = 1


def build(ctx) -> dict:
    channels = {}
    for row in ctx.roster:
        channels[row["channel_id"]] = {"handle": row.get("handle"),
                                       "series": read.channel_series(row["channel_id"])}
    present = snapshot.present_dates()
    window = ctx.thresholds["growth"]["default_window_days"]
    return {"version": VERSION, "generated_at": ctx.generated_at,
            "dates_present": present,
            "dates_missing": snapshot.missing_dates(ctx.today, window),
            "channels": channels}


def build_videos(ctx) -> dict:
    return {"version": VIDEO_VERSION, "generated_at": ctx.generated_at,
            "videos": {v["video_id"]: {"channel_id": v["channel_id"], "series": v["series"]}
                       for v in ctx.videos}}


def write(ctx) -> None:
    util.write_json(config.db_dir() / "snapshots.json", build(ctx))
    util.write_json(config.db_dir() / "video_snapshots.json", build_videos(ctx))
```

`pipeline/bundles/videos.py`:

```python
"""videos.json: metadata, multiplier, traction, and the keyword topic assignments."""
from __future__ import annotations

from .. import config, multiplier, topics, traction, util

VERSION = 2


def build(ctx) -> dict:
    rows = []
    for video in ctx.videos:
        baselines = ctx.baselines[video["channel_id"]]
        rows.append({
            "video_id": video["video_id"],
            "channel_id": video["channel_id"],
            "published_at": video["published_at"],
            "title": video["title"],
            "duration_s": video["duration_s"],
            "type": video["type"],
            "view_count": video["view_count"],
            "multiplier": multiplier.for_video(video, baselines),
            "traction": traction.for_video(video["series"], video["view_count"], ctx.today,
                                           ctx.thresholds["traction"]),
            "comment_stats": ctx.comment_stats.get(video["video_id"],
                                                   {"root_count": 0, "top_comment_likes": None,
                                                    "classified": 0}),
            "topic_assignments": topics.match_video(video, ctx.topic_index),
        })
    rows.sort(key=lambda r: r["video_id"])
    return {"version": VERSION, "generated_at": ctx.generated_at, "videos": rows}


def write(ctx) -> None:
    util.write_json(config.db_dir() / "videos.json", build(ctx))
```

`pipeline/bundles/channels.py`:

```python
"""channels.json: the leaderboard bundle. Four rank modes, the measurement floor everywhere.

The self channel is ranked like everyone else and is included in every median and percentile.
is_self drives colour only.
"""
from __future__ import annotations

import datetime as dt
import statistics

from .. import config, growth, read, util

VERSION = 3


def own_coverage(topic_id: str, own_videos: list[dict], today: dt.date,
                 own_thresholds: dict) -> dict:
    """Suppression is a FILTER, never a deletion: the row keeps its score and its verdict."""
    covering = [v for v in own_videos if topic_id in (v.get("topic_ids") or [])]
    if not covering:
        return {"covered": False, "video_id": None, "published_at": None, "suppressed": False}
    newest = max(covering, key=lambda v: v["published_at"])
    age = util.days_between(util.parse_ts(newest["published_at"]).date(), today)
    fresh = age <= own_thresholds["covered_lookback_days"]
    return {"covered": True, "video_id": newest["video_id"],
            "published_at": newest["published_at"],
            "suppressed": bool(own_thresholds["suppress_covered_topics"] and fresh)}


def _windows(ctx) -> list[int]:
    return list(ctx.thresholds["growth"]["windows_days"])


def build(ctx) -> dict:
    growth_thresholds = ctx.thresholds["growth"]
    default_window = growth_thresholds["default_window_days"]
    rows = []
    for roster_row in ctx.roster:
        channel_id = roster_row["channel_id"]
        series = read.channel_series(channel_id)
        newest = next((r for r in reversed(series) if r["status"] == "ok"), None)
        subscriber_count = newest["subscriber_count"] if newest else None
        channel_videos = [v for v in ctx.videos if v["channel_id"] == channel_id]

        view_delta = {"24h": growth.delta_24h(series, "view_count", ctx.today)}
        subscriber_delta, growth_rate, per_1k = {}, {}, {}
        for window in _windows(ctx):
            view_delta[f"{window}d"] = growth.delta(series, "view_count", window, ctx.today)
            subscriber_delta[f"{window}d"] = growth.subscriber_delta(
                series, window, ctx.today, growth_thresholds)
            growth_rate[f"{window}d"] = growth.subscriber_growth_rate(
                series, window, ctx.today, growth_thresholds)
            per_1k[f"{window}d"] = growth.subs_per_1k_views(
                subscriber_delta[f"{window}d"], view_delta[f"{window}d"])

        published = [v for v in channel_videos
                     if util.days_between(util.parse_ts(v["published_at"]).date(), ctx.today)
                     <= 30 and v["view_count"] is not None]
        rows.append({
            "channel_id": channel_id,
            "handle": roster_row.get("handle"), "name": roster_row.get("name"),
            "avatar": f"/assets/channels/{channel_id}.jpg",
            "lang": roster_row.get("lang"), "niche": roster_row.get("niche"),
            "category": roster_row.get("category"),
            "is_self": channel_id == ctx.self_channel_id,
            "blurb": None,                       # Inference tier, build step 11
            "subscriber_count": subscriber_count,
            "subscriber_bucket": growth.bucket_width(subscriber_count),
            "view_count": newest["view_count"] if newest else None,
            "video_count": newest["video_count"] if newest else None,
            "status": newest["status"] if newest else "insufficient_data",
            "view_delta": view_delta,
            "subscriber_delta": subscriber_delta,
            "subscriber_growth_rate": growth_rate,
            "subs_per_1k_views": per_1k,
            "subscriber_daily": ({"state": "unavailable", "reason": "owner_only"}
                                 if channel_id != ctx.self_channel_id
                                 else {"state": "unavailable", "reason": "not_built"}),
            "videos_published": {"30d": len(published)},
            "median_views_per_video": {
                "30d": statistics.median(v["view_count"] for v in published) if published
                else None},
            "still_growing_video_ids": sorted(
                v["video_id"] for v in channel_videos
                if ctx.traction.get(v["video_id"], {}).get("still_growing")),
        })

    # Ranks are computed over EVERY row including the self channel, and over every window.
    for window in _windows(ctx):
        flat = [{"channel_id": r["channel_id"],
                 "subscriber_count": r["subscriber_count"],
                 "subscriber_growth_rate": r["subscriber_growth_rate"][f"{window}d"],
                 "views_gained": r["view_delta"][f"{window}d"]} for r in rows]
        for mode in ("growth", "general", "subscribers", "views"):
            ranked = growth.rank(flat, mode, growth_thresholds)
            for row in rows:
                row.setdefault("rank", {}).setdefault(mode, {})[f"{window}d"] = \
                    ranked[row["channel_id"]]

    rows.sort(key=lambda r: r["rank"]["growth"][f"{default_window}d"])
    return {"version": VERSION, "generated_at": ctx.generated_at,
            "self_channel_id": ctx.self_channel_id, "channels": rows}


def write(ctx) -> None:
    util.write_json(config.db_dir() / "channels.json", build(ctx))
```

`pipeline/build_data.py`:

```python
"""Entry point 2. Pure arithmetic over _raw/ and _synthesize/, writing only _db/.

Idempotent by construction: every input is read, nothing is appended, and every bundle is written
whole with sorted keys. Deleting _db/ and rebuilding must produce identical bytes.
"""
from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
from typing import Any

from . import bundles, config, multiplier, read, topics, traction, util


@dataclasses.dataclass
class Context:
    today: dt.date
    generated_at: str
    thresholds: dict
    roster: list[dict]
    self_channel_id: str
    topic_index: dict
    videos: list[dict]
    baselines: dict[str, dict]
    traction: dict[str, dict]
    comment_stats: dict[str, dict]
    repos: dict
    keyword_volumes: dict
    extra: dict[str, Any] = dataclasses.field(default_factory=dict)


def make_context(today: dt.date) -> Context:
    read.reset_caches()
    thresholds = config.thresholds()
    roster = config.roster()
    self_row = config.self_channel(roster)
    videos = read.all_videos(roster)
    baselines = {
        row["channel_id"]: multiplier.baselines(
            [v for v in videos if v["channel_id"] == row["channel_id"]],
            today, thresholds["multiplier"])
        for row in roster
    }
    traction_by_video = {
        v["video_id"]: traction.for_video(v["series"], v["view_count"], today,
                                          thresholds["traction"])
        for v in videos
    }
    return Context(
        today=today,
        # generated_at is the only non-deterministic field, and it is deliberately excluded
        # from the byte-identity tests by being derived from `today` rather than the clock.
        generated_at=f"{util.date_str(today)}T00:00:00Z",
        thresholds=thresholds, roster=roster, self_channel_id=self_row["channel_id"],
        topic_index=topics.load(), videos=videos, baselines=baselines,
        traction=traction_by_video, comment_stats={}, repos=read.repos(today),
        keyword_volumes=read.keyword_volumes())


def build(today: dt.date | None = None) -> dict:
    today = today or util.today()
    ctx = make_context(today)
    bundles.snapshots.write(ctx)
    bundles.videos.write(ctx)
    bundles.channels.write(ctx)
    return {"date": util.date_str(today), "channels": len(ctx.roster),
            "videos": len(ctx.videos), "bundles": sorted(p.name for p in
                                                         config.db_dir().glob("*.json"))}


def main() -> int:
    parser = argparse.ArgumentParser(description="rebuild _db/ from _raw/ and _synthesize/")
    parser.add_argument("--date", help="YYYY-MM-DD, defaults to today UTC")
    args = parser.parse_args()
    summary = build(util.parse_date(args.date) if args.date else None)
    for key, value in summary.items():
        print(f"{key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 5: Run the tests**

Run: `pytest pipeline/test_build_data.py pipeline/test_own.py -v`
Expected: PASS, 11 tests. `test_rebuilding_is_byte_identical` and `test_deleting_the_db_layer_is_boring` are the two that matter most: if either fails, something is reading the wall clock or iterating an unsorted structure.

- [ ] **Step 6: Add the config-is-never-written anchor**

Append to `test_anchors.py`:

```python
def test_a_full_build_never_writes_into_config(ait_root):
    """The invariant, checked by hashing the tree rather than by grepping for open()."""
    from pipeline import build_data, snapshot, util
    import datetime as dt

    today = dt.date(2026, 7, 27)
    snapshot.write_channel_snapshot(
        {"UCcole": {"date": "2026-07-27", "status": "ok", "view_count": 1,
                    "subscriber_count": 219000, "subscriber_bucket": 1000,
                    "video_count": 1, "source": "youtube_api"}}, today)
    before = util.tree_hashes(config_dir_for_test())
    build_data.build(today=today)
    assert util.tree_hashes(config_dir_for_test()) == before


def config_dir_for_test():
    from pipeline import config
    return config.config_dir()
```

Move `test_anchors.py`'s fixture import so it can see `pipeline/conftest.py`: add `pytest_plugins = ["pipeline.conftest"]` at the top of `test_anchors.py`.

- [ ] **Step 7: Run everything**

Run: `pytest -q && ruff check pipeline test_anchors.py scripts`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
rtk git add pipeline/read.py pipeline/bundles/ pipeline/build_data.py \
  pipeline/test_build_data.py pipeline/test_own.py test_anchors.py
rtk git commit -m "feat(build): read layer, snapshot/video/channel bundles, idempotent rebuild"
```

---

### Task 18: The remaining four bundles, and the end-to-end 71.9 check

**Files:**
- Create: `pipeline/bundles/comments.py`
- Create: `pipeline/bundles/opportunities.py`
- Create: `pipeline/bundles/topic_pages.py`
- Create: `pipeline/bundles/meta.py`
- Modify: `pipeline/bundles/__init__.py`, `pipeline/build_data.py`
- Modify: `pipeline/test_build_data.py` (part two)

**Interfaces:**
- Produces:
  - `bundles.comments.build(ctx) -> dict` (`by_channel`, `by_video`, `by_topic`, one corpus and three indexes)
  - `bundles.opportunities.build(ctx) -> dict` (leaves only, `fired` on every band, `hunch` from `config/targets.json`)
  - `bundles.topic_pages.build(ctx) -> dict` (leaves and parents; `nodes` and `edges` reserved as `null` for step 15)
  - `bundles.meta.build(ctx) -> dict`
  - `build_data.build` writes all nine

**Three indexes, one corpus.** The joins are transitive (comment to video to `topic_assignments`) and already in the data, so these cost index builds and not extra pipelines. `by_topic` is the one that finds Eric a video, because aggregating every comment across all 9 videos from all 7 creators is what makes an unserved branch visible at all.

**`topic_pages.state`** is where conflict C1's `videos < 3` rule lives: `insufficient_data` when `video_count < min_n.topic_page_min_videos` or `creator_count < min_n.topic_page_min_creators`, which is what renders *"1 video, need 3"*.

- [ ] **Step 1: Write the failing tests**

Append to `pipeline/test_build_data.py`:

```python
def seed_topic_corpus(ait_root):
    """Two videos on mcp-registry-integration, comments on one, and a hot repo linked to it."""
    from pipeline import comments, snapshot
    videos = [
        {"id": "v1", "snippet": {"title": "MCP registry walkthrough", "description": "",
                                 "tags": ["mcp registry"], "channelId": "UCcole",
                                 "publishedAt": "2026-07-21T00:00:00Z"},
         "contentDetails": {"duration": "PT21M56S"}, "statistics": {"viewCount": "1000"}},
        {"id": "v2", "snippet": {"title": "Another mcp registry build", "description": "",
                                 "tags": [], "channelId": "UCdan",
                                 "publishedAt": "2026-07-21T00:00:00Z"},
         "contentDetails": {"duration": "PT9M"}, "statistics": {"viewCount": "500"}},
    ]
    snapshot.record_video_metadata("UCcole", videos[:1])
    snapshot.record_video_metadata("UCdan", videos[1:])
    for i in range(8):
        day = TODAY - dt.timedelta(days=i)
        snapshot.write_video_snapshot(
            {"v1": {"date": util.date_str(day), "status": "ok", "view_count": 1000 - i * 10,
                    "source": "youtube_api"},
             "v2": {"date": util.date_str(day), "status": "ok", "view_count": 500 - i * 5,
                    "source": "youtube_api"}}, day)
    comments.append_new("UCcole", [{
        "comment_id": "Ug1", "video_id": "v1", "channel_id": "UCcole",
        "video_title": "MCP registry walkthrough", "video_url": "https://youtu.be/v1",
        "video_published_at": "2026-07-21T00:00:00Z", "author": "someguy",
        "text": "Would love to see this on Windows", "like_count": 412, "reply_count": 7,
        "published_at": "2026-07-24T00:00:00Z", "answered": False, "lag_days": 3,
        "topic_ids": ["mcp-registry-integration"], "category": None}])
    util.write_json(config.raw_dir() / "repos" / "2026-07-27.json", {
        "date": "2026-07-27", "partial_run": False, "trending_ok": True, "trending_reason": None,
        "search": [{"github_id": 123456, "full_name": "x/mcp-registry",
                    "description": "an mcp registry", "repo_topics": ["mcp"],
                    "stars": 12496, "created_at": "2026-06-10T00:00:00Z", "age_days": 47,
                    "velocity": 265.87, "owner_type": "Organization",
                    "discovered_via": "search",
                    "indie": {"score": 0.58, "owner_type": "Organization",
                              "contributors": 9, "trust": "derived"}}],
        "trending": []})
    util.write_json(config.raw_dir() / "keywords" / "2026-07-27.json", {
        "date": "2026-07-27",
        "volumes": {"mcp-registry-integration": {"keyword": "MCP registry integration",
                                                 "volume": 8100, "state": "ok"}}})


def test_the_opportunity_row_reproduces_71_point_9_end_to_end(ait_root):
    seed_snapshots(days=8)
    seed_topic_corpus(ait_root)
    build_data.build(today=TODAY)
    rows = util.read_json(config.db_dir() / "opportunities.json")["rows"]
    row = next(r for r in rows if r["topic_id"] == "mcp-registry-integration")
    assert row["verdict"] == "MAKE_THIS_NOW"
    assert row["score"]["value"] == 71.9 and row["score"]["out_of"] == 100
    assert row["supply"]["fired"] == ["videos <= 2"]
    assert row["demand"]["fired"] == ["keyword_volume >= 5000", "repo_velocity >= 100.0"]
    assert row["evidence"][0]["github_id"] == 123456
    assert row["trust"] == {"demand": "derived", "supply": "derived",
                            "verdict": "derived", "score": "derived"}


def test_a_parent_never_appears_in_the_opportunity_bundle(ait_root):
    seed_snapshots(days=8)
    seed_topic_corpus(ait_root)
    build_data.build(today=TODAY)
    rows = util.read_json(config.db_dir() / "opportunities.json")["rows"]
    assert "claude-code" not in {r["topic_id"] for r in rows}


def test_a_hunch_sorts_but_never_scores(write_config, ait_root):
    seed_snapshots(days=8)
    seed_topic_corpus(ait_root)
    write_config("targets.json", {"version": 1,
                                  "target": {"mode": "growth", "window_days": 90, "rank": 6},
                                  "hunches": ["claude-code-subagents"]})
    build_data.build(today=TODAY)
    rows = util.read_json(config.db_dir() / "opportunities.json")["rows"]
    hunched = next(r for r in rows if r["topic_id"] == "claude-code-subagents")
    plain = next(r for r in rows if r["topic_id"] == "mcp-registry-integration")
    assert hunched["hunch"] is True and plain["hunch"] is False
    assert all(c["key"] != "hunch" for c in plain["score"]["components"])


def test_a_topic_page_below_the_minimum_says_so_rather_than_hiding(ait_root):
    seed_snapshots(days=8)
    seed_topic_corpus(ait_root)
    build_data.build(today=TODAY)
    pages = {p["topic_id"]: p for p in util.read_json(
        config.db_dir() / "topic_pages.json")["topics"]}
    page = pages["mcp-registry-integration"]
    assert page["state"] == "insufficient_data"        # 2 videos, min is 3
    assert page["video_count"] == 2 and page["creator_count"] == 2
    assert page["nodes"] is None and page["edges"] is None    # reserved for step 15
    assert pages["claude-code"]["is_leaf"] is False and "shape" not in pages["claude-code"]


def test_the_comment_bundle_indexes_the_same_corpus_three_ways(ait_root):
    seed_snapshots(days=8)
    seed_topic_corpus(ait_root)
    build_data.build(today=TODAY)
    bundle = util.read_json(config.db_dir() / "comments.json")
    assert bundle["version"] == 2
    assert bundle["by_channel"]["UCcole"]["totals"]["ingested"] == 1
    assert bundle["by_video"]["v1"]["totals"]["comments"] == 1
    topic = bundle["by_topic"]["mcp-registry-integration"]
    assert topic["totals"] == {"comments": 1, "videos": 2, "creators": 2}
    assert topic["by_category"]["unsorted"] == 1        # not classified yet, never hidden


def test_a_category_can_never_ship_without_its_comment_text(ait_root):
    seed_snapshots(days=8)
    seed_topic_corpus(ait_root)
    build_data.build(today=TODAY)
    bundle = util.read_json(config.db_dir() / "comments.json")
    for index in ("by_channel", "by_video", "by_topic"):
        for entry in bundle[index].values():
            for row in entry["top"]:
                assert row["text"], "a comment row shipped without its text"
                assert "category" in row and "lag_days" in row


def test_meta_reports_coverage_health_and_the_target(ait_root):
    seed_snapshots(days=8)
    seed_topic_corpus(ait_root)
    build_data.build(today=TODAY)
    meta = util.read_json(config.db_dir() / "meta.json")
    assert meta["version"] == 3 and meta["thresholds_version"] == 3
    assert meta["self_channel_id"] == "UCself"
    assert meta["channels"] == {"total": 3, "ok": 3, "absent": 0}
    assert 0 <= meta["coverage_rate"] <= 1
    assert meta["target"] == {"mode": "growth", "window_days": 90, "rank": 6}
    assert meta["partial_run"] is False
    assert meta["build_step"] == 8


def test_all_nine_bundles_are_written(ait_root):
    seed_snapshots(days=8)
    seed_topic_corpus(ait_root)
    build_data.build(today=TODAY)
    assert sorted(p.name for p in config.db_dir().glob("*.json")) == [
        "channels.json", "comments.json", "meta.json", "opportunities.json",
        "snapshots.json", "topic_pages.json", "video_snapshots.json", "videos.json"]
```

Eight files, not nine: `system.md` §4 counts nine bundles, and `videos.json` plus `video_snapshots.json` are two of them, which makes the total on disk eight `.json` files plus the `assets/` directory. Fix the count in `system.md` §4 in Task 19 rather than inventing a ninth file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pytest pipeline/test_build_data.py -v`
Expected: FAIL on the new tests, `FileNotFoundError` for `opportunities.json`.

- [ ] **Step 3: Write `pipeline/bundles/comments.py`**

```python
"""comments.json: one corpus, three indexes.

by_channel  what does THIS creator's audience ask
by_topic    what does EVERYONE ask about this subject, across every creator covering it
by_video    what did THIS upload provoke

The bundle pairs `category` with `text` structurally, so it is not possible to render a category
without the evidence for it.
"""
from __future__ import annotations

from .. import comments as comments_module
from .. import config, util

VERSION = 2
CATEGORY_KEYS = ("video_request", "question", "correction", "suggestion", "other")


def _counts(rows: list[dict]) -> dict:
    out = {key: 0 for key in CATEGORY_KEYS}
    out["unsorted"] = 0
    for row in rows:
        category = (row.get("category") or {}).get("key") if row.get("category") else None
        out[category if category in out else "unsorted"] += 1
    return out


def _top(rows: list[dict], limit: int) -> list[dict]:
    ordered = sorted(rows, key=lambda r: (-(r.get("like_count") or 0),
                                          -(r.get("reply_count") or 0),
                                          r["comment_id"]))
    return ordered[:limit]


def build(ctx) -> dict:
    limit = ctx.thresholds["comments"]["top_n_per_channel"]
    topics_by_video = {
        v["video_id"]: [a["topic_id"] for a in ctx.assignments_by_video.get(v["video_id"], [])]
        for v in ctx.videos
    }
    channel_of_video = {v["video_id"]: v["channel_id"] for v in ctx.videos}

    by_channel, by_video, by_topic = {}, {}, {}
    for roster_row in ctx.roster:
        channel_id = roster_row["channel_id"]
        rows = list(comments_module.load(channel_id).values())
        for row in rows:
            row["topic_ids"] = topics_by_video.get(row["video_id"], row.get("topic_ids") or [])
        if rows:
            by_channel[channel_id] = {
                "totals": {"ingested": len(rows),
                           "classified": sum(1 for r in rows if r.get("category")),
                           "window_days": 365},
                "top": _top(rows, limit),
                "by_category": _counts(rows),
                "most_discussed_video_ids": [
                    vid for vid, _ in sorted(
                        ((v, sum(1 for r in rows if r["video_id"] == v))
                         for v in {r["video_id"] for r in rows}),
                        key=lambda pair: -pair[1])[:5]],
            }
        for row in rows:
            bucket = by_video.setdefault(row["video_id"], [])
            bucket.append(row)
            for topic_id in row["topic_ids"]:
                by_topic.setdefault(topic_id, []).append(row)

    by_video_out = {
        video_id: {"totals": {"comments": len(rows)}, "by_category": _counts(rows),
                   "top": _top(rows, ctx.thresholds["comments"]["page_size"] * 2)}
        for video_id, rows in by_video.items()
    }
    by_topic_out = {}
    for topic_id, rows in by_topic.items():
        videos = {v["video_id"] for v in ctx.videos
                  if topic_id in topics_by_video.get(v["video_id"], [])}
        creators = {channel_of_video[v] for v in videos if v in channel_of_video}
        by_topic_out[topic_id] = {
            "totals": {"comments": len(rows), "videos": len(videos), "creators": len(creators)},
            "top": _top(rows, limit),
            "by_category": _counts(rows),
            "unserved": [],          # Inference, and it needs extraction. Build step 16.
        }
    return {"version": VERSION, "generated_at": ctx.generated_at,
            "by_channel": by_channel, "by_video": by_video_out, "by_topic": by_topic_out}


def write(ctx) -> None:
    util.write_json(config.db_dir() / "comments.json", build(ctx))
```

- [ ] **Step 4: Write `pipeline/bundles/opportunities.py`**

```python
"""opportunities.json: leaves only, every band showing what fired, every score showing its work."""
from __future__ import annotations

from .. import config, github, score, topics, util, verdict

VERSION = 3
TRUST = {"demand": "derived", "supply": "derived", "verdict": "derived", "score": "derived"}


def build(ctx) -> dict:
    thresholds = ctx.thresholds
    window = thresholds["supply"]["window_days"]
    hunches = set(config.targets().get("hunches") or [])
    all_repos = list(ctx.repos.get("search") or []) + list(ctx.repos.get("trending") or [])
    linked = github.link_topics(all_repos, ctx.topic_index)

    rows = []
    for leaf in topics.leaves(ctx.topic_index):
        in_window = [
            v for v in ctx.videos
            if leaf.id in [a["topic_id"] for a in ctx.assignments_by_video.get(v["video_id"], [])]
            and util.days_between(util.parse_ts(v["published_at"]).date(), ctx.today) <= window
        ]
        creators = {v["channel_id"] for v in in_window}
        repos = sorted(linked.get(leaf.id, []), key=lambda r: -r["velocity"])
        repo_velocity = repos[0]["velocity"] if repos else None
        volume_row = ctx.keyword_volumes.get(leaf.id) or {}
        keyword_volume = volume_row.get("volume")

        banded = verdict.for_topic(leaf.id, len(in_window), len(creators), keyword_volume,
                                   repo_velocity, thresholds)
        newest_days = None
        if in_window:
            newest = max(v["published_at"] for v in in_window)
            newest_days = util.days_between(util.parse_ts(newest).date(), ctx.today)
        scored = score.for_topic(banded, {
            "repo_velocity": repo_velocity, "keyword_volume": keyword_volume,
            "supply_gap": len(in_window), "staleness": newest_days}, thresholds)

        rows.append({
            "topic_id": leaf.id, "shape": leaf.shape,
            "demand": banded["demand"], "supply": banded["supply"],
            "verdict": banded["verdict"], "hunch": leaf.id in hunches,
            "own_coverage": ctx.own_coverage.get(leaf.id),
            "score": scored,
            "evidence": [{"kind": "repo", "github_id": r["github_id"],
                          "full_name": r["full_name"], "stars": r["stars"],
                          "age_days": r["age_days"], "velocity": r["velocity"],
                          "indie": r.get("indie"),
                          "discovered_via": r.get("discovered_via", "search")}
                         for r in repos[:5]],
            "trust": dict(TRUST),
        })
    # Hunches sort up. They never score: the sort key holds the flag, the score never sees it.
    rows.sort(key=lambda r: (not r["hunch"], -(r["score"]["value"] or -1), r["topic_id"]))
    return {"version": VERSION, "generated_at": ctx.generated_at,
            "thresholds_version": thresholds["version"], "rows": rows}


def write(ctx) -> None:
    util.write_json(config.db_dir() / "opportunities.json", build(ctx))
```

- [ ] **Step 5: Write `pipeline/bundles/topic_pages.py` and `pipeline/bundles/meta.py`**

```python
"""topic_pages.json: every topic, leaf or parent. nodes and edges are reserved for step 15."""
from __future__ import annotations

from .. import config, topics, util

VERSION = 3


def build(ctx) -> dict:
    min_n = ctx.thresholds["min_n"]
    window = ctx.thresholds["supply"]["window_days"]
    pages = []
    per_leaf = {}
    for topic in ctx.topic_index.values():
        if not topics.is_leaf(topic):
            continue
        matched = [v for v in ctx.videos
                   if topic.id in [a["topic_id"]
                                   for a in ctx.assignments_by_video.get(v["video_id"], [])]]
        creators = {v["channel_id"] for v in matched}
        per_leaf[topic.id] = {"videos": len(matched), "creators": len(creators)}
        enough = (len(matched) >= min_n["topic_page_min_videos"]
                  and len(creators) >= min_n["topic_page_min_creators"])
        pages.append({
            "topic_id": topic.id, "label": topic.label, "parent_id": topic.parent_id,
            "is_leaf": True, "shape": topic.shape,
            "video_count": len(matched), "creator_count": len(creators),
            "window_days": window,
            # "1 video, need 3" lives HERE, not on the verdict. See conflict C1.
            "state": "ok" if enough else "insufficient_data",
            "min_videos": min_n["topic_page_min_videos"],
            "newest_video_at": max((v["published_at"] for v in matched), default=None),
            "video_ids": sorted(v["video_id"] for v in matched),
            "nodes": None, "edges": None,
        })

    rolled = topics.rollup(ctx.topic_index, per_leaf)
    for topic in ctx.topic_index.values():
        if topics.is_leaf(topic):
            continue
        counts = rolled.get(topic.id, {"videos": 0, "creators": 0, "leaves": 0})
        pages.append({
            "topic_id": topic.id, "label": topic.label, "parent_id": topic.parent_id,
            "is_leaf": False,
            "leaf_count": counts["leaves"], "video_count": counts["videos"],
            "creator_count": counts["creators"], "window_days": window,
            "children": list(topic.children_ids),
        })
    pages.sort(key=lambda p: p["topic_id"])
    return {"version": VERSION, "generated_at": ctx.generated_at, "topics": pages}


def write(ctx) -> None:
    util.write_json(config.db_dir() / "topic_pages.json", build(ctx))
```

```python
"""meta.json: the health readout. coverage_rate is load-bearing, not decoration.

With the proposal queue cut, a falling coverage_rate is the ONLY signal that config/topics.json
needs new leaves.
"""
from __future__ import annotations

from .. import config, read, snapshot, topics, util

VERSION = 3
BUILD_STEP = 8


def build(ctx) -> dict:
    assignments = [dict(a, video_id=v["video_id"])
                   for v in ctx.videos
                   for a in ctx.assignments_by_video.get(v["video_id"], [])]
    present = snapshot.present_dates()
    window = ctx.thresholds["growth"]["default_window_days"]
    statuses = [read.channel_series(r["channel_id"]) for r in ctx.roster]
    newest = [next((p for p in reversed(s) if p["status"] == "ok"), None) for s in statuses]
    return {
        "version": VERSION,
        "generated_at": ctx.generated_at,
        "thresholds_version": ctx.thresholds["version"],
        "build_step": BUILD_STEP,
        "coverage_rate": topics.coverage_rate(ctx.videos, assignments),
        "self_channel_id": ctx.self_channel_id,
        "snapshot_health": {"first_date": present[0] if present else None,
                            "days_present": len(present),
                            "days_missing": len(snapshot.missing_dates(ctx.today, window))},
        "video_snapshot_health": {"videos_tracked": len(ctx.videos),
                                  "days_present": len(present)},
        "comment_health": {"channels_with_comments": ctx.extra.get("channels_with_comments", 0),
                           "ingested": ctx.extra.get("comments_ingested", 0),
                           "classified": ctx.extra.get("comments_classified", 0)},
        "channels": {"total": len(ctx.roster),
                     "ok": sum(1 for n in newest if n is not None),
                     "absent": sum(1 for n in newest if n is None)},
        "target": config.targets().get("target"),
        "discovery": {"trending_ok": ctx.repos.get("trending_ok"),
                      "reason": ctx.repos.get("trending_reason")},
        "partial_run": bool(ctx.repos.get("partial_run")),
    }


def write(ctx) -> None:
    util.write_json(config.db_dir() / "meta.json", build(ctx))
```

- [ ] **Step 6: Extend `Context` and `build()`**

`Context` gains `assignments_by_video: dict[str, list[dict]]` and `own_coverage: dict[str, dict]`. In `make_context`, after `videos` is built:

```python
    topic_index = topics.load()
    assignments_by_video = {v["video_id"]: topics.match_video(v, topic_index) for v in videos}
    demotions = topics.detect_demotions(
        topic_index,
        [{"video_id": vid, "topic_id": a["topic_id"]}
         for vid, rows in assignments_by_video.items() for a in rows])
    for row in demotions:
        print(f"WARN leaf became a parent: {row['topic_id']} carried "
              f"{len(row['video_ids'])} videos, now has children {row['new_children']}. "
              f"Its videos were re-matched against the new children.")

    own_videos = [{**v, "topic_ids": [a["topic_id"] for a in assignments_by_video[v["video_id"]]]}
                  for v in videos if v["channel_id"] == self_row["channel_id"]]
    own_coverage = {
        leaf.id: bundles.channels.own_coverage(leaf.id, own_videos, today,
                                               thresholds["own_content"])
        for leaf in topics.leaves(topic_index)
    }
```

and `build()` writes the rest:

```python
    bundles.comments.write(ctx)
    bundles.opportunities.write(ctx)
    bundles.topic_pages.write(ctx)
    bundles.meta.write(ctx)
```

`bundles/__init__.py` re-exports all seven modules.

- [ ] **Step 7: Run the tests**

Run: `pytest pipeline/test_build_data.py -v`
Expected: PASS, 19 tests, including `test_the_opportunity_row_reproduces_71_point_9_end_to_end`.

- [ ] **Step 8: Build against the real data**

Run: `python3 -m pipeline.build_data`
Expected: eight bundles in `_db/`. Then read the summary:

```bash
python3 -c "from pipeline import config, util; m=util.read_json(config.db_dir()/'meta.json'); \
o=util.read_json(config.db_dir()/'opportunities.json')['rows']; \
print('coverage', m['coverage_rate'], '| channels', m['channels'], '| partial', m['partial_run']); \
[print(f\"{r['topic_id']:<34}{r['verdict']:<18}\" \
       f\"{(str(r['score']['value']) + '/' + str(r['score']['out_of'])) if r['score']['value'] is not None else '--':>10}\") \
 for r in o[:12]]"
```

Expected: a `MAKE_THIS_NOW` list at the top, `--` for every `INSUFFICIENT_DATA` row, and `x / 75` on any row missing keyword volume.

- [ ] **Step 9: Commit**

```bash
rtk git add pipeline/bundles/ pipeline/build_data.py pipeline/test_build_data.py
rtk git commit -m "feat(build): comments, opportunities, topic_pages and meta bundles"
```

---

### Task 19: The launchd agent, four skills, and the doc corrections

**Files:**
- Create: `.agents/skills/ait-snapshot/SKILL.md`
- Create: `.agents/skills/ait-refresh/SKILL.md`
- Create: `.agents/skills/ait-opportunity/SKILL.md`
- Create: `.agents/skills/ait-analyze/SKILL.md`
- Create: `scripts/ait-snapshot.plist` (template, installed to `~/Library/LaunchAgents/`)
- Modify: `docs/decisions.md` (add 0009)
- Modify: `docs/spec.md` §5, `docs/system.md` §2 §4 §11, `CLAUDE.md`, `_raw/README.md`, `.agents/skills/README.md`

**Interfaces:**
- Consumes: `pipeline.snapshot.main`, `pipeline.build_data.main`, `pipeline.vidiq`.
- Produces: four `SKILL.md` files, each a thin wrapper that shells out to `pipeline/`. A skill never imports another skill, and `test_anchors.py` proves it.

- [ ] **Step 1: Install the daily agent**

`scripts/ait-snapshot.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>ca.erictech.ait-snapshot</string>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
  <key>WorkingDirectory</key>
  <string>/Users/erictech/Desktop/EricOS/projects/ai-influencers-tracker</string>
  <key>ProgramArguments</key>
  <array><string>/usr/bin/python3</string><string>-m</string><string>pipeline.snapshot</string></array>
  <key>StandardOutPath</key><string>.logs/snapshot.log</string>
  <key>StandardErrorPath</key><string>.logs/snapshot.err</string>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
```

```bash
mkdir -p .logs
cp scripts/ait-snapshot.plist ~/Library/LaunchAgents/ca.erictech.ait-snapshot.plist
launchctl load -w ~/Library/LaunchAgents/ca.erictech.ait-snapshot.plist
launchctl list | grep ait-snapshot
```

Expected: one line with the label and exit status 0.

- [ ] **Step 2: Prove gap healing works**

The snapshot runs on a laptop that sleeps and travels, so gaps are expected rather than exceptional. Delete a day and confirm the gap is reported rather than averaged over.

```bash
python3 -c "from pipeline import config, snapshot, util; import datetime as dt; \
d = util.date_str(util.today() - dt.timedelta(days=1)); \
p = snapshot.snapshot_path(d); p.rename(p.with_suffix('.json.bak')); print('removed', d)"
python3 -m pipeline.snapshot --dry-run
python3 -m pipeline.build_data
python3 -c "from pipeline import config, util; \
c = util.read_json(config.db_dir()/'channels.json')['channels'][0]; \
print(c['handle'], c['subscriber_delta']['7d'])"
```

Expected: `missing_dates` names yesterday, and the 7d cell reads `{'state': 'building', 'have': 6, 'need': 7, 'value': None}` with **no number**. Restore the file afterwards.

- [ ] **Step 3: Write the four SKILL.md files**

`.agents/skills/ait-snapshot/SKILL.md`:

```markdown
---
name: ait-snapshot
description: Run the daily free sweep for ai-influencers-tracker (channels, uploads, per-video counts, comments, GitHub velocity, GitHub Trending) and report the gap list. Use when the user says ait-snapshot, "run the sweep", "pull today's numbers", or asks why the dashboard has a hole in it.
---

# ait-snapshot

The daily free sweep. About 176 of 10,000 YouTube quota units, 0 vidIQ credits, 0 dollars.
`launchd` already runs it at 09:00; this skill is for running it by hand.

## Run it

```bash
python3 -m pipeline.snapshot --dry-run     # what it would cost, writes nothing
python3 -m pipeline.snapshot               # the real sweep
python3 -m pipeline.build_data             # rebuild _db/ so the dashboard sees it
```

## Read the summary

| Field | What it means |
|---|---|
| `absent` | channels missing from a 200 response. They went private. Never a zero. |
| `missing_dates` | calendar days with no snapshot. Those windows render `building, N of M`. |
| `partial_run` | a GitHub 403 truncated the sweep. What was collected is kept. |
| `trending_ok` | false means discovery degraded. Data is still clean. Non-critical. |

## Do not

- Do not edit anything under `config/`. That is Eric's, and the pipeline never writes there.
- Do not repair a `corrupt` point. It is stored exactly as it arrived, on purpose.
- Do not call `search.list` (100 units) or `captions.download` (200 units, owner-only).
```

`.agents/skills/ait-refresh/SKILL.md`:

```markdown
---
name: ait-refresh
description: Orchestrate a metered ai-influencers-tracker refresh: print the vidIQ cost preview, run the guarded channel-history backfill or the weekly keyword sweep, then rebuild the bundles. Use when the user says ait-refresh, "buy the history", "run the keyword sweep", or asks what a refresh would cost in credits.
---

# ait-refresh

The only skill that spends money. **Always print the preview and wait for a yes before spending.**

## Preview first, always

```bash
python3 -c "from pipeline import config, vidiq; c=vidiq.client_from_env(); \
b=vidiq.balance(c); print(b); \
vidiq.backfill(config.roster(), c, vidiq.CostGuard(b['totalCredits'], 200, 400), dry_run=True)"
```

## The two jobs

| Job | Cost | Cadence |
|---|---|---|
| `vidiq_channel_stats` backfill, 72 channels | 360 credits | once, build step 2 |
| `vidiq_keyword_research`, one per leaf | 5 per leaf, ~125 | weekly |

The guard refuses anything that would take the balance below its 200-credit reserve, or that would
spend more than 400 in a single run. After a real run, confirm the ledger: balance before minus
balance after must equal the previewed number.

## Do not

- Do not re-run the backfill "to be safe". It costs 360 credits and the merge already prefers
  points we snapshotted ourselves.
- Do not use `vidiq_outliers` or `vidiq_channel_videos`. Both are dropped: the multiplier is
  computed from exact free view counts, and nothing paid can improve on exact.
```

`.agents/skills/ait-opportunity/SKILL.md`:

```markdown
---
name: ait-opportunity
description: Explain or debug the ai-influencers-tracker opportunity engine, the verdict grid, the indie score, and the 0-100 score. Use when the user says ait-opportunity, asks "what should I make next", asks why a topic got a particular verdict or score, or asks what fired.
---

# ait-opportunity

## Read a row

```bash
python3 -c "from pipeline import config, util; import json,sys; \
rows=util.read_json(config.db_dir()/'opportunities.json')['rows']; \
print(json.dumps(next(r for r in rows if r['topic_id']==sys.argv[1]), indent=2))" <topic-id>
```

Every row carries `fired`, the exact threshold comparisons that produced its bands, and
`score.components`, each with raw, norm, weight, points and source. If a row looks wrong, the
answer is in one of those two lists, not in the code.

## The rules that are easy to get wrong

- Only leaves reach the verdict function. A parent has no score and no verdict, ever.
- `INSUFFICIENT_DATA` fires when the demand axis is unknown, not when the video count is low.
  A low video count sets `topic_pages.state`, which is what renders "1 video, need 3".
- A missing component drops its weight: `out_of` reads 75, never 100. Never impute.
- The indie score renders as a chip and never enters the score. The `hunch` flag sorts and
  never scores.
- The canonical example must reproduce 71.9. If it does not, the rounding order is wrong.
```

`.agents/skills/ait-analyze/SKILL.md`:

```markdown
---
name: ait-analyze
description: Topic matching and coverage for ai-influencers-tracker; later, comment classification and step extraction. Use when the user says ait-analyze, asks which topics a video matched, asks why coverage_rate is falling, or asks what new leaves config/topics.json is missing.
---

# ait-analyze

Currently the cheap form only: keyword topic matching over title, description and tags, all free
from the YouTube Data API. Comment classification lands at build step 12 and step extraction at 15.

## What matched, and what did not

```bash
python3 -c "from pipeline import config, util; \
m=util.read_json(config.db_dir()/'meta.json'); print('coverage_rate', m['coverage_rate']); \
v=util.read_json(config.db_dir()/'videos.json')['videos']; \
[print(x['title'][:70]) for x in v if not x['topic_assignments']][:20]"
```

A falling `coverage_rate` is the **only** signal that `config/topics.json` needs new leaves, because
there is no proposal queue. New topics enter through the GitHub Trending sweep plus Eric's judgment.
The list above is the evidence; adding leaves is a hand edit Eric makes.

## Do not

- Do not add leaves to `config/topics.json` yourself. The pipeline never writes into config, and
  auto-adding topics was explicitly rejected (decision 0003).
- Every assignment carries `method: "keyword"`. Step 15 upgrades the same rows in place to
  `"transcript"`. No schema change, no migration.
```

- [ ] **Step 4: Write decision 0009**

Append to `docs/decisions.md`, and add its row to the index table at the top:

```markdown
## 0009 — `INSUFFICIENT_DATA` is an unknown axis, not a low video count

### Context

Spec §5 stated the rule as *"either axis unknown, or videos < 3 → INSUFFICIENT_DATA"*. The same
section's canonical worked example gives `mcp-registry-integration` a supply of 2 videos, a verdict
of `MAKE_THIS_NOW`, and a score of 71.9, which is declared mandatory in two places. Those cannot
both hold: `INSUFFICIENT_DATA` forces a null score. The wireframes agree with the example and not
with the rule: `claude-code-plugins` renders INSUFFICIENT at 3 videos and 3 creators, and
`claude-code-hooks-config` renders TOO_EARLY at 0 videos.

### Decision

The verdict grid's `INSUFFICIENT_DATA` fires **iff an axis is unknown**, which in practice means
the demand axis: no keyword volume and no linked repo velocity.

The `videos < 3` rule is the **topic page's** state, driven by `min_n.topic_page_min_videos` and
`min_n.topic_page_min_creators`. That is the surface where *"1 video, need 3"* renders, and it is
about whether a consensus claim can be made, not about whether an opportunity exists.

One word was doing two jobs on two surfaces. Splitting it costs one field on `topic_pages.json`.

Rejected alternatives:

- **Keep `videos < 3` on the verdict and drop the 71.9 example.** The example is real data, is
  named canonical, and is asserted in two test modules. It outranks a sentence.
- **Score the row anyway while banding it INSUFFICIENT_DATA.** Then verdict and score disagree,
  and `test_score.py` explicitly forbids that.

### Scope

`verdict.decide` never reads a video count. `topic_pages.state` carries `insufficient_data` plus
`min_videos` so the page can render the shortfall rather than hiding the route.
```

- [ ] **Step 5: Correct the other three doc drifts**

1. `docs/spec.md` §5: replace `either axis unknown, or videos < 3   ->   INSUFFICIENT_DATA` with `either axis unknown   ->   INSUFFICIENT_DATA`, and add a line under it: *"A topic below `min_n.topic_page_min_videos` renders `1 video, need 3` on its topic page. That is the page's state, not the verdict. See decisions 0009."*
2. `docs/system.md` §4: change *"Nine bundles under `_db/`"* to *"Eight bundles under `_db/`"* and correct the same count in `_db/README.md`. `review_queue.json` was deleted and the count was never updated. Also change the illustrative `indie.score` from `0.66` to `0.58`, which is what the three thresholds in `config/thresholds.json` actually produce (conflict C3).
3. `docs/system.md` §2: add `read.py`, `verdict.py` and `bundles/` to the `pipeline/` tree, and add `_raw/videos/`, `_raw/keywords/`, `_raw/quota/` and `_db/assets/` to the layer map. Mirror the `_raw/` additions into `_raw/README.md`.

- [ ] **Step 6: Update `CLAUDE.md` and the skills README**

In `CLAUDE.md`, replace the *"Spec stage. No code exists yet"* block with the real state: the commands now run, build steps 0 to 8 are done, and the next step is 9 (the web shell). Update `.agents/skills/README.md` to mark four of the six skills as built.

- [ ] **Step 7: Full verification**

Run every check named in this plan, in one go:

```bash
pytest -q
ruff check pipeline test_anchors.py scripts
python3 -m pipeline.snapshot --dry-run
python3 -m pipeline.build_data
python3 -c "from pipeline import config, util; \
o=util.read_json(config.db_dir()/'opportunities.json'); \
m=util.read_json(config.db_dir()/'meta.json'); \
assert m['thresholds_version']==config.thresholds()['version']; \
print(len(o['rows']),'topics scored, build step', m['build_step'])"
```

Expected: every test passing, ruff clean, the bundles rebuilt, and the assertion holding. Do not report this task complete without pasting the actual output of these commands.

- [ ] **Step 8: Commit**

```bash
rtk git add .agents/skills/ scripts/ait-snapshot.plist docs/ CLAUDE.md _raw/README.md _db/README.md
rtk git commit -m "feat(skills): four ait-* wrappers, launchd agent, and the doc corrections"
```

---

## What this plan does not build

Named here so nobody has to infer it from an absence.

| Deferred | Where it lands |
|---|---|
| `web/`, the Next.js app on port 3002, trust tokens, the sortable table | plan 2, build steps 9 to 10 |
| The gamified top-5 card grid and the opportunity table with expandable derivations | plan 2 |
| Channel pages, the comment table with the lag column, `/compare` | plan 3, build steps 11 to 12 |
| Comment classification into the four actionable categories, and channel blurbs | plan 3, build step 12 |
| The 20-video manual spike measuring artifact capture against the 50% floor | plan 4, build step 13, **a hard gate** |
| Transcript extraction, trunk/fork synthesis, the mind map, the path judge | plan 5, build steps 14 to 16 |
| Reply drafts and deep links, long-form OCR | plan 6, build steps 17 to 18 |
| `T13`, splitting `videos.json` and `comments.json` by route | plan 2, once bundle sizes are real |

`blurb`, `nodes`, `edges` and `unserved` ship as `null` or `[]` from this plan, exactly as
`system.md` §4 specifies, so the later plans fill bundles rather than replacing them.

## Follow-on plans

Write plan 2 next. It is cleanly separable because `system.md` §4 freezes the bundle contract, and
this plan produces every bundle it needs. Its first task should be `web/lib/bundles.test.ts`, the
schema parity check, run against the real `_db/` output of this plan.

---

## Self-review

**Spec coverage.** Build steps 0 through 8 of spec §10, and tasks T1, T2, T2b, T2c, T3, T3b, T4,
T4b, T5, T5b, T6, T6b, T7, T8, T9, T10, T10b, T15, T16, T17, T19 and T20 of system.md §11, each map
to a task above. T18 (the leaderboard bundle) is Task 17's `bundles/channels.py`. T12, T13, T21,
T21b, T22 and T3c are web work and are listed as deferred. Of system.md §10's test plan, every
Python module named there has its tests here except `test_snapshot.py`'s vidIQ-backfill-merge case,
which lives in `test_vidiq.py` beside the code that does the merging.

**Failure modes.** All eleven rows of system.md §9 have a named test in this plan: absent channel
(Task 5), `age_days == 0` (Task 13), missed snapshot day (Task 7), corrupt vidIQ point (Task 7),
video deleted (Task 6), zero or two self channels (Tasks 1 and 5), leaf becomes a parent (Tasks 2
and 18), sub delta below bucket (Task 8), category without evidence (Task 18), unclassified comment
(Tasks 12 and 18), trending scrape fails (Task 14).

**Unresolved before Task 1 can start.** The three human blockers in Task 4 step 6. Nothing before
Task 4 depends on them, so Tasks 1 through 3 can begin immediately.
