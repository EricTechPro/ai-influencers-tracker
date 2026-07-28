# `_synthesize/` — what we computed from `_raw`

**Layer 2 of 3.** Everything here is derived from `_raw` and would be **expensive to recompute**,
which is the only reason it is a durable layer rather than a variable in memory.

```
_synthesize/
├── extractions/<videoId>.json    trunk/fork or themes/split, per video  (~40k tokens each)
├── classifications.jsonl         comment -> category, keyed by comment_id
└── blurbs.json                   the AI channel descriptions
```

The rule that decides what belongs here: **if losing it costs money or hours, it lands here.** A
40,000-token transcript extraction does. A growth delta does not — that is arithmetic, recomputed
on every build.

Every artifact carries the id it was derived from and the model that produced it, so a re-run can
tell what is stale versus what is merely old. Nothing here is Oracle; it is all Inference, and it
carries its sources so the UI can say so.

Gitignored. Regenerable, but only by paying again.
