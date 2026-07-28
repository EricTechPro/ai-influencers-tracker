# Topics Recent Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a windowed "what went up this week" feed to `/topics`, ranked by vidIQ's breakout score, with LLM-named pattern rows underneath that resolve to promote / add-to-leaf / below-floor.

**Architecture:** A new `pipeline/outliers.py` fetches vidIQ outliers for the 72-channel roster in batches of 24 and writes them to `_synthesize/outliers/<date>.json` (they cost credits, so they land in the paid layer). A new `pipeline/bundles/recent.py` copies that into a slim `_db/recent.json`. The web reads that one bundle and does all filtering client-side, so the window, format, and per-channel toggles cost nothing.

**Tech Stack:** Python 3 stdlib only (`pipeline/`), Next.js 16 + React 19 + TypeScript (`web/`), pytest, vitest, ruff.

## Global Constraints

- **Never assert a number nobody returned.** Missing data is a state, never a zero. A failed vidIQ batch is recorded as failed; it never silently shortens the result list.
- **Three claim tiers, never blended.** `breakout_score` is `vendor` (vidIQ computed it, we cannot show its working). `existing_leaf` is `derived` (a deterministic alias match). `pattern` label and membership are `inference` and always render beside their evidence.
- **Layer direction is one-way:** `config/` (humans write) → `_raw/` (as the API returned it) → `_synthesize/` (cost money) → `_db/` (what the web reads). The pipeline never writes into `config/`.
- **`pipeline/` imports stdlib only.** It never imports a skill or `web/`. `test_anchors.py` enforces this.
- **Standard library first.** No new Python or npm dependency in this plan.
- **A number belongs in `config/thresholds.json` only if changing it changes what the dashboard tells you to do.** Everything else is a module constant.
- **Ruff line-length is 100** for `pipeline/`. Run `ruff check pipeline` before every commit.
- **Every test runs against a temp `AIT_ROOT`** via the `ait_root` fixture in `pipeline/conftest.py`. No test ever spends a vidIQ credit — the `VidIQ` client takes an injectable `transport`, and all tests use a fake one.
- **`_db/` rebuilds must be byte-identical.** Every bundle is written whole with sorted keys via `util.write_json`.
- **Conventional commits:** `feat` `fix` `docs` `refactor` `data` `chore` `test`.

---

### Task 1: Start the snapshot clock

The evergreen "still climbing" section cannot be built until view-count history exists. `_db/meta.json` reports `days_present: 1, days_missing: 89` because `scripts/ait-snapshot.plist` was never installed. Installing it now means the first delta lands tomorrow instead of on the day someone remembers. Nothing else in this plan depends on it.

**Files:**
- Modify: none (runs an existing installer script)

**Interfaces:**
- Consumes: nothing
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Confirm it is not already installed**

Run: `ls ~/Library/LaunchAgents/ | grep -i ait`
Expected: no output (not installed)

- [ ] **Step 2: Read the installer before running it**

Run: `cat scripts/install_ait_snapshot_launchd.sh`
Confirm it copies `scripts/ait-snapshot.plist` into `~/Library/LaunchAgents/` and calls `launchctl load`. If it does anything else, stop and report rather than running it.

- [ ] **Step 3: Run the installer**

Run: `bash scripts/install_ait_snapshot_launchd.sh`

- [ ] **Step 4: Verify it is registered**

Run: `launchctl list | grep -i ait`
Expected: one line showing the job.

- [ ] **Step 5: Verify the sweep would run without spending anything**

Run: `python3 -m pipeline.snapshot --dry-run`
Expected: a cost table, and no files written.

- [ ] **Step 6: Commit**

Nothing to commit if the installer only touched `~/Library/LaunchAgents/`. If it modified a tracked file:

```bash
git add -A scripts/
git commit -m "chore: install the daily snapshot launchd agent"
```

---

### Task 2: Batch the roster for vidIQ

vidIQ's `vidiq_outliers` accepts a `channelIds` array, but **72 IDs in one call fails and 24 succeeds** (verified live on 2026-07-29). This task is the pure batching function, with no network in it, so it is testable for free.

**Files:**
- Create: `pipeline/outliers.py`
- Test: `pipeline/test_outliers.py`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `BATCH_SIZE: int = 24`
  - `OUTLIER_COST: int = 5`
  - `batches(channel_ids: list[str], size: int = BATCH_SIZE) -> list[list[str]]`

- [ ] **Step 1: Write the failing test**

Create `pipeline/test_outliers.py`:

```python
"""Outlier fetching. Every test uses a fake transport; none ever spends a credit."""
from __future__ import annotations

from pipeline import outliers


def test_batches_splits_at_the_vendor_limit():
    ids = [f"UC{i:03d}" for i in range(72)]
    groups = outliers.batches(ids)
    assert len(groups) == 3
    assert [len(g) for g in groups] == [24, 24, 24]
    assert [i for g in groups for i in g] == ids


def test_batches_keeps_a_short_final_group():
    ids = [f"UC{i:03d}" for i in range(50)]
    groups = outliers.batches(ids)
    assert [len(g) for g in groups] == [24, 24, 2]


def test_batches_of_an_empty_roster_is_empty_not_one_empty_group():
    assert outliers.batches([]) == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest pipeline/test_outliers.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'pipeline.outliers'`

- [ ] **Step 3: Write minimal implementation**

Create `pipeline/outliers.py`:

```python
"""vidIQ breakout scores for the roster. Metered, so it lands in _synthesize/, never _raw/.

The score is vidIQ's, not ours. pipeline/multiplier.py still serves the taxonomy shelves; this
module exists because our median-over-mature-uploads baseline disagreed with vidIQ by roughly 2x
on every shared video, and vidIQ additionally normalises by video age, which we cannot do until
the snapshot series exists. See docs/superpowers/specs/2026-07-28-topics-recent-feed-design.md.
"""
from __future__ import annotations

# vidIQ rejects a 72-id request and accepts a 24-id one. Verified live 2026-07-29. This is a
# vendor constraint, not a tuning knob, which is why it is a constant and not in thresholds.json.
BATCH_SIZE = 24
OUTLIER_COST = 5


def batches(channel_ids: list[str], size: int = BATCH_SIZE) -> list[list[str]]:
    """The roster split into requests vidIQ will actually accept, order preserved."""
    return [channel_ids[i:i + size] for i in range(0, len(channel_ids), size)]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest pipeline/test_outliers.py -v`
Expected: 3 passed

- [ ] **Step 5: Lint**

Run: `ruff check pipeline/outliers.py pipeline/test_outliers.py`
Expected: `All checks passed!`

- [ ] **Step 6: Commit**

```bash
git add pipeline/outliers.py pipeline/test_outliers.py
git commit -m "feat(outliers): batch the roster at vidIQ's 24-channel request limit"
```

---

### Task 3: Normalise one vidIQ response row

vidIQ returns camelCase keys and an epoch timestamp. The rest of `_db/` is snake_case with ISO-8601 strings. This task is the pure row mapper, still no network.

**Files:**
- Modify: `pipeline/outliers.py`
- Test: `pipeline/test_outliers.py`

**Interfaces:**
- Consumes: `pipeline.util.parse_ts`, `pipeline.util.iso_z`
- Produces: `normalise(row: dict) -> dict` returning exactly these keys:
  `video_id, title, published_at, view_count, duration_s, type, channel_id, channel_name, breakout_score, vph, engagement_rate`

- [ ] **Step 1: Write the failing test**

Append to `pipeline/test_outliers.py`:

```python
# One real row from vidiq_outliers on 2026-07-29, trimmed to the keys we read.
LIVE_ROW = {
    "videoId": "IbFaY3xFpZM",
    "videoTitle": "I Tested 100+ Hermes Agent Automations. These Are The Best",
    "videoPublishedAt": 1784848095,
    "videoDuration": 1045,
    "channelId": "UC4SgqYQmdTCKXUoer2U-lcg",
    "channelTitle": "Dubibubi",
    "viewCount": 36869,
    "breakoutScore": 9.59,
    "videoType": "long",
    "vph": 145.71,
    "engagementRate": 0.049,
}


def test_normalise_maps_the_live_shape():
    row = outliers.normalise(LIVE_ROW)
    assert row == {
        "video_id": "IbFaY3xFpZM",
        "title": "I Tested 100+ Hermes Agent Automations. These Are The Best",
        "published_at": "2026-07-23T09:48:15Z",
        "view_count": 36869,
        "duration_s": 1045,
        "type": "long",
        "channel_id": "UC4SgqYQmdTCKXUoer2U-lcg",
        "channel_name": "Dubibubi",
        "breakout_score": 9.59,
        "vph": 145.71,
        "engagement_rate": 0.049,
    }


def test_normalise_never_recomputes_or_rounds_the_score():
    row = outliers.normalise({**LIVE_ROW, "breakoutScore": 17.934999})
    assert row["breakout_score"] == 17.934999


def test_normalise_keeps_a_missing_score_as_none_not_zero():
    payload = {k: v for k, v in LIVE_ROW.items() if k != "breakoutScore"}
    assert outliers.normalise(payload)["breakout_score"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest pipeline/test_outliers.py -v -k normalise`
