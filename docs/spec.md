# AI Influencers Tracker — spec

What we're building and what's decided. Short on purpose. Architecture detail is in
[system.md](system.md); this page is the contract.

**Status:** spec. No code written.
**Last groomed:** 2026-07-27, from a 43-round interview. Raw capture:
`_raw/grill-me-checkpoint/2026-07-27-ai-influencers-tracker.md`.

---

## 1. What it is

A local dashboard over the 72 AI/automation channels in `config/channels.json` that answers **what should I
make next**, without watching anything.

- **Topic is the primary object.** The influencer is a lens onto it. Growth and multiplier are not
  the deliverable; they are the ranking signal that decides which topics earn a page.
- Runs on Eric's Mac. `npm run dev` on **port 3002**, alongside social-invest on 3001.
- One user: Eric. Exactly one roster row carries `category = own` — his channel.

**Not** a hosted product, not multi-user, not deployed, not a replacement for social-invest.

**One ship.** The free-data spine and the transcript synthesis are one build in one order (§10), not
two releases.

### What winning looks like

> **I don't have to watch the videos any more.** I look at the page and I know what they said and
> where to go next.

That is the bar, in Eric's words. It is a **comprehension** bar, not a ranking bar, and it has three
consequences that outrank everything else in this document:

1. **The topic page is the primary surface**, not the leaderboard. The leaderboard tells him who is
   winning; the topic page is the thing that replaces an afternoon of watching.
2. **A 60%-complete topic page is a failure**, not a partial success, because he still has to open
   the video. This is what makes step 13's gate (§10) a gate and not homework.
3. **Speed is the product.** The edge being bought is not novelty. Eric already copies what works;
   this makes copying faster and more accurate. *"Time is everything."*

### What it replaces

Today Eric picks topics three ways, all at once: he copies what is working (found through vidIQ),
he reads comments and community requests, and he goes on gut. `yt-watchlist` covers part of the
first and *"sometimes doesn't give you what you need."* The gut input is real and stays: §5 gives it
a place to live rather than pretending the system is purely computed.

---

## 2. The one rule

> **Sacred failure.** The dashboard asserts a step, a number, or a recommendation that nobody
> actually said or that no API actually returned, and Eric films it.

Prefer omitting a claim over inventing one. Every guarantee in this doc traces back to that sentence.

Three tiers of claim, visually distinct, never blended:

| Tier | Examples | Rendering | Token |
|---|---|---|---|
| **Oracle** | views, stars, likes, reply counts, video counts, dates | normal weight, full color | `--oracle` |
| **Derived** | multiplier, velocity, growth deltas, bands, score, comment lag | dotted underline; hover reveals the formula or bucket width | `--derived` |
| **Inference** | why it's popular, path verdicts, merged steps, **comment categories**, **AI channel blurbs** | tinted background, source chip, never presented as measurement | `--inference` |

The false-BUY analogue here is **an inference rendered as a measurement**. If a step, verdict,
category, or explanation cannot name its sources, it does not render.

**The newest instance of this risk is the comment table.** Sorting a comment into `feedback` versus
`suggestion` is an LLM judgment sitting inches away from a like count that is exact. A category chip
styled like a count is precisely the failure this rule exists to prevent. Mitigation, borrowed from
social-invest's evidence-quote rule: **the comment text always renders beside its category**, so a
wrong label is visible at a glance rather than trusted.

Four consequences that outrank convenience:

```
missing data      is a STATE, never a zero
                  INSUFFICIENT_DATA scores null. Sorts last in BOTH directions. Never hidden.

incomplete window returns "building, N of M days" and NO number
                  a missed Tuesday makes 7d read "building, 6 of 7", not a 6-day average

missing component drops its weight out of the denominator
                  the row renders x / 75, not x / 100, and says "no data, weight excluded"

wall-clock time   banned unless a creator said the number on camera, quoted and attributed
```

**The product is read-only.** It never posts, comments, likes, or authenticates as Eric anywhere.
See §7 for why the comment feature does not break this.

---

## 3. Topic model

### Only leaves are scoreable

`config/topics.json` is a **tree of arbitrary depth**. A node with children exists for navigation and
rollup counts only. A node with no children is a leaf, and leaves are the only nodes that get
matched, scored, ranked, or given a verdict.

```
AI  (parent, never scored)
 └─ Claude Code  (parent, never scored)
     ├─ claude-code-mcp-setup        LEAF   scoreable
     ├─ claude-code-subagent-teams   LEAF   scoreable
     └─ claude-code-skills-authoring LEAF   scoreable
```

`scoreable` is **derived, never authored**: a node is scoreable if and only if it has no children.
The rule is therefore unbreakable by hand-editing. Adding a child to a leaf silently demotes it, so
the pipeline warns whenever a topic carrying videos becomes a parent, and re-matches its videos
against the new children.

"Claude Code" and "n8n" can never win a `MAKE THIS NOW`. That is the entire point.

### Every topic declares its shape

Content on a topic comes in two shapes, and a model that knows only the first cannot represent
roughly half the roster.

| `shape` | Example | Structure | Gated by step 13? |
|---|---|---|---|
| `tutorial` | claude-code-mcp-setup | ordered steps, real commands, gotchas | **yes** |
| `review` | kimi-k2-launch | themes, claims, benchmarks, verdicts | **no** |

A tutorial has a procedure you can run. A review has an argument you can follow. Why this is not
optional: [decisions.md 0002](decisions.md).

**Both shapes render through the same mind map and the same click-through-to-quotes** (§6). Only the
meaning of a node changes.

**`shape` is determined by synthesis, not authored.** Extraction reads the transcript and, where it
helps, the on-screen frames, and decides which shape the topic actually is — the same way
social-invest synthesizes rather than trusting metadata. `config/topics.json` carries a hand-written
**seed** so the dashboard has something to work with before extraction exists; step 15 upgrades it in
place, exactly as topic assignment upgrades from `method: "keyword"` to `"transcript"`. No schema
change, no migration.

