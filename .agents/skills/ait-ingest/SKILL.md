---
name: ait-ingest
description: Run the daily free sweep for ai-influencers-tracker (channels, uploads, per-video counts, comments, GitHub velocity, GitHub Trending) into _raw/ and report the gap list. Use when the user says ait-ingest, "run the sweep", "run the snapshot", "pull today's numbers", or asks why the dashboard has a hole in it.
---

# ait-ingest

Writes `_raw/`. The daily free sweep, about 176 of 10,000 YouTube quota units, 0 vidIQ credits,
0 dollars. `launchd` already runs it at 09:00; this skill is for running it by hand.

The module is still `pipeline.snapshot` and the launchd label is still `ca.erictech.ait-snapshot`
— the skill was renamed to match the `_raw/` layer it fills, the cron job and the module were not.

## Run it

```bash
python3 -m pipeline.snapshot --dry-run     # what it would cost, writes nothing
python3 -m pipeline.snapshot               # the real sweep
python3 -m pipeline.avatars                # faces for any channel that does not have one yet
python3 -m pipeline.build_data             # rebuild _db/ so the dashboard sees it
```

**Always run `pipeline.avatars` after the sweep.** It costs 2 quota units and skips every channel
whose file already exists, so on a normal day it is nearly free. On the day a channel joins the
roster it is the only thing that gives that channel a face.

Leaving it out is a silent failure, not a loud one: `build_data` writes an `avatar` path into
`channels.json` for every channel whether the file exists or not, so a new channel renders a broken
image and initials while every number about it looks perfectly healthy. That is exactly what
happened when Gary Chen and Sanji Nai-Chien joined — 74 channels in the bundle, 72 files on disk,
and nothing anywhere said so.

Confirm it after a roster change:

```bash
python3 -m pipeline.avatars --dry-run      # would_spend_units: 2 means nothing new to fetch
ls _db/assets/channels | wc -l             # must equal the channel count in _db/channels.json
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
