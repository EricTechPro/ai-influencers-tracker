# AI Influencers Tracker — system architecture

How it's built and why. The contract is in [spec.md](spec.md); this page is the detail behind it.

**Status:** design. No code written.
**Last groomed:** 2026-07-27. Raw capture:
`_raw/grill-me-checkpoint/2026-07-27-ai-influencers-tracker.md`.

---

## 1. The whole pipeline

```
config/  channels.json (72) · topics.json · thresholds.json · excluded_repos.json · targets.json
        │                                                     the pipeline NEVER writes here
        ▼
┌─ TIER 1 ─ daily, free ──────────────────────────────────────────────────┐
│  YouTube channels.list      72 ids / 50 per call        =    2 units     │
│  YouTube playlistItems      new uploads per channel     =  ~72 units     │
│  YouTube videos.list        3,600 tracked videos / 50   =   72 units     │
│  YouTube commentThreads     new videos, 100/call        =  ~30 units     │
│  GitHub  /search/repositories + /repositories/{id}, capped, backoff      │
│  Firecrawl  github.com/trending  (no API exists)                         │
│                                                                          │
│  -> _raw/snapshots/YYYY-MM-DD.json         append-only, THE growth history│
│  -> _raw/video_snapshots/YYYY-MM-DD.json   append-only, per-video views   │
│  -> _raw/comments/<channel_id>.jsonl       append-only, THE comment corpus│
└──────────────────────────────────────────────────────────────────────────┘
        │
┌─ TIER 2 ─ weekly / monthly, vidIQ credits ──────────────────────────────┐
│  vidiq_keyword_research      per scoreable leaf, weekly   -> volume       │
│  vidiq_channel_stats         one-time 72-channel backfill -> full history │
│  vidiq_video_stats           surgical per-video backfill  -> lost history │
│  vidiq_channel_analytics     SELF channel only            -> exact subs   │
└──────────────────────────────────────────────────────────────────────────┘
        │
┌─ TIER 3 ─ LLM, on qualification ────────────────────────────────────────┐
│  ait-research-yt          from step 14 (fork of si-research-yt)           │
│    -> _raw/youtube/<channel>/<videoId>.md   the transcript IS raw         │
│                                                                          │
│  comment classification   step 12, above a likes floor, cached by id      │
│    -> _synthesize/classifications.jsonl                                   │
│  channel blurbs           step 11, one per channel, cached                │
│    -> _synthesize/blurbs.json                                             │
│  ait-analyze              step 15, trunk/fork or themes/split, path judge │
│    -> _synthesize/extractions/<videoId>.json    ~40k tokens each          │
└──────────────────────────────────────────────────────────────────────────┘

A transcript lands in `_raw/` because it is what the source said, unmodified. Everything an LLM
*concluded* lands in `_synthesize/`, because it cost money and would cost money again.
        │
        ▼
  pipeline/build_data.py   idempotent, never writes into _raw/ or _synthesize/
    growth deltas · measurement floor · per-video traction · multipliers
    topic matching · verdict bands · opportunity scoring · comment aggregation
        │
        ▼
  _db/*.json      9 versioned bundles (§4)
        │
        ▼
  Next.js App Router, port 3002
```

Two things break potential circularity:

1. **Tier 3 extraction qualifies on the *keyword* topic assignment produced in tier 1.** Cheap
   matching decides what deserves expensive extraction, and extraction then produces the better
   assignment.
2. **Comment classification qualifies on the *like count* produced in tier 1.** Free counting decides
   which comments are worth an LLM call. The table only shows the top N, so classifying the tail is
   pure waste.

---

## 2. Where everything lives

Three data layers, one direction, copying EricOS's `_raw` → `_context` → `_research` shape, where
**an underscore means a data layer, not code**.

```
ai-influencers-tracker/
├── AGENTS.md -> CLAUDE.md   symlink; both harnesses, one file
├── CLAUDE.md                the brief; points everywhere else
├── README.md                for humans
│
├── config/                  HAND-EDITED. The pipeline never writes here.
│   ├── channels.json          the roster. GITIGNORED
│   ├── channels.example.json  the schema, committed
│   ├── topics.json            the tree; only leaves are scoreable
│   ├── thresholds.json        every number the pipeline branches on
│   ├── excluded_repos.json    evergreen overrides, keyed by numeric id
│   └── targets.json           rank target + hunch flags. Only user state
│
├── pipeline/                ALL the Python. Root level so imports just work.
│   ├── config.py youtube.py github.py vidiq.py     clients + loading
│   ├── growth.py multiplier.py traction.py         the math
│   ├── topics.py comments.py score.py              matching + scoring
│   ├── verdict.py read.py                          the grid + the _db/ reader layer
│   ├── bundles/                                     one module per bundle, per §4
│   ├── snapshot.py build_data.py                   the two entry points
│   └── test_*.py                                   beside the code they cover
│
├── _raw/                    LAYER 1. Exactly what the APIs returned.
│   snapshots/ video_snapshots/ videos/ comments/ repos/ keywords/ quota/ youtube/
├── _synthesize/             LAYER 2. Cost money to compute.
│   extractions/ classifications.jsonl blurbs.json
├── _db/                     LAYER 3. What the web reads. Safe to delete.
│   the 8 bundles from §4, plus assets/ for downloaded channel avatars
│
├── web/                     Next.js, port 3002. Reads _db/ server-side.
│   app/ components/ lib/
│
├── .agents/skills/          six ait-* skills, one dir each with SKILL.md
├── .claude/                 settings.json + skills -> ../.agents/skills
└── docs/                    CONTEXT · spec · system · wireframes · decisions
```

| Layer | Written by | Deleting it costs |
|---|---|---|
| `config/` | **humans only** | your roster and your tuning. Back it up. |
| `_raw/` | `ait-snapshot` | recent days refetchable; old history **gone forever** |
| `_synthesize/` | `ait-analyze` | money — every extraction is ~40k tokens |
| `_db/` | `build_data.py` | nothing. One rebuild recreates it byte for byte. |

**That last row is the test of whether the design is right: deleting `_db/` must be boring.**

A transcript lands in `_raw/` because it is what the source *said*. Everything an LLM *concluded*
lands in `_synthesize/`, because it cost money and would cost money again. That one sentence decides
where any new artifact goes.

`config/` is a directory rather than loose files so the write-protection rule is enforceable by
path: `test_anchors.py` asserts nothing under it is ever opened for writing.

**Where a new file goes**

| It is... | It goes in |
|---|---|
| a number that changes a verdict | `config/thresholds.json` |
| something a human curates | `config/` |
| any Python at all | `pipeline/` |
| a response we fetched, unmodified | `_raw/` |
| something an LLM produced that cost money | `_synthesize/` |
| a bundle the web reads | `_db/` |
| a decision, and what was rejected | `docs/decisions.md` |
| a term that needs defining | `docs/CONTEXT.md` |

---

## 3. Skills

Six skills, **one shared library**. All of them import `pipeline/` — config loading,
snapshot reader, cost guard, YouTube client, GitHub client, comment store.

> **This is a deliberate departure from social-invest, not a copy of it.** Verified 2026-07-27:
> social-invest has **three** toolkits, one per skill —
> `si-research-yt/scripts/yt_toolkit`, `si-research-ig/scripts/insta_toolkit`,
> `si-refresh/scripts/refresh_toolkit`. Its own §11 names the cost: *"yt_toolkit plus its tests
> exist in three places and will diverge. That is a standing maintenance tax."* Decision E4 chose
> one shared library specifically to avoid inheriting that tax. Earlier drafts of this document
> described the split project as having a single toolkit, which was simply wrong.

