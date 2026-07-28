---
name: ait-refresh
description: Orchestrate a metered ai-influencers-tracker refresh: print the vidIQ cost preview, run the guarded channel-history backfill or the weekly keyword sweep, then rebuild the bundles. Use when the user says ait-refresh, "buy the history", "run the keyword sweep", or asks what a refresh would cost in credits.
---

# ait-refresh

The only skill that spends money. **Always print the preview and wait for a yes before spending.**

## Preview first, always

```bash
python3 -c "from pipeline import config, vidiq; c=vidiq.client_from_env(); \
b=vidiq.balance(c); print(b); \
vidiq.backfill(config.roster(), c, vidiq.CostGuard(b['totalCredits'], 200, 400), dry_run=True)"
```

## The two jobs

| Job | Cost | Cadence |
|---|---|---|
| `vidiq_channel_stats` backfill, 72 channels | 360 credits | once, build step 2 |
| `vidiq_keyword_research`, one per leaf | 5 per leaf, ~125 | weekly |

The guard refuses anything that would take the balance below its 200-credit reserve, or that would
spend more than 400 in a single run. After a real run, confirm the ledger: balance before minus
balance after must equal the previewed number.

## Do not

- Do not re-run the backfill "to be safe". It costs 360 credits and the merge already prefers
  points we snapshotted ourselves.
- Do not use `vidiq_outliers` or `vidiq_channel_videos`. Both are dropped: the multiplier is
  computed from exact free view counts, and nothing paid can improve on exact.
