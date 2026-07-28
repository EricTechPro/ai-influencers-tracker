# `_db/` — what the dashboard reads

**Layer 3 of 3.** Written by `build_data.py` only. **Safe to delete at any time** — one rebuild
recreates it exactly. That property is the point: if deleting it is scary, something upstream is
wrong.

```
_db/
├── snapshots.json      channels.json      comments.json
├── videos.json         opportunities.json topic_pages.json
├── video_snapshots.json                   meta.json
```

Eight versioned bundles, every one carrying `version` and `generated_at`. The Next.js app reads these
server-side; nothing else may write them.

`build_data.py` is **idempotent** and **never writes into `_raw/` or `_synthesize/`**. Running it
twice on the same inputs produces byte-identical output, which is what makes "delete and rebuild" a
safe instruction rather than a gamble.

Gitignored.