| Skill | Mirrors | Job | Build step |
|---|---|---|---|
| `ait-snapshot` | (new) | Daily free sweep: channels, videos, comments, GitHub, trending. Gap detection. | 1, 6, 7 |
| `ait-opportunity` | (new) | Velocity, indie score, keyword scores, verdict bands, opportunity score | 7–8 |
| `ait-analyze` | `si-analyze-yt` | Keyword topic matching, comment classification, then step extraction | 8 → 12 → 15 |
| `ait-refresh` | `si-refresh` | Orchestrator: cost guard, ledger, pre-flight preview | 2 |
| `ait-dashboard` | `si-dashboard` | Start dev server on 3002, open browser | 9 |
| `ait-research-yt` | `si-research-yt` | Deep per-video transcript extraction | 14 |

`ait-match-topics` is not a seventh skill; it is `ait-analyze`'s cheap form.

### Topic matching, the cheap form

Runs in tier 1, costs nothing, needs no transcripts:

```
for each new video:
  haystack = title + description + tags          # all free from the YouTube Data API
  for each LEAF topic in config/topics.json:
    if any alias or keyword matches haystack:
      emit { video_id, topic_id, confidence, method: "keyword" }
```

Assignment is **n:m**, with one `primary_topic` for page attribution and secondaries counting toward
coverage. A video on "building agents with Claude Code subagents" legitimately hits three leaves and
must not be forced to pick one.

Every row carries `method`. Step 15 upgrades the **same rows** in place from `"keyword"` to
`"transcript"`, raising `confidence`. No schema change, no migration, no re-render. Until then the
page states that topic assignment rests on titles, descriptions and tags only.

**Unmatched videos no longer generate proposals.** `/review` is cut (spec §7). A video matching no
leaf simply lowers `coverage_rate` in `meta.json`, which is the visible signal that `config/topics.json`
needs new leaves. New topics enter through the trending sweep plus Eric's judgment.

---

## 4. Bundle schemas

Eight bundles under `_db/`, all carrying `version` and `generated_at`. (`review_queue.json` was
deleted per decision 0003; the count here was never updated until now.)

### `snapshots.json`

```jsonc
{
  "version": 3,
  "generated_at": "2026-07-27T09:00:00Z",
  "dates_present": ["2026-07-25", "2026-07-26", "2026-07-27"],
  "dates_missing": [],
  "channels": {
    "UCMwVTLZIRRUyyVrkjDpn4pA": {
      "handle": "ColeMedin",
      "series": [{
        "date": "2026-07-27",
        "status": "ok",                  // ok | absent | corrupt
        "view_count": 11991545,          // exact, Oracle
        "subscriber_count": 219000,      // rounded, Derived
        "subscriber_bucket": 1000,
        "video_count": 412,
        "source": "youtube_api"          // youtube_api | vidiq_backfill
      }]
    }
  }
}
```

`status: "absent"` is written when a channel id is missing from a 200 response, which is what
YouTube returns when a channel goes private. **Never written as zero, never omitted.**
`status: "corrupt"` is written when the monotonicity filter rejects a point.

### `video_snapshots.json`

```jsonc
{
  "version": 1,
  "videos": {
    "zbmuiaPuiNM": {
      "channel_id": "UCMwVTLZIRRUyyVrkjDpn4pA",
      "series": [
        { "date": "2026-07-25", "status": "ok", "view_count": 144053, "source": "youtube_api" },
        { "date": "2026-07-26", "status": "ok", "view_count": 144744, "source": "youtube_api" }
      ]
    }
  }
}
```

`source: "vidiq_backfill"` marks points imported from `vidiq_video_stats`, so a backfilled video
stays distinguishable from one we snapshotted ourselves.

### `videos.json`

```jsonc
{
  "version": 2,
  "videos": [{
    "video_id": "zbmuiaPuiNM",
    "channel_id": "UCMwVTLZIRRUyyVrkjDpn4pA",
    "published_at": "2026-06-25T00:00:05Z",
    "title": "Google Just Dropped a Masterclass on Agentic Engineering",
    "duration_s": 1316,
    "type": "long",                       // long | short
    "view_count": 146102,
    "multiplier": { "value": 4.8, "state": "ok",   // ok | no_baseline
                    "baseline": 30400, "baseline_n": 20, "source": "computed" },
    "traction": {
      "views_gained": { "24h": 691, "7d": 5221, "30d": 55000 },
      "share_recent_7d": 0.036,
      "still_growing": true
    },
    "comment_stats": { "root_count": 213, "top_comment_likes": 412, "classified": 41 },
    "topic_assignments": [{
      "topic_id": "claude-code-subagent-teams",   // always a leaf
      "primary": true,
      "confidence": 0.6,
      "method": "keyword",                        // -> "transcript" at step 15
      "matched_on": ["title", "tags"],
      "matched_alias": "agentic engineering"
    }]
  }]
}
```

`multiplier.state: "no_baseline"` is required, not optional.

### `channels.json`

```jsonc
{
  "version": 3,
  "self_channel_id": "UCxxxxEricTech",
  "channels": [{
    "channel_id": "UCMwVTLZIRRUyyVrkjDpn4pA",
    "handle": "ColeMedin", "name": "Cole Medin",
    "avatar": "/assets/channels/UCMwVT....jpg",   // downloaded locally, like si ticker logos
    "lang": "en", "niche": "ai-agents", "category": "ai-creator", "is_self": false,

    "blurb": {
      "text": "Builds AI agent tutorials focused on n8n, MCP and local-first stacks...",
      "trust": "inference",
      "generated_at": "2026-07-20T00:00:00Z",
      "sources": ["channel_description", "last_20_titles"]
    },

    "subscriber_count": 219000,
    "subscriber_bucket": 1000,
    "view_count": 11991545,
    "video_count": 412,

    "view_delta": {
      "24h": { "state": "ok", "value": 41200 },
      "7d":  { "state": "ok", "value": 288000 },
      "30d": { "state": "ok", "value": 1120000 }
    },
    "view_growth_pct": { "30d": 0.104 },          // deferred: no formula defined yet, not built

    "subscriber_delta": {
      "7d":  { "state": "bounded", "upper": 5000, "value": null, "bucket": 1000 },
      "30d": { "state": "ok",      "value": 8000, "bucket": 1000 },
      "90d": { "state": "ok",      "value": 15000, "bucket": 1000 }
    },
    "subscriber_growth_rate": { "90d": { "state": "ok", "value": 0.0735 } },
    "subs_per_1k_views": { "90d": { "state": "ok", "value": 12.4 } },
    "subscriber_daily": { "state": "unavailable", "reason": "owner_only" },

    "videos_published": { "30d": 9 },
    "median_views_per_video": { "30d": 25246 },
    "upload_cadence_days": 3.4,               // deferred: no formula defined yet, not built
    "breakout_count": { "30d": 2 },           // deferred: no formula defined yet, not built
    "still_growing_video_ids": ["zbmuiaPuiNM"],
    "top_topics": ["claude-code-subagent-teams"],  // deferred: no formula defined yet, not built

    "rank": {
      "growth":      { "90d": 4 },
      "general":     { "90d": 6 },
      "subscribers": { "90d": 11 },
      "views":       { "90d": 3 }
    }
  }]
}
```

Four rank keys, one per mode in spec §7. **The self channel is ranked like everyone else** and is
included in every median and percentile; `is_self` drives colour only.

`subscriber_delta[w].state` is `ok | bounded | building | insufficient_data`. **`bounded` carries
`upper` and no `value`**, and the UI renders `< 5,000`. This is the single most important schema
change in this revision: it is what lets a subscriber-growth ranking exist at all without lying.

`subscriber_daily.state` is `"ok"` with a real series **only for the self channel**, sourced from
`vidiq_channel_analytics`. Everyone else gets `"unavailable", reason: "owner_only"`.

`view_growth_pct`, `upload_cadence_days`, `breakout_count` and `top_topics` are **deferred**: this
plan defines no formula for any of the four, so `bundles/channels.py` does not emit them yet. They
stay in the schema as the contract a later task fills, the same way `nodes` and `edges` are
reserved `null` on `topic_pages.json` below.

### `comments.json`

