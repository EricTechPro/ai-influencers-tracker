# AI Influencers Tracker

A local dashboard over 72 AI/automation YouTube channels that answers what to make next, by finding
the topics where the field still has not settled.

## Language

Terms are load-bearing. The `_Avoid_` lines are not style preferences: each one names a word that
has already caused a real misunderstanding in this project, or that means something different
elsewhere in the codebase.

### Claim tiers

**Oracle**:
A value a public API returned, exact. Views, stars, likes, reply counts, video counts, dates.
Renders at full weight with no annotation.
_Avoid_: "fact", "raw", "ground truth"

**Derived**:
A value computed from Oracle values by arithmetic the page can show. Multipliers, velocities, growth
deltas, bands, the score, comment lag. Renders with a dotted underline; hover reveals the formula.
_Avoid_: "calculated", "computed" (both true but untyped), "metric"

**Inference**:
A judgment an LLM made. Comment categories, channel blurbs, path verdicts, merged steps. Renders on
a tinted background beside the evidence it came from, never styled as a measurement.
_Avoid_: "AI-generated", "guess", "estimate"

**Sacred failure**:
The one failure mode the whole design serves: the dashboard asserts a step, number, or
recommendation that nobody said and no API returned, and Eric films it. **An Inference rendered as a
measurement is the canonical instance.**
_Avoid_: "hallucination" (too broad — this is specifically about rendering)

### Topics

**Topic**:
The primary object. A subject a video could be about. Lives in `config/topics.json` as a tree.
_Avoid_: "niche" (that is a channel attribute), "category", "tag", "keyword"

**Leaf**:
A topic with no children. **Only leaves are scoreable**, matched, ranked, or given a verdict.
_Avoid_: "scoreable topic" as a thing you set — `scoreable` is derived from having no children and
is never authored.

**Parent**:
A topic with children. Exists for navigation and rollup only. Never scored, never banded.
_Avoid_: "category", "group" — a parent is a topic, just not a fileable one.

**Shape**:
Whether a leaf is a `tutorial` (ordered steps with real commands) or a `review` (themes and
positions, no procedure). Set at extraction. Reviews carry no artifacts, so they skip the capture
gate.
_Avoid_: "type", "kind", "format"

**Trunk**:
The steps every creator covers on a `tutorial` topic, in order. Commodity: any single video delivers
it.
_Avoid_: "consensus" (that is a view over the trunk, not the trunk), "the basics"

**Fork**:
The point where creators stop agreeing on a `tutorial` topic. **The highest-value coordinate in the
product** — "is there room for me?" reduces to "is this topic still forked?"
_Avoid_: "branch" (collides with git), "disagreement", "variance"

**Covered / Split**:
The `review`-shape equivalents of trunk and fork. Themes everyone hits, positions they divide on.
_Avoid_: using "trunk" and "fork" for review topics — the words imply a procedure that is not there.

**Step → implementation → citation**:
The three levels. `claude mcp add` and `.mcp.json` are the **same step with different
implementations**, not two steps. Collapsing this to two levels leaves stale-majority detection
nowhere to live.
_Avoid_: calling an implementation a "step" or a "variant"

**Stale majority**:
When the numeric majority of creators teach a path the most recent creators call superseded. The
single highest-value sentence the product can emit.
_Avoid_: "outdated", "deprecated" (those describe the path; this describes the *count* being
misleading)

### Growth

**Bucket width**:
The rounding granularity YouTube applies to a competitor's `subscriberCount` — always ~0.1% of the
count, because it rounds to three significant figures. 219,000 has a bucket of 1,000.
_Avoid_: "precision", "error bar", "margin"

**Measurement floor**:
5x a channel's bucket width. A subscriber delta must clear it to render as a number.
_Avoid_: "threshold" (everything else in `config/thresholds.json` is a threshold; this one has a name)

**Bounded**:
The state of a delta below its floor. We know it grew *less than* the floor, so it renders `< 5,000`
and sorts below every measured row. **Bounded is not unknown, and never blank, and never zero.**
_Avoid_: "unknown", "insufficient", "null" — those are different states with different sorting.

**Building**:
A window with fewer snapshot days than requested. Returns `building, N of M days` and no number.
_Avoid_: "partial", "incomplete data", "loading"

**Multiplier**:
A video's views over its channel's baseline (median of the last 20 mature long-form uploads).
Computed from exact free view counts, never bought.
_Avoid_: "outlier score" (that is vidIQ's capped product, deliberately dropped), "performance"

**Still pulling views**:
A video gaining ≥500 views in 7d **and** ≥2% of its lifetime total in that window. Both conditions,
or a large back-catalogue video trickling reads as growth.
_Avoid_: "trending", "resurgent", "hot"

### Opportunity

**Velocity**:
A repo's `stars / max(age_days, 1)`. The only leading signal in the product; every YouTube signal is
lagging by construction.
_Avoid_: "star growth", "momentum", "trend score"

**Indie score**:
How grassroots a repo looks, from `owner.type` and contributor count. **It scores, it never
filters.** A silent drop is the same class of error as rendering missing data as zero.
_Avoid_: "indie filter", "quality score"

**Hunch**:
Eric's manual flag on a topic. It sorts, it never scores. Not Oracle, not Derived — a human
annotation, styled as one.
_Avoid_: "priority", "boost", "weight"

**Unserved branch**:
A crowded topic with a specific question many comments ask and no video answers.
_Avoid_: "content gap", "opportunity" (that is the whole engine, not this cell)

**INSUFFICIENT_DATA**:
Fewer than 3 videos, or an unknown axis. Scores `null`, sorts last in **both** directions.
_Avoid_: rendering it as `0`, hiding the row, or calling it "no data" in the UI (it renders `--`)

### Comments

**Lag**:
Days between a video's publish date and a comment's. **Rendered instead of the comment's absolute
date**, because a 3-day lag and a 96-day lag on the same video mean different things.
_Avoid_: "age", "delay", "recency"

**Category**:
One of four actionable labels: `video_request`, `question`, `correction`, `suggestion`. Plus `other`
for the remainder, collapsed but never discarded, and `unsorted` for rows below the classification
floor.
_Avoid_: `feedback`, `needs_improvement`, `praise` — all three were cut. A category has to be
actionable to exist, and anything real inside "feedback" resolves to a suggestion or a request.

**Answered**:
Detected, never declared: the self channel id appears among a comment's replies.
_Avoid_: "resolved", "done", "dismissed"

### Channels

**Self channel**:
The single roster row with `category = own`. **Ranked inline like everyone else and included in
every median.** Zero or two rows with `own` is a hard failure.
_Avoid_: "my channel", "benchmark" (it used to be pinned as a benchmark; that was reversed)

**Niche**:
A channel-level grouping used to filter the leaderboard to peers.
_Avoid_: "topic", "category" (that column means competitor / company / adjacent / own)

## Naming that has already drifted

- **`staleness`**, not `recency`. It scores *higher* the longer since anyone covered a topic, so
  `recency` read backwards.
- **Chapter N**, not Level N, for Skool courses. The knowledge base still says Level; the live
  community says Chapter.
