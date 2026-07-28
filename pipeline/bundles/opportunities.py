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
