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

## 0010 — A video deletion is an event, not a corrupt reading

### Context

`filter_monotonic` marked any day where a `MONOTONIC_KEYS` metric went backwards as `corrupt`, and
a corrupt day is excluded from every window computed over those metrics. The keys were
`("view_count", "video_count")`.

Both halves misfired against real data:

- **`video_count` decreases whenever a creator deletes or unlists a video.** That is a normal thing
  for a channel to do. Of the 72 channels on the roster, **58 first broke on `video_count`** —
  Anthropic at 114 → 107, Austin Marchese at 485 → 484, corbin at 363 → 362. Nothing anywhere in
  the pipeline computes a delta over `video_count`, so the check protected no number while taking
  each of those channels' *view* deltas down with it.
- **`view_count` decreases slightly when YouTube removes views it judges invalid.** Observed live:
  22,009 → 21,991 and 19,367 → 19,363. A strict `<` treats a 0.08% correction the same as
  192,901 → 36,338.

The result was 3,723 of 24,841 stored snapshot rows flagged corrupt, 20 of 72 channels unable to
report a 7d view delta and 44 of 72 unable to report a 90d one — surfacing on the board as
`building 0/7` on channels that had a full year of history sitting in `_raw/`.

A second problem sat underneath: `vidiq.py` writes the verdict into `_raw/backfill/*.json` at fetch
time, so those 3,723 rows carried `status: "corrupt"` on disk and no rule change could clear them.

### Decision

`MONOTONIC_KEYS` is `("view_count",)`. A deletion is an event the channel had every right to
perform, and it is not evidence about the view count.

A `view_count` fall is corrupt only past `thresholds.growth.view_drop_tolerance` (0.05), measured
**relative** to the last good value — 500 views is noise on a million and a cliff on a thousand.
The tolerance is a threshold rather than a constant because changing it changes which cells the
dashboard can measure at all.

`corrupt` is `filter_monotonic`'s own verdict, so it is **cleared and re-derived from the values on
every build** rather than inherited from disk. Values are still never repaired; only the judgment
about them is recomputed. Any other status (`absent`, written by `snapshot.py`) is not this
function's to overturn and passes through.

Effect: corrupt rows 3,723 → 1,283, channels short of a full 7d run 20 → 3, short of 90d 44 → 6.
What remains is genuine — the mildest surviving drop is −5.0% and the worst are −98%, including the
vidIQ series (21,103 → 606) that `test_growth` already pinned as really corrupt.

Rejected alternatives:

- **Wait for the daily sweep to fill the gaps.** It cannot. These are historical days already
  snapshotted; a new day only helps if nothing ticks backwards, and across 72 channels deletions
  and view purges happen continuously. The data was never missing, only condemned.
- **Repair the values on the way in.** Spec §7's standing rule: correcting a value on the way in
  makes the error invisible on the way out.
- **Drop monotonicity entirely.** Then Robin Ebers' live 2,854,571 → 49,605 becomes a −98% view
  delta rendered as measurement.

### A third misfire: the high-water mark never expired

Clearing the first two got corrupt rows from 3,723 to 1,283 and still left channels reading
`building` on flawless data. The cause was the baseline itself: comparison is against the last
*accepted* point, so after one bad reading a channel stayed condemned until it climbed back over a
number that was itself suspect. **Anthropic dropped once in December 2025 and lost the following
238 days** — a pristine rising series, 31,306,618 to 31,964,440 views, thrown away in full. Pat
Simmons lost 240 days the same way.

So a condemned run that lasts `thresholds.growth.rebase_min_days` (14) is re-judged against its
own first point instead of against the mark it already failed. Long enough to outlast a burst of
bad data — Robin Ebers is three days into a live 2,854,571 -> 49,605 break and is still refused —
without demanding a channel out-climb a suspect number.

The run is re-judged by `filter_monotonic` itself rather than required to be flawless. Demanding
flawless was too brittle to fire: Anthropic's 238 days contain a single wobble, which is nothing
across eight months and was enough to condemn all of them. The re-judged run must still yield
`rebase_min_days` consecutive clean days, which is the same thing as "enough data to measure a
window with".

**The reading that broke the sequence stays corrupt in every case.** The step into a new baseline
is a discontinuity, and no window may be computed across it — which is why Pat Simmons still reads
`building` at 365d on 364 of 365 usable days, and should.

Final state: corrupt rows **3,723 -> 46**, and every one of the 46 is the discontinuity step
itself (-97.1%, -81.2%, -53.3%, -51.7%, -44.1% ...). Channels able to report a 7d view delta go
**52/72 -> 71/72**; 90d goes **30/72 -> 68/72**.

What still reads `building` is honest and only two things: a channel with a discontinuity inside
the requested window, and a channel not tracked long enough to fill it (Tristen O'Brien has 122
days of history against a 365-day window). The second is the only kind that calendar time fixes.

### Scope