```jsonc
{
  "version": 2,
  "by_channel": {
    "UCMwVTLZIRRUyyVrkjDpn4pA": {
      "totals": { "ingested": 8412, "classified": 611, "window_days": 365 },
      "top": [{
        "comment_id": "Ug...",
        "video_id": "zbmuiaPuiNM",
        "video_title": "Google Just Dropped a Masterclass on Agentic Engineering",
        "video_url": "https://youtu.be/zbmuiaPuiNM",
        "video_published_at": "2026-06-25T00:00:05Z",

        "author": "someguy",
        "text": "Would love to see this on Windows, WSL keeps breaking for me",
        "like_count": 412,
        "reply_count": 7,
        "published_at": "2026-06-28T10:00:00Z",
        "answered": false,                   // self channel id seen among the replies


        "lag_days": 3,                       // Derived: published_at - video_published_at
        "topic_ids": ["claude-code-mcp-setup"],   // inherited from the video
        "category": {
          "key": "video_request",            // video_request|question|correction|suggestion|other
          "trust": "inference",
          "model": "sonnet",
          "classified_at": "2026-07-26T00:00:00Z"
        }
      }],
      "by_category": { "video_request": 84, "question": 210, "correction": 12,
                       "suggestion": 96, "other": 240, "unsorted": 7211 },
      "most_discussed_video_ids": ["zbmuiaPuiNM"]
    }
  },

  "by_video": {
    "zbmuiaPuiNM": {
      "totals": { "comments": 213 },
      "by_category": { "video_request": 12, "question": 84, "correction": 3,
                       "suggestion": 21, "other": 93 },
      "top": [ /* same comment shape */ ]
    }
  },

  "by_topic": {
    "claude-code-mcp-setup": {
      "totals": { "comments": 1840, "videos": 9, "creators": 7 },
      "top": [ /* same comment shape, plus channel_id and creator name */ ],
      "by_category": { "video_request": 210, "question": 640, "correction": 31,
                       "suggestion": 188, "other": 402, "unsorted": 369 },
      "unserved": [{
        "ask": "Windows / WSL support",
        "comments": 340,
        "videos_asking": 6,
        "videos_total": 9,
        "videos_covering": 0,
        "trust": "inference",
        "cites": ["Ug...", "Ug...", "Ug..."]
      }]
    }
  }
}
```

**One corpus, three indexes.** `by_channel` answers *what does this creator's audience ask*.
`by_topic` answers *what does everyone ask about this subject, across every creator covering it*,
and it is the index the unserved-branch cell reads. `by_video` answers *what did this one upload
provoke* and is read when a video row is expanded. The joins are transitive and already available
(comment → video → `topic_assignments`), so these cost index builds, not extra pipelines.

**Five category keys, four of them actionable:** `video_request`, `question`, `correction`,
`suggestion`, plus `other` for everything that fits none of them (collapsed by default, never
discarded). `feedback`, `needs_improvement` and `praise` were cut — a category has to be actionable
to exist, and anything real inside "feedback" resolves to a suggestion or a video request.
`unsorted` counts rows below the classification floor; they render, they are just not labeled.

`unserved[]` is **Inference** and carries `cites`, so the claim "340 comments ask about Windows"
can always be opened into the actual comments that back it. `videos_covering` comes from
extraction, which is why the cell lands after step 15 even though the corpus is warm from step 6.

`lag_days` is the spec §7 lag column: pure subtraction of two Oracle timestamps, therefore Derived,
therefore cheap and honest. The UI formats it ("3 days after", "1 week after", "100 days after") and
**never renders the comment's absolute date in that column**.

`category` is **Inference** and always ships alongside `text`, so the bundle makes it structurally
impossible to render a category without the evidence for it.

Comments are ingested for every channel from step 6. Classification is a separate later pass over the
same rows, so an unclassified comment carries `category: null` and renders under "unsorted" rather
than being hidden.

### `opportunities.json`

```jsonc
{
  "version": 3,
  "thresholds_version": 3,
  "rows": [{
    "topic_id": "mcp-registry-integration",
    "shape": "tutorial",                      // tutorial | review
    "demand": { "band": "HIGH", "keyword_volume": 8100, "repo_velocity": 266.0,
                "fired": ["repo_velocity >= 100.0"] },
    "supply": { "band": "OPEN", "videos": 2, "creators": 2, "window_days": 90,
                "fired": ["videos <= 2"] },
    "verdict": "MAKE_THIS_NOW",
    "hunch": false,                           // Eric's manual flag, never scored

    "own_coverage": { "covered": false, "video_id": null, "published_at": null,
                      "suppressed": false },

    "score": {
      "value": 71.9,
      "out_of": 100,
      "components": [
        { "key": "repo_velocity",  "raw": 266.0, "raw_label": "266 stars/day",
          "norm": 0.89, "weight": 40, "points": 35.6, "source": "github",  "state": "ok" },
        { "key": "keyword_volume", "raw": 8100,  "raw_label": "8,100 searches/mo",
          "norm": 0.54, "weight": 25, "points": 13.5, "source": "vidiq",   "state": "ok" },
        { "key": "supply_gap",     "raw": 2,     "raw_label": "2 videos / 90d",
          "norm": 0.83, "weight": 25, "points": 20.8, "source": "youtube", "state": "ok" },
        { "key": "staleness",      "raw": 6,     "raw_label": "newest 6d ago",
          "norm": 0.20, "weight": 10, "points":  2.0, "source": "youtube", "state": "ok" }
      ]
    },

    "evidence": [{ "kind": "repo", "github_id": 123456, "full_name": "x/mcp-registry",
                   "stars": 12496, "age_days": 47, "velocity": 266.0,
                   "indie": { "score": 0.58, "owner_type": "Organization", "contributors": 9,
                              "trust": "derived" },
                   "discovered_via": "trending" }],   // trending | search
    "trust": { "demand": "derived", "supply": "derived",
               "verdict": "derived", "score": "derived" }
  }]
}
```

`score.value` and `score.out_of` are both `null` when the row is `INSUFFICIENT_DATA`. A component
with `state: "no_data"` carries `points: null` and is excluded from `out_of`, so `out_of` reads 75
rather than 100 when vidIQ has no volume. **The UI reads `out_of` directly and never assumes 100.**

Repos are keyed by `github_id`, never `full_name`. `indie.score` never gates: it renders as a chip.

### `topic_pages.json`

```jsonc
{ "version": 3, "topics": [{
    "topic_id": "claude-code-mcp-setup",
    "label": "Wiring MCP servers into Claude Code",
    "parent_id": "claude-code",
    "is_leaf": true,
    "shape": "tutorial",
    "video_count": 9, "creator_count": 7, "window_days": 90,
    "state": "ok",                        // ok | insufficient_data
    "min_videos": 3,                      // thresholds.min_n.topic_page_min_videos, echoed
    "newest_video_at": "2026-07-24T00:00:00Z",
    "video_ids": ["zbmuiaPuiNM"],

    "nodes": null,                        // reserved for step 15
    "edges": null                         // reserved for step 15
}]}
```

`min_videos` is the shortfall the page renders against: `state: "insufficient_data"` plus
`min_videos: 3` is what lets a topic page say *"1 video, need 3"* instead of just hiding the route.
This is decision 0009's split: the verdict never reads a video count, and this field is where the
count still matters, on the topic page, not the verdict.

`nodes` and `edges` are the **mind map**, reserved as `null` so step 15 fills this bundle rather than
replacing it. They carry the three-level `step → implementation → citation` shape for `tutorial`
topics and `theme → position → citation` for `review` topics. **One schema, two vocabularies**, which
is what lets one `ChainMap` component render both:

```jsonc
"edges": [{
  "from": "authenticate", "to": "write-claude-md",
  "relation": "then",                    // then | requires | alternative_to | contradicts
  "voices": 6,
  "cites": [{ "handle": "adrian", "video_id": "abc", "t": 252,
              "evidence": "run claude in any directory and it opens a browser" }]
}]
```

`cites[].evidence` is **mandatory**. An edge with no verbatim evidence does not render. This is the
direct port of social-invest's chain-map rule, written after string-matched prose produced ~50% junk.

