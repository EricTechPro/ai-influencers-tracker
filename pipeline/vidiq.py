"""vidIQ MCP client and the two calls nothing else sells: purchased daily history and volume.

Everything here is metered, so nothing runs without passing the cost guard first, and every run
prints its bill before it spends. The si-refresh guard pattern, reimplemented rather than shared.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import urllib.error
import urllib.request

from . import config, growth, util


def _g() -> dict:
    """The growth threshold block. filter_monotonic's knobs live in config, and growth.py stays
    pure by taking them as arguments, so the read happens here at the call site."""
    return config.thresholds()["growth"]

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
        if self.spent + cost > self.ceiling:
            raise CostGuardError(
                f"{label} costs {cost} (already spent {self.spent} this run), over the "
                f"{self.ceiling}-credit per-run ceiling")
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
    return growth.filter_monotonic(rows, view_drop_tolerance=_g()["view_drop_tolerance"],
                                   rebase_min_days=_g()["rebase_min_days"])


def merge_backfill(existing: list[dict], bought: list[dict]) -> list[dict]:
    """A point we snapshotted ourselves always wins. The source tag is what makes that auditable."""
    by_date = {row["date"]: row for row in bought}
    by_date.update({row["date"]: row for row in existing})
    return [by_date[d] for d in sorted(by_date)]


def backfill(roster: list[dict], client: VidIQ, guard: CostGuard, days: int = 365,
             today: dt.date | None = None, dry_run: bool = True) -> dict:
    """Buy the daily history for every roster channel. 5 credits each, 360 for 72, once.

    Resumable: a channel whose _raw/backfill/<channel_id>.json already exists is skipped rather
    than re-bought, so a run interrupted partway through (a raised CostGuardError, a network
    failure) never re-spends on channels it already paid for.
    """
    today = today or util.today()
    start = today - dt.timedelta(days=days)
    cost = CHANNEL_STATS_COST * len(roster)
    print(guard.preview([(f"vidiq_channel_stats x{len(roster)}", cost)]))
    if dry_run:
        return {"channels": len(roster), "credits": cost, "spent": 0, "dry_run": True}

    written = 0
    skipped = 0
    for row in roster:
        path = config.raw_dir() / "backfill" / f"{row['channel_id']}.json"
        if path.exists():
            skipped += 1
            continue
        guard.check(CHANNEL_STATS_COST, f"channel_stats {row['handle']}")
        series = channel_stats_series(client, row["channel_id"], start, today)
        guard.record(CHANNEL_STATS_COST)
        util.write_json(path, {"channel_id": row["channel_id"], "series": series})
        written += 1
    return {"channels": written, "skipped": skipped, "credits": cost,
            "spent": guard.spent, "dry_run": False}


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
        # Live shape nests it under seedKeyword (singular estimatedMonthlySearch); the flat
        # estimatedMonthlySearches key is kept as a fallback in case an older shape returns.
        volume = (payload.get("seedKeyword") or {}).get("estimatedMonthlySearch")
        if volume is None:
            volume = payload.get("estimatedMonthlySearches")
        volumes[topic.id] = {"keyword": topic.label,
                             "volume": int(volume) if volume is not None else None,
                             "state": "ok" if volume is not None else "unavailable"}
    util.write_json(config.raw_dir() / "keywords" / f"{util.date_str(today)}.json",
                    {"date": util.date_str(today), "volumes": volumes})
    return {"topics": len(volumes), "credits": cost, "spent": guard.spent, "dry_run": False}
