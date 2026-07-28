# Data-spine build report: 2026-07-28

Companion to [2026-07-27-data-spine.md](2026-07-27-data-spine.md) (the plan) and
[2026-07-28-handoff.md](2026-07-28-handoff.md) (the input sheet). All 19 tasks executed via
subagent-driven development on branch `feat/data-spine`: one implementer per task, a spec+quality
review after each, scoped re-reviews on every fix round, and a whole-branch final review at the
end. 30+ commits, every task pushed to origin as it closed.

## 1. Suite results (real output, end of build)

```
$ pytest -q
314 passed in 0.48s

$ uvx ruff check pipeline test_anchors.py scripts
All checks passed!
```

Zero skips: the thresholds-parity anchor flipped from skip to green when `_db/meta.json` became
real in Task 18. The canonical 71.9 reproduces three ways (unit, end-to-end through the bundles,
and by an independent reviewer hand-trace with no step that special-cases the target).

## 2. Ledgers

**YouTube quota:** 9,143 of 10,000 units spent today (budget guard is 9,500).
By call: commentThreads.list 8,307, videos.list 439, playlistItems.list 391, channels.list 6.

**vidIQ:** nothing spent. Balance verified live: 1,136 credits (1,085 renewable + 51 add-on),
resets 2026-08-04. The 4a/4b spends were not authorized and were skipped (commands in §4).

## 3. What the real data says (day one)

Top of `_db/opportunities.json` (25 scoreable leaves):

| topic | verdict | score |
|---|---|---|
| claude-code-mcp-setup | ONLY_IF_UNSERVED | 40.3 / 75 |
| codex-workflows | ONLY_IF_UNSERVED | 40.0 / 75 |
| cursor-and-ide-agents | ONLY_IF_UNSERVED | 40.0 / 75 |
| multi-agent-orchestration | ONLY_IF_UNSERVED | 39.2 / 75 |
| claude-code-subagents | ONLY_IF_UNSERVED | 32.6 / 75 |

Scores render `x / 75`, not `/ 100`, because the keyword-volume axis has no data (4b unticked);
its 25-point weight drops out of the denominator, exactly as designed. Demand is running on repo
velocity alone.

`_db/meta.json` health block: coverage_rate 0.60 (60% of the 11,657 registered videos match at
least one topic leaf), comment_health {channels_with_comments: 40, ingested: 236,742,
classified: 0}, snapshot_health {days_present: 1 of 90, first_date: 2026-07-28},
discovery {trending_ok: true}. Growth cells read `building, 1 of N` until the daily sweep
accumulates days, or until the 4a backfill buys the history.

Real-run totals from today: 72/72 channels swept (0 absent), 11,657 videos registered, comment
backfill ran to the quota cap (8,304 of 11,657 videos, 236,742 comments; the resumable ledger
continues automatically on the next run), GitHub search sweep 1,275 repos across 25 queries,
trending scrape 39 repos. Reality caught four real bugs the fixture tests could not (P0D live
broadcasts, absolute trending URLs, comment_health false zeros, a hash-order nondeterminism);
all fixed test-first.

## 4. Skipped (not authorized), with the exact command

| Item | What it buys | Command |
|---|---|---|
| 4a vidIQ backfill (360 cr) | growth windows live on day one instead of day 91 | `python3 -c "from pipeline import config, vidiq; config.load_env(); c = vidiq.client_from_env(); print(vidiq.backfill(c, config.roster(), dry_run=False))"` |
| 4b keyword sweep (125 cr, weekly) | the demand axis; scores become x/100 | `python3 -c "from pipeline import config, topics, vidiq; config.load_env(); c = vidiq.client_from_env(); import pipeline.util as u; print(vidiq.keyword_sweep(c, topics.leaves(topics.load()), u.today(), dry_run=False))"` |
| 4d launchd install | the 09:00 daily sweep runs itself | `bash scripts/install_ait_snapshot_launchd.sh` |

Preview both spends first with the same commands using `dry_run=True` (free). The cost guard
enforces the 200-credit reserve and 400-credit ceiling regardless.

**Before installing launchd:** run `python3 -m pipeline.snapshot` by hand once after the quota
day resets. Every phase has run live, but the single-process end-to-end path has not (today's
quota was too spent to rerun it whole). Then `python3 -m pipeline.build_data` and check
`_db/meta.json`.

## 5. Decisions that landed while you were away

Full trail in the per-task review history; the ones that changed anything:

- Another claude.ai session squashed the three docs commits into 9654f00 mid-build and
  force-pushed `feat/data-spine`. Trees were byte-identical; the build adopted 9654f00 as base
  and never touched `main`. **Local `main` still diverges from origin/main; left alone.**
- Six plan-snippet bugs were fixed against the plan's own Global Constraints (signed floor
  comparison, rank None-as-measured, zero-baseline division, non-cumulative cost ceiling,
  fabricated `fired` comparisons, hardcoded comment_stats zeros). Each was reviewer-found,
  controller-ruled, fixed test-first, and re-reviewed.
- C1/C2/C3 spec conflicts shipped as the plan resolved them; decision 0009 and the doc
  corrections are in `docs/`.

## 6. Waiting on you

1. **channels.json deferred fields**: `view_growth_pct`, `upload_cadence_days`, `breakout_count`,
   `top_topics` are in system.md's schema but no plan defines their formulas. They are annotated
   deferred rather than invented. Define them (or bless the deferral) before the web leaderboard
   needs them.
2. **Trending vs exclusions**: `trending_sweep` does not apply `config/excluded_repos.json`.
   Likely fine (trending feeds manual review), confirm or it is a two-line fix.
3. **Avatars**: the plan's file table promises `_db/assets/channels/<id>.jpg`; no task built the
   downloader, so channels.json avatar paths dangle. Needs a Phase 2 line item or a schema trim.
4. **Merge**: the branch is fully reviewed ("ready to merge with fixes" — fixes landed and
   re-reviewed). A PR from `feat/data-spine` is the clean path given the other session's
   uncommitted position on `main`.

## 7. What's next in this session

Phase 2 (per your instruction): build `web/` on port 3002 styled after `projects/social-invest`
(system.md §11 mapping), starting with the bundle schema-parity test against the real `_db/`.
Then Phase 3: the open-look-refine iteration loop. Note for that work: `videos.json` is 16.7 MB
and `comments.json` 59 MB; the web read path must slice, not ship them wholesale.