**Review topics carry no artifacts, so the capture gate cannot fail them.** They are therefore
usable whatever the gate measures. That is an outcome of having nothing to capture, not a sequencing
decision made in advance — which matters, because shape is not known until extraction has run.

### Trunk and fork (the `tutorial` shape)

Content on any procedural topic converges early and diverges late.

```
TOPIC: claude-code-mcp-setup             7 videos, 7 creators

TRUNK  everyone does this, in this order
  1  Install the CLI              7/7   npm i -g @anthropic-ai/claude-code
  2  Authenticate                 7/7   run `claude`, browser opens
  3  Write a CLAUDE.md            6/7   repo root, project conventions

FORK  the field has not settled here
  ├─ `claude mcp add` global      4     Adrian, Duncan, Samin, Ray   (Feb–Apr)
  ├─ `.mcp.json` in repo root     2     Brad 11d, Charlie 6d         ← newest
  └─ per-project scoped perms     1     Cole 24d
                                 ---
                                  7     = the 7 creators, no double counting
```

**The fork point is the highest-value coordinate in the product.** The trunk is commodity: any
single video delivers it, and a new video about it competes with seven existing ones. The fork is
where the field has not settled, which means it is simultaneously where a viewer actually learns
something and where there is room for Eric.

**"Is there still room for me?" reduces to "is this topic still forked?"** One data structure, two
answers, no second pipeline.

### Themes and positions (the `review` shape)

The same idea one level up. Instead of steps everyone runs, **themes everyone covers**; instead of
competing implementations, **competing positions**.

```
TOPIC: kimi-k2-launch                    6 videos, 6 creators

COVERED  every review hits these
  1  What it is / lineage          6/6
  2  Benchmark table               6/6   MMLU, SWE-bench, cost per Mtok
  3  Hands-on demo                 5/6

SPLIT  they do not agree
  ├─ "beats Sonnet on code"        3     benchmark-led
  ├─ "benchmarks don't transfer"   2     hands-on-led            ← newest
  └─ "irrelevant, cost is wrong"   1
```

A `SPLIT` is a fork by another name, and it answers the same question: is there room for a take
nobody has given yet.

### Steps carry substance, not pointers

The timestamp is the **citation**, not the content:

```
2  Authenticate                                      7/7 agree
   Run `claude` in any directory. Opens a browser for OAuth.
   Console-key users: `claude auth --api-key`.
   WARN  Samin, Ray: fails behind corporate proxy, set ANTHROPIC_BASE_URL first
   cite: Adrian 04:12, Duncan 02:55, Samin 06:30  (+4)
```

Reading the page is sufficient. That sentence is the whole product (§1). Extraction must pull
**procedural detail** — actual commands, actual settings, actual gotchas — not topic labels and
timestamps. This is the single biggest quality risk in the build and is gated at step 13.

### Three levels, not two

```
step (intent)  ──▶  implementation (artifact)  ──▶  citation (span)
"wire in MCP"       `claude mcp add`                Adrian 04:12
                    `.mcp.json`                     Brad 07:40
```

`claude mcp add` and `.mcp.json` are the **same step with different implementations**, not two
different steps. A two-level model renders them either as one step (losing the distinction) or as
two forks (losing that they are competing answers to one question). The second is the entire basis
of stale-majority detection, so a two-level shape leaves it nowhere to live.

Normalized artifacts give an **exact hash join** for most technical steps: `npm i -g X` and
`npm install --global X` both collapse to `(npm, install, X)`. Embedding clustering is reserved for
artifact-less steps, and **two steps carrying different artifacts are never merged.**

> **Paid-for lesson, from the sibling project.** social-invest's `chain-map.tsx` carries this in its
> own comments: *"an earlier attempt that string-matched prose produced about 50% junk (MU to DRAM,
> a product; UNH to ISRG, two unrelated holdings), which is why edges are extracted per post with
> verbatim evidence and checked against their source."* Same failure, same fix, already paid for
> once. It is direct evidence the step 13 gate is correctly placed.

### The denominator

`6/7` is an oracle-looking number over a denominator that must be defined or the fraction is an
inference wearing a measurement's clothes. An MCP-only deep dive is not a dissenter on "install the
CLI"; it is out of scope.

- Every video declares `scope` at extraction: `full_guide | single_subtopic | update_news | opinion`.
- A step's denominator counts only creators whose scope could plausibly contain that step.
- The basis renders on hover: *"7 of 7 creators publishing a full guide on this topic"*.
- Where scope is indeterminate, render the **numerator alone** ("5 creators do this"), never a
  fraction.

---

## 4. What it answers

| Question | Surface | Signal |
|---|---|---|
| Who is growing fastest right now? | growth leaderboard | subscriber growth rate over the window |
| What should I make next? | opportunity table | verdict grid + 0–100 score |
| Is there still room for me? | topic page | is the topic still forked or split |
| What did each creator actually say? | topic page | mind map, per creator, cited |
| **What is my audience asking for?** | **channel page** | **categorized comments** |
| Which videos are still pulling views? | channel page | `views_gained(7d)` + share of total |
| What's the easiest path, step by step? | topic page | path judge, named by goal |

**The self channel competes.** It sits inline at its true rank, highlighted in a distinct color, and
is **included in every calculation** including medians and percentiles. Eric wants to race inside the
list, not sit beside it: *"currently I'm ranked number seven and I want to be better at number six."*
This supersedes the earlier decision to exclude and pin it.

A leaf topic Eric already covered renders `you covered this 2026-05-14 → <video>` and is filtered
out of `MAKE_THIS_NOW` by default. Suppression is a filter, never a deletion: the row still exists
and still carries its score.

---

## 5. The opportunity engine

### GitHub is the only leading signal