Expected: FAIL with `AttributeError: module 'pipeline.outliers' has no attribute 'normalise'`

- [ ] **Step 3: Write minimal implementation**

Add to `pipeline/outliers.py`, with the import at the top of the file:

```python
from . import util
```

```python
def normalise(row: dict) -> dict:
    """One vidIQ row in _db/'s vocabulary. breakout_score is carried through untouched:
    it is a vendor number and rounding it would be editing someone else's measurement."""
    return {
        "video_id": row.get("videoId"),
        "title": row.get("videoTitle"),
        "published_at": util.iso_z(util.parse_ts(row["videoPublishedAt"])),
        "view_count": row.get("viewCount"),
        "duration_s": row.get("videoDuration"),
        "type": row.get("videoType"),
        "channel_id": row.get("channelId"),
        "channel_name": row.get("channelTitle"),
        "breakout_score": row.get("breakoutScore"),
        "vph": row.get("vph"),
        "engagement_rate": row.get("engagementRate"),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest pipeline/test_outliers.py -v`
Expected: 6 passed

- [ ] **Step 5: Lint**

Run: `ruff check pipeline/outliers.py pipeline/test_outliers.py`
Expected: `All checks passed!`

- [ ] **Step 6: Commit**

```bash
git add pipeline/outliers.py pipeline/test_outliers.py
git commit -m "feat(outliers): normalise a vidIQ row without touching its score"
```

---

### Task 4: Fetch every batch, and record a failure as a failure

The one behaviour that matters here: if batch 2 of 3 fails, the run must not return batch 1 and 3's videos as though they were the whole roster. A short list that looks complete is the failure mode this repo exists to avoid.

**Files:**
- Modify: `pipeline/outliers.py`
- Test: `pipeline/test_outliers.py`

**Interfaces:**
- Consumes: `pipeline.vidiq.VidIQ`, `pipeline.vidiq.CostGuard`, `pipeline.vidiq.VidiqError`
- Produces:
  `fetch(client, guard, channel_ids: list[str], content_type: str = "long", window: str = "thisMonth", limit: int = 100) -> dict`
  returning `{"videos": [...], "coverage": {"channels_requested": int, "batches_ok": int, "batches_failed": int, "missing_channel_ids": [...]}, "credits": int, "window": str, "content_type": str}`

- [ ] **Step 1: Write the failing test**

Append to `pipeline/test_outliers.py`:

```python
import pytest

from pipeline import vidiq


class FakeClient:
    """Stands in for VidIQ. Records calls and replays scripted replies, one per batch."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    def call(self, tool, arguments):
        self.calls.append((tool, arguments))
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def _guard():
    return vidiq.CostGuard(balance=1000, reserve=0, ceiling=1000)


def test_fetch_makes_one_call_per_batch_and_merges_the_videos():
    ids = [f"UC{i:03d}" for i in range(48)]
    client = FakeClient([{"videos": [LIVE_ROW]}, {"videos": [LIVE_ROW]}])
    result = outliers.fetch(client, _guard(), ids)

    assert len(client.calls) == 2
    assert result["coverage"] == {
        "channels_requested": 48,
        "batches_ok": 2,
        "batches_failed": 0,
        "missing_channel_ids": [],
    }
    assert result["credits"] == 10
    assert len(result["videos"]) == 2


def test_fetch_sends_the_arguments_vidiq_expects():
    client = FakeClient([{"videos": []}])
    outliers.fetch(client, _guard(), ["UC001"], content_type="short", window="thisWeek")
    tool, args = client.calls[0]
    assert tool == "vidiq_outliers"
    assert args == {
        "channelIds": ["UC001"],
        "contentType": "short",
        "publishedWithin": "thisWeek",
        "limit": 100,
        "sort": "breakoutScore",
    }


def test_a_failed_batch_is_reported_missing_not_silently_dropped():
    ids = [f"UC{i:03d}" for i in range(48)]
    client = FakeClient([{"videos": [LIVE_ROW]}, vidiq.VidiqError("boom")])
    result = outliers.fetch(client, _guard(), ids)

    assert result["coverage"]["batches_ok"] == 1
    assert result["coverage"]["batches_failed"] == 1
    assert result["coverage"]["missing_channel_ids"] == ids[24:]
    assert len(result["videos"]) == 1


def test_fetch_stops_when_the_cost_guard_refuses():
    guard = vidiq.CostGuard(balance=1000, reserve=0, ceiling=5)
    client = FakeClient([{"videos": []}, {"videos": []}])
    with pytest.raises(vidiq.CostGuardError):
        outliers.fetch(client, guard, [f"UC{i:03d}" for i in range(48)])


def test_fetch_dedupes_a_video_returned_by_two_batches():
    client = FakeClient([{"videos": [LIVE_ROW]}, {"videos": [LIVE_ROW]}])
    result = outliers.fetch(client, _guard(), [f"UC{i:03d}" for i in range(48)])
    assert len({v["video_id"] for v in result["videos"]}) == 1
    assert len(result["videos"]) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest pipeline/test_outliers.py -v -k fetch`
Expected: FAIL with `AttributeError: module 'pipeline.outliers' has no attribute 'fetch'`

- [ ] **Step 3: Write minimal implementation**

Add to `pipeline/outliers.py`, extending the import line to `from . import util, vidiq`:

```python
def fetch(client, guard, channel_ids: list[str], content_type: str = "long",
          window: str = "thisMonth", limit: int = 100) -> dict:
    """Every batch vidIQ will accept, merged. A batch that fails is named, not absorbed.

    Returning 48 channels' outliers as if they were 72 would read as "nothing broke out on the
    other 24", which is a claim nobody made. coverage carries the truth to the page.
    """
    groups = batches(channel_ids)
    by_id: dict[str, dict] = {}
    ok = 0
    missing: list[str] = []

    for group in groups:
        guard.check(OUTLIER_COST, f"vidiq_outliers x{len(group)} {content_type}")
        try:
            payload = client.call("vidiq_outliers", {
                "channelIds": list(group),
                "contentType": content_type,
                "publishedWithin": window,
                "limit": limit,
                "sort": "breakoutScore",
            })
        except vidiq.VidiqError:
            missing.extend(group)
            continue
        finally:
            guard.record(OUTLIER_COST)
        ok += 1
        for raw in payload.get("videos") or []:
            row = normalise(raw)
            if row["video_id"]:
                by_id.setdefault(row["video_id"], row)

    videos = sorted(by_id.values(),
                    key=lambda v: (-(v["breakout_score"] or 0), v["video_id"]))
    return {
        "videos": videos,
        "coverage": {
            "channels_requested": len(channel_ids),
            "batches_ok": ok,
            "batches_failed": len(groups) - ok,
            "missing_channel_ids": missing,
        },
        "credits": OUTLIER_COST * len(groups),
        "window": window,
        "content_type": content_type,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest pipeline/test_outliers.py -v`
Expected: 11 passed

- [ ] **Step 5: Lint**

Run: `ruff check pipeline/outliers.py pipeline/test_outliers.py`
Expected: `All checks passed!`

- [ ] **Step 6: Commit**

```bash
git add pipeline/outliers.py pipeline/test_outliers.py
git commit -m "feat(outliers): fetch every batch and name the ones that failed"
```

---

### Task 5: Write the sweep to `_synthesize/` behind a cost guard

**Files:**
- Modify: `pipeline/outliers.py`
- Test: `pipeline/test_outliers.py`

**Interfaces:**
- Consumes: `pipeline.config.synth_dir`, `pipeline.config.roster`, `pipeline.util.write_json`, `pipeline.util.date_str`
- Produces:
  - `sweep(roster, client, guard, today, dry_run=True) -> dict`
  - `latest(today=None) -> dict | None` reading the newest `_synthesize/outliers/*.json`
  - a `main()` CLI at `python3 -m pipeline.outliers [--no-dry-run]`

- [ ] **Step 1: Write the failing test**

Append to `pipeline/test_outliers.py`:

```python
import datetime as dt
import json


def test_sweep_dry_run_spends_nothing_and_writes_nothing(ait_root, capsys):
    from pipeline import config
    client = FakeClient([])
    result = outliers.sweep(config.roster(), client, _guard(), dt.date(2026, 7, 29))

    assert result["dry_run"] is True
    assert result["spent"] == 0
    assert client.calls == []
    assert not (ait_root / "_synthesize" / "outliers").exists()
    assert "credits" in capsys.readouterr().out


def test_sweep_writes_both_formats_into_one_dated_file(ait_root):
    from pipeline import config
    # 3 roster channels -> 1 batch per format -> 2 calls
    client = FakeClient([{"videos": [LIVE_ROW]}, {"videos": []}])
    result = outliers.sweep(config.roster(), client, _guard(), dt.date(2026, 7, 29),
                            dry_run=False)

    path = ait_root / "_synthesize" / "outliers" / "2026-07-29.json"
    assert path.exists()
    written = json.loads(path.read_text())
    assert written["date"] == "2026-07-29"
    assert [f["content_type"] for f in written["formats"]] == ["long", "short"]
    assert written["formats"][0]["videos"][0]["video_id"] == "IbFaY3xFpZM"
    assert result["spent"] == 10


def test_latest_returns_none_when_no_sweep_has_run(ait_root):
    assert outliers.latest() is None


def test_latest_returns_the_newest_file(ait_root):
    from pipeline import config, util
    for date in ("2026-07-27", "2026-07-29", "2026-07-28"):
        util.write_json(config.synth_dir() / "outliers" / f"{date}.json", {"date": date})
    assert outliers.latest()["date"] == "2026-07-29"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest pipeline/test_outliers.py -v -k "sweep or latest"`
Expected: FAIL with `AttributeError: module 'pipeline.outliers' has no attribute 'sweep'`

- [ ] **Step 3: Write minimal implementation**

Extend the import line to `from . import config, util, vidiq` and add:

```python
import argparse
import datetime as dt

FORMATS = ("long", "short")


def sweep(roster: list[dict], client, guard, today: dt.date,
          window: str = "thisMonth", dry_run: bool = True) -> dict:
    """One dated file holding both formats. thisMonth is fetched once; the 7d and 14d views on
    the page are filtered from it client-side, so the window toggle costs nothing."""
    channel_ids = [row["channel_id"] for row in roster]
    per_format = OUTLIER_COST * len(batches(channel_ids))
    print(guard.preview([(f"vidiq_outliers {fmt} x{len(batches(channel_ids))}", per_format)
                         for fmt in FORMATS]))
    if dry_run:
        return {"formats": len(FORMATS), "credits": per_format * len(FORMATS),
                "spent": 0, "dry_run": True}

    formats = [fetch(client, guard, channel_ids, content_type=fmt, window=window)
               for fmt in FORMATS]
    util.write_json(config.synth_dir() / "outliers" / f"{util.date_str(today)}.json",
                    {"date": util.date_str(today), "window": window, "formats": formats})
    return {"formats": len(formats), "credits": per_format * len(FORMATS),
            "spent": guard.spent, "dry_run": False}


def latest(today: dt.date | None = None) -> dict | None:
    """The newest sweep on disk, or None. None is a state: no sweep has run yet."""
    directory = config.synth_dir() / "outliers"
    if not directory.is_dir():
        return None
    files = sorted(directory.glob("*.json"))
    if not files:
        return None
    return util.read_json(files[-1])


def main() -> int:
    parser = argparse.ArgumentParser(description="fetch vidIQ breakout scores for the roster")
    parser.add_argument("--no-dry-run", action="store_true", help="actually spend credits")
    args = parser.parse_args()
    client = vidiq.client_from_env()
    guard = vidiq.CostGuard(vidiq.balance(client).get("totalCredits", 0))
    summary = sweep(config.roster(), client, guard, util.today(),
                    dry_run=not args.no_dry_run)
    for key, value in summary.items():
        print(f"{key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

`util.read_json(path, default=None)` already exists in `pipeline/util.py`. Do not add it.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest pipeline/test_outliers.py -v`
Expected: 15 passed

- [ ] **Step 5: Verify the CLI dry run costs nothing**

Run: `python3 -m pipeline.outliers`
Expected: a cost table showing `total 30`, `dry_run: True`, `spent: 0`, and no file under `_synthesize/outliers/`.

- [ ] **Step 6: Lint**

Run: `ruff check pipeline/outliers.py pipeline/test_outliers.py pipeline/util.py`
Expected: `All checks passed!`

- [ ] **Step 7: Commit**

```bash
git add pipeline/outliers.py pipeline/test_outliers.py pipeline/util.py
git commit -m "feat(outliers): dated sweep into _synthesize behind the cost guard"
```

---

### Task 6: Build `_db/recent.json`

**Files:**
- Create: `pipeline/bundles/recent.py`
- Modify: `pipeline/build_data.py` (add `bundles.recent.write(ctx)` to `build()`)
- Modify: `config/thresholds.json` (add the `outliers` block)
- Test: `pipeline/bundles/test_recent.py`

**Interfaces:**
- Consumes: `pipeline.outliers.latest`
- Produces: `_db/recent.json` with keys
  `version, generated_at, source, fetched_at, window, coverage, videos, patterns, trust`
  where each video row is `{video_id, title, published_at, view_count, duration_s, type, channel_id, channel_name, breakout_score, pattern_id}`

- [ ] **Step 1: Add the two thresholds that change what you are told to do**

In `config/thresholds.json`, after the `"multiplier"` block, add:

```json
  "outliers": {
    "per_channel_cap": 2,
    "display_floor": 2.5,
    "_comment": "per_channel_cap is how many of one channel's outliers reach the grid before the rest fall to the tail. On the live 2026-07-29 week AI Engineer alone held 6 of the 28 outliers, posting a conference back-catalogue, so uncapped the first screen is one channel. display_floor is the breakout score under which a row goes to the tail rather than the grid. Both change what the feed shows you, which is why they live here."
  },
```

Also add the same block to `FIXTURE_THRESHOLDS` in `pipeline/conftest.py` (without `_comment`), and bump `"version"` in both from `3` to `4`.

- [ ] **Step 2: Write the failing test**

Create `pipeline/bundles/test_recent.py`:

```python
"""recent.json: vidIQ's outliers, in the shape the web reads."""
from __future__ import annotations

import datetime as dt
import json

from pipeline import build_data, config, util

ROW = {
    "video_id": "IbFaY3xFpZM",
    "title": "I Tested 100+ Hermes Agent Automations. These Are The Best",
    "published_at": "2026-07-23T09:48:15Z",
    "view_count": 36869,
    "duration_s": 1045,
    "type": "long",
    "channel_id": "UCcole",
    "channel_name": "Cole Medin",
    "breakout_score": 9.59,
    "vph": 145.71,
    "engagement_rate": 0.049,
}


def _sweep(ait_root, videos, coverage=None):
    util.write_json(config.synth_dir() / "outliers" / "2026-07-29.json", {
        "date": "2026-07-29",
        "window": "thisMonth",
        "formats": [{
            "content_type": "long",
            "window": "thisMonth",
            "videos": videos,
            "coverage": coverage or {"channels_requested": 3, "batches_ok": 1,
                                     "batches_failed": 0, "missing_channel_ids": []},
            "credits": 5,
        }],
    })


def test_bundle_carries_the_vendor_score_and_names_its_source(ait_root):
    _sweep(ait_root, [ROW])
    build_data.build(dt.date(2026, 7, 29))

    bundle = json.loads((config.db_dir() / "recent.json").read_text())
    assert bundle["source"] == "vidiq"
    assert bundle["trust"]["breakout_score"] == "vendor"
    assert bundle["videos"][0]["breakout_score"] == 9.59
    assert bundle["videos"][0]["pattern_id"] is None


def test_rows_are_sorted_by_breakout_score_descending(ait_root):
    _sweep(ait_root, [
        {**ROW, "video_id": "low", "breakout_score": 2.1},
        {**ROW, "video_id": "high", "breakout_score": 9.5},
        {**ROW, "video_id": "mid", "breakout_score": 4.0},
    ])
    build_data.build(dt.date(2026, 7, 29))

    bundle = json.loads((config.db_dir() / "recent.json").read_text())
    assert [v["video_id"] for v in bundle["videos"]] == ["high", "mid", "low"]


def test_a_failed_batch_reaches_the_bundle_as_coverage(ait_root):
    _sweep(ait_root, [ROW], coverage={"channels_requested": 72, "batches_ok": 2,
                                      "batches_failed": 1,
                                      "missing_channel_ids": ["UCgone"]})
    build_data.build(dt.date(2026, 7, 29))

    bundle = json.loads((config.db_dir() / "recent.json").read_text())
    assert bundle["coverage"]["batches_failed"] == 1
    assert bundle["coverage"]["missing_channel_ids"] == ["UCgone"]


def test_no_sweep_yet_is_an_empty_bundle_that_says_so(ait_root):
    build_data.build(dt.date(2026, 7, 29))

    bundle = json.loads((config.db_dir() / "recent.json").read_text())
    assert bundle["videos"] == []
    assert bundle["fetched_at"] is None


def test_rebuild_is_byte_identical(ait_root):
    _sweep(ait_root, [ROW])
    build_data.build(dt.date(2026, 7, 29))
    first = (config.db_dir() / "recent.json").read_bytes()
    build_data.build(dt.date(2026, 7, 29))
    assert (config.db_dir() / "recent.json").read_bytes() == first
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pytest pipeline/bundles/test_recent.py -v`
Expected: FAIL — `recent.json` does not exist.

