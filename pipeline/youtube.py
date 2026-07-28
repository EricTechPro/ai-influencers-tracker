"""YouTube Data API v3 over urllib, with id batching and a persisted quota ledger.

Two calls are deliberately absent and must stay absent:
  the keyword-search endpoint   100 units a call, enough to burn the whole day in one page.
  the caption-download endpoint 200 units, and only works on videos you own.
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