`growth.MONOTONIC_KEYS`, `growth.filter_monotonic` (tolerance, re-derivation, and re-basing),
`growth._longest_ok_streak`, `thresholds.growth.view_drop_tolerance` and
`thresholds.growth.rebase_min_days`, and the call sites in `read.py` and `vidiq.py` that pass them.
`growth.VIEW_DROP_TOLERANCE` and `growth.REBASE_MIN_DAYS` mirror config for direct calls and
`test_growth` proves they never drift.

`web/lib/growth.ts sparkAll` stopped filtering the subscriber series on `status`, which this work
exposed: a `view_count` flag was hiding a usable `subscriber_count`, so the card's line disagreed
with the delta printed above it by 4,120 subscribers on Pat Simmons. `growth.test.ts` now asserts
last-minus-first equals the delta for every channel and window in the real bundles.

## 0011 — A window ends on the last day that was measured, not on today

### Context

`delta` built its window as `util.last_n_dates(today, window_days)` and required every one of those
dates to be present. The sweep runs once a day, so between midnight and the run the newest snapshot
on disk is yesterday's — and yesterday's absence made *today* the missing day of all six windows at
once.

On 2026-07-29 the board held **366 days** of history per channel (`_raw/backfill`, 2025-07-28 to
2026-07-28) and reported this:

- 70 of 72 channels: `building, 89 of 90 days` on 90d, `building, 6 of 7` on 7d, and the same
  off-by-one on 14d, 30d, 180d and 365d.
- `rank by growth` had no growth rates to rank, so the leaderboard silently fell back to
  subscriber count and read as a size chart.
- The home panel showed one callout instead of any channel, advising a **360-credit vidIQ backfill
  to buy 365 days of history the repo already had**.

Three surfaces, one absent day.

### Decision

The window ends at `_anchor()`: the newest day the channel has a usable reading for, provided it is
within `thresholds.growth.anchor_max_lag_days` (3) of today. Otherwise the anchor stays on today.

This is **not** a tolerance on the count. The window still spans exactly the days it asks for and
spec §6 is untouched — 89 days never answer a 90-day question. What changed is where "the last 90
days" is measured from: the last day there is a measurement for. A 90-day window ending yesterday
is a full 90-day window; it is as-of yesterday, and `from`/`to` on the cell say so.

The lag bound is what keeps that honest. A channel whose snapshots stopped in April holds a
complete 90-day run somewhere in its past, and anchoring to it would date-stamp April's growth as
current. Past the lag the shortfall is stated instead, which is the correct answer there.

Effect on the live build: 90d subscriber deltas went 2 ok / 70 building → **66 ok, 4 bounded, 2
building**, the two remaining being the channels that genuinely hold 60 and 76 days.

`snapshot_health.history_days` was added in the same pass. `days_present` counts our own sweep
files, which is the right answer to "is the sweep running" and was being rendered in the header as
"1 of 90 days" — the answer to "how much history is on the board", where it is wrong by two orders
of magnitude. Both facts stay, under separate names.

Rejected alternatives:

- **Accept a window that is one day short.** The obvious fix, and it is the one rule spec §6 names:
  a number computed over fewer days than requested is not the number that was requested. It also
  scales badly — accepting 89 of 90 invites accepting 85, and nothing marks where it stops.
- **Wait for the sweep.** The launchd agent is staged, not installed, so every window on the board
  was unmeasurable until someone installed it. Even installed, the board would go blind every night
  between midnight and 09:00.
- **Anchor to the newest day across the whole roster.** One channel going quiet would then hold
  every other channel's window back a day, and a roster-wide anchor cannot express that one channel
  is stale while the rest are current.

## 0012 — The breakout score on the feed is vidIQ's, not ours

**Superseded by 0013.** The reasoning below still holds on the merits; the vendor sweep stopped
being run, which is what changed.

### Context

`/topics` needed a "what went up this week" feed, and the sort key is the question: how far past
normal did a video run. `pipeline/multiplier.py` already computes one — a video's views over the
median of its channel's last `multiplier.baseline_n` mature uploads — and it is what the taxonomy
shelves rank by today.

Checked against vidIQ's `breakoutScore` on every video the two sources share, ours disagreed by
roughly **2x**, consistently high. Two causes, both structural:

- **A median is the wrong centre for a skewed catalogue.** Eric Tech's own median is 1,648 views
  against a mean of 6,628. Most channels in this niche have the same shape: a long tail of quiet
  uploads and a few large ones. Dividing by the median of a tail-heavy distribution flatters every
  video that is merely average.
- **We cannot normalise by age and vidIQ can.** A 6-day-old video and a 300-day-old video are not
  comparable on raw views, and the correction needs a per-channel view curve — which needs the
  snapshot series, which had one day of history when this was written and needs about ninety.

### Decision

The feed shows **vidIQ's `breakoutScore`, carried through untouched, labelled `vendor`**. It is
never recomputed, never rounded, and the card's tooltip names vidIQ rather than printing a
derivation, because we did not compute it and cannot show its working.

`vendor` is a fourth word beside Oracle / Derived / Inference, and it is the honest one: an exact
number, but someone else's, and unauditable by us. Rendering it as Derived would promise a formula
that does not exist on our side; rendering it as Inference would understate a real measurement.