Every YouTube signal here is **lagging by construction**. A video existing means someone already
made it. GitHub star velocity runs **ahead** of YouTube coverage: a repo trends, creators discover
it, videos appear one to several weeks later. The gap is the highest-value cell in the product.

```
OPPORTUNITY
  repo          velocity     YT videos    indie    verdict
  ------------------------------------------------------------------------
  agent-lab     174/day      0            ●●●      OPEN, nobody has covered this
  mcp-registry  266/day      2            ●●○      OPEN, forked, 2 recent
  n8n-nodes      12/day      14           ●○○      CROWDED, you would be 14th
```

`stars_30d` **does not exist in the GitHub API**, so a 30-day star delta is not purchasable on day
one. The metric is new-repo velocity, which is free and immediate:

```
GET /search/repositories?q=created:>{today-90d}+topic:ai&sort=stars&order=desc

velocity = stars_total / max(age_days, 1)

  MiMo-Code   12,496 stars /  47d  = 266/day    ← real result, 2026-07-27
  n8n        198,246 stars / 2593d =  76/day    ← and it cannot even appear
```

Two properties fall out free. **Evergreens are excluded by the query itself** — n8n was created in
2019 and cannot appear in a `created:>` window, so the exclusion rule is enforced by the API call,
not by a maintained list. And **lifetime-average velocity self-corrects**: a young repo's average is
close to its current rate, an old repo's is dragged down by years of slow accumulation.

Repos are keyed by the numeric GitHub `id`, **never `full_name`**. A rename changes `full_name`,
which would fork the star history and read as a brand-new spike, firing a false `MAKE THIS NOW`.

### Discovery: GitHub Trending, human-reviewed

The search API finds new repos by stars. It cannot express "what is hot right now", which is a
curated human artifact. So **`github.com/trending` is swept alongside it**, scraped via Firecrawl
because it has no API. This is additive: both run.

Trending is also how **new topics enter the system**. There is no approval queue (§7); Eric reviews
the trending sweep himself and adds leaves to `config/topics.json` by hand. Without this the dashboard could
only ever recommend from a list Eric already wrote, which defeats the leading-signal claim.

**The indie score.** Eric only cares about *"real people who are not really commercial, it's not
like a sponsor."* GitHub returns `owner.type` (`User` or `Organization`) free on every repo, plus
contributor counts. Those feed an indie score rendered as a chip on the row.

**It scores, it never blocks** — a silent drop is the same class of error as rendering missing data
as zero. Rationale and rejected alternatives: [decisions.md 0005](decisions.md).

### The gut input

Eric's third input today is instinct, and he asked for it to live in the system rather than beside
it. A topic can carry a manual `hunch` flag. It sorts the topic up and renders as **Eric's own call,
visibly tagged**, never folded into the computed score. It is not Oracle and not Derived; it is a
human annotation and is styled as one. Cheapest honest version of *"I need to embed this into our
system."*

### The verdict grid

One supply vocabulary, one demand vocabulary, one cell.

```
                    OPEN             MID              CROWDED
  HIGH DEMAND    MAKE_THIS_NOW    MAKE_THIS_NOW    ONLY_IF_UNSERVED
  LOW  DEMAND    TOO_EARLY        TOO_EARLY        SKIP

  supply   = video and creator counts over thresholds.supply.window_days
  demand   = vidIQ keyword volume OR max repo velocity over the topic's linked repos
  either axis unknown   ->   INSUFFICIENT_DATA
```

A topic below `min_n.topic_page_min_videos` renders `1 video, need 3` on its topic page. That is
the page's state, not the verdict. See decisions 0009.

`INSUFFICIENT_DATA` is the fix for the one-video problem. A topic with one video does not render
`1/1 unanimous`, the most confident-looking and least justified output the system can produce. It
renders **"1 video, need 3."** The honest state is a state, not an absence.

Every emitted row carries `fired`, the list of threshold comparisons that produced the band, so the
page can show its work. **Parents are never banded.** Only leaves reach this function.

**The output is always a video.** Decided. A trending repo is a leading indicator of video demand,
never a recommendation to go build the tool. `MAKE_THIS_NOW` means film this.

### The score

Verdict and score answer different questions from the same four numbers and cannot disagree. Verdict
is the cell, *what kind* of opportunity. Score is 0–100, *how strong*. `MAKE_THIS_NOW` sorted by
score is the Monday list.

```
COMPONENT        RAW                  NORM    WT    POINTS   SOURCE
repo velocity    266 stars/day        0.89    40      35.6   github
keyword volume   8,100 searches/mo    0.54    25      13.5   vidiq
supply gap       2 videos / 90d       0.83    25      20.8   youtube
staleness        newest 6d ago        0.20    10       2.0   youtube
                                             ----    -----
                                              100     71.9
```

Real 2026-07-27 numbers. **This is the canonical example; every bundle and every UI surface must
reproduce 71.9.**

`repo_velocity` carries 40 because it is the only leading signal in the product. Keyword volume is
real demand but is paid and refreshed weekly, so it lags a spike. Supply gap reads the supply axis
directly. Staleness separates "two videos from six months ago" from "two from last week," which the
raw count cannot. All four are Derived tier and render their own formula.

### The unserved branch

The `+` cell: a crowded topic that still has room.

```
+ claude-code-mcp-setup               CROWDED, 9 videos, 7 creators
  Trunk fully covered. Forks covered: global add, .mcp.json, scoped perms.

  UNSERVED BRANCH
    340 comments across 6 of those 9 videos ask "...on Windows?"
    0 of 9 videos cover it.
    -> crowded topic, wide-open branch. This is the video.
```

A pure coverage count says "9 videos, skip." Comment mining says "9 videos, and here is the exact 20
minutes nobody filmed." The check needs transcripts on the "0 of 9 cover it" side, so it lands after
step 14; comment collection starts at step 6 so the corpus is warm by then.

