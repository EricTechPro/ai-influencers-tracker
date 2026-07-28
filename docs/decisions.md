# Decisions

Why each call went the way it did, and **what was rejected**. That last part is the reason this file
exists: a rule tells you what, and three months later somebody re-litigates it because nobody wrote
down what was already considered.

Numbered in the order they were made. A decision that changes gets a new entry that supersedes the
old one; entries are not edited after the fact.

| # | Decision | The question it answers |
|---|---|---|
| [0001](#0001-per-channel-measurement-floor-for-subscriber-deltas) | Per-channel measurement floor for subscriber deltas | Why not just rank on views, which are exact? |
| [0002](#0002-every-topic-declares-a-shape-tutorial-or-review) | Every topic declares a shape: tutorial or review | Why isn't trunk/fork enough? |
| [0003](#0003-no-proposal-queue-discovery-via-github-trending-plus-human-review) | No proposal queue; discovery via GitHub Trending plus human review | If topics are hand-written, how does anything new get in? |
| [0004](#0004-read-only-draft-replies-deep-link-them-never-post) | Read-only: draft replies, deep-link them, never post | The API supports replying. Why not use it? |
| [0005](#0005-the-indie-score-ranks-it-never-filters) | The indie score ranks; it never filters | Why not just hide the corporate repos? |
| [0006](#0006-no-viewstats-tubebuddy-or-apify) | No ViewStats, TubeBuddy or Apify | Isn't there a better data source than vidIQ? |
| [0007](#0007-the-topic-page-opens-on-the-fork-not-the-trunk) | The topic page opens on the fork, not the trunk | Shouldn't a tutorial start at step 1? |
| [0008](#0008-partial-extraction-is-omitted-never-degraded) | Partial extraction is omitted, never degraded | We got 6 of 9 steps. Why not show the 6? |
| [0009](#0009-insufficient_data-is-an-unknown-axis-not-a-low-video-count) | `INSUFFICIENT_DATA` is an unknown axis, not a low video count | The spec rule and the canonical 71.9 example contradict each other. Which one is wrong? |

---

## 0001 — Per-channel measurement floor for subscriber deltas

### Context

The leaderboard's default rank is subscriber growth rate. YouTube rounds `subscriberCount` to three
significant figures for every channel you do not own — confirmed three ways on 2026-07-27: Google's
own API docs, YouTube's third-party policy, and by checking the alternatives directly (ViewStats,
TubeBuddy and every Apify actor read the same rounded number; see ADR 0006).

Bucket width is therefore always ~0.1% of the count. Cole Medin at 219,000 rounds to 1,000; Dan
Martell at 2.93M rounds to 10,000; a 2,380-subscriber channel rounds to 10.

Measured against Cole Medin's real 7-day windows, the deltas read 2000, 2000, 1000, 2000 against a
±1,000 bucket: **50 to 100% quantization error**. Daily deltas sit at zero for four to six days and
then jump a full bucket.

### Decision

A subscriber delta renders as a number only when it clears **5x that channel's bucket width**.

```
delta  = newest - oldest
floor  = 5 * bucket_width(channel)

delta >= floor  ->  { state: "ok",      value: delta }
delta <  floor  ->  { state: "bounded", upper: floor, value: null }
```

**Below the floor is bounded, not unknown.** If Cole cannot clear 5,000 we still know he grew *less
than* 5,000, so the cell renders `< 5,000` and sorts below every measured row, above
`insufficient_data`, and among other bounded rows by `upper`.

Rejected alternatives:

- **Flat ban below 30 days** (the original spec). Too blunt in both directions. It suppresses a
  2,380-subscriber channel that is perfectly measurable over a week, and it permits a 2.93M channel
  at 30 days where the delta still may not clear one bucket. The error is a function of delta size
  relative to the channel, not of window length.
- **Blank the cell.** Discards real information. "Grew less than 5,000" is a fact.
- **Render the raw delta with an error bar.** The number reads as a measurement and the error bar
  reads as decoration. This is the sacred failure in miniature.
- **Rank on views instead.** Considered and rejected by the operator: two channels with a million
  views each are not equivalent if one converts far better, and conversion is the thing that
  identifies a real competitor.

### Calibration, checked against the real roster

Verified 2026-07-27 against live subscriber counts for all 72 channels, pulled while resolving
channel ids. The question a 5x floor has to survive: **does it suppress so much that the default
ranking goes blank?**

| Channel | subs | bucket | floor | growth needed to register |
|---|---|---|---|---|
| Dan Martell | 2,940,000 | 10,000 | 50,000 | 1.70% |
| Cole Medin | 219,000 | 1,000 | 5,000 | 2.28% |
| Eric Tech | 68,700 | 100 | 500 | **0.73%** |
| AI Systems by Jimi | 2,380 | 10 | 50 | 2.10% |

Across all 72: median **1.33%**, worst **4.90%**, best **0.51%**.
**Zero channels need more than 5% growth to register.**

So over a 90-day window the floor suppresses only genuinely flat channels, which is the intended
behaviour — a channel that grew less than 1.5% in a quarter has not meaningfully grown. The
counter-intuitive result is that the floor is *not* hardest on the largest channel: Eric's own
68,700 is the easiest to measure in the roster, because 3-sig-fig rounding is kindest just above a
power of ten.

If a future roster addition sits just *below* a power of ten (e.g. 1,010,000, bucket 10,000, floor
50,000, needing 4.95%), it will be the hardest to measure. That is a property of the rounding, not
of the design, and it is why the floor is per channel.

### Scope

Applies to subscriber counts only. `viewCount` is exact and needs none of this. `subs_per_1k_views`
inherits the floor because its numerator does.

Requires a three-way sort comparator (`ok > bounded > insufficient_data`), which the ported
`useTableSort` cannot express — its nulls-last rule is two-way.

---

## 0002 — Every topic declares a shape: tutorial or review

### Context

The original model rendered every topic as an ordered procedure: trunk (steps everyone covers) and
fork (where they diverge). That works for "wiring MCP servers into Claude Code."

It does not work for roughly half the roster. A model-launch review opens with history and
background, moves to benchmarks, then to a hands-on demo. Nobody runs a command. There is no
artifact to capture and no procedure to order — but there is absolutely a structure worth seeing,
and creators absolutely disagree.

Measured: of 1,889 real titles from the watchlist archive, model launches and tool comparisons are
among the largest clusters (`frontier-model-launches` 151 hits, `open-model-launches` 70,
`cli-agent-comparison` 9 plus 68 for codex comparisons).

### Decision

Every leaf carries `shape`: `tutorial` or `review`.

- `tutorial` → **trunk / fork**. Ordered steps, real commands, gotchas.
- `review` → **covered / split**. Themes everyone hits, positions they divide on.

**Both render through the same mind map and the same click-through-to-quotes.** Only the meaning of
a node changes, and the edge vocabulary (`then / requires / alternative_to / contradicts`) covers
both. One component, one schema, two vocabularies.

Rejected alternatives:

- **Tutorial only.** Half the roster produces content the deep page cannot represent at all.
- **One flexible shape, ordering optional.** Loses the trunk/fork distinction, which is the stated
  highest-value coordinate in the product and the entire basis of stale-majority detection.
- **A separate page type per shape.** Two components, two schemas, two sets of bugs, for a
  difference that is one field wide.

### Scope

Costs roughly 30% more extraction work (the classifier must decide the shape).

**Consequence worth stating separately: the capture gate cannot fail a review.** The step 13 gate
measures whether transcripts yield exact commands. Reviews have no commands, so they contribute
nothing to that measurement and are usable whatever it says.

Note this is an *outcome*, not a sequencing decision. `shape` is decided by synthesis, so it is not
known until extraction has run — you cannot sort topics by shape in advance and do the easy ones
first. `config/topics.json` carries a hand-written seed only so the dashboard has something before
extraction exists.

---

## 0003 — No proposal queue; discovery via GitHub Trending plus human review

### Context

The original design had a `/review` route: the pipeline proposed new topics from unmatched videos,
and the operator promoted, merged or rejected them.

The operator cut it as CRUD around a file he hand-edits anyway.

That cut created a real hole. `config/topics.json` is hand-written, so without a path for new topics to
enter, the dashboard can only ever recommend from a list the operator already wrote. When a brand
new tool blows up, there is no topic for it to attach to and it stays invisible — which defeats the
product's central claim of catching things early.

### Decision

New topics enter through the **GitHub Trending sweep plus the operator's own judgment**.
`github.com/trending` has no API, so it is scraped via Firecrawl once a day. This runs *alongside*
the official `created:>` search sweep, not instead of it: the search API finds new repos by stars,
which cannot express "what is hot right now."

`coverage_rate` in `meta.json` (assigned videos over total) becomes the **only** signal that
`config/topics.json` is decaying, so it moves from nice-to-have to load-bearing.

Rejected alternatives:

- **Auto-add topics with an `unreviewed` chip.** Keeps the promise without a UI, but lets a
  machine write into hand-edited config, which breaks the invariant that the pipeline never writes
  there. That invariant is worth more than the convenience.
- **A third "Unmapped" home panel.** A review queue wearing a different hat.
- **Hand-edit only, accept the blind spot.** Honest, and rejected: a tool that never surprises you
  is not worth the build.

### Scope

`review_queue.json` is deleted. The cheap matcher no longer emits proposals; an unmatched video
simply lowers `coverage_rate`.

Softens spec §8's "no live scraping" line — but scraping happens in the pipeline, never inside the
web app, so the rule survives in spirit. A failed trending scrape is explicitly non-critical:
discovery degrades, data stays clean.

---

## 0004 — Read-only: draft replies, deep-link them, never post

### Context

The operator wanted AI-drafted replies to comments on his own channel. `comments.insert` exists in
the YouTube Data API at 50 quota units per call, so posting was technically available.

It would have required OAuth rather than an API key — a token store, a refresh flow, and a scope
grant — where every other call in the system runs on a plain key. It would also have introduced a
second and worse form of the sacred failure: **AI-drafted text going out under the operator's name
saying something he did not mean.**

### Decision

The dashboard **drafts** a reply and hands over a **deep link** — to the comment itself, or to
YouTube Studio's comment view with the right filter applied. The operator replies by hand.

The draft is built from his knowledge base, the video transcript, the video description and
metadata, his channel profile, and his Skool community context. Its shape is locked, taken from how
he actually writes:

1. His feedback first — what he thinks.
2. Where to find more, **and why** — a specific video, a playlist, or the Skool community.

The two CTAs that dominate his real replies are Skool and another video.

**Drafting is own-channel only.** Competitor comments are read and analysed; there is nothing to
reply to.

Rejected alternatives:

- **Post via `comments.insert`.** Buys one click. Costs an OAuth subsystem and the entire read-only
  property of the product.
- **Post with a confirmation dialog.** The guardrail is real but the auth cost is unchanged, and a
  confirmation is a thing people learn to click through.

Operator's words: *"if I'm not able to post it in the actual platform itself, that's completely
fine."*

### Scope

The product now makes **no authenticated writes to anything**. No OAuth credentials appear in
`.env`, and `test_anchors.py` asserts none is ever read.

One read remains that is *about* the operator's actions: `answered` is detected by looking for the
self channel id among a comment's replies. That is still read-only, costs nothing extra (the sweep
already reads threads), and survives a re-ingest, which a locally stored dismissal would not.

---

## 0005 — The indie score ranks; it never filters

### Context

The operator only wants opportunities from *"real people who are not really commercial, it's not
like a sponsor."* A repo published by a large company's devrel team is a different signal from one
published by a person.

GitHub supplies the raw material free on responses already being made: `owner.type` returns `User`
or `Organization`, and contributor counts come with the repo.

### Decision

Indie-ness is computed into a score and **rendered as a chip on the row. It never removes a repo
from the results.**

Rejected alternatives:

- **`owner.type == "User"` only.** Unambiguous, zero maintenance, and wrong. n8n, Ollama and
  LangChain all sit under org accounts — and they form those orgs at roughly the moment they start
  trending, which is exactly when they matter.
- **Blocklist the obvious corporations.** Needs maintaining forever and silently misses every new
  corporate account.

The deeper reason both are rejected: **a hard filter drops things silently, and a silent drop is
the same class of error as rendering missing data as zero.** The whole project's stance is that
missing is a state, not a hiding place. A filter the operator cannot see is a hiding place.

### Scope

`indie.score` appears on `opportunities.evidence[]` and is **not** a component of the 0–100
opportunity score. It is descriptive, not directional: the operator wants to *see* whether a repo is
grassroots, not to have that quietly reorder his Monday list.

The same reasoning governs the `hunch` flag: it sorts, it never scores.

---

## 0006 — No ViewStats, TubeBuddy or Apify

### Context

The operator asked directly whether a better data source than vidIQ exists, naming ViewStats
(MrBeast's analytics product) and TubeBuddy, and whether Apify's marketplace had something usable.

### Decision

None of them are used. Checked 2026-07-27:

- **ViewStats** — no public API. Web and iOS product; the only "API" is an unofficial third-party
  scraper wrapper.
- **TubeBuddy** — no public developer API. Its own support docs describe it as a YouTube API
  *partner and consumer*, bound by the same compliance rules.
- **Apify** — actors exist and market themselves as subscriber trackers. They scrape the same
  rounded public number. Its comment scrapers lose to a 1-unit official API call. Its GitHub
  trending scrapers return an opaque third-party ranking, strictly worse than GitHub REST.

**They all read the same YouTube Data API we already have.** They sell UI and aggregation, not more
accurate raw numbers. Per YouTube's own third-party policy: *"third parties that use YouTube's API
Services will also access the same public facing counts you see on YouTube."*

The decisive consequence: **`viewCount` is exact, and the multiplier is computed from it. Nothing
can be more accurate than exact.** There is no accuracy left to buy at any price.

### Scope

vidIQ survives on exactly two calls, because they are the only two things nothing else sells:

1. `vidiq_channel_stats` — a purchased 365-day daily history, 360 credits once. This cannot be
   reconstructed from a standing start; it is the reason the leaderboard works on day one instead of
   day 91.
2. `vidiq_keyword_research` — search volume, which has no free equivalent anywhere.

`vidiq_channel_videos` was also dropped (100 credits/month): it cross-checked a multiplier computed
from exact free data, so it verified a number we already knew more precisely.

Steady state: ~663 of 2,000 monthly credits.

---

## 0007 — The topic page opens on the fork, not the trunk

### Context

The topic page originally ran trunk → fork → path: the ordered steps everyone covers, then where
they diverge, then the judged paths. That reads like a tutorial, top to bottom.

But the page exists to answer a specific question, and it is not "how do I do this." It is **"is
there still room for me?"** — which reduces exactly to "is this topic still forked?"

The trunk is commodity by definition: any single video delivers it, and a new video about it
competes with seven existing ones.

### Decision

Section order is:

1. **Where they disagree** — the mind map, plus the stale-majority warning
2. **Easiest path** — the named paths, or the positions on a `review` topic
3. **What they all do** — the trunk, **collapsed**, with its step count and agreement level in the
   header so it can be judged without being opened
4. What viewers asked
5. Every creator's trail
6. Videos

Rejected alternatives:

- **Trunk first.** Optimizes for learning the topic cold, which is closer to the stated
  "I don't have to watch the videos" bar — but the operator has usually already decided he knows the
  basics by the time he opens a topic page. Fork-first optimizes for the decision.
- **Mind map as the entire page.** Attractive, and it loses the linear reading path for anyone who
  wants to actually follow the procedure.

The same reasoning was applied to `/compare`, which opens on topic gaps rather than the stat table:
the stats say *that* you are behind, the gaps say *what to do about it*.

### Scope

Before extraction exists (steps 1–13), section 1 renders an empty state naming the build step that
will fill it, while sections 4, 5 and 6 are already real off the spine alone. The route is never
hidden for being incomplete — the same rule as `INSUFFICIENT_DATA`, missing is a state, not a hiding
place.

---

## 0008 — Partial extraction is omitted, never degraded

### Context

Step 13 is a hard gate: if transcripts yield under 50% exact-artifact capture, the extraction steps
get redesigned. The question that gate raises but does not answer is what happens to a *single*
video that only partly extracts — 6 of its 9 steps captured cleanly, 3 mangled by auto-captions.

The tempting answer is to render what you have. It is also the wrong one, and it is tempting
precisely because it feels generous rather than reckless.

Eric, asked directly: *"If it doesn't have full data, don't add it into the mind map. I don't want
to make it like, do what we can if we can't do it."*

### Decision

**A step, edge, or node that cannot be fully reconstructed does not render at all.**

- An edge with no verbatim `cites[].evidence` does not render. (Already the rule; this extends it.)
- A step whose artifact was mangled renders **as a step with no artifact**, not as a step with a
  guessed one. `npm install dash g at anthropic dash AI slash claude dash code` never becomes
  `npm i -g @anthropic-ai/claude-code` by inference.
- A topic whose extraction covers fewer than `min_n.topic_page_min_videos` cleanly-extracted videos
  keeps its mind map empty and says so, exactly as it does before extraction runs at all.

The page states what it has, and the count it is missing. It never fills a gap with a plausible
value.

Rejected alternatives:

- **Render partial with a confidence badge.** A badge is a footnote, and footnotes lose to the thing
  they annotate. This is the same failure as rendering an Inference in measurement styling.
- **Reconstruct mangled artifacts from context.** An LLM can very plausibly turn the mangled ASR
  above into the right command. It can also very plausibly turn it into the *wrong* one, and there
  is no way to tell from the page which happened. This is the sacred failure exactly.
- **Show the mangled text as-is.** Honest, and useless — it fails the "I don't have to watch the
  videos" bar while looking like it tried.

### Scope

This is what makes the step 13 gate meaningful rather than decorative. Without it, a 45% capture
rate would produce a mind map that is 45% right and 100% confident-looking, which is worse than no
mind map at all — Eric would have to check every step against the video, which is the thing the
product exists to eliminate.

**Consequence for the gate's failure path:** if capture comes in under 50%, the answer is OCR, not
degradation. Frame analysis is far less expensive than assumed — `si-research-yt`'s `media.py` is
**76 lines** and already does scene-change frame extraction via ffmpeg with a `timestamps.json`
mapping each frame to its second. `SHORT_MAX_SECONDS = 180` and `FRAME_CAP = 20` are **config values
limiting it to Shorts, not a missing capability.** Raising them is most of the work.

Review-shape topics are unaffected: they carry no artifacts to capture, so they proceed regardless.

---

## 0009 — `INSUFFICIENT_DATA` is an unknown axis, not a low video count

### Context

Spec §5 stated the rule as *"either axis unknown, or videos < 3 → INSUFFICIENT_DATA"*. The same
section's canonical worked example gives `mcp-registry-integration` a supply of 2 videos, a verdict
of `MAKE_THIS_NOW`, and a score of 71.9, which is declared mandatory in two places. Those cannot
both hold: `INSUFFICIENT_DATA` forces a null score. The wireframes agree with the example and not
with the rule: `claude-code-plugins` renders INSUFFICIENT at 3 videos and 3 creators, and
`claude-code-hooks-config` renders TOO_EARLY at 0 videos.

### Decision

The verdict grid's `INSUFFICIENT_DATA` fires **iff an axis is unknown**, which in practice means
the demand axis: no keyword volume and no linked repo velocity.

The `videos < 3` rule is the **topic page's** state, driven by `min_n.topic_page_min_videos` and
`min_n.topic_page_min_creators`. That is the surface where *"1 video, need 3"* renders, and it is
about whether a consensus claim can be made, not about whether an opportunity exists.

One word was doing two jobs on two surfaces. Splitting it costs one field on `topic_pages.json`.

Rejected alternatives:

- **Keep `videos < 3` on the verdict and drop the 71.9 example.** The example is real data, is
  named canonical, and is asserted in two test modules. It outranks a sentence.
- **Score the row anyway while banding it INSUFFICIENT_DATA.** Then verdict and score disagree,
  and `test_score.py` explicitly forbids that.

### Scope

`verdict.decide` never reads a video count. `topic_pages.state` carries `insufficient_data` plus
`min_videos` so the page can render the shortfall rather than hiding the route.
