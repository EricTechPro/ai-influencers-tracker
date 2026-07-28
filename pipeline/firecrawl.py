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

# GitHub renders each row as a heading link: [owner / **repo**](/owner/repo). Firecrawl resolves
# that to an absolute URL (https://github.com/owner/repo), so both shapes must match.
_ROW = re.compile(r"\]\((?:https://github\.com)?/([A-Za-z0-9][\w.-]*)/([\w.-]+)\)")
_CHROME = {"login", "trending", "collections", "topics", "sponsors", "features"}


class FirecrawlError(RuntimeError):
    pass


def _default_transport(url: str, payload: bytes, headers: dict) -> bytes:
    request = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        body = exc.read().decode(errors="replace")[:200]
        raise FirecrawlError(f"HTTP {exc.code}: {body}") from exc
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
            item["discovered_via"] = "trending"
            row = github_module.normalize(item, today, github_thresholds)
            row["indie"] = github_module.indie_score(
                row["owner_type"], github_client.contributor_count(full_name),
                github_thresholds["indie"])
        except Exception:
            # One malformed or unreachable repo must never sink the rest of the sweep --
            # fetch, normalize, and score all live inside this guard, not just the fetch.
            continue
        repos.append(row)
    return {"repos": repos, "ok": True, "reason": None}
