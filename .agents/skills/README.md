# Skills

Six skills, all importing one shared `pipeline/` library. **Five built.**

Names track the **data layer each one fills**, so a skill and its layer read the same word.
`si-*` in `projects/social-invest/` is the shape being copied.

| Skill | Writes | Job | si-equivalent | Build step | Status |
|---|---|---|---|---|---|
| `ait-ingest` | `_raw/` | Daily free sweep: channels, videos, comments, GitHub, trending | `si-research-*` | 1 | built |
| `ait-refresh` | `_raw/` | Orchestrator: cost guard, ledger, pre-flight preview | `si-refresh` | 2 | built |
| `ait-synthesize` | `_synthesize/` | Topic matching, comment classification, step extraction | `si-analyze-*` | 8 | built |
| `ait-opportunity` | nothing, reads `_db/` | Velocity, indie score, verdict bands, the 0–100 score | dip-advisor MCP | 7 | built |
| `ait-dashboard` | nothing | Start the dev server on 3002, open the browser | `si-dashboard` | 9 | built |
| `ait-research-yt` | `_raw/` | Per-video transcript extraction. Fork of `si-research-yt` | `si-research-yt` | 14 | not built |

`ait-opportunity` is the one name that is not a layer verb, and deliberately: it reads `_db/` and
explains a score rather than writing a layer. It is not a pipeline stage.

Renamed 2026-07-30: `ait-snapshot` → `ait-ingest`, `ait-analyze` → `ait-synthesize`. The module
`pipeline.snapshot`, the file `scripts/ait-snapshot.plist`, and the launchd label
`ca.erictech.ait-snapshot` were **not** renamed — the cron agent is installed and loaded under that
label.

One skill per directory, each with a `SKILL.md`.

`.claude/skills` is a symlink to this directory, so both harnesses read one source.