### `recent.json`

The `/topics` feed. Its own bundle rather than a slice of `videos.json`, which is 16.7 MB and is
never shipped to the browser whole; this one carries card fields only, for one month of outliers,
so the window / format / per-channel toggles are client-side filters over a payload already in
memory.

```jsonc
{
  "version": 1,
  "generated_at": "2026-07-29T00:00:00Z",
  "source": "vidiq",
  "fetched_at": "2026-07-29",          // null when no sweep has run: a state, not zero outliers
  "window": "thisMonth",
  "coverage": { "channels_requested": 72, "batches_ok": 6,
                "batches_failed": 0, "missing_channel_ids": [] },
  "videos": [{
    "video_id": "IbFaY3xFpZM", "title": "...", "published_at": "2026-07-23T23:08:15Z",
    "view_count": 36869, "duration_s": 1045, "type": "long",
    "channel_id": "UC4Sg...", "channel_name": "Dubibubi",
    "breakout_score": 9.59,            // vidIQ's, carried through untouched. null = not returned
    "pattern_id": null                 // stamped by the grouping pass when one has run
  }],
  "patterns": [{ "pattern_id": "p1", "label": "...", "evidence": ["v1", "v2"],
                 "creator_count": 3, "existing_leaf": "claude-code-mcp-setup",
                 "action": "add_to_leaf" }],
  "trust": { "breakout_score": "vendor", "pattern": "inference", "existing_leaf": "derived" }
}
```

**Inputs.** `_synthesize/outliers/<date>.json`, written by `pipeline/outliers.py` (metered: 30
credits, 2 formats x 3 batches of 24 x 5), and `_synthesize/patterns/<date>.json`, written by a
skill that does the LLM grouping — `pipeline/` imports stdlib and never calls a model. Both are
optional: missing outliers give an empty feed that says so, missing patterns give empty rows that
say so.

**`vendor` is a fourth trust tier**, beside Oracle / Derived / Inference: an exact number that is
someone else's and that we cannot audit. `breakout_score` is never recomputed or rounded, and the
card names vidIQ rather than printing a derivation. Decision 0012 has the why.

`coverage.batches_failed > 0` renders as a warning on the page. Returning 48 channels' outliers as
if they were 72 would read as "nothing broke out on the other 24", which is a claim nobody made.

### `meta.json`

```jsonc
{
  "version": 3,
  "generated_at": "2026-07-27T09:00:00Z",
  "thresholds_version": 3,
  "build_step": 10,
  "coverage_rate": 0.62,
  "self_channel_id": "UCxxxxEricTech",
  "snapshot_health": { "first_date": "2026-07-27", "days_present": 365, "days_missing": 0 },
  "video_snapshot_health": { "videos_tracked": 3600, "days_present": 1 },
  "comment_health": { "channels_with_comments": 72, "ingested": 412000, "classified": 6100 },
  "channels": { "total": 72, "ok": 71, "absent": 1 },
  "target": { "mode": "growth", "window_days": 90, "rank": 6 },
  "discovery": { "trending_ok": true, "reason": null },
  "partial_run": false
}
```

`discovery.trending_ok` is the GitHub Trending scrape's health, and `reason` carries why when it is
`false` (a Firecrawl failure, a layout change). Decision 0003's non-critical rule lives here:
`trending_ok: false` means discovery degraded, never that the sweep failed.

`coverage_rate` (assigned videos over total) makes registry decay visible rather than silent. A
falling rate is now the *only* signal that `config/topics.json` needs new leaves, since the proposal queue
is gone, so it moves from nice-to-have to load-bearing. `channels.absent` surfaces the
private-channel hole on the page instead of burying it. `partial_run` is set when a GitHub 403
backoff truncated the sweep.

`review_queue.json` is **deleted**. `config/targets.json` is hand-edited input, not a bundle; `meta.target`
is its echo for the UI.

---

## 5. `config/thresholds.json`

**The file is the spec.** It lives at `config/thresholds.json`; duplicating its contents here would
guarantee the two drift. Read the file.

Every adjective the pipeline uses ("crowded", "still growing", "high demand") resolves to a number
in it, and every emitted band carries `fired`, the list of comparisons that produced it, so a page
can always show its work.

**A number earns a place there only if changing it would change what the dashboard tells you to do.**
Everything else is a constant in code. Without that bar the file becomes a junk drawer of every
magic number and stops meaning anything.

Four values are load-bearing and worth knowing without opening the file:

| Key | Value | What it trades |
|---|---|---|
| `growth.subscriber_floor_buckets` | 5 | coverage against honesty on the default ranking. Raise it and fewer subscriber numbers render, but every one that does is tighter. |
| `comments.classify_min_likes` | 5 | the LLM bill. Every comment above it costs one model call. |
| `github.age_days_floor` | 1 | not cosmetic. A repo created today has `age_days == 0`, and `stars / 0` is `Infinity`, which sorts first and permanently tops the table. |
| `scoring.weights.repo_velocity` | 40 | the biggest single weight, because velocity is the only leading signal in the product. |

Leaf grain is why `supply.crowded_min_videos` (5) and `crowded_min_creators` (3) sit lower than they
would for broad topics: at leaf grain the video count per topic drops sharply. Expect both to move
once real counts land.
## 6. Score normalization

```
score = sum over components of  weight * normalize(raw)

  COMPONENT        NORMALIZE                                   WEIGHT
  repo_velocity    min(1, stars_per_day / 300)                    40
  keyword_volume   min(1, volume / 15000)                         25
  supply_gap       max(0, 1 - videos / 12)                        25
  staleness        min(1, days_since_newest / 30)                 10
                   1.0 when the topic has zero videos
```

Every component traces to a counted API value. None is an estimate. All four are Derived tier and
render their formula.

The **indie score** is deliberately *not* a score component. It is descriptive, not directional:
Eric wants to see whether a repo is grassroots, not to have that quietly move a topic up the Monday
list. It renders as a chip and nothing else (spec §5).

The **hunch flag** is likewise not a component. It sorts, it does not score.

> The `staleness` component was called `recency` in an early draft, which reads backwards: it scores
> **higher** the **longer** it has been since anyone covered the topic. Renamed so the field name
> matches its direction. Semantics unchanged.

### Leaderboard rank, the four modes

```
growth (default)  subscriber_growth_rate[window]        floor applied; bounded sorts by upper
general           weighted composite, thresholds.growth.rank_weights
subscribers       subscriber_count                       Oracle-ish, but rounded; bucket disclosed
views             views_gained[window]                   exact, always renderable
```

`bounded` rows sort **below** every `ok` row and **above** `insufficient_data`, ordered among
themselves by their `upper` bound.

**In the `general` composite, a `bounded` subscriber delta drops its weight out of the denominator**
rather than contributing a guessed value. A channel whose growth cannot be measured ranks on its
remaining inputs and renders `x / 50`, exactly as the opportunity score renders `x / 75` when a
component is missing. One rule, used in both places: **never impute a missing input, and always show
the reduced denominator so the row is visibly measured differently.**

The rejected alternative was treating `< 5,000` as 5,000 to keep one scale. That credits growth that
may not have happened, and it does so silently. This is the ordering that makes "we know it grew less than 5,000"
strictly more informative than "we have no idea", and it is what `sortable-table`'s existing
nulls-last rule cannot express on its own, so it needs its own comparator.

---

## 7. Synthesis

### The mind map

One component, two vocabularies (§3). Ported from `social-invest/web/components/ticker/chain-map.tsx`.

```
TOPIC: claude-code-mcp-setup

  install-cli  ──── then ────▶  authenticate
  authenticate ──── then ────▶  write-claude-md
  claude-mcp-add ─ alternative_to ─▶ mcp-json     ×6
  claude-mcp-add ─ contradicts ────▶ mcp-json     ×2   ← newest
```

Every row is a claim someone asserted on camera. Clicking one opens the verbatim quote, the speaker,
the date, and a link to the timestamp. **An edge with no `cites[].evidence` does not render.**