---

## 6. Growth math

### `viewCount` is exact; `subscriberCount` is not

YouTube rounds `subscriberCount` to three significant figures for every channel you do not own.
Verified across 50 roster channels:

| Channel | subscriberCount | bucket width |
|---|---|---|
| Dan Martell | 2,930,000 | 10,000 |
| Cole Medin | 219,000 | 1,000 |
| Eric Tech | 68,700 | 100 |
| AI Systems by Jimi | 2,380 | 10 |

A property of the data, not of our API tier, and nothing on the market improves it — see
[decisions.md 0006](decisions.md). `viewCount` is exact (Cole Medin: 11,991,545, verified to the
digit), which also means **no paid source can improve the multiplier**, since the multiplier is
built from exact view counts already.

### The measurement floor

Bucket width is always about 0.1% of the count, so what matters is **the size of the delta relative
to the channel**, not the length of the window. Why not a flat 30-day ban:
[decisions.md 0001](decisions.md).

```
sub_delta_state(channel, window):
    delta  = newest - oldest          # both rounded
    floor  = 5 * bucket_width(channel)

    if delta >= floor:   { state: "ok",      value: delta, bucket: ... }
    else:                { state: "bounded", upper: floor, value: null }
```

**Below the floor is bounded, not unknown.** If Cole cannot clear 5,000, we still know he grew
*less than* 5,000. So the cell renders **`< 5,000`** and sorts below every channel that cleared its
own floor. That is honest, it sorts correctly, and it is not a fabricated zero. Only a channel with
no usable snapshots at all is `INSUFFICIENT_DATA`.

Worked: Cole Medin, 219,000, bucket 1,000, floor 5,000.
7d gain ≈ 2,000 → 2 buckets → `< 5,000`.  90d gain ≈ 15,000 → 15 buckets → renders, ±7%.

```
rank on subscriber growth rate    the default (§7), with the floor applied per channel
view counts and deltas            exact, always renderable, no caveat
subscriber deltas are DERIVED     never Oracle, bucket width always disclosed
per-day subscriber growth         SELF CHANNEL ONLY, via owner-authorized analytics
```

### The window rule

```
delta(entity, metric, window_days):
    required = the last window_days calendar dates
    present  = points in that range with status == "ok"

    if len(present) < window_days:
        return { state: "building", have: N, need: M, value: null }

    return { state: "ok", value: newest - oldest, bucket: ... }
```

**No branch can return a number computed over fewer days than requested.** Identical for channels,
videos, and GitHub repos.

### Monotonicity

`view_count` and `video_count` are monotonic non-decreasing. Any point violating that is flagged
`corrupt` and **not consumed**, never silently averaged. One observed vidIQ series dropped views
21,103 → 606 and videos 19 → 5 across two consecutive days. That real series seeds the regression
test.

### Multipliers are computed, not bought

```
baseline(channel)  = median view_count of the last 20 long-form uploads
                     published at least 14 days ago
multiplier(video)  = video.view_count / baseline(channel)
```

Free, exact, transparent, computed at every window, covering all 72 channels evenly. `maturity_days`
excludes videos too young to have accumulated views, which would otherwise drag the baseline down
and inflate every multiplier. **Shorts and long-form get separate baselines** — different
distributions, mixing them makes both wrong. A channel with too few mature uploads returns
`no_baseline` and renders as **unknown, never as low**.

`vidiq_outliers` is dropped: it returns a global top-100 capped list, so a channel with no video
clearing vidIQ's bar returns nothing, spreading 100 slots across 72 channels squeezes out exactly
the small channels the feature exists to find, and `contentType: "long"` drops Shorts entirely.

### Per-video traction

```
share_recent  = views_gained(7d) / view_count_total
still_growing = views_gained(7d) >= 500  AND  share_recent >= 0.02
```

The second condition separates a genuinely resurgent old video from a large back-catalogue video
accumulating a trickle. A 150K-view video gaining 300 views a week is not growing. Rendered as
**"still pulling views"**, ranked by `views_gained(7d)`, with the publish date shown so a six-week-old
video still climbing is visibly different from a three-day-old launch.

---

## 7. Surfaces

```
/                    home            top-5 leaderboard + opportunity table
/leaderboard         full ranking    all 72, every rank mode, niche filter
/topics/[id]         topic page      leaf: mind map + evidence. parent: rollup + children
/channels/[id]       channel page    profile, charts, comments, high performers
/compare             comparison      two channels side by side, b defaults to self
```

`/review` is **cut**. It was CRUD around a file Eric hand-edits anyway. New topics enter through the
GitHub Trending sweep plus his own judgment (§5), not an approval queue.

**Layout and visual design beyond what is stated here belong to `/plan-design-review`.** What
follows is what each surface must contain.

### Home, panel 1: the leaderboard

**A card grid capped at five, not a table.** This is social-invest's `leaderboard.tsx` shape
(`grid sm:grid-cols-2 lg:grid-cols-3`), where each card carries rank, identity, one big hero number,
and a sparkline. Eric: *"I don't want this to be super flooded."* Expanding routes to `/leaderboard`
for the full 72.

**Make it fun.** Explicitly gamified, modeled on Skool's leaderboard: rank icons, rank colors, and
**the top three visually distinct from four and five**. Use a common UI library rather than
hand-rolling. This is the first screen Eric sees every morning and it should feel like standings,
not a spreadsheet.

**The self channel gets no pinned strip.** One card, at its true rank, colored differently. If Eric
is #7 he is simply not on the home grid and clicks through to `/leaderboard` to find himself. That
friction is the point: the goal is to be in the top five, not to be pinned next to it.

**Hero number: subscriber growth rate**, with the §6 floor applied per channel.

**Rank modes are switchable**, because one formula cannot answer every question:

| Mode | Ranks on |
|---|---|
| **growth** (default) | subscriber growth rate over the window |
| general | composite of subscriber count, subscriber growth, and views gained |
| subscribers | absolute subscriber count |
| views | views gained over the window |

**Filters:** window (`24h, 7d, 14d, 30d, 90d, 180d, 365d`, plus custom) and **niche**, so the
comparison is against peers rather than against everyone.

**Stats on the card:** videos published in the window (displayed, never a rank input), views gained,
and **subs gained per 1,000 views** — the conversion metric. Eric's reasoning, and it is the sharpest
argument in the session: *"same person gets 1 million views and the other also gets 1 million views,
the one with a higher conversion rate to getting more subscribers is a big difference."* It inherits
the measurement floor.

**Rank target.** Eric sets a target rank in config. The leaderboard draws it and his card shows the
gap: *"#7, need 41,000 more subscribers to pass #6."* Stored in hand-edited config, no database.

### Home, panel 2: the opportunity table

Modeled on social-invest's `ConsensusBoard`: sortable table, **the formula printed above it as the
definition**, an avatar cluster for who is on it, a hover tooltip that prints the arithmetic line by
line, and a row click through to the topic page. Ranked by score, sortable on every column, each row
expandable into the derivation that produced it.

### The recent feed, and muting a card

`/topics` opens on the recent feed rather than on the taxonomy: one filtered, sorted, paged grid of
what went up, ranked by `multiplier.py` (decision 0013). The filters are stamped keys rather than
dropdowns — window, format, language, videos-per-channel, sort, and a tag strip — every one of them
client-side over one already-loaded bundle, so none costs a request or a vidIQ credit.

**A card can be muted, from a control on the card itself.** Decision 0014. The question this page
asks is *what should I film next*, and the answer it keeps mixing in is videos Eric has already
made — a competitor's frontier-model review is a real breakout, correctly ranked, and not a thing
to go and shoot. That is not a topic to exclude and not a channel to exclude. It is one video.

| | |
|---|---|
| what it hides | the card, and only the card |
| what it never touches | `_raw/`, `_db/videos.json`, `recent.json`, the `N scanned` count, every baseline and rollup |
| where the list lives | `config/muted.json` — the one file under `config/` the UI writes |
| who writes it | `web/app/api/mute/route.ts`, the app's only write route. **`pipeline/` still never writes there** |
| when it takes effect | the next render. `/topics` is `force-dynamic` and reads the file per request, so no rebuild |
| how it comes back | one click, from either surface below |

This is the per-video sibling of `config/exclusions.json` (§12), which stays hand-written and
answers the standing rule — whole topics, whole channels, title terms. Two files, two writers, one
direction each.

**Reversibility is not optional.** Muting the wrong card is one click, so unmuting has to be one
click too, from the page where the mistake was made:

- **The muted strip**, above the tag line, built from `config/muted.json` rather than from the
  grid. A decision outlives the window its video sat in and eventually the bundle itself, so a
  strip built from the corpus would silently grow shorter than the file it claims to show.
- **A `muted N` key** in the format row, which shows the cards. It ignores the window, the format,
  the language and the per-channel cap deliberately: you mute a video today, it ages out of every
  window the feed offers, and a review view that respected the window would render an empty grid
  under a key reading `muted 12`. The other key groups are hidden while it is open, because none of
  them reaches it.

The format row is `all · long · shorts · muted N`, not `all · long · shorts · unmuted`. The three
formats always hide muted videos, which is the whole point of muting one. An `unmuted` key reads as
a fourth format and is not one — either `long` also hides muted videos, making `unmuted` a lie for
two of the four keys, or it does not, making `unmuted` a key that changes nothing.

### Topic page

Modeled on social-invest's ticker page, which turns out to be a near 1:1 template:

| Section | Content |
|---|---|
| header | topic name, opportunity score, verdict badge, indie chip |
| **1. where they disagree** | **the mind map. Click a node for the exact quotes.** Opens here. |
| 2. easiest path | the named paths, or the positions for a `review` topic |
| 3. what they all do | the trunk, **collapsed by default** |
| 4. what viewers asked | comment signal across every video on this topic |
| 5. every creator's trail | each creator's full trail |
| 6. videos | the source list |

**Before extraction lands (steps 1–13), the topic page still renders.** Sections 4, 5 and 6 are real
off the spine alone — the comment view in particular is fully populated from step 6 — and section 1
carries an empty state naming the build step that will fill it. The route is never hidden for being
incomplete, which is the same rule as `INSUFFICIENT_DATA`: missing is a state, not a hiding place.

**Section order is decided: the fork comes first.** The page opens on the contested part, because
that is the question the page exists to answer: *is there still room for me*. The trunk is commodity
— any single video delivers it — so it sits collapsed with its step count and agreement level in the
header, letting you judge whether to open it without opening it.

**The mind map is the centerpiece**, and it already exists as
`social-invest/web/components/ticker/chain-map.tsx`: a node-and-arrow diagram where every row is a
claim someone actually asserted, and clicking one opens a dialog with **the verbatim quote, the
speaker, the date, and a link to the source**. Port it and swap the edge vocabulary
(`supplies / invests_in / depends_on / competes_with`) for structural edges
(`then / requires / alternative_to / contradicts`).

That click-through is the mechanism that delivers §1's promise. Eric: *"I can click into this mind
map and see a dialogue, see exactly what it has talked about in this very short, easy, concise way."*

### Channel page

Three collapsible sections, top to bottom.

**1. Profile card.** Deliberately short. Profile image, name, subscriber count, total views, videos
published, and **an AI-written description of what the channel actually does**, expandable and
collapsible. Modeled on the ticker page's `CompanyBlurb`: first sentence always visible, the rest one
click away, native `<details>`, no JS. The description is **Inference tier** and renders as such.

**2. Charts, tabbed.** Three charts behind tabs over a selectable date range:
`subscriber count` · `view count` · `view growth`.

