# Skills

Six skills, all importing one shared `pipeline/` library. **Four built.**

| Skill | Job | Build step | Status |
|---|---|---|---|
| `ait-snapshot` | Daily free sweep: channels, videos, comments, GitHub, trending | 1 | built |
| `ait-refresh` | Orchestrator: cost guard, ledger, pre-flight preview | 2 | built |
| `ait-opportunity` | Velocity, indie score, verdict bands, the 0–100 score | 7 | built |
| `ait-analyze` | Topic matching, comment classification, step extraction | 8 | built |
| `ait-dashboard` | Start the dev server on 3002, open the browser | 9 | not built — waits on `web/` |
| `ait-research-yt` | Per-video transcript extraction. Fork of `si-research-yt` | 14 | not built |

One skill per directory, each with a `SKILL.md`.

`.claude/skills` is a symlink to this directory, so both harnesses read one source.
