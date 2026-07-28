---
name: ait-snapshot
description: Run the daily free sweep for ai-influencers-tracker (channels, uploads, per-video counts, comments, GitHub velocity, GitHub Trending) and report the gap list. Use when the user says ait-snapshot, "run the sweep", "pull today's numbers", or asks why the dashboard has a hole in it.
---

# ait-snapshot

The daily free sweep. About 176 of 10,000 YouTube quota units, 0 vidIQ credits, 0 dollars.
`launchd` already runs it at 09:00; this skill is for running it by hand.

## Run it

```bash
python3 -m pipeline.snapshot --dry-run     # what it would cost, writes nothing
python3 -m pipeline.snapshot               # the real sweep
python3 -m pipeline.build_data             # rebuild _db/ so the dashboard sees it
```

## Read the summary

| Field | What it means |
|---|---|
| `absent` | channels missing from a 200 response. They went private. Never a zero. |
| `missing_dates` | calendar days with no snapshot. Those windows render `building, N of M`. |
| `partial_run` | a GitHub 403 truncated the sweep. What was collected is kept. |
| `trending_ok` | false means discovery degraded. Data is still clean. Non-critical. |

## Do not

- Do not edit anything under `config/`. That is Eric's, and the pipeline never writes there.
- Do not repair a `corrupt` point. It is stored exactly as it arrived, on purpose.
- Do not call `search.list` (100 units) or `captions.download` (200 units, owner-only).