### The path judge (`tutorial` shape)

Emits **2–3 named paths, each labeled with the goal it wins at**, never a single opaque "best."
"Best" is a property of a path plus a goal, not of a path alone.

```
FORK: how to wire in MCP                      (7 creators)

*  FEWEST STEPS                  3 steps
   .mcp.json in repo root
   Brad 11d, Charlie 6d
   Why: 2 newest creators, fewest extracted steps

o  MOST DURABLE                  7 steps
   per-project + scoped permissions
   Cole 24d
   Why: only branch whose creator mentions team handoff

!  MOST COMMON, BUT STALE
   `claude mcp add` global
   4 creators, Feb to Apr
   -> the 2 newest call this superseded
```

The judge shows its criteria on every verdict. Eric can disagree with it because he can see why.
This is the direct analogue of social-invest's "evidence quote on every call."

**Every judge input must be a counted or cited fact.** Allowed: extracted step count, distinct
creator count, publish dates, and whether a later video explicitly contradicts an earlier one (which
requires a citation). Wall-clock estimates are banned unless quoted and attributed — an early draft
showed `~10 min` and `~40 min` on these branches and nobody said those numbers.

**Explicitly rejected:** performance-weighted path ranking (highest-multiplier video wins). It
conflates "teaches well" with "is correct," and would rank a high-performing February tutorial
teaching a now-deprecated path first.

### The position judge (`review` shape)

Same machinery, different output. Instead of paths by goal, **positions by argument**, each carrying
who holds it and what they based it on:

```
SPLIT: is Kimi K2 better than Sonnet for code?    (6 creators)

*  BENCHMARK-LED               "beats Sonnet"        3 creators
   Basis: published MMLU / SWE-bench tables

o  HANDS-ON-LED                "doesn't transfer"    2 creators   ← newest
   Basis: their own repro attempts on real repos

!  COST-LED                    "wrong question"      1 creator
```

The stale-majority check applies identically: a benchmark-led majority from six weeks ago against two
newer hands-on dissents is exactly the pattern worth flagging.

### Stale-majority detection

The single highest-value sentence this product can emit:

```
WARN  4 creators install MCP servers via `claude mcp add` (Feb to Apr).
      The 2 most recent (Brad 11d, Charlie 6d) say that path is superseded by
      .mcp.json checked into the repo.
      -> majority is stale. Newest wins.
```

In AI tooling the truth moves monthly, so a plain consensus count points confidently at the wrong
path.

### Comment classification

One LLM call per qualifying comment, into the seven keys in spec §7. Cached by `comment_id`, so a
comment is never classified twice. Only comments clearing `classify_min_likes` **or**
`classify_min_replies` are sent, and each run is capped by `classify_max_per_run`.

The classifier returns the key and nothing else. It does not summarize, rewrite, or infer intent
beyond the label, because everything it produces renders next to the raw comment text and any
elaboration would compete with the evidence for the reader's attention.

### Channel blurbs

One LLM call per channel, cached, regenerated monthly. Input is the channel's own description plus
its last 20 video titles. Output is two or three sentences. **Inference tier**, rendered in the
collapsible profile card with its source list attached.

---

## 8. What it costs

### vidIQ

Balance verified 2026-07-27: **1,141 total** (1,090 renewable of 2,000 + 51 add-on), renewable
resets **2026-08-04**.

**One-time, build step 2:**

| Call | Scope | Cost |
|---|---|---|
| `vidiq_channel_stats` full daily series | all 72 channels | **360** |

One call per channel returns ~365 consecutive daily points (subscribers, views, videos). Verified
live on `@ColeMedin`: `from=2025-07-01, to=2026-07-27` returned **392 consecutive daily points**. All
growth windows are arithmetic on that one series, so **growth windows are live from day one**. The
`building, N of M days` machinery stays regardless, because it is the response to *any*
incompleteness including a missed Tuesday.

**Steady state, monthly** (a month is 4.33 weeks, not 4):

| Call | Scope | Cost | Cadence | Monthly |
|---|---|---|---|---|
| `vidiq_keyword_research` | 25 scoreable leaves | 125 | weekly | ~541 |
| `vidiq_video_stats` | surgical per-video backfill | 5 ea | ad hoc | ~100 |
| `vidiq_channel_analytics` | self channel, daily subs | 5 | weekly | ~22 |
| **Total** | | | | **~663 of 2,000** |

`vidiq_channel_videos` (100/month, multiplier cross-check) is **dropped**. The multiplier is computed
from exact free view counts, so there is nothing for a paid source to cross-check that we do not
already know more precisely. That frees ~100 credits a month.

Month one: 360 for the backfill leaves 781. Steady state resumes against the 2,000 landing
2026-08-04, with ~118 credits of slack rather than the previous ~18. The backfill still runs as its
own guarded job **before** the first weekly keyword sweep.

The `si-refresh` cost-guard pattern ports directly: reserve floor, daily ceiling, free pre-flight
preview table, actual-spend ledger via balance-before minus balance-after.

### Alternatives, and why none of them are bought

Checked 2026-07-27 because Eric asked directly:

| Source | Verdict |
|---|---|
| **ViewStats** (MrBeast) | No public API. Web and iOS only; the one "API" is a third-party scraper wrapper. |
| **TubeBuddy** | No public developer API. Its own docs describe it as a YouTube API *partner and consumer*. |
| **Apify** actors | Every subscriber tracker scrapes the same rounded figure; comment scrapers lose to a 1-unit official call; GitHub REST beats a scraped trending rank. |

They all read the same YouTube Data API we already have. They sell UI and aggregation, not more
accurate raw numbers. Since `viewCount` is exact and the multiplier is built from it, **no paid
source can improve the multiplier at all.** vidIQ survives on exactly two things nothing else
provides: purchased daily history, and keyword search volume.

### The daily sweep, call by call

This is the loop that runs every morning. **Nothing here is metered; it is all free quota.**

```
09:00  ait-snapshot starts
       │
       ├─ 0. GAP CHECK ─────────────────────────────────────────────────────────
       │     read _raw/snapshots/, find missing calendar dates
       │     if a day is missing → backfill it, do NOT average across the hole
       │
       ├─ 1. CHANNELS ──────────────────────────── 2 units ────────────────────
       │     channels.list?id=UC1,UC2,...UC50      ← 50 ids per call, 1 unit
       │     channels.list?id=UC51,...UC72         ← remaining 22, 1 unit
       │
       │     for each: viewCount (exact) · subscriberCount (ROUNDED, 3 sig figs)
       │               videoCount · uploads playlist id
       │
       │     ⚠ id missing from a 200 response  →  status:"absent"  (went private)
       │     ⚠ viewCount went DOWN             →  status:"corrupt" (not consumed)
       │
       ├─ 2. NEW UPLOADS ──────────────────────── ~72 units ───────────────────
       │     playlistItems.list?playlistId=UU...   ← 1 unit per channel
       │     only fetch until we hit a video we already have
       │
       ├─ 3. VIDEO STATS ──────────────────────── ~72 units ───────────────────
       │     videos.list?id=v1,v2,...v50           ← 50 ids per call, 1 unit
       │     3,600 tracked videos = 72 calls
       │
       │     this is what makes per-video traction free and exact
       │
       ├─ 4. COMMENTS ─────────────────────────── ~30 units ───────────────────
       │     commentThreads.list?videoId=...&maxResults=100   ← 1 unit per page
       │     new videos only in steady state
       │
       │     append to _raw/comments/<channel_id>.jsonl, dedupe on comment_id
       │
       ├─ 5. GITHUB VELOCITY ──────────────────── free w/ token ───────────────
       │     GET /search/repositories
       │         ?q=created:>2026-04-28+topic:ai&sort=stars&order=desc
       │                                          ← ~30 req/min, TIGHT limit
       │     GET /repositories/{id}               ← keyed by NUMERIC id, always
       │
       │     velocity = stars / max(age_days, 1)   ← the floor stops Infinity
       │     owner.type + contributors → indie score
       │
       │     ⚠ 403 secondary limit → back off, set meta.partial_run = true
       │
       ├─ 6. GITHUB TRENDING ──────────────────── 1 Firecrawl scrape ──────────
       │     scrape github.com/trending (daily + weekly)   ← no API exists
       │     failure here is NON-CRITICAL: discovery degrades, data stays clean
       │
       └─ 7. WRITE ─────────────────────────────────────────────────────────────
             append to _raw/, never overwrite, never delete

09:04  done.   ~176 of 10,000 units.   0 credits.   0 dollars.
```