- [ ] **Step 4: Write the bundle**

Create `pipeline/bundles/recent.py`:

```python
"""recent.json: vidIQ's breakout scores, flattened for the /topics feed.

Its own bundle rather than a slice of videos.json, which is 16.7 MB and deliberately never
shipped to the browser whole. This one carries card fields only, for one month of outliers, so
the window / format / per-channel toggles are all client-side filters over a payload that is
already in memory.
"""
from __future__ import annotations

from .. import config, outliers, util

VERSION = 1
TRUST = {"breakout_score": "vendor", "pattern": "inference", "existing_leaf": "derived"}

CARD_KEYS = ("video_id", "title", "published_at", "view_count", "duration_s", "type",
             "channel_id", "channel_name", "breakout_score")


def build(ctx) -> dict:
    sweep = outliers.latest()
    videos: list[dict] = []
    coverage = {"channels_requested": 0, "batches_ok": 0, "batches_failed": 0,
                "missing_channel_ids": []}

    if sweep:
        for block in sweep.get("formats") or []:
            for row in block.get("videos") or []:
                videos.append({**{k: row.get(k) for k in CARD_KEYS}, "pattern_id": None})
            found = block.get("coverage") or {}
            coverage = {
                "channels_requested": max(coverage["channels_requested"],
                                          found.get("channels_requested", 0)),
                "batches_ok": coverage["batches_ok"] + found.get("batches_ok", 0),
                "batches_failed": coverage["batches_failed"] + found.get("batches_failed", 0),
                "missing_channel_ids": sorted(
                    set(coverage["missing_channel_ids"])
                    | set(found.get("missing_channel_ids") or [])),
            }

    videos.sort(key=lambda v: (-(v["breakout_score"] or 0), v["video_id"]))
    return {
        "version": VERSION,
        "generated_at": ctx.generated_at,
        "source": "vidiq",
        "fetched_at": sweep.get("date") if sweep else None,
        "window": sweep.get("window") if sweep else None,
        "coverage": coverage,
        "videos": videos,
        "patterns": [],
        "trust": dict(TRUST),
    }


def write(ctx) -> None:
    util.write_json(config.db_dir() / "recent.json", build(ctx))
```

- [ ] **Step 5: Register it in the build**

In `pipeline/build_data.py`, inside `build()`, add after `bundles.topic_pages.write(ctx)`:

```python
    bundles.recent.write(ctx)
```

`pipeline/build_data.py`'s import line already reads `from . import bundles, ...` and needs no
change. The new module is reached through `bundles/__init__.py`, whose single import line becomes:

```python
from . import channels, comments, meta, opportunities, recent, snapshots, topic_pages, videos  # noqa: F401
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pytest pipeline/bundles/test_recent.py -v`
Expected: 5 passed

- [ ] **Step 7: Run the whole suite so nothing else moved**

Run: `pytest -q`
Expected: all pass. If `test_config.py` asserts a thresholds version, update it to 4.

- [ ] **Step 8: Lint**

Run: `ruff check pipeline`
Expected: `All checks passed!`

- [ ] **Step 9: Commit**

```bash
git add pipeline/bundles/recent.py pipeline/bundles/test_recent.py \
        pipeline/bundles/__init__.py pipeline/build_data.py \
        pipeline/conftest.py config/thresholds.json
git commit -m "feat(recent): build _db/recent.json from the vidIQ sweep"
```

---

### Task 7: The web filter, sort, and cap

All three toggles are pure functions over the bundle. No I/O, so this is the cheapest place to get the behaviour right.

**Files:**
- Create: `web/lib/recent.ts`
- Create: `web/lib/recent.test.ts`
- Modify: `web/lib/types.ts`
- Modify: `web/lib/bundles.ts`

**Interfaces:**
- Consumes: `_db/recent.json`
- Produces:
  - `RecentRow`, `PatternRow`, `RecentBundle` in `types.ts`
  - `loadRecent(): RecentBundle` in `bundles.ts`
  - `type FormatKey = "videos" | "shorts" | "all"`
  - `type RecentWindow = 7 | 14 | 30`
  - `selectRecent(bundle, opts, today): {ranked: RecentRow[], tail: RecentRow[]}`
    where `opts` is `{window: RecentWindow, format: FormatKey, perChannelCap: number | null, floor: number}`

- [ ] **Step 1: Add the types**

Append to `web/lib/types.ts`:

```ts
export interface RecentRow {
  video_id: string
  title: string
  published_at: string
  view_count: number | null
  duration_s: number | null
  type: "short" | "long"
  channel_id: string
  channel_name: string
  /** vidIQ's own breakout score. A vendor number: we never recompute or round it,
   *  and null means vidIQ did not return one, not that the video underperformed. */
  breakout_score: number | null
  pattern_id: string | null
}

export type PatternAction = "promote" | "add_to_leaf" | "below_floor"

export interface PatternRow {
  pattern_id: string
  label: string
  evidence: string[]
  creator_count: number
  existing_leaf: string | null
  action: PatternAction
}

export interface RecentCoverage {
  channels_requested: number
  batches_ok: number
  batches_failed: number
  missing_channel_ids: string[]
}

export interface RecentBundle {
  version: number
  generated_at: string
  source: "vidiq"
  fetched_at: string | null
  window: string | null
  coverage: RecentCoverage
  videos: RecentRow[]
  patterns: PatternRow[]
  trust: Record<string, string>
}
```

- [ ] **Step 2: Add the loader**

In `web/lib/bundles.ts`, add `RecentBundle` to the type import list and add beside `loadTopicPages`:

```ts
export function loadRecent(): RecentBundle {
  return load("recent.json")
}
```

- [ ] **Step 3: Write the failing test**

Create `web/lib/recent.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { selectRecent } from "./recent"
import type { RecentBundle, RecentRow } from "./types"

const TODAY = new Date("2026-07-29T00:00:00Z")

function row(over: Partial<RecentRow> & { video_id: string }): RecentRow {
  return {
    title: "t",
    published_at: "2026-07-27T00:00:00Z",
    view_count: 1000,
    duration_s: 600,
    type: "long",
    channel_id: "UCa",
    channel_name: "A",
    breakout_score: 5,
    pattern_id: null,
    ...over,
  }
}

function bundle(videos: RecentRow[]): RecentBundle {
  return {
    version: 1,
    generated_at: "2026-07-29T00:00:00Z",
    source: "vidiq",
    fetched_at: "2026-07-29",
    window: "thisMonth",
    coverage: {
      channels_requested: 72,
      batches_ok: 3,
      batches_failed: 0,
      missing_channel_ids: [],
    },
    videos,
    patterns: [],
    trust: {},
  }
}

const OPTS = { window: 30 as const, format: "videos" as const, perChannelCap: 2, floor: 2.5 }

describe("selectRecent windows", () => {
  it("keeps a video exactly N days old and drops one at N+1", () => {
    const b = bundle([
      row({ video_id: "in", published_at: "2026-07-22T00:00:00Z" }),
      row({ video_id: "out", published_at: "2026-07-21T00:00:00Z" }),
    ])
    const { ranked } = selectRecent(b, { ...OPTS, window: 7 }, TODAY)
    expect(ranked.map((v) => v.video_id)).toEqual(["in"])
  })
})

describe("selectRecent format", () => {
  it("videos means long-form only and shorts means the complement", () => {
    const b = bundle([
      row({ video_id: "long" }),
      row({ video_id: "short", type: "short" }),
    ])
    expect(
      selectRecent(b, { ...OPTS, format: "videos" }, TODAY).ranked.map((v) => v.video_id)
    ).toEqual(["long"])
    expect(
      selectRecent(b, { ...OPTS, format: "shorts" }, TODAY).ranked.map((v) => v.video_id)
    ).toEqual(["short"])
    expect(
      selectRecent(b, { ...OPTS, format: "all" }, TODAY).ranked.length
    ).toBe(2)
  })
})

describe("selectRecent per-channel cap", () => {
  it("keeps a channel's two highest and sends the rest to the tail", () => {
    const b = bundle([
      row({ video_id: "a1", breakout_score: 9 }),
      row({ video_id: "a2", breakout_score: 8 }),
      row({ video_id: "a3", breakout_score: 7 }),
    ])
    const { ranked, tail } = selectRecent(b, OPTS, TODAY)
    expect(ranked.map((v) => v.video_id)).toEqual(["a1", "a2"])
    expect(tail.map((v) => v.video_id)).toEqual(["a3"])
  })

  it("lifting the cap restores them in score order", () => {
    const b = bundle([
      row({ video_id: "a1", breakout_score: 9 }),
      row({ video_id: "a2", breakout_score: 8 }),
      row({ video_id: "a3", breakout_score: 7 }),
    ])
    const { ranked } = selectRecent(b, { ...OPTS, perChannelCap: null }, TODAY)
    expect(ranked.map((v) => v.video_id)).toEqual(["a1", "a2", "a3"])
  })
})

describe("selectRecent floor and nulls", () => {
  it("sends a row under the floor to the tail rather than dropping it", () => {
    const b = bundle([
      row({ video_id: "over", breakout_score: 3 }),
      row({ video_id: "under", breakout_score: 1.2, channel_id: "UCb" }),
    ])
    const { ranked, tail } = selectRecent(b, OPTS, TODAY)
    expect(ranked.map((v) => v.video_id)).toEqual(["over"])
    expect(tail.map((v) => v.video_id)).toEqual(["under"])
  })

  it("a null score is never sorted as a zero: it goes to the tail", () => {
    const b = bundle([row({ video_id: "unknown", breakout_score: null })])
    const { ranked, tail } = selectRecent(b, OPTS, TODAY)
    expect(ranked).toEqual([])
    expect(tail.map((v) => v.video_id)).toEqual(["unknown"])
  })

  it("an empty window is empty, not an error", () => {
    expect(selectRecent(bundle([]), OPTS, TODAY)).toEqual({ ranked: [], tail: [] })
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd web && npx vitest run lib/recent.test.ts`
Expected: FAIL — cannot resolve `./recent`