`pipeline/multiplier.py` is unchanged and still ranks the taxonomy shelves. Two ranking rules in
one app is a cost, but the shelves answer "which video on this topic is worth watching" over the
whole corpus, where a within-channel median is fine, and the feed answers "what broke out this
week", where age normalisation is the whole game.

### Rejected alternatives

- **Switch our baseline to a trimmed mean.** It closes most of the 2x gap and is a two-line change.
  It does nothing about age, which is the dimension that actually decides whether a 6-day-old video
  is a breakout, so the number would agree better and still answer a different question.
- **Show both numbers.** Two figures for one question, and the reader has no basis to prefer
  either. The failure mode this repo exists to avoid is a page that looks precise and is not.
- **Wait ninety days and compute it ourselves.** Defensible, and the snapshot clock is now running
  (decision 0010's rebase work plus the launchd install). It is not a reason to ship nothing for a
  quarter, and if our own number ever matches, this decision is cheap to revisit.

### Scope

`pipeline/outliers.py`, `pipeline/bundles/recent.py` (`TRUST["breakout_score"] == "vendor"`),
`web/components/grid-video-card.tsx`, `thresholds.outliers`. The sweep costs 30 credits
(2 formats x 3 batches x `OUTLIER_COST` 5) and lands in `_synthesize/outliers/<date>.json` because
it is metered; `_db/recent.json` is the free copy the web reads.

## 0013 — The feed's number is ours again, because the vendor's stopped arriving

Supersedes 0012.

### Context

0012 chose vidIQ's `breakoutScore` over `pipeline/multiplier.py` on the merits, and those merits
have not changed: a median is still the wrong centre for a tail-heavy catalogue, our number still
reads roughly 2x high, and we still cannot normalise by video age — the snapshot series holds 4
days of our own sweep against the ~90 that correction needs.

What changed is that the vendor number stopped arriving. Nothing automates the sweep: the launchd
job runs `pipeline.snapshot` alone, `pipeline.outliers` is a manual metered command, and
`.agents/skills/ait-refresh/SKILL.md` had already dropped `vidiq_outliers` on its own reasoning
("the multiplier is computed from exact free view counts, and nothing paid can improve on exact").
`_db/recent.json` was the last thing still reading it.

Measured on 2026-07-31: the bundle's newest video was published 2026-07-29 while the free registry
held 48 newer ones, 5 of them from that morning. `/topics` could not answer "what went up today" at
all, and re-running the sweep would have cost 40 credits against a 215 balance and a 200 reserve —
a breach the guard refuses, correctly.

### Decision

`recent.json` is built from the corpus the free daily sweep already fills, and ranks on
`multiplier.py`. **Derived**, and it ships the divisor: each card carries `baseline` and
`baseline_n`, so the tooltip states the median it divided by and how many uploads that came from.

The trade is explicit. A feed whose entire job is recency is better served by a worse-calibrated
number that is current than by a better-calibrated one that is two days stale and costs credits to
refresh. 0012's own closing line anticipated a revisit; this is not the one it expected — our
number did not catch up, the vendor's went away.

The age-normalisation gap 0012 named is covered from a different direction rather than closed.
`momentum` now reads our own 24-hour view deltas instead of vidIQ's `vph`, which is the same
quantity measured rather than modelled, and "is this still climbing" is the question age
normalisation was a proxy for. A video too fresh to have been observed twice reads `unmeasured`,
never `flat`.

`vendor` remains a live trust tier — `snapshots.json` still carries vidIQ backfill points tagged
`source` — it is simply no longer used on this bundle.

### Rejected alternatives

- **Automate the outlier sweep.** It is the smaller change and it buys the better number. It also
  spends credits daily on a path `ait-refresh` had already dropped, against a reserve floor the
  balance is already near, to keep a second ranking rule alive beside `multiplier.py`.
- **Raise the reserve floor so the sweep fits.** Moves a number so a guard stops objecting, which
  is the guard working and being overruled rather than answered.
- **Keep vidIQ and mark the feed stale.** Honest, and it leaves the page unable to answer its own
  question. A dated banner over a two-day-old feed is a correct label on a broken surface.
- **Trimmed mean instead of the median.** Still worth doing and still orthogonal: it closes most of
  the 2x gap and nothing about it depends on this decision. Left where 0012 left it.

### Scope

`pipeline/bundles/recent.py` (now reads `ctx.videos` and `ctx.baselines`; imports neither
`outliers` nor vidIQ), `thresholds.outliers.feed_window_days`, `web/lib/types.ts`,
`web/lib/recent.ts`, `web/components/grid-video-card.tsx`, `web/components/recent-feed.tsx`.
`pipeline/outliers.py` is untouched and still runs on demand; nothing in `_db/` reads it.
The bundle carries `feed_window_days` (30) of card fields, ~300 KB against the corpus's 16.7 MB,
and every window toggle stays a client-side filter over it.

`WINDOW_CHOICES` gains 1 and 3, and `windowsHeld` grew a lower bound: a window shorter than the
newest video held is not offered, because a `1d` key over a feed last swept yesterday is an empty
grid. That end went unguarded while the shortest choice was 7 and the sweep was never far behind.
