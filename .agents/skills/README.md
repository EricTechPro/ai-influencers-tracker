# Skills

Seven skills, all importing one shared `pipeline/` library. **Six built.**

Names track the **data layer each one fills**, so a skill and its layer read the same word.
`si-*` in `projects/social-invest/` is the shape being copied.

| Skill | Writes | Job | si-equivalent | Build step | Status |
|---|---|---|---|---|---|
| `ait-ingest` | `_raw/` | Daily free sweep: channels, videos, comments, GitHub, trending | `si-research-*` | 1 | built |
| `ait-refresh` | `_raw/` | Orchestrator: cost guard, ledger, pre-flight preview | `si-refresh` | 2 | built |
| `ait-synthesize` | `_synthesize/` | Topic matching, comment classification, step extraction | `si-analyze-*` | 8 | built |
| `ait-opportunity` | nothing, reads `_db/` | Velocity, indie score, verdict bands, the 0–100 score | dip-advisor MCP | 7 | built |
| `ait-dashboard` | nothing | Start the dev server on 3002, open the browser | `si-dashboard` | 9 | built |
| `ait-test` | nothing | pytest, anchors, ruff, vitest, coverage | none | — | built |
| `ait-research-yt` | `_raw/` | Per-video transcript extraction. Fork of `si-research-yt` | `si-research-yt` | 14 | not built |

`ait-opportunity` and `ait-test` are the two names that are not layer verbs, and deliberately.
`ait-opportunity` reads `_db/` and explains a score; `ait-test` reads the code and runs its checks.
Neither is a pipeline stage, and `ait-test` has no build step because it belongs to no phase —
it is the check the other six are held to.

Renamed 2026-07-30: `ait-snapshot` → `ait-ingest`, `ait-analyze` → `ait-synthesize`. The module
`pipeline.snapshot`, the file `scripts/ait-snapshot.plist`, and the launchd label
`ca.erictech.ait-snapshot` were **not** renamed — the cron agent is installed and loaded under that
label.

One skill per directory, each with a `SKILL.md`.

`.claude/skills` is a symlink to this directory, so both harnesses read one source.
