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
PER_PAGE = 100

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

    def search_repositories(self, query: str, page: int = 1, per_page: int = PER_PAGE) -> dict:
        return self._get("/search/repositories",
                         {"q": query, "sort": SEARCH_SORT, "order": "desc",
                          "per_page": per_page, "page": page})

    def repo(self, repo_id: int) -> dict:
        """By numeric id. A rename changes full_name; the id survives it."""
        return self._get(f"/repositories/{repo_id}")

    def contributor_count(self, full_name: str) -> int | None:
        try:
            params = {"per_page": PER_PAGE, "anon": "1"}
            rows = self._get(f"/repos/{full_name}/contributors", params)
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
    penalty = indie_thresholds["corp_org_penalty"]
    owner_part = bonus if owner_type == "User" else bonus * (1 - penalty)
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

    A page only stops the query early when the response itself proves no more results exist
    (empty items, or total_count already covered by pages fetched so far). Absent that proof
    (as in a test fixture with no total_count), every query spends its full max_pages_per_query
    budget rather than guessing "short page means last page" -- a guess that would either miss
    real results or, worse, get the guess backwards against a fixture built to check the cap.
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
            if not items:
                break
            total_count = data.get("total_count")
            if total_count is not None and page * PER_PAGE >= total_count:
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
