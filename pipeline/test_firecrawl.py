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


def test_the_parser_handles_the_absolute_urls_firecrawl_actually_returns():
    # The real github.com/trending page, once resolved by Firecrawl, links with full
    # https://github.com/owner/repo URLs rather than the /owner/repo relative paths used
    # above -- confirmed against a live scrape. Both shapes must parse.
    real_shaped_md = """
## [permissionlesstech / bitchat](https://github.com/permissionlesstech/bitchat)

Swift [32,860](https://github.com/permissionlesstech/bitchat/stargazers) \
[5,147](https://github.com/permissionlesstech/bitchat/forks)
Built by

[![@jack](https://avatars.githubusercontent.com/u/212554440)](https://github.com/jackjackbits)
2,346 stars today

[Star](https://github.com/login?return_to=%2Fpermissionlesstech%2Fbitchat)

## [amnezia-vpn / amnezia-client](https://github.com/amnezia-vpn/amnezia-client)
"""
    assert firecrawl.parse_trending(real_shaped_md) == [
        "permissionlesstech/bitchat", "amnezia-vpn/amnezia-client"]


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
        def repo_by_name(self, ref):
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
