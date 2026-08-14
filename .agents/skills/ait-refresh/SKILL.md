---
name: ait-refresh
description: Orchestrate a metered ai-influencers-tracker refresh: print the vidIQ cost preview, run the guarded channel-history backfill or the weekly keyword sweep, then rebuild the bundles. Use when the user says ait-refresh, "buy the history", "run the keyword sweep", or asks what a refresh would cost in credits.
---

# ait-refresh

The only skill that spends money. **Always print the preview and wait for a yes before spending.**

## Preview first, always

```bash
.agents/skills/ait-refresh/scripts/ait_refresh.py
```

Free, and the default: no job flag means dry run. It prints both jobs' cost against the balance
**and** what is actually due — whether any channel is still missing history, and how old the last
keyword sweep is. Those two lines are the point. The bare cost table cannot tell you that a 370-credit
backfill would re-buy history we already hold, which is the mistake this skill exists to prevent.

## The two jobs

| Job | Cost | Cadence | Flag |
|---|---|---|---|
| `vidiq_channel_stats` backfill, 74 channels | 5/channel, **370** | once, build step 2 | `--backfill` |
| `vidiq_keyword_research`, one per leaf | 5/leaf, **125** | weekly | `--sweep` |

```bash
.agents/skills/ait-refresh/scripts/ait_refresh.py --sweep            # run it here
.agents/skills/ait-refresh/scripts/ait_refresh.py --sweep --codex    # run it on Codex
```

A run prints its bill, spends under the guard, **verifies the ledger**, then rebuilds the bundles.
The ledger check is not optional and no longer skippable: balance before minus balance after must
equal the previewed number, and a mismatch exits non-zero. A mismatch means a call was billed that
the preview never showed Eric, which is the one thing the preview exists to prevent.

The guard refuses anything that would take the balance below its 200-credit reserve, or that would
spend more than 400 in a single run. The script never raises either limit.

## Codex offload

`--codex` runs an **already-approved** job in a headless Codex session, so it costs no Claude
context and survives the session ending. Codex re-enters the same script with the same flag, so the
guard, the ledger check and the rebuild are the identical code path.

What `--codex` changes is *where* the job runs, never *whether* it runs. The approval stays with
Eric, exactly as si-refresh hands Codex a price block it is forbidden to fetch:

- `--codex` alone exits 2. It needs `--sweep` or `--backfill`; Codex never picks what to spend.
- There is deliberately no `--approve`, no `--yes`, and no "run whichever job is due".
- Never pass `--sweep`/`--backfill` on Eric's behalf after showing him a preview he has not answered.

## Do not

- Do not re-run the backfill "to be safe". It costs 370 credits and the merge already prefers
  points we snapshotted ourselves. The script refuses it outright while every channel has history
  (exit 2) — if that refusal fires, the answer is that there is nothing to buy, not that it needs
  overriding.
- Do not use `vidiq_outliers` or `vidiq_channel_videos`. Both are dropped: the multiplier is
  computed from exact free view counts, and nothing paid can improve on exact.
- Do not run both jobs in one invocation. 495 credits is over the 400 ceiling, so the guard would
  abort mid-run having already spent; the script refuses the combination up front instead.
