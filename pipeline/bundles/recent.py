"""recent.json: what went up lately, ranked against each channel's own normal.

Its own bundle rather than a slice of videos.json, which is 16.7 MB and deliberately never
shipped to the browser whole. This one carries card fields only, for `feed_window_days` of
history, so the window / format / per-channel toggles are all client-side filters over a payload
that is already in memory.

It read vidIQ's outlier sweep until this rewrite, and ranked on `breakout_score`, a vendor number.
Two things were wrong with that. The sweep costs credits and nothing automated it — the launchd
job runs pipeline.snapshot alone — so the feed drifted: on 2026-07-31 its newest video was
published 2026-07-29 while the free registry already held 48 newer ones, and /topics could not
answer "what went up today" at all. And `.agents/skills/ait-refresh/SKILL.md` had already dropped
vidiq_outliers on the merits: "the multiplier is computed from exact free view counts, and nothing
paid can improve on exact." This bundle was the last thing still reading it.

So the feed is built from the corpus the free daily sweep already fills, and the number it ranks
on is multiplier.py's — Derived tier, and it ships the baseline it was divided by so the card can
prove it rather than assert it.
"""
from __future__ import annotations

from .. import cards, config, exclusions, patterns, snapshot, util

VERSION = 3
# `lang` is deliberately absent. TRUST states one tier per field for the whole bundle, and lang
# has two: oracle where the uploader declared one, derived where the title rule read it. Naming
# either here would claim the wrong tier for the other half of the corpus, which is the blend the
# three-tier rule forbids. Each row carries its own `lang_tier` instead.
TRUST = {"multiplier": "derived", "views_gained_24h": "derived", "momentum": "derived",
         "pattern": "inference", "existing_leaf": "derived"}

# The card shape lives in cards.py now, shared with channel_top.json. Re-exported because
# test_recent and the wireframes both name it here.
CARD_KEYS = cards.CARD_KEYS


def _sort_key(row: dict):
    """Descending by multiplier, unscored last, video_id breaking every tie.

    A None multiplier is a channel we have no baseline for, not a video that did badly, so it
    sinks below every scored row instead of sorting as a zero. The id tiebreak is what makes a
    rebuild byte-identical when two videos score the same.
    """
    scored = row["multiplier"] is not None
    return (0 if scored else 1, -(row["multiplier"] or 0), row["video_id"])


def build(ctx) -> dict:
    window_days = ctx.thresholds["outliers"]["feed_window_days"]
    names = cards.names_for(ctx)

    # The feed obeys config/exclusions.json like every other display surface. It is the first
    # thing /topics shows, so a muted channel or an off-the-board title landing here would be
    # the loudest possible place for the rule to be forgotten.
    rules = exclusions.load()
    now = cards.now_for(ctx)

    videos = []
    for video in ctx.videos:
        if rules.excludes_video(video):
            continue
        age = util.days_between(util.parse_ts(video["published_at"]).date(), ctx.today)
        if age < 0 or age > window_days:
            continue
        # pattern_id is the feed's alone: patterns are groupings across channels, and a channel
        # page has nothing to highlight them against. It is stamped in below, after sorting.
        videos.append({**cards.row(video, ctx, names, now), "pattern_id": None})

    videos.sort(key=_sort_key)

    # A channel with too few mature uploads has no baseline, so none of its videos can be scored.
    # That is a coverage fact about the feed and it is named here rather than left to look like a
    # channel that simply had a quiet month.
    unscored = sorted(
        row["channel_id"] for row in ctx.roster
        if not any(b["state"] == "ok" for b in ctx.baselines.get(row["channel_id"], {}).values())
    )

    # The grouping is an LLM pass that runs outside pipeline/; this only reads what it wrote and
    # stamps each card with the group it belongs to, so the feed can highlight a pattern's videos.
    videos_by_id = {v["video_id"]: v for v in videos}
    min_creators = ctx.thresholds["min_n"]["consensus_min_creators"]
    rows = [patterns.resolve(g, videos_by_id, ctx.topic_index, min_creators)
            for g in patterns.read_groups()]
    for row in rows:
        for video_id in row["evidence"]:
            if video_id in videos_by_id:
                videos_by_id[video_id]["pattern_id"] = row["pattern_id"]

    return {
        "version": VERSION,
        "generated_at": ctx.generated_at,
        "source": "corpus",
        # When the counts these multipliers were computed from last landed. The free sweep's own
        # clock, not a vendor's, and None before the first sweep has ever run.
        "fetched_at": (snapshot.present_dates() or [None])[-1],
        "fetched_at_utc": snapshot.newest_fetched_at(),
        "coverage": {
            "channels_requested": len(ctx.roster),
            "channels_scored": len(ctx.roster) - len(unscored),
            "unscored_channel_ids": unscored,
        },
        # The numbers that decide what the grid shows, carried to the UI the one honest way web/
        # can get at config: through _db/. Hardcoding them in the page made the threshold block
        # documentation for a decision it did not control.
        "display_floor": ctx.thresholds["outliers"]["display_floor"],
        "per_channel_cap": ctx.thresholds["outliers"]["per_channel_cap"],
        "feed_window_days": window_days,
        "videos": videos,
        "patterns": rows,
        "trust": dict(TRUST),
    }


def write(ctx) -> None:
    util.write_json(config.db_dir() / "recent.json", build(ctx))
