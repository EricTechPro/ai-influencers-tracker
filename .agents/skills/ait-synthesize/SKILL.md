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

## Classification (the model pass)

`pipeline/classify.py` holds no model call by design — a skill writes
`_synthesize/classifications/<date>.json` and the module validates it on the way in. This runs
that pass on the Codex CLI, so a backlog costs no Claude context:

```bash
.agents/skills/ait-synthesize/scripts/codex_classify.py --dry-run      # what would be sent
.agents/skills/ait-synthesize/scripts/codex_classify.py --batch 65     # run it
```

Only `candidates()` are ever sent — videos a keyword hit already put on a shelf at title
strength (≥0.6). The rest of the corpus never reaches a surface, so classifying it is waste.

`write_assignments()` refuses the **whole** pass if any `topic_id` is not a leaf or any reason is
empty, so a bad batch writes nothing. Passes are dated and merged oldest-first, which makes a
partial run safe and a re-run cover only what is still missing.

**A high `null` rate is a finding, not a failure.** `null` means no existing leaf fits, and that is
the correct answer — a wrong shelf renders as a claim. When one cluster keeps coming back `null`,
that is the coverage signal above, arriving one video at a time. On 2026-08-13, 235 of 373 pending
candidates were OpenClaw videos that the keyword matcher had filed under
`multi-agent-orchestration`; the model returned `null` for them, which is what surfaced that the
vocabulary has no OpenClaw leaf. Adding it is still Eric's hand edit — never auto-add (decision 0003).

## Do not

- Do not add leaves to `config/topics.json` yourself. The pipeline never writes into config, and
  auto-adding topics was explicitly rejected (decision 0003).
- Every assignment carries `method: "keyword"`. Step 15 upgrades the same rows in place to
  `"transcript"`. No schema change, no migration.