**3. Comments.** The categorized table, below.

Plus **high-performing videos**: this channel's videos that are still pulling views (§6).

### The comment table

**One corpus, two views.** The same comments are indexed twice, because they answer two different
questions:

| View | Question it answers | Where |
|---|---|---|
| **by channel** | what does *this creator's* audience ask? | channel page |
| **by topic** | what does *everyone* ask about this subject, across all creators? | topic page |
| **by video** | what did *this upload* provoke? | video row, expanded |

The by-topic view is the one that finds Eric a video. A single channel's comments show one
audience's gripes; aggregating every comment across all 9 videos from all 7 creators covering a topic
is what makes an unserved branch visible at all. The join is transitive (comment → video → topic) and
already in the data, so this is an index, not a second pipeline.

Both views render the same table below. It works identically for competitors and for Eric's own
channels.

**Four categories**, Inference tier, always rendered beside the comment text:

| Category | Why it earns a row |
|---|---|
| `video_request` | someone asking for a video, especially one accumulating likes |
| `question` | someone stuck, which is a tutorial gap |
| `correction` | someone says the creator got it wrong — highest signal for finding a fork |
| `suggestion` | an idea or an ask that is not a full video request |

Every one of the four is **actionable**. That is the test a category has to pass to exist.
An earlier draft carried `feedback`, `needs_improvement` and `praise`; all three are cut.
Feedback is not a category, it is a description of the other four, and anything real inside it
resolves to a suggestion or a video request. `praise` was never actionable.

`other` absorbs everything that fits none of the four (thanks, jokes, spam, off-topic). It is
**collapsed by default** and exists so nothing is silently discarded. An unclassified comment carries
`category: null` and renders as `unsorted`, never hidden.

**Controls:** category tabs, **each carrying its own count**, in a fixed order so the tab positions
never move between channels; sort by likes or reply count; window selector; **top 5 by default,
expand to 10, then pagination.**

```
[ video requests 84 ]  [ questions 210 ]  [ corrections 12 ]  [ suggestions 96 ]  [ other 240 ]
```

The counts are Oracle (they are just counts of classified rows) even though the classification itself
is Inference, so they render in normal weight while the chips beside each comment stay tinted.

**Three views over one corpus:** by channel (this creator's audience), by topic (everyone covering
this subject), and by video (this one upload). Same table, same categories, different index.

**Columns:** who said it (name is enough), the comment, likes, replies, the video as a **hyperlink on
its title** plus a jump icon, the video's publish date, and:

**The lag column.** Do not render the comment's absolute date. Render **how long after the video was
published it was posted**: "3 days after", "1 week after", "100 days after". Eric's own idea and the
best one in the section. It is pure subtraction of two Oracle dates, so it is cheap and honest, and
it separates launch-week reaction from a comment left on a video that is still pulling views a year
later. It pairs directly with `still_growing`.

### Replying: deep links, never posting

For **Eric's own channels only**, the dashboard drafts a reply. It never sends it.

The draft is built from his knowledge base, the video's transcript, the video description and
metadata, his channel profile, and his Skool community context. Its shape is locked, from how he
actually writes:

1. **His feedback first.** What he thinks.
2. **Where to find more, and why.** A specific video, a playlist, or the Skool community.

Short. The two dominant CTAs in his real replies are *redirect to Skool* and *redirect to another
video*.

**Then it hands him a deep link** to that comment, or to YouTube Studio's comment view with the
right filter applied, and he replies by hand. Why not `comments.insert`:
[decisions.md 0004](decisions.md).

**Answered is detected, never declared.** The daily sweep already reads comment threads, so it marks
a comment `answered` when the self channel id appears among its replies. No extra quota, no local
state to lose, and it survives a re-ingest — which a manual dismiss would not. The queue therefore
empties on its own instead of showing the same rows forever. This is still read-only: the product
observes that Eric replied, it never replies for him.

**This is why the product stays read-only** and why §2 needs no second failure mode.

Competitor channels get comment analysis and **no drafting**. There is nothing to reply to.

### Comparison

**Gaps lead, numbers follow.** The page opens on *what he covers that you do not*: shared and unshared
topics with video counts on both sides, his views on each, and the verdict that topic already carries
on the opportunity table. That block is the only part of the page that tells Eric what to *do*; the
stat table only tells him that he is behind. Same reasoning as the topic page opening on the fork.

The stat table sits below and states that the two channels may carry different subscriber bucket
widths (a 2.9M channel rounds to 10,000; a 68.7K channel to 100), so a subscriber comparison across
a size gap is not like-for-like. Views carry no such caveat. This is a trust-marking requirement,
not a footnote.

### Rendering rules

Enforced by `web/lib/trust.test.ts`:

- `--` in the score column is `INSUFFICIENT_DATA`. Sorts to the bottom in **both** directions. Never
  `0`, never hidden. (social-invest's `useTableSort` already implements exactly this, which makes
  `sortable-table` the highest-value single port and it arrives already correct.)
- `--` in a component column is missing data. Expanding shows `no data, weight excluded` and the
  total reads `x / 75`.
- **Every band and every verdict renders the comparison that fired.**
- Any incomplete window renders `building, N of M days` and no number.
- A subscriber delta below its channel's floor renders `< N`, never a number and never blank.
- Subscriber deltas always render their bucket width.
- **Comment categories and AI channel blurbs render in the Inference tier**, always adjacent to the
  text they describe.
- Parent topics never show a score or a verdict, only rollup counts.
- Suppressed own-covered rows sit behind a toggle, never deleted, and show the covering video.

Chrome ports from social-invest through a **de-domaining pass, not a `cp -r`**. Three trust tokens
replace its P&L semantics (`--gain / --loss / --warning / --limit`), which have no meaning here.

---

## 8. What it costs, in one table

