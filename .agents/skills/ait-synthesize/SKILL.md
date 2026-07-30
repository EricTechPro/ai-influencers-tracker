---
name: ait-synthesize
description: Topic matching and coverage for ai-influencers-tracker; later, comment classification and step extraction. Use when the user says ait-synthesize, ait-analyze, asks which topics a video matched, asks why coverage_rate is falling, or asks what new leaves config/topics.json is missing.
---

# ait-synthesize

Writes `_synthesize/`. Currently the cheap form only: keyword topic matching over title, description and tags, all free
from the YouTube Data API. Comment classification lands at build step 12 and step extraction at 15.

## What matched, and what did not

```bash
python3 -c "from pipeline import config, util; \
m=util.read_json(config.db_dir()/'meta.json'); print('coverage_rate', m['coverage_rate']); \
v=util.read_json(config.db_dir()/'videos.json')['videos']; \
[print(x['title'][:70]) for x in v if not x['topic_assignments']][:20]"
```

A falling `coverage_rate` is the **only** signal that `config/topics.json` needs new leaves, because
there is no proposal queue. New topics enter through the GitHub Trending sweep plus Eric's judgment.
The list above is the evidence; adding leaves is a hand edit Eric makes.

## Do not

- Do not add leaves to `config/topics.json` yourself. The pipeline never writes into config, and
  auto-adding topics was explicitly rejected (decision 0003).
- Every assignment carries `method: "keyword"`. Step 15 upgrades the same rows in place to
  `"transcript"`. No schema change, no migration.
