import datetime as dt
import json

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