One paid dependency, two calls. Everything else is free API or local compute.

| Source | Used for | Cost |
|---|---|---|
| YouTube Data API | channels, videos, **all comments** | free, ~176 of 10,000 units/day |
| GitHub REST | velocity sweep, indie signal | free with `GITHUB_TOKEN` |
| Firecrawl | GitHub Trending only | already in `.mcp.json` |
| yt-dlp + mlx_whisper | transcripts when captions are missing | free, local |
| **vidIQ** | **daily-history backfill + keyword volume** | **metered, ~663 of 2,000/mo** |
| LLM | extraction, comment classification | see system.md §7 |

**Comment ingest is nearly free**: `commentThreads.list` costs 1 unit per 100 comments. The entire
comment feature fits inside the existing daily budget.

**Comment classification is not free.** It is the project's first real LLM bill, one call per
comment. Only comments clearing a likes/replies floor get classified, since the table only ever shows
the top N, and results cache by comment id so nothing is judged twice. The floor lives in
`config/thresholds.json`.

**`captions.download` only works on videos you own.** Competitor transcripts therefore cannot come
from the official captions API, which is exactly why step 13 mines descriptions and pinned comments
before touching a transcript.

---

## 9. Out of scope

Multi-user · accounts · billing · CI/CD · deploy · public URLs · live scraping inside the web app ·
**posting, commenting, liking, or any OAuth write path** · per-video subscriber conversion
(owner-only YouTube Analytics data) · per-day subscriber growth for competitors (rounding floor, §6)
· `vidiq_outliers` · **Apify, anywhere** · ViewStats and TubeBuddy (no public APIs, and no accuracy
to gain) · a topic approval queue · recommending that Eric build a repo rather than film a video ·
Hacker News and Product Hunt corroboration · retiring `yt-watchlist`'s parallel 31-channel list ·
sharing code with social-invest (copy the shape, share nothing; revisit at project 3).

---

## 10. Build order

Vertical slices, following social-invest's own proven sequence: **digest the data, build the
ingestion, then synthesize and build the dashboard.** Detail in [system.md](system.md) §10.

```
 0  config          config/: channels.json + channel_id, topics.json tree, thresholds.json
 1  snapshot        daily free sweep, status field, gap detection, launchd
 2  backfill        vidiq_channel_stats x72, 360 credits, full history bought
 3  growth          delta(), building states, measurement floor, monotonicity
 4  multiplier      computed from free view counts, split short/long baselines
 5  traction        per-video views_gained, still_growing
 6  comments        ingest + comments.json per channel (cheap, and needed early)
 7  github          velocity sweep + trending sweep, indie score, capped and backed off
 8  verdict + score bands, opportunity score, INSUFFICIENT_DATA
 9  shell           next app on 3002, trust tokens, sortable table
10  home            gamified top-5 leaderboard + opportunity table with derivations
    ═══ SPINE DONE — the Monday question is answered ═══
11  channel pages   profile card, tabbed charts, comment table, comparison
11b mute           per-video mute on the feed, config/muted.json, unmute from the board
12  classify        comment categories, lag column, top-asks per channel
    ═══ GATE — step 13 must pass before 14 starts ═══
13  the spike       20 videos by hand: reproduce one trunk/fork, MEASURE capture rate
14  extraction      description + pinned-comment mining first, then transcripts
15  synthesis       trunk/fork and themes/split, mind map, self-contained steps
16  judge           path judge, stale-majority, unserved-branch cell
17  drafts          own-channel reply drafts + deep links
18  ocr             long-form frame sampling, ASR vs OCR reconciliation
```

Step 0 is first because `config/topics.json` is the one input nothing else works without: the keyword
matcher does nothing until 15 to 25 leaf topics exist, hand-written.

**Comments moved from step 10 to step 6.** They are nearly free, they feed the channel page, and the
corpus needs to be warm long before the unserved-branch check at step 16.

**Muting is 11b rather than a numbered step.** It is not a slice of the spine and nothing after it
depends on it — it is one surface, one file, and one route, added once the feed had been on screen
long enough for the same already-made video to be on it three weeks running. Numbering it would
renumber the gate at 13, which is quoted by number in four other places.

**Step 13 is a hard gate, not homework.** No extraction work begins until a 20-video manual spike
reproduces one hand-written trunk/fork and **artifact capture rate is measured** against a 50% floor.
Clustering is not the risk. Capture is. **Review-shape topics are exempt** and can proceed in
parallel, because they carry no artifacts to capture.

**If the gate fails, the answer is OCR, not degradation.** Frame analysis is a config change rather
than a new subsystem: `si-research-yt/scripts/yt_toolkit/media.py` is 76 lines and already does
scene-change frame extraction with per-frame timestamps, limited to Shorts only by
`SHORT_MAX_SECONDS` and `FRAME_CAP`.

**Partial extraction is omitted, never degraded** (decision 0008). A step whose artifact was mangled
renders as a step with no artifact, never with a reconstructed one. A topic without enough cleanly
extracted videos keeps its mind map empty and says so. A 45% capture rate rendered as a mind map
would be 45% right and 100% confident-looking, which is worse than no mind map at all: Eric would
have to check every step against the video, which is the thing the product exists to eliminate.

Why the gate exists: YouTube auto-captions do not punctuate and do not spell package names.
`npm i -g @anthropic-ai/claude-code` arrives as *"npm install dash g at anthropic dash AI slash
claude dash code"*, if the words survive at all. Estimated exact-artifact capture is ~45% from ASR
alone, ~70% adding description and pinned-comment mining, ~85% adding long-form OCR. Creators paste
their commands into the description and the pinned comment, and both are free, which is why step 14
mines those before it touches a transcript.

**Build the ingestion layer with a dynamic Workflow**, choosing the model per stage: the cheaper
model for mechanical extraction, the strongest one reserved for cross-creator adjudication. *"The
best model on the job, not the highest expensive one."*

