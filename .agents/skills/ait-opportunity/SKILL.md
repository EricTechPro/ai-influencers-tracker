---
name: ait-opportunity
description: Explain or debug the ai-influencers-tracker opportunity engine, the verdict grid, the indie score, and the 0-100 score. Use when the user says ait-opportunity, asks "what should I make next", asks why a topic got a particular verdict or score, or asks what fired.
---

# ait-opportunity

## Read a row

```bash
python3 -c "from pipeline import config, util; import json,sys; \
rows=util.read_json(config.db_dir()/'opportunities.json')['rows']; \
print(json.dumps(next(r for r in rows if r['topic_id']==sys.argv[1]), indent=2))" <topic-id>
```

Every row carries `fired`, the exact threshold comparisons that produced its bands, and
`score.components`, each with raw, norm, weight, points and source. If a row looks wrong, the
answer is in one of those two lists, not in the code.

## The rules that are easy to get wrong

- Only leaves reach the verdict function. A parent has no score and no verdict, ever.
- `INSUFFICIENT_DATA` fires when the demand axis is unknown, not when the video count is low.
  A low video count sets `topic_pages.state`, which is what renders "1 video, need 3".
- A missing component drops its weight: `out_of` reads 75, never 100. Never impute.
- The indie score renders as a chip and never enters the score. The `hunch` flag sorts and
  never scores.
- The canonical example must reproduce 71.9. If it does not, the rounding order is wrong.
