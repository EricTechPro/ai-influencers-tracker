# `_raw/` — exactly what the APIs returned

**Layer 1 of 3.** Written by `ait-snapshot` only. Append-only. Never edited by hand, never
overwritten, never deleted.

```
_raw/
├── snapshots/2026-07-27.json          one row per channel per day
├── video_snapshots/2026-07-27.json    one row per video per day
├── comments/<channel_id>.jsonl        one line per comment, forever
├── repos/2026-07-27.json              GitHub velocity sweep + trending
└── youtube/<channel>/<videoId>.md     transcripts, from build step 14
```

Nothing here is interpreted. A value that looks wrong is stored as it arrived, with a `status` field
saying so — `absent` when a channel goes private, `corrupt` when the monotonicity filter rejects a
point. **Never as a zero.** Correcting data on the way in would make the error invisible on the way
out.

Gitignored: it is large, regenerable for recent days, and `comments/` contains other people's text.

Flows one direction only: `_raw` → `_synthesize` → `_db`. Nothing ever writes backwards.
