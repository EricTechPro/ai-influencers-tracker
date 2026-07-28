"""Dates, deterministic JSON IO, and file hashing. Standard library only."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import pathlib
from collections.abc import Iterator
from typing import Any

UTC = dt.UTC


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


def newest_json(directory: pathlib.Path, default: Any = None) -> Any:
    """The newest dated *.json in a directory of them, or default.

    Every metered sweep in this repo writes one file per day named YYYY-MM-DD.json, so newest is
    the last name in sort order. Four places had written this out by hand; the one thing they must
    agree on is that a missing directory and an empty one both mean "no sweep has run", which is a
    state and never an error.
    """
    if not directory.is_dir():
        return default
    files = sorted(directory.glob("*.json"))
    return read_json(files[-1]) if files else default


def published_within(row: dict, today: dt.date, days: int) -> bool:
    """Whether row["published_at"] falls inside the last `days` days, counting today as 0.

    A missing or unparseable date is not inside the window: an unknown date is not a recent one.
    The lower bound matters too — a video dated in the future is a bad reading, and letting it
    through put the same video in-window on one surface and out on another.
    """
    published = row.get("published_at")
    if not published:
        return False
    try:
        age = days_between(parse_ts(published).date(), today)
    except (ValueError, TypeError):
        return False
    return 0 <= age <= days


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