**Two calls that are never made, and why:**

```
  search.list          100 units   100 searches = the ENTIRE daily quota. Banned.
  captions.download    200 units   Only works on videos YOU OWN. Useless for competitors.
  comments.insert       50 units   Would need OAuth. Cut by design: we deep-link instead.
```

### YouTube quota — 10,000 units/day

| Job | Units | When |
|---|---|---|
| `channels.list` 72 ids | 2 | daily |
| `playlistItems` new uploads | ~72 | daily |
| `videos.list` 3,600 tracked videos | 72 | daily |
| `commentThreads` new videos | ~30 | daily |
| **Daily steady state** | **~176** | |
| Comment backfill, 3,600 videos × 1 | ~3,600 | one-time, fits in one day |

Comfortable at every stage. Two hard rules:

- **`search.list` costs 100 units and is never called.** 100 searches would consume the entire day.
- **`captions.download` costs 200 units and only works on videos you own.** Competitor transcripts
  come from timedtext with a local `yt-dlp` + `mlx_whisper` fallback, exactly as `si-research-yt`
  already does. This is why step 14 mines descriptions and pinned comments first.

**No OAuth anywhere.** `comments.insert` (50 units) would be the only write call in the system and it
is cut by design (spec §7), which removes a token store, a refresh flow, and an entire class of
failure.

### GitHub

- Core REST: 5,000 req/hr authenticated. Needs `GITHUB_TOKEN`.
- `/search/repositories`: **~30 req/min**, separate and much tighter, with secondary abuse limits on
  top. Capped by `max_queries_per_run` and `max_pages_per_query`, with backoff and a `partial_run`
  flag on `meta.json`.
- `github.com/trending`: **no API**. One Firecrawl scrape per configured window, daily. Cheap, and
  its failure is non-critical: a failed trending scrape degrades discovery, it does not corrupt data.

Niche scoping uses `topic:` qualifiers plus a keyword allowlist derived from the leaf topics in
`config/topics.json`. `owner.type` and contributor counts arrive free on responses we already make.

### LLM tokens

**Comment classification, from step 12.** One short call per qualifying comment: ~200 input tokens,
~10 output. At `classify_min_likes: 5` expect roughly 5–10% of ingested comments to qualify. Against
a ~412,000-comment corpus that is ~25–40K classifications for the one-time backfill and a few hundred
a day in steady state. Route to the cheap model; the task is a single label from a closed set.

**Channel blurbs, from step 11.** 72 calls, monthly. Negligible.

**Transcript extraction, from step 14.** Measured against the sibling project:
`social-invest/_raw/youtube/` holds 607 markdown files totaling 9.13 MB, averaging ~3.8K tokens,
long-form samples running 3.7K–7.5K words. AI tutorials skew longer, so budget **12–20K tokens per
video** and roughly two full-context passes, so **~40–45K tokens per video** through tier 3.

| Workload | Volume | Tokens |
|---|---|---|
| Steady state | 30–55 qualifying videos/week | **1.5–2.5M / week** |
| 90-day cold-start backfill | ~1,500–3,000 videos | **70–135M**, ~17–33 hours wall clock |

**The backfill is a separately scheduled one-time job with a resumable ledger, never inside a
session.** Route extraction to the cheap model and reserve the expensive one for cross-creator
adjudication only, which is a small number of short calls per topic rather than per video. Eric's
rule: *"the best model on the job, not the highest expensive one."*

---

## 9. Failure modes

```
                        silent today?  fix                              test
 channel goes private       YES        status:"absent" + meta.channels   absent-channel
 age_days == 0              YES        github.age_days_floor = 1         velocity boundary
 missed snapshot day        YES        delta() returns "building"        gap-window
 corrupt vidIQ point        YES        monotonicity filter, "corrupt"    monotonicity reject
 video deleted              YES        status:"absent" in video series   video-absent
 zero/multi self channel    YES        ait-snapshot fails loudly         self-channel guard
 leaf becomes a parent      YES        warn + re-match its videos        tree-demotion
 sub delta below bucket     YES        state:"bounded" + upper, "< N"    measurement-floor
 category without evidence  YES        bundle pairs category with text   category-evidence
 unclassified comment       YES        category:null -> "unsorted"       classify-partial
 trending scrape fails      YES        non-critical warning, keep search trending-degraded
```

Every one of these produces a confident wrong number rather than an error unless handled, which is
why each has an explicit state, a config knob, or a filter, plus a named test.

The bottom four are new in this revision. **`sub delta below bucket` is the most dangerous**, because
it is the default ranking: before the floor existed, a 219,000-subscriber channel that grew 2,000 in
a week rendered "+2,000" against a ±1,000 bucket, a number that was 50% noise and looked exact.

Non-silent once handled: repo renamed (keyed on `github_id`, survives); GitHub 403 secondary rate
limit (backoff, then `partial_run`); video deleted after extraction leaving live citations pointing
at dead URLs (citation liveness check, step 15).

---

## 10. Test plan

Python `pytest` beside the code as `test_*.py` per the root CLAUDE.md convention. Web bundles in
vitest, mirroring `social-invest/web/lib/*.test.ts` (1,983 lines, verified), which is *how* that
project enforces its truth guarantees.

```
pipeline/test_snapshot.py    resolve ids, batch 72->50+22, absent channel, idempotent
                                same-day rerun, gap detection, self-channel guard (0 and 2 rows)
pipeline/test_video.py       per-video delta 24h/7d/30d, still_growing both conditions,
                                deleted video -> absent, vidiq backfill merge keeps source tag
pipeline/test_multiplier.py  median baseline, maturity_days exclusion, separate short/long
                                baselines, < baseline_min_videos -> no_baseline NOT low
pipeline/test_github.py      velocity math, age_days==0 floor, excluded_repos, 403 backoff,
                                page cap, zero results, partial_run flag,
                                trending scrape failure is non-critical,
                                indie score never gates a row out
pipeline/test_topics.py      leaf-only scoring, parent never banded, arbitrary depth,
                                leaf-becomes-parent warning + re-match, n:m assignment,
                                primary selection, coverage_rate, shape tutorial|review
pipeline/test_verdict.py     all 4 cells, every threshold boundary, INSUFFICIENT_DATA,
                                UNKNOWN demand, no_baseline multiplier
pipeline/test_score.py       each component normalizes and caps at 1.0; weights sum to 100;
                                worked example reproduces 71.9; INSUFFICIENT_DATA scores null
                                NOT zero; missing component drops its weight (out_of == 75);
                                zero-video topic gets staleness norm 1.0;
                                indie score and hunch never enter the score;
                                score never contradicts its own verdict bands
pipeline/test_growth.py      complete window, window with gap -> building,
                                MEASUREMENT FLOOR: delta < 5x bucket -> bounded with upper,
                                bounded never returns a value, bucket always disclosed,
                                bounded sorts below ok and above insufficient_data,
                                bounded rows order among themselves by upper,
                                per-channel floor differs by bucket width (2,380 vs 2.93M),
                                subs_per_1k_views inherits the floor,
                                all four rank modes produce a total order,
                                monotonicity filter rejects the real 21103->606 series
pipeline/test_comments.py    root/reply caps, resumable backfill ledger, quota accounting,
                                lag_days = published_at - video_published_at, never negative,
                                classification cached by comment_id, never twice,
                                classify floor is likes OR replies,
                                unclassified -> category null, rendered not hidden,
                                every classified row ships its text alongside
pipeline/test_own.py         covered-topic suppression is a filter not a deletion,
                                self channel IS ranked and IS included in medians,
                                comparison defaults to self and accepts an override
test_anchors.py                 build_data never writes into data/;
                                thresholds.json version matches meta.thresholds_version;
                                no OAuth credential is ever read
web/lib/bundles.test.ts         schema parity: every bundle field the UI reads exists
web/lib/trust.test.ts           Oracle vs Derived vs Inference render distinctly; no Derived
                                value renders without its formula or bucket; a bounded delta
                                renders "< N" and never a bare number; a comment category
                                never renders without its comment text; an edge without
                                cites[].evidence never renders
web/e2e/monday.spec.ts          [E2E] open dashboard, top-5 grid + opportunity table render,
                                expand to /leaderboard, empty states
```