- [ ] **Step 5: Write the implementation**

Create `web/lib/recent.ts`:

```ts
import type { RecentBundle, RecentRow } from "./types"

export type FormatKey = "videos" | "shorts" | "all"
export type RecentWindow = 7 | 14 | 30

export interface RecentOptions {
  window: RecentWindow
  format: FormatKey
  /** how many of one channel's rows reach the grid; null lifts the cap entirely */
  perChannelCap: number | null
  /** breakout score under which a row goes to the tail instead of the grid */
  floor: number
}

export interface RecentSelection {
  ranked: RecentRow[]
  tail: RecentRow[]
}

const DAY_MS = 86_400_000

function ageDays(publishedAt: string, today: Date): number {
  return Math.floor((today.getTime() - Date.parse(publishedAt)) / DAY_MS)
}

function matchesFormat(row: RecentRow, format: FormatKey): boolean {
  if (format === "all") return true
  return format === "shorts" ? row.type === "short" : row.type === "long"
}

/**
 * The feed, as three filters over one bundle.
 *
 * Nothing is ever discarded: a row below the floor, over the per-channel cap, or carrying no
 * score at all lands in `tail` rather than vanishing. A null breakout_score means vidIQ did not
 * return one, which is not the same as a low one, so it is never sorted as a zero.
 *
 * The per-channel cap is the load-bearing one. On the live 2026-07-29 week a single channel held
 * 6 of the 28 outliers by posting a conference back-catalogue, which is exactly the subscriptions
 * page failure this feed exists to replace.
 */
export function selectRecent(
  bundle: RecentBundle,
  opts: RecentOptions,
  today: Date
): RecentSelection {
  const inWindow = bundle.videos.filter(
    (v) => matchesFormat(v, opts.format) && ageDays(v.published_at, today) <= opts.window
  )

  const scored = inWindow
    .filter((v) => v.breakout_score !== null && v.breakout_score >= opts.floor)
    .sort(
      (a, b) =>
        (b.breakout_score ?? 0) - (a.breakout_score ?? 0) ||
        a.video_id.localeCompare(b.video_id)
    )

  const belowFloor = inWindow.filter(
    (v) => v.breakout_score === null || v.breakout_score < opts.floor
  )

  const ranked: RecentRow[] = []
  const capped: RecentRow[] = []
  const seen = new Map<string, number>()
  for (const v of scored) {
    const n = seen.get(v.channel_id) ?? 0
    if (opts.perChannelCap !== null && n >= opts.perChannelCap) {
      capped.push(v)
      continue
    }
    seen.set(v.channel_id, n + 1)
    ranked.push(v)
  }

  return { ranked, tail: [...capped, ...belowFloor] }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd web && npx vitest run lib/recent.test.ts`
Expected: 9 passed

- [ ] **Step 7: Typecheck and the rest of the web suite**

Run: `cd web && npx tsc --noEmit && npx vitest run`
Expected: no type errors, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add web/lib/recent.ts web/lib/recent.test.ts web/lib/types.ts web/lib/bundles.ts
git commit -m "feat(web): filter, sort and cap the recent feed"
```

---

### Task 8: The YouTube-geometry card

A sibling to `video-card.tsx`, not a rewrite of it. The taxonomy shelves keep the stacked card; only the feed uses this grid card.

**Files:**
- Create: `web/components/grid-video-card.tsx`
- Modify: `web/app/globals.css`

**Interfaces:**
- Consumes: `RecentRow` from `types.ts`, `Avatar` from `./avatar`, `fmtInt`/`agoText` from `@/lib/trust`
- Produces: `<GridVideoCard v={row} isSelf={boolean} />`

- [ ] **Step 1: Add the styles**

Append to `web/app/globals.css`. These mirror `docs/mockups/topics-recent.html` exactly; that file is the reference render.

```css
/* ————— The recent feed: YouTube's grid geometry, this app's tokens —————
   Deliberately not .vcard. The shelves stack title-then-channel because they
   are 15rem rails; a 4-up grid reads faster with the face beside the title,
   which is what YouTube does and what the eye is already trained on. */
.ygrid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 16px 14px; }
@media (max-width: 60rem) { .ygrid { grid-template-columns: repeat(2, minmax(0,1fr)); } }

.ycard { display: block; color: inherit; text-decoration: none; }
.ycard:hover { text-decoration: none; }
.ycard:hover .ytitle { color: var(--primary); }