---

## 11. Still open

- **Hand-write `config/topics.json`** with 15 to 25 leaf topics, each tagged `tutorial` or `review`, and for
  three of them write the trunk and fork from memory. Blocks step 0. Nothing works without it.
- **Skool comment bodies are unreachable.** The reply drafter (step 17) wants Skool context.
  `skool-pp-cli posts get` is broken: its path template needs `{buildId}` and `{post_name}` and the
  command exposes neither, so it prints help and exits. The underlying `_next/data` endpoint works
  and returns rich post-level data, but `postTree.children` comes back empty. Fix the CLI upstream,
  or capture the real comment request from browser devtools. **Blocks step 17 only.**
- **`_context/skool/` is stale.** It records 317 members; the live community reports 271. It says
  "Level 4 AI SaaS Builder"; Eric now uses "Chapter 4". Resolve before quoting either.
- **Chinese-language channels** — default is the same registry with `lang` as a filter and
  transcripts via local Whisper, as `si-research-ig` already does. Only bites at step 14.
- **The callout feed.** In social-invest a callout is a dated event with a price; this domain has no
  equivalent. Proposed definition: **the first mention of a named entity (tool, model, repo, company)
  by a tracked channel, with date, channel, and citation.** Definition is locked; the build waits for
  step 14, because a titles-only detector would miss anything said out loud while carrying the
  authoritative name "first mention."
- **Launch-event sources** beyond the three company channels — Firecrawl on Anthropic/OpenAI/Google
  changelogs, weekly. Not built.
- **`config/channels.json` as the source for `yt-watchlist`.** Yes eventually.
- **Does `config/channels.json` have a niche column?** The peer filter (§7) needs one. It is Eric's private
  roster, so confirm before depending on it.

---

## 12. Appendix: exact commands and config

system.md explains *why*. This is the *what*, copy-paste ready.

### Ports

```bash
# 3001 is social-invest. Both must run simultaneously.
cd web && npm run dev                       # port 3002, predev rebuilds _db/
```

### Credentials

Repo-root `.env`. All present except the last, which needs adding:

```
YOUTUBE_API_KEY=      # free, 10,000 units/day
VIDIQ_API_KEY=        # 1,141 credits verified 2026-07-27, 2,000 renewable resets 2026-08-04
MCP_VIDIQ_URL=
FIRECRAWL_API_KEY=
GITHUB_TOKEN=         # NEEDS ADDING. Without it the sweep runs on the anonymous limit.
```

No OAuth credentials are needed anywhere, by design (§7).

### Config files

Hand-edited, with one exception noted below. **The pipeline never writes into any of these.**

```
config/
  channels.example.csv  the roster schema, committed
  channels.json          72 rows, GITIGNORED. NEEDS channel_id and niche columns.
  topics.json           topic tree, leaves derived as scoreable, each tagged tutorial|review
  excluded_repos.json   manual evergreen override, keyed by GitHub numeric id
  exclusions.json       what Eric has taken off the board: topics, channels, title terms
  thresholds.json       every number the pipeline branches on
  targets.json          rank target, hunch flags — the only user state in the product
  muted.json            per-video mutes. THE ONE FILE HERE THE UI WRITES (§7, decision 0014)
```

`config/` is a directory rather than loose files at the root so the write-protection rule is
enforceable by path: `test_anchors.py` runs a full build and hashes the tree before and after,
which checks the invariant that matters — **the pipeline never writes into `config/`** — rather
than grepping for `open()`. `muted.json` does not weaken it: the writer is `web/`, Python only ever
reads, and the file stays a plain readable JSON object so a hand-edit remains the fallback.
Full layout in [system.md](system.md) §2.

The roster is whoever the operator chooses to watch, so `config/channels.json` is not committed. Copy
`config/channels.example.json` to start one.

`config/channels.json` currently has no `channel_id`, and that is blocking. `channels.list?id=` batches 50
ids at 1 quota unit; `forHandle` **does not batch at all** (verified: passing two handles returns
zero items). Without ids the daily sweep costs 72 units instead of 2, and a handle rename silently
forks the growth history — the exact failure already guarded against for GitHub repos. Every join
downstream keys on `channel_id`; `handle` becomes display metadata.

### Daily snapshot agent

`~/Library/LaunchAgents/ca.erictech.ait-snapshot.plist`

```
Label              ca.erictech.ait-snapshot
StartCalendarInterval  hour 9, minute 0
WorkingDirectory   ~/Desktop/EricOS/projects/ai-influencers-tracker
ProgramArguments   python3 -m pipeline.snapshot
StandardOutPath    .logs/snapshot.log
StandardErrorPath  .logs/snapshot.err
```

```bash
launchctl load -w ~/Library/LaunchAgents/ca.erictech.ait-snapshot.plist
launchctl list | grep ait-snapshot
```

Gap detection runs on every invocation, so a missed day is backfilled rather than silently averaged.

### Daily quota

```
channels.list      72 ids / 50 per call        2 units
playlistItems      new uploads per channel   ~72 units
videos.list        3,600 tracked videos / 50  72 units    ← per-video traction, free and exact
commentThreads     new videos only           ~30 units
                                            ---------
                                            ~176 of 10,000
```

**Gap healing.** The snapshot runs on a laptop that sleeps and travels, and YouTube's API only ever
returns today's numbers — a missed day cannot be asked for later. Gaps are therefore expected, not
exceptional: they render `building, N of M days` and no number until healed. Healing means
repurchasing the `vidiq_channel_stats` series. **A 90-day window is sufficient; a full year is not
required.** Buy the shorter window when credits are tight rather than skipping the heal entirely.

One-time comment backfill is ~3,600 units and fits inside a single day. Resumable with a ledger
regardless. `search.list` costs **100 units** and is never used: 100 searches would consume the
entire daily quota.