The `test_growth.py` monotonicity case seeds the **real** corrupt series observed on 2026-07-27.
A regression test written against a failure already observed is worth more than ten invented ones.

---

## 11. Build order, in detail

The ordered slices are in [spec.md](spec.md) §10. This is the task list under them.

**Config and foundations — step 0**

- **T1** `config/channels.json`: add `channel_id` and `niche` via a one-time resolution pass; assert exactly
  one `category = own`. Verify: 72 rows each with a `UC...` id, `pytest -k "resolve or self_channel"`.
- **T2** `config/thresholds.json` v3, and wire every branch through it. Verify: `pytest -k thresholds_version`.
- **T2b** `config/topics.json` v3: tree schema, derived leaf detection, demotion warning, `shape` field.
  Verify: `pytest pipeline/test_topics.py -k "leaf or parent or demotion or shape"`.
- **T2c** `config/targets.json`: rank target and hunch flags. The only user state in the product.
- **T9** extract `pipeline/`, the package all skills import.
- **T15** add `GITHUB_TOKEN` to `.env` and `.env.example`.

**Snapshot and growth — steps 1–3**

- **T4** `ait-snapshot`: `status` field + gap detection for channels.
- **T4b** per-video daily `videos.list` sweep, 50 ids per call. Verify: ≤ 80 quota units for 3,600 videos.
- **T5** `delta()` returns `building` on any incompleteness, channels and videos alike.
- **T5b** **the measurement floor.** `bounded` state, `upper`, the four rank modes, and the
  comparator that orders `ok > bounded > insufficient_data`. Highest-risk single task in the spine.
- **T6** monotonicity filter on the vidIQ series, seeded from the real 21,103 → 606 case.
- **T6b** `vidiq_channel_stats` backfill job, 72 channels, cost-guarded. Verify: 360 credits spent,
  ledger matches the balance delta, all 72 series merged with `source` tags.
- **T8** `launchd` daily snapshot agent with gap backfill. Verify: kill a day, confirm the gap report.

**Competitive intelligence — steps 4–6**

- **T16** multiplier computed from free view counts.
- **T17** per-video traction and `still_growing`.
- **T18** leaderboard bundle: four rank modes, window selector, niche filter, rank target.
- **T19** own-content suppression and back-catalogue panel.
- **T20** **comment ingest**: backfill ledger + daily fetch, 100 roots per call. Verify: backfill
  resumes after a kill; ≤ 10,000 units/day; `lag_days` never negative.

**Opportunity engine — steps 7–8**

- **T3** verdict grid, one vocabulary, leaves only.
- **T3b** opportunity score. Verify: null-not-zero, weight exclusion, reproduces 71.9.
- **T7** `age_days_floor` on velocity.
- **T10** cap the GitHub sweep, backoff, `partial_run` flag.
- **T10b** **trending sweep** via Firecrawl + indie score from `owner.type` and contributors.
  Verify: scrape failure is non-critical; indie never gates.

**Web — steps 9–12**

- **T3c** home: gamified top-5 card grid + opportunity table with expandable derivation. Verify:
  `--` sorts last in both directions; `x / 75` renders on a missing component; top 3 styled distinctly.
- **T12** trust tokens + bundle parity test.
- **T21** channel page: profile card with AI blurb, tabbed collapsible charts, comparison view.
- **T21b** **comment table**: categories, filters, sort by likes or replies, top 5 → 10 → pagination,
  video hyperlink + jump icon, **lag column**.
- **T22** comment classification pass, cached by id, floor-gated.
- **T13** split `videos.json` and `video_snapshots.json` by route, or ~7,200 rows ship to the browser
  on every page. `comments.json` splits by channel for the same reason and is larger.

### Parallelization

```
Lane A: T1 -> T15                                config files, independent
Lane B: T2 -> T2b -> T2c -> T9                   toolkit skeleton, gates C/D/E
Lane C: T4 -> T4b -> T5 -> T5b -> T6 -> T6b -> T8  snapshot + growth (shared growth.py)
Lane D: T3 -> T3b -> T7 -> T10 -> T10b           opportunity (shared github.py)
Lane E: T16 -> T17 -> T18 -> T19 -> T20          competitive intelligence + comment ingest
Lane F: T3c -> T12 -> T21 -> T21b -> T22 -> T13  web (waits on D and E bundle shapes)

Launch A + B in parallel. Merge B. Then C + D + E in parallel. Then F.
```

Conflict flag: lanes C, D and E all feed `build_data`'s bundle writers. Keep each writer in its own
module so the merges stay clean.

**Build the ingestion lanes with a dynamic Workflow**, one agent per task, model chosen per stage.

---

## 12. Reuse from social-invest

**Copy the shape, share no code.** Revisit at project 3.

Verified by reading imports, not grepping keywords: **2,752 portable lines**, and `components/ui`
holds **12** files (1,318 lines). The rewrite bucket is **~6,360** non-test lines, **~8,340** with
tests — roughly three times what a first read suggests.

### The concrete mapping

`app/ticker/[symbol]/page.tsx` is a near 1:1 template for the topic page. Section for section:

| social-invest | ai-influencers-tracker |
|---|---|
| header: logo, symbol, price, `heat 4.2` dotted underline | topic name, score, verdict badge, indie chip |
| `PriceChart`, 1y close + call markers | topic timeline, markers are videos |
| `TickerLeaderboard`, "who called this one best" | who covered this first, who covered it best |
| `InfluencerSections`, "every influencer's trail" | per-creator trail on the topic |
| `TickerDeepDive`, "short bullets" | trunk steps, or review themes |
| **`ChainMap`, "who feeds whom"** | **the mind map** |
| `community_entries`, "what commenters said" | comment signal, unserved branch |

`components/leaderboard.tsx` (372 lines) is the **card grid** for home panel 1, capped at 5:
`#rank` + identity chip + one hero number + unit label + coverage chip + sparkline + footer stat.
Hero number maps from `avg return %` to `subscriber growth rate`. It already implements `—` for null
(never `0%`) and a `provisional` badge, both of which this project needs.

`components/consensus-board.tsx` (231 lines) is the **opportunity table**: sortable, formula printed
above the table as the definition, avatar cluster, row-click routing, and `buildHeatTip` printing the
arithmetic line by line. That tooltip is the model for rendering `fired`.

`components/sortable-table.tsx` (182 lines) is the **highest-value single port** and arrives already
correct: `useTableSort` documents and implements *"Null/undefined always sort last in both
directions"*, which is verbatim the `INSUFFICIENT_DATA` rule. It needs one extension, the
three-way `ok > bounded > insufficient_data` comparator (§5).

`app/globals.css` tokens: `--gain #16a34a`, `--loss #e5484d`, `--warning #f5a623`, `--limit #7c3aed`,
`--primary #006cac`. The four P&L tokens are replaced by `--oracle`, `--derived`, `--inference`;
`--primary` and the neutral scale carry over untouched.

`web/AGENTS.md` is itself portable: it already encodes "UI honesty ≥ cleverness", "null → `—`, never
`0%`", a locked metric-language table, and "status is never gain/loss". Rewrite the metric table and
the rest stands.

### What does not port clean