.ythumb {
  position: relative; display: block; aspect-ratio: 16/9; overflow: hidden;
  background: var(--muted); border: 1px solid var(--border); border-radius: 8px;
}
.ythumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
@media (prefers-reduced-motion: no-preference) {
  .ythumb img { transition: transform 200ms ease-out; }
  .ycard:hover .ythumb img { transform: scale(1.03); }
}
.ylen {
  position: absolute; right: 5px; bottom: 5px; padding: 0 4px; border-radius: 3px;
  background: rgba(0,0,0,0.8); color: #fff; font-size: 10px; font-weight: 600;
  font-variant-numeric: tabular-nums;
}
/* the breakout score takes the slot YouTube uses for LIVE / NEW: it is the sort key */
.ymult {
  position: absolute; left: 5px; bottom: 5px; padding: 1px 5px; border-radius: 3px;
  background: var(--v-make); color: #fff; font-size: 11px; font-weight: 700;
  font-variant-numeric: tabular-nums; letter-spacing: -0.01em;
}
.ymult.t5 { background: #1f8a4c; }
.ymult.t3 { background: #3f8f5f; }
.ymult.t2 { background: #6b7f74; }
.yshort {
  position: absolute; left: 5px; top: 5px; padding: 0 4px; border-radius: 3px;
  background: rgba(0,0,0,0.7); color: #fff; font-size: 9px; font-weight: 700;
  letter-spacing: 0.06em;
}
.ybody { display: flex; gap: 10px; padding: 9px 0 0; }
.ymeta { min-width: 0; }
.ytitle {
  font-size: 12.5px; font-weight: 600; line-height: 1.32; margin: 0 0 3px;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
}
.ychan {
  font-size: 11px; color: var(--muted-foreground);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ystat { font-size: 11px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
.yself { color: var(--primary); font-weight: 700; }
```

- [ ] **Step 2: Write the component**

Create `web/components/grid-video-card.tsx`:

```tsx
import { agoText, fmtInt } from "@/lib/trust"
import type { RecentRow } from "@/lib/types"
import { Avatar } from "./avatar"

function duration(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Louder the further past normal it ran. Bands only, never a recomputation. */
function scoreTier(score: number): string {
  if (score >= 10) return ""
  if (score >= 5) return "t5"
  if (score >= 3) return "t3"
  return "t2"
}

/**
 * One video in the recent feed, wearing YouTube's grid geometry.
 *
 * The number bottom-left is vidIQ's breakout score, not ours. Our own multiplier
 * (pipeline/multiplier.py) disagreed with it by roughly 2x on every shared video and cannot
 * normalise by video age, so this surface shows the vendor's figure and says so. That is why
 * the title attribute names vidIQ rather than showing a derivation: we did not compute it and
 * cannot show its working.
 */
export function GridVideoCard({
  v,
  avatarUrl,
  isSelf = false,
}: {
  v: RecentRow
  avatarUrl: string | null
  isSelf?: boolean
}) {
  const len = duration(v.duration_s)
  return (
    <a
      className="ycard"
      href={`https://www.youtube.com/watch?v=${v.video_id}`}
      target="_blank"
      rel="noreferrer"
    >
      <span className="ythumb">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://i.ytimg.com/vi/${v.video_id}/mqdefault.jpg`}
          alt=""
          loading="lazy"
          decoding="async"
        />
        {v.type === "short" && <span className="yshort">SHORT</span>}
        {v.breakout_score !== null && (
          <span
            className={`ymult ${scoreTier(v.breakout_score)}`}
            title={`vidIQ breakout score ${v.breakout_score}. How far past this channel's normal performance at this age the video ran. Measured by vidIQ, not by us.`}
          >
            {v.breakout_score.toFixed(2)}&times;
          </span>
        )}
        {len && <span className="ylen">{len}</span>}
      </span>
      <span className="ybody">
        <Avatar src={avatarUrl} name={v.channel_name} size={34} />
        <span className="ymeta">
          <span className="ytitle" title={v.title}>
            {v.title}
          </span>
          <span className={isSelf ? "ychan yself" : "ychan"}>
            {v.channel_name}
            {isSelf ? " · you" : ""}
          </span>
          <span className="ystat">
            {v.view_count === null ? "views --" : `${fmtInt(v.view_count)} views`} ·{" "}
            {agoText(v.published_at)}
          </span>
        </span>
      </span>
    </a>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors. `Avatar` takes `{src, name, size}` — the shelves call it with `size={20}`.

- [ ] **Step 4: Commit**

```bash
git add web/components/grid-video-card.tsx web/app/globals.css
git commit -m "feat(web): YouTube-geometry card for the recent feed"
```

---

### Task 9: Mount the feed on `/topics`

**Files:**
- Create: `web/components/recent-feed.tsx`
- Modify: `web/app/topics/page.tsx`

**Interfaces:**
- Consumes: `selectRecent` from `@/lib/recent`, `GridVideoCard`, `loadRecent`/`channelAvatarUrl` from `@/lib/bundles`
- Produces: `<RecentFeed bundle={...} avatars={...} selfChannelId={...} floor={...} defaultCap={...} />`

- [ ] **Step 1: Write the client component**

Create `web/components/recent-feed.tsx`:

```tsx
"use client"

import { useMemo, useState } from "react"
import { selectRecent, type FormatKey, type RecentWindow } from "@/lib/recent"
import type { RecentBundle } from "@/lib/types"
import { fmtInt } from "@/lib/trust"
import { GridVideoCard } from "./grid-video-card"

const WINDOWS: RecentWindow[] = [7, 14, 30]
const FORMATS: { key: FormatKey; label: string }[] = [
  { key: "videos", label: "videos" },
  { key: "shorts", label: "shorts" },
  { key: "all", label: "all" },
]

/**
 * The feed, and its three toggles.
 *
 * Format leads and defaults to long-form: the two formats are different jobs, and this page
 * answers "what should I film". All three toggles are filters over one already-loaded bundle,
 * so none of them costs a request or a vidIQ credit.
 */
export function RecentFeed({
  bundle,
  avatars,
  selfChannelId,
  floor,
  defaultCap,
}: {
  bundle: RecentBundle
  avatars: Record<string, string | null>
  selfChannelId: string
  floor: number
  defaultCap: number
}) {
  const [window, setWindow] = useState<RecentWindow>(7)
  const [format, setFormat] = useState<FormatKey>("videos")
  const [capped, setCapped] = useState(true)
  const [showTail, setShowTail] = useState(false)

  const { ranked, tail } = useMemo(
    () =>
      selectRecent(
        bundle,
        { window, format, perChannelCap: capped ? defaultCap : null, floor },
        new Date()
      ),
    [bundle, window, format, capped, defaultCap, floor]
  )

  const failed = bundle.coverage.batches_failed

  return (
    <section>
      <div className="section-kicker">
        <span className="kicker">WHAT WENT UP THIS WEEK</span>
        <span className="rule" />
        <span className="cap">
          {fmtInt(ranked.length)} shown · {fmtInt(bundle.videos.length)} outliers ·{" "}
          {bundle.fetched_at ?? "never fetched"}
        </span>
      </div>

      {bundle.fetched_at === null ? (
        <p className="note">
          No outlier sweep has run yet. Run <code>python3 -m pipeline.outliers --no-dry-run</code>{" "}
          and rebuild. This is empty because nothing was fetched, not because nothing broke out.
        </p>
      ) : (
        <>
          <p className="note">
            vidIQ&apos;s breakout score: how far a video ran past what its channel normally does at
            this age. vidIQ returns only videos it judges outliers, so this is a shortlist, not the
            full upload feed.
          </p>

          {failed > 0 && (
            <p className="note">
              ⚠ {failed} of {failed + bundle.coverage.batches_ok} batches failed.{" "}
              {bundle.coverage.missing_channel_ids.length} channels are missing from this list.
            </p>
          )}

          <div className="ctrls">
            <div className="ctrl">
              <span className="lbl">format</span>
              <span className="seg big">
                {FORMATS.map((f) => (
                  <button
                    key={f.key}
                    className={format === f.key ? "on" : undefined}
                    onClick={() => setFormat(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </span>
            </div>
            <div className="ctrl">
              <span className="lbl">window</span>
              <span className="seg">
                {WINDOWS.map((w) => (
                  <button
                    key={w}
                    className={window === w ? "on" : undefined}
                    onClick={() => setWindow(w)}
                  >
                    {w}d
                  </button>
                ))}
              </span>
            </div>
            <div className="ctrl">
              <span className="lbl">per channel</span>
              <span className="seg">
                <button className={capped ? "on" : undefined} onClick={() => setCapped(true)}>
                  max {defaultCap}
                </button>
                <button className={!capped ? "on" : undefined} onClick={() => setCapped(false)}>
                  show all
                </button>
              </span>
            </div>
          </div>

          {ranked.length === 0 ? (
            <p className="note">Nothing cleared {floor}× in this window.</p>
          ) : (
            <div className="ygrid">
              {ranked.map((v) => (
                <GridVideoCard
                  key={v.video_id}
                  v={v}
                  avatarUrl={avatars[v.channel_id] ?? null}
                  isSelf={v.channel_id === selfChannelId}
                />
              ))}
            </div>
          )}

          {tail.length > 0 && (
            <div className="tail">
              <span className="t1">
                {fmtInt(tail.length)} more held back by the cap or under {floor}×
              </span>
              <span className="t2">
                Nothing vidIQ returned is discarded. A video with no score is unmeasured, not low.
              </span>
              <button onClick={() => setShowTail((s) => !s)}>
                {showTail ? "hide" : "show them"}
              </button>
            </div>
          )}

          {showTail && (
            <div className="ygrid" style={{ marginTop: "14px" }}>
              {tail.map((v) => (
                <GridVideoCard
                  key={v.video_id}
                  v={v}
                  avatarUrl={avatars[v.channel_id] ?? null}
                  isSelf={v.channel_id === selfChannelId}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Add the control-bar styles**

Append to `web/app/globals.css`:

```css
.ctrls { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; margin: 0 0 14px; }
.ctrl { display: flex; align-items: center; gap: 6px; }
.ctrl > .lbl {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--muted-foreground);
}
.seg {
  display: inline-flex; border: 1px solid var(--border); border-radius: 4px;
  overflow: hidden; background: var(--card);
}
.seg button {
  font: inherit; font-size: 11px; padding: 3px 10px; border: 0; background: transparent;
  color: var(--muted-foreground); cursor: pointer; border-right: 1px solid var(--border);
}
.seg button:last-child { border-right: 0; }
.seg button.on { background: var(--primary); color: #fff; font-weight: 600; }
/* format is the first decision, so it is the loudest control */
.seg.big button { font-size: 12px; padding: 4px 14px; font-weight: 600; }

.tail {
  margin-top: 20px; border: 1px dashed var(--border); border-radius: 6px; padding: 11px 14px;
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap; background: var(--card);
}
.tail .t1 { font-size: 12px; font-weight: 600; }
.tail .t2 { font-size: 10px; color: var(--muted-foreground); }
.tail button {
  margin-left: auto; font: inherit; font-size: 11px; border: 1px solid var(--border);
  background: var(--secondary); border-radius: 4px; padding: 2px 12px; cursor: pointer;
}
```

- [ ] **Step 3: Mount it above the existing shelves**

In `web/app/topics/page.tsx`, extend the imports:

```tsx
import { channelAvatarUrl, loadChannels, loadMeta, loadOpportunities, loadRecent, loadTopicPages, videosById } from "@/lib/bundles"
import { RecentFeed } from "@/components/recent-feed"
```

Inside `TopicsIndexPage`, before the existing `return`:

```tsx
  const recent = loadRecent()
  const meta = loadMeta()
  const avatars = Object.fromEntries(
    channels.map((c) => [c.channel_id, channelAvatarUrl(c.channel_id)])
  )
```

Then as the first child inside `<section className="breakout">`:

```tsx
      <RecentFeed
        bundle={recent}
        avatars={avatars}
        selfChannelId={meta.self_channel_id}
        floor={2.5}
        defaultCap={2}
      />
```

- [ ] **Step 4: Typecheck and test**

Run: `cd web && npx tsc --noEmit && npx vitest run`
Expected: no type errors, all tests pass.

- [ ] **Step 5: Look at it**

Run: `cd web && npm run dev`
Open `http://localhost:3002/topics`. Confirm against `docs/mockups/screenshots/topics-recent.png`:
format toggle first and defaulting to `videos`, 4-up grid, score badge bottom-left, duration bottom-right, real faces, tail row at the bottom.

If `_db/recent.json` is empty because no sweep has run, the empty-state copy should appear rather than a blank grid. To populate it: `python3 -m pipeline.outliers --no-dry-run && python3 -m pipeline.build_data` (30 credits).

- [ ] **Step 6: Commit**

```bash
git add web/components/recent-feed.tsx web/app/topics/page.tsx web/app/globals.css
git commit -m "feat(web): mount the recent feed on /topics"
```

---

### Task 10: Group the outliers into patterns

Part 2 of the spec. Everything above works without this; this task adds the rows underneath.

The grouping is an LLM judgement over titles, so it is written by a skill rather than by `pipeline/` (which imports stdlib only and never calls a model). The skill writes a plain JSON file; `pipeline/` only reads it and does the deterministic leaf match.

**Files:**
- Create: `pipeline/patterns.py`
- Modify: `pipeline/bundles/recent.py`
- Test: `pipeline/test_patterns.py`

**Interfaces:**
- Consumes: `pipeline.topics.load`, `pipeline.topics.leaves`, `config/thresholds.json → min_n.consensus_min_creators`
- Produces:
  - `read_groups(today=None) -> list[dict]` reading `_synthesize/patterns/<date>.json`
  - `resolve(group: dict, videos_by_id: dict, topic_index, min_creators: int) -> dict` returning a `PatternRow`

- [ ] **Step 1: Write the failing test**

Create `pipeline/test_patterns.py`:

```python
"""Pattern rows: an inference label, a derived leaf match, and the action that follows."""
from __future__ import annotations

from pipeline import patterns, topics

VIDEOS = {
    "v1": {"video_id": "v1", "title": "Wiring MCP servers into Claude Code",
           "channel_id": "UCa"},
    "v2": {"video_id": "v2", "title": "My .mcp.json setup", "channel_id": "UCb"},
    "v3": {"video_id": "v3", "title": "claude mcp add walkthrough", "channel_id": "UCc"},
    "v4": {"video_id": "v4", "title": "Opus 5 just dropped", "channel_id": "UCa"},
    "v5": {"video_id": "v5", "title": "Fable 5 first look", "channel_id": "UCb"},
}


def test_a_group_matching_an_existing_leaf_is_add_to_leaf(ait_root):
    index = topics.load()
    row = patterns.resolve(
        {"pattern_id": "p1", "label": "MCP setup walkthroughs",
         "evidence": ["v1", "v2", "v3"]},
        VIDEOS, index, min_creators=3)
    assert row["existing_leaf"] == "claude-code-mcp-setup"
    assert row["action"] == "add_to_leaf"
    assert row["creator_count"] == 3


def test_the_leaf_floor_does_not_apply_to_an_existing_leaf(ait_root):
    index = topics.load()
    row = patterns.resolve(
        {"pattern_id": "p1", "label": "MCP setup", "evidence": ["v1", "v2"]},
        VIDEOS, index, min_creators=3)
    assert row["creator_count"] == 2
    assert row["action"] == "add_to_leaf"


def test_three_creators_and_no_leaf_is_promote(ait_root):
    index = topics.load()
    videos = {**VIDEOS, "v6": {"video_id": "v6", "title": "Nothing matches this",
                               "channel_id": "UCd"}}
    row = patterns.resolve(
        {"pattern_id": "p2", "label": "Unmatched thing",
         "evidence": ["v6", "v6b", "v6c"]},
        {**videos,
         "v6b": {"video_id": "v6b", "title": "Also unmatched", "channel_id": "UCe"},
         "v6c": {"video_id": "v6c", "title": "Still unmatched", "channel_id": "UCf"}},
        index, min_creators=3)
    assert row["existing_leaf"] is None
    assert row["action"] == "promote"


def test_too_few_creators_and_no_leaf_is_below_floor(ait_root):
    index = topics.load()
    row = patterns.resolve(
        {"pattern_id": "p3", "label": "Two channels only",
         "evidence": ["v4", "v5"]},
        VIDEOS, index, min_creators=3)
    assert row["creator_count"] == 2
    assert row["action"] == "below_floor"


def test_creator_count_is_distinct_channels_not_videos(ait_root):
    index = topics.load()
    row = patterns.resolve(
        {"pattern_id": "p4", "label": "One channel twice",
         "evidence": ["v1", "v4"]},
        VIDEOS, index, min_creators=3)
    assert len(row["evidence"]) == 2
    assert row["creator_count"] == 1


def test_read_groups_is_empty_when_no_pass_has_run(ait_root):
    assert patterns.read_groups() == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest pipeline/test_patterns.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'pipeline.patterns'`

- [ ] **Step 3: Write the implementation**

Create `pipeline/patterns.py`:

```python
"""Pattern rows over the outlier set.

The grouping itself is an LLM judgement and happens outside pipeline/, which imports stdlib only
and never calls a model. A skill writes _synthesize/patterns/<date>.json; this module reads it and
adds the one thing that is not a judgement: whether the group already has a leaf in
config/topics.json. That check is a deterministic alias match, so it is Derived, and it is what
decides whether a row offers "promote" or "add to that topic".
"""
from __future__ import annotations

import datetime as dt

from . import config, topics, util


def read_groups(today: dt.date | None = None) -> list[dict]:
    """The newest grouping pass, or []. Empty is a state: no pass has run."""
    directory = config.synth_dir() / "patterns"
    if not directory.is_dir():
        return []
    files = sorted(directory.glob("*.json"))
    if not files:
        return []
    return util.read_json(files[-1]).get("groups") or []


def _matching_leaf(titles: list[str], topic_index) -> str | None:
    """The leaf whose aliases the group's titles hit most often, or None.

    Deterministic, case-insensitive substring matching against the aliases a human authored.
    Never an inference: either the words are there or they are not.
    """
    # topics.load() already lowercases every alias (pipeline/topics.py:72), so only the
    # haystack needs folding here.
    blob = " ".join(titles).lower()
    best, best_hits = None, 0
    for leaf in topics.leaves(topic_index):
        hits = sum(1 for alias in leaf.aliases if alias in blob)
        if hits > best_hits:
            best, best_hits = leaf.id, hits
    return best


def resolve(group: dict, videos_by_id: dict, topic_index, min_creators: int) -> dict:
    """One PatternRow: the label as given, the leaf match computed, the action that follows.

    The creator floor does not gate add_to_leaf. That topic cleared the floor when it was
    authored; a second week of coverage is not a new decision, it is the existing one heating up.
    """
    rows = [videos_by_id[v] for v in group.get("evidence") or [] if v in videos_by_id]
    creators = {r["channel_id"] for r in rows}
    leaf = _matching_leaf([r["title"] for r in rows], topic_index)

    if leaf is not None:
        action = "add_to_leaf"
    elif len(creators) >= min_creators:
        action = "promote"
    else:
        action = "below_floor"

    return {
        "pattern_id": group["pattern_id"],
        "label": group["label"],
        "evidence": [r["video_id"] for r in rows],
        "creator_count": len(creators),
        "existing_leaf": leaf,
        "action": action,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest pipeline/test_patterns.py -v`
Expected: 6 passed

- [ ] **Step 5: Wire patterns into the bundle**

In `pipeline/bundles/recent.py`, add `patterns` to the import and replace the `"patterns": []` line in `build()`:

```python
from .. import config, outliers, patterns, util
```

```python
    videos_by_id = {v["video_id"]: v for v in videos}
    min_creators = ctx.thresholds["min_n"]["consensus_min_creators"]
    rows = [patterns.resolve(g, videos_by_id, ctx.topic_index, min_creators)
            for g in patterns.read_groups()]
    for row in rows:
        for video_id in row["evidence"]:
            videos_by_id[video_id]["pattern_id"] = row["pattern_id"]
```

and use `"patterns": rows,` in the returned dict. Place this block after `videos.sort(...)`.

- [ ] **Step 6: Run the whole Python suite**

Run: `pytest -q && ruff check pipeline`
Expected: all pass, `All checks passed!`

- [ ] **Step 7: Commit**

```bash
git add pipeline/patterns.py pipeline/test_patterns.py pipeline/bundles/recent.py
git commit -m "feat(patterns): resolve a group to promote, add-to-leaf, or below-floor"
```

---

### Task 11: Render the pattern rows

**Files:**
- Create: `web/components/pattern-rows.tsx`
- Modify: `web/components/recent-feed.tsx`
- Modify: `web/app/globals.css`

**Interfaces:**
- Consumes: `PatternRow`, `RecentRow`, `GridVideoCard`
- Produces: `<PatternRows patterns={...} videos={...} avatars={...} selfChannelId={...} />`

- [ ] **Step 1: Add the styles**

Append to `web/app/globals.css`:

```css
.prow { border-top: 1px solid var(--border); padding: 14px 0 4px; }
.prow:first-of-type { border-top: 0; }
.phead { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 9px; }
.plabel { font-size: 13px; font-weight: 700; }
.pinf {
  font-size: 9px; font-weight: 700; letter-spacing: 0.06em; color: var(--inf);
  border: 1px solid color-mix(in srgb, var(--inf) 35%, transparent);
  border-radius: 3px; padding: 0 5px;
}
.pleaf {
  font-size: 10px; color: var(--v-unserved);
  border: 1px solid color-mix(in srgb, var(--v-unserved) 35%, transparent);
  border-radius: 3px; padding: 0 5px;
}
.pstat { font-size: 10px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
.ppromote {
  margin-left: auto; font-size: 11px; border: 1px solid var(--primary); color: var(--primary);
  background: var(--card); border-radius: 4px; padding: 2px 10px; font-family: inherit;
}
.ppromote.padd { border-color: var(--v-unserved); color: var(--v-unserved); }
.ppromote.pfloor { border-color: var(--border); color: var(--muted-foreground); }
.pevidence {
  font-size: 10px; color: var(--muted-foreground); margin: 9px 0 0;
  border-left: 2px solid color-mix(in srgb, var(--inf) 40%, transparent);
  padding-left: 9px; line-height: 1.6;
}
.pgrid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px; }
@media (max-width: 60rem) { .pgrid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
.plegend {
  display: flex; gap: 16px; flex-wrap: wrap; font-size: 10px; color: var(--muted-foreground);
  border-top: 1px solid var(--border); margin-top: 6px; padding-top: 10px;
}
```

- [ ] **Step 2: Write the component**

Create `web/components/pattern-rows.tsx`:

```tsx
import type { PatternRow, RecentRow } from "@/lib/types"
import { GridVideoCard } from "./grid-video-card"

const ACTION_LABEL: Record<PatternRow["action"], string> = {
  promote: "promote to a topic →",
  add_to_leaf: "add to that topic →",
  below_floor: "needs more creators",
}

const ACTION_CLASS: Record<PatternRow["action"], string> = {
  promote: "ppromote",
  add_to_leaf: "ppromote padd",
  below_floor: "ppromote pfloor",
}

/**
 * The outliers regrouped by what they are actually about.
 *
 * Every label here is an LLM judgement, so every row carries its evidence: the titles the group
 * was read from, verbatim. A bad grouping should look like a bad grouping rather than pass as a
 * finding. The leaf match beside it is the opposite kind of claim, a deterministic alias hit,
 * which is why it renders in the derived colour and not the inference one.
 */
export function PatternRows({
  patterns,
  videos,
  avatars,
  selfChannelId,
}: {
  patterns: PatternRow[]
  videos: RecentRow[]
  avatars: Record<string, string | null>
  selfChannelId: string
}) {
  if (patterns.length === 0) {
    return (
      <p className="note">
        No grouping pass has run over this sweep yet, so there are no pattern rows. The feed above
        does not depend on it.
      </p>
    )
  }

  const byId = new Map(videos.map((v) => [v.video_id, v]))

  return (
    <div className="card pad">
      {patterns.map((p) => {
        const rows = p.evidence.map((id) => byId.get(id)).filter((v): v is RecentRow => !!v)
        return (
          <div key={p.pattern_id} className="prow">
            <div className="phead">
              <span className="plabel">{p.label}</span>
              <span className="pinf">INFERENCE</span>
              {p.existing_leaf && <span className="pleaf">matches {p.existing_leaf}</span>}
              <span className="pstat">
                {rows.length} videos · {p.creator_count} creators
              </span>
              <button
                className={ACTION_CLASS[p.action]}
                disabled={p.action === "below_floor"}
              >
                {ACTION_LABEL[p.action]}
              </button>
            </div>
            <div className="pgrid">
              {rows.map((v) => (
                <GridVideoCard
                  key={v.video_id}
                  v={v}
                  avatarUrl={avatars[v.channel_id] ?? null}
                  isSelf={v.channel_id === selfChannelId}
                />
              ))}
            </div>
            <p className="pevidence">
              grouped on these titles: {rows.map((v) => `“${v.title}”`).join(" · ")}
            </p>
          </div>
        )
      })}
      <div className="plegend">
        <span>
          <b>promote to a topic →</b> clears the creator floor and matches no existing leaf
        </span>
        <span>
          <b>add to that topic →</b> matches a leaf you already authored
        </span>
        <span>
          <b>needs more creators</b> real, but too few channels to act on yet
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Mount it under the grid**

In `web/components/recent-feed.tsx`, import it and render it after the tail block, still inside the `<>` fragment:

```tsx
import { PatternRows } from "./pattern-rows"
```

```tsx
          <div className="section-kicker">
            <span className="kicker">PATTERNS</span>
            <span className="rule" />
            <span className="cap">inference · over vidIQ&apos;s {bundle.videos.length}</span>
          </div>
          <PatternRows
            patterns={bundle.patterns}
            videos={bundle.videos}
            avatars={avatars}
            selfChannelId={selfChannelId}
          />
```

- [ ] **Step 4: Typecheck and test**

Run: `cd web && npx tsc --noEmit && npx vitest run`
Expected: no type errors, all tests pass.

- [ ] **Step 5: Look at it**

Run: `cd web && npm run dev`, open `http://localhost:3002/topics`. With no pattern pass on disk the empty-state copy should show and the grid above must still render.

- [ ] **Step 6: Commit**

```bash
git add web/components/pattern-rows.tsx web/components/recent-feed.tsx web/app/globals.css
git commit -m "feat(web): render pattern rows with their evidence and action"
```

---

### Task 12: Document and close out

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/decisions.md`
- Modify: `docs/system.md`

- [ ] **Step 1: Record the decision**

Append a new numbered decision to `docs/decisions.md`, following the existing format (Context / Decision / Rejected alternatives). Cover: our multiplier disagreed with vidIQ by ~2x on every shared video; the median baseline is too low on a skewed catalogue (Eric Tech median 1,648 vs mean 6,628); vidIQ normalises by video age and we cannot until snapshots accumulate; `pipeline/multiplier.py` is kept for the taxonomy shelves. Rejected: switching our baseline to a trimmed mean (closes the gap but not the age dimension), and showing both numbers (two figures for one question).

- [ ] **Step 2: Add the command to CLAUDE.md**

In the commands block:

```bash
python3 -m pipeline.outliers               # what the vidIQ outlier sweep would cost, writes nothing
python3 -m pipeline.outliers --no-dry-run  # the real sweep, 30 credits, writes _synthesize/outliers/
```

- [ ] **Step 3: Add the bundle to the system map**

In `docs/system.md`, add `recent.json` to the bundle table with its shape and its `vendor` trust tier, and note that `_synthesize/outliers/` and `_synthesize/patterns/` are its inputs.

- [ ] **Step 4: Full verification**

Run each and confirm before claiming done:

```bash
pytest -q
ruff check pipeline test_anchors.py scripts
cd web && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/decisions.md docs/system.md
git commit -m "docs: record the vidIQ breakout-score decision and the outlier sweep"
```

---

## Self-Review Notes

**Spec coverage.** Part 1 (feed) is Tasks 6-9. Part 2 (patterns) is Tasks 10-11. Part 3 (evergreen) is Task 1, which starts the snapshot clock; the section itself is deliberately not built, because the data will not exist for a week. The vidIQ fetching, batching, and cost sections are Tasks 2-5. The three pattern actions are Task 10. The `coverage` / failed-batch requirement appears in Tasks 4, 6, and 9.

**Known follow-ups, deliberately not in this plan.** The "still climbing" evergreen section once snapshots accumulate; the skill that writes `_synthesize/patterns/<date>.json` (Task 10 reads it and degrades to an empty state without it); and adding the outlier sweep to whatever daily runner ends up driving `pipeline.snapshot`.