**"Ports clean" is false as literally stated** for four named files. `lib/identity.ts`,
`components/avatar.tsx`, and `components/source-icon.tsx` all
`import type { Source } from "@/lib/data"`, and `lib/data.ts` opens with `import "server-only"` — a
`"use client"` component type-importing a server-only module compiles today only because TypeScript
erases the type, so none of the three compiles standalone. `components/header.tsx` is welded to the
live-quote freshness system, which has no analogue here. `hear-from.tsx` hardcodes a
`social-invest:` storage key. `source-icon.tsx` is an Instagram/YouTube switch, dead weight in an
all-YouTube product.

Individually small. Collectively: a **de-domaining pass over ~2,750 lines**, not a `cp -r`.

**`build_data.py`:** its *shape* ports (collect, enrich, compute, write versioned JSON bundles,
idempotent, never writes into `data/`). Its 2,098 lines of yfinance and ticker logic do not.
`build()` alone is 397 lines, so "the shape" is a monolith to be re-derived, not a scaffold to fill.

**The `si-research-yt` fork is easy.** `si-research-yt/scripts/yt_toolkit/` is self-contained with
**zero investing coupling**; all four CLIs import only from `yt_toolkit`, and `diff -rq` confirms it
shares no files with `.agents/scripts/youtube` (a different package, `youtube_toolkit`). The fork is:
copy verbatim, rewrite ~40 lines of `postfile.render_draft`, rewrite the SKILL.md prose. Investing
coupling lives entirely in the Step 1.5 relevance-filter prompt and the Step 4 summary bullet set.
Hours, not days.

**The OCR path is far cheaper than earlier drafts of this document claimed.** Re-checked
2026-07-27: `si-research-yt/scripts/yt_toolkit/media.py` is **76 lines** and already implements the
whole thing — `download_mp4()` via yt-dlp, `probe_duration()` via ffprobe, and `extract_frames()`
doing **ffmpeg scene-change detection** capped by config, writing a `timestamps.json` that maps each
frame to its second.

Scene-change is the right trigger for a tutorial: the screen changes when a new command appears.

What limits it to Shorts is **configuration, not capability**: `SHORT_MAX_SECONDS = 180`,
`FRAME_CAP = 20`, and a `render_draft` branch that emits "On-Screen Content" only when
`video["type"] == "short"`. Raising those three is most of step 18.

This materially de-risks the step 13 gate's failure path. If capture comes in under 50%, OCR is a
config change plus a frame-cap budget, not a new subsystem.

### The build sequence, from their commit history

51 commits on `projects/social-invest`, and the order is the model Eric named: **digest the data,
build the ingestion, then synthesize and build the dashboard.** Research and ingest skills land
first, then data refreshes, then the dashboard, then a long tail of honesty fixes: *"stop trusting
stated entry prices that cannot be real"*, *"normalize LLM prose fields"*, *"preview is read-only"*.

**Those trust fixes come last and never stop.** That is the argument for building the three trust
tiers into this project at step 9 rather than retrofitting them at step 30.

**Unpriced cost:** "share nothing" means `yt_toolkit` plus its tests exist in three places and will
diverge. That is a standing maintenance tax and the strongest concrete argument for revisiting the
decision before project 3.

---

## 13. Decided

| ID | Decision |
|---|---|
| D1 | Topic-first synthesis, not influencer-first tracking |
| D2 | Topic identity: hand-edited `config/topics.json`. **No proposal queue; discovery via GitHub Trending + Eric** |
| D3 | Composition: trunk/fork for tutorials, themes/split for reviews, self-contained steps |
| D4 | Path judge: named paths by goal, recency-weighted, stale-majority always flagged |
| D5 | Code reuse: copy chrome and tokens, share nothing with social-invest |
| D6 | Build order: opportunity engine and competitive spine first, topic synthesis second |
| D7 | Topic assignment: cheap metadata-only keyword matcher, upgraded in place at step 15 |
| D8 | History: **buy** the 360-credit `vidiq_channel_stats` daily series for all 72 channels |
| D9 | **Growth metric: rank on subscriber growth rate, gated by a per-channel 5x-bucket measurement floor. Below the floor is `bounded` (`< N`), never blank and never a bare number** |
| D10 | Extraction sequencing: description and pinned-comment mining first, long-form OCR second |
| D11 | Ground truth: hard gate, not homework. No extraction until the spike measures capture rate |
| E2 | Thresholds live in `config/thresholds.json`. Every verdict renders which threshold fired |
| E3 | Snapshot clock: macOS `launchd` daily, gap detection every run, no number over a missing day |
| E4 | Six skills, one shared `pipeline/` library |
| E5 | Test coverage: all paths, pytest + vitest + anchor tests |
| E6 | Opportunity score: 0–100, four weighted components, never imputes a missing input |
| E8 | Visual language: port social-invest chrome after a de-domaining pass; swap P&L for trust tokens |
| F1 | Home: two panels, **top-5 gamified card grid** on top, opportunity table below |
| F2 | Own content: suppress covered topics; **self is ranked inline and included in all maths**, colour-coded only |
| F3 | Multiplier computed from free exact view counts. `vidiq_outliers` and `vidiq_channel_videos` dropped |
| F4 | Topic grain: tree of arbitrary depth, only leaves scored, `scoreable` derived not authored |
| F5 | Comments unbundled from the transcript tier: **ingest at step 6**, classify at step 12, cluster at 16 |
| F6 | Per-video growth: free daily `videos.list` snapshots, `vidiq_video_stats` for surgical backfill |
| **G1** | **Output is always a video. A trending repo is a demand signal, never a "go build it"** |
| **G2** | **Every topic declares `shape`: `tutorial` or `review`. Reviews skip the capture gate** |
| **G3** | **`/review` is cut. New topics enter via GitHub Trending plus Eric's own judgment** |
| **G4** | **Indie-ness is scored and shown, never used to filter a repo out** |
| **G5** | **The product is read-only. No OAuth, no posting. Replies are drafted, then deep-linked** |
| **G6** | **Reply drafting is own-channel only. Competitor comments are analysed, never answered** |
| **G7** | **Comment categories and channel blurbs are Inference and always render beside their evidence** |
| **G8** | **Comment recency renders as lag from the video's publish date, never as an absolute date** |
| **G9** | **Apify, ViewStats and TubeBuddy are not used. They read the same rounded data we already have** |
| **G10** | **Eric's gut gets a `hunch` flag: it sorts, it never scores** |

E1 and E7 are retired. E1 split the build into two ships; E7 was superseded by F1.

---

## 14. Open

Product-level open items are in [spec.md](spec.md) §11. Engineering-level:

- **Skool comment bodies.** `skool-pp-cli posts get` has a defect: its path template is
  `/_next/data/{buildId}/{community}/{post_name}.json` but the command exposes only
  `--community/--g/--name-q/--slug`, so neither `{buildId}` nor `{post_name}` can be supplied and it
  prints help and exits 0. The endpoint itself works when called directly and returns rich
  post-level data, but `postTree.children` returns empty, so the comment-loading request is still
  unidentified. Fix the CLI upstream, or capture the real request from devtools. **Blocks step 17
  only.** Comment-liking is separately confirmed unsupported: `posts like` upvotes a post, and `api`
  reports no hidden interfaces.
- **Comment classification drift.** A closed set of seven categories will not fit every comment.
  Needs a periodic review of what lands in `feedback` (the catch-all) to see whether an eighth
  category is earning its place.
- **Chinese-language transcripts.** Local Whisper, as `si-research-ig` already does. Bites at step 14.
- **Citation liveness.** A video deleted after extraction leaves cited timestamps pointing at dead
  URLs. Needs a checker at step 15.
- **`config/topics.json` decay.** `coverage_rate` makes it visible, and with the proposal queue gone it is
  the only such signal, but nothing yet decides when a falling rate should force a registry pass.
- **Bundle size at scale.** T13 splits by route; `comments.json` is the largest bundle and splits by
  channel. Whether that holds past ~10,000 tracked videos is untested.
