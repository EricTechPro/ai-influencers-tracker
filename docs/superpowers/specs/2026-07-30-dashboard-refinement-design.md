# Dashboard refinement: all five routes

Date: 2026-07-30
Status: approved, not implemented
Grill capture: `_raw/grill-me-checkpoint/2026-07-30-ait-page-refinement.md` (EricOS root)

Supersedes the narrower `/compare` spec this file started as. The scope grew during the grill:
every route needs work, and three of the decisions are app-wide rather than page-local.

## The shape of the problem

Five routes exist. Two of them were the same page, one was frozen at hardcoded windows, one was
a flat list pretending to be a topic view, and one had invented its own version of a shared
control.

| route | job today | job after |
|---|---|---|
| `/` | ranked table of all 72 | unchanged job, gains selection: **the comparing view** |
| `/channels` | near-identical ranked table | **a directory** — find and open a channel |
| `/compare` | topic diff, numbers buried below | **the stats comparison** |
| `/topics` | flat feed of breakout videos | the same feed **grouped by topic** |
| `/channels/[id]` | detail page, private window picker | detail page on the **shared** control |

Eric's framing when asked whether `/` and `/channels` should merge: *"one is more like comparing,
right? The other one is more general."* They are not duplicates in his head, so the fix is not a
merge — it is making each page look like the job it already has.

## App-wide decisions

### Window is shared, format is not

**Window** is one `WindowKey` of six, held in the URL as `w`, and it **follows you across every
route**. Pick 30d on `/`, click into `/compare`, still 30d. The shared `WindowTabs` component
already exists for this and `/compare` never adopted it.

**Format** (`all` / `long` / `shorts`) is page-local, held as `fmt`, and appears **only where
every number it touches is video-derived**:

- `/compare` Output rows
- `/channels/[id]` uploads list

It does **not** appear on `/`. A format filter cannot touch Δsubs or Δviews — those are
channel-level totals from YouTube with no per-format breakdown in existence — and six of the
leaderboard's eight columns would sit inert under it. A control that greys out most of a table
teaches the reader the wrong thing about what the data can do.

### Comparisons start on `/`

`/compare` is the payoff page and today the only route into it is a `compare with you →` link
buried on a channel page, landing on whoever happens to rank first by 90d growth.

`/` gains **checkbox selection**, max two. Tick two channels and a bar rises with both faces and a
`compare →` button. Tick one and the second is assumed to be you. Ticking a third replaces the
oldest selection rather than refusing.

### Corpus figures these decisions rest on

Measured against the `2026-07-30T00:00:00Z` build of `_db/`. They drift with each sweep; the ratios
are what matter, not the exact integers.

| | count |
|---|---|
| videos in corpus | 11,820 |
| long / short | 7,821 / 3,999 |
| carrying `topic_assignments` | 7,077 (60%) |
| videos in the recent feed | 153 |
| of those, present in `videos.json` | 153 (all) |
| of those, carrying a topic | 107 (70%) |

**On the wireframes below:** Pat Simmons' and Eric Tech's cells are real values read out of
`_db/channels.json` at the `30d` window. Every other channel's numbers are illustrative filler to
show the layout. Do not treat them as measurements.

---

## `/` — the leaderboard

```
ALL CHANNELS ──────────────────────────────────────── 72 tracked · 2 absent
window  7d 14d [30d] 90d 180d 365d       rank by  [growth] general subs views

      #  channel              subs      Δsubs    growth    Δviews  subs/1k  vids30d
 [ ]  1  ● Pat Simmons      21,700     +7,000   +47.6%     +588K     12.5       12
 [✓]  2  ● Dubibubi        104,000    +31,400   +43.2%    +2.41M      9.2        9
 [ ]  3  ● AI Jason         88,000    +12,000   +15.8%     +881K     13.6        4
 [✓]  4  ● Eric Tech ★      69,000     +4,100    +6.3%     +412K     11.8       26
 [ ]  5  ● Charlie Autom.   47,300     < 500       --      +704K       --        7
                                        ↑ under 5× bucket

┌──────────────────────────────────────────────────────────────┐
│  ● Dubibubi   vs   ● Eric Tech ★              compare →      │
└──────────────────────────────────────────────────────────────┘
```

Changes: selection checkboxes and the comparison bar. Everything else stays — the rank-mode
selector, the window tabs, the column set, the coverage data.

The `vids 30d` column keeps its name and its meaning (videos published in the last 30 days,
regardless of the selected window, as its tooltip already says). The colliding `videos` column
on `/channels` disappears with that page's table, so the ambiguity resolves itself.

## `/channels` — the directory

```
CHANNELS ──────────────────────────────────────── 72 tracked · 2 absent

  search  [ pat________________ ]
  filter  [all] ai-creator  company  adjacent  you

  ● Pat Simmons          @per_simmons
    21.7K subs · 71 videos · en                      compare →

  ● Eric Tech ★          @erictech
    69K subs · 340 videos · en                            you

  ○ Some Channel         @somechannel                          absent
    last seen 21.4K subs · 88 videos
```

**Corrected during execution: there is no `absent since` date.** `ChannelRow` carries `status` but
no date field, so the wireframe above originally promised a date the directory cannot render. The
date *is* derivable — `snapshots.json` series rows carry `date` and `status` — but only by loading
a second bundle into this page, which is not worth it for a row that says "this channel went
private". The row shows an `absent` chip and its last-seen figures, and invents nothing.

`ChannelsTable` stops being a sortable stats table. The rank column, the window tabs, and every
Δ column leave — they belong to `/`. What remains is enough to recognise a channel: face, name,
handle, subscriber count, catalogue size, language.

You land here to **get to a channel page**, not to read numbers. Each row carries a `compare →`
shortcut; the self row shows `you` instead.

Absent channels render their last-seen state rather than vanishing or showing zeros.

## `/compare` — the stats comparison

The topic-coverage table is **removed, not collapsed**. `/topics` already answers "who covers
what" against all 72 channels; a pairwise topic diff was a weaker version of the same answer. In
the screenshot that started this, the entire "him only" section was empty and opened with a
paragraph explaining it had nothing to say.

```
  ● Pat Simmons  ▾        ↔        ● Eric Tech ★  ▾

window  7d 14d [30d] 90d 180d 365d

AUDIENCE                      them          you        gap
  subscribers            21,700 ±100  69,000 ±100     ▲ 3.2×
  Δ subs                     +7,000       +4,100      ▼ 41%
  growth rate                +47.6%       +6.3%       ▼ 7.6×

REACH
  views                   1,658,816    4,349,584      ▲ 2.6×
  Δ views                    +588K        +412K       ▼ 30%
  subs / 1k views              12.5         11.8      ≈ even

OUTPUT              format  [all] long  shorts
  videos published               12           26      ▲ 2.2×
  mix                       4L · 8S     18L · 8S         --
  median views               24,097        3,750      ▼ 6.4×
  cadence                        2d           1d   ▲ 2× more often

  ▸ expand any row for its from → to dates and a sparkline
```

### The gap column

The first draft carried signed raw deltas (`+14`, `-1d`). Eric rejected them: a signed integer
trailing a unit reads as noise, not as a comparison.

**The rule: signed numbers live only in the two channel columns. The gap column is always
relative.** `Δ subs +7,000` keeps its sign, because there the sign *is* the meaning — the channel
gained subscribers. In the gap column a sign is redundant with the glyph and the colour.

| condition | renders |
|---|---|
| ratio < 2× | percent, `▲ 117%` |
| ratio ≥ 2× | multiple, `▲ 3.2×` |
| within ±10% | `≈ even`, muted |
| their side is 0 | `you only` |
| either cell is not `state: "ok"` | `--` |

Percent below 2× and a multiple above it: `+540%` is how nobody reads a six-fold gap, and `3.2×`
is how nobody reads a modest lead.

**Colour**, all from tokens already in the palette:

| state | token | already used for |
|---|---|---|
| you ahead | `--v-make` | the live dot, `.gain`, rank-1 chips |
| within ±10% | `--muted-foreground` | every muted number on the site |
| you behind | `--v-crowded` | the `crowded` verdict badge |

The `▲` / `▼` glyph carries direction independently of hue, so the cell survives a colourblind
reader and the accessibility audit. Magnitude is not a fourth and fifth hue — a large gap gets
heavier font weight and the palette stays at three colours.

**`cadence` is the only lower-is-better row.** Its arrow inverts and its label says `2× more
often`, rather than leaving a bare `2×` that reads backwards. The inversion is a property of the
row definition, not a special case in the renderer.

### What the Output rows are allowed to mean

Per-video views-gained is **unusable**. Every video reports `traction.views_gained` as `building`
or `insufficient_data` at both `7d` and `30d`, and zero `ok`.

So an Output row means **videos published inside the window, and the lifetime views those videos
have accumulated**. Not views earned during the window. Labels and `Derived` tooltips must say so.
A lifetime view count under a `7d` tab without that qualifier is exactly the
inference-styled-as-measurement failure the project rule names.

Format filtering exists because blending destroys `median views`: a shorts-heavy channel's median
collapses for reasons unrelated to performance, and comparing that against a long-form channel's
median compares nothing. The `mix` row shows the long/short split and appears **only under
`all`**, where it is the one place that split is visible.

## `/topics` — grouped by topic

```
TOPICS ─────────────────── what broke out, and is it still climbing

 ▲ claude-code-subagents                    4 videos · 3 creators
   avg breakout 6.2×  ·  you: 23 videos
   ● Dubibubi       9.6×   142,000  climbing ▲  "I Tested 100+ Herm…"   2d
   ● AI Jason       4.1×    38,400              "Subagents Explained"   4d
   ● Pat Simmons    3.8×    22,100              "Why Subagents Beat…"   5d

 ▲ local-llm-stacks                         2 videos · 2 creators
   avg breakout 3.1×  ·  you: 10 videos
   ● Charlie Autom. 3.4×    88,000  climbing ▲  "Ollama Is All You…"    1d

 ── 46 videos have no topic assigned ──
   107 of the 153 in this feed carry an assignment; these 46 do not.
   ● Charlie Autom. 55.2×  704,260  climbing ▲  "Your Sales Pipeline…"  9d
```

**The unit becomes the topic.** Today you can see three videos broke out but not that all three
are about the same thing; noticing the pattern is the reader's job. After this it is the page's.

**This is a join, not a rename.** `_db/recent.json` rows carry no topic assignment at all — their
fields are `breakout_score`, `momentum`, `vph`, `type`, `duration_s`, and a `pattern_id` that is
`null` on every row. The grouping comes from joining on `video_id` into `videos.json`.

**46 of the 153 feed videos have no topic.** They get their own trailing group, rendered as an
honest state. Dropping them hides 30% of what broke out; inventing an "other" topic for them is
worse, because "other" is not a thing anyone makes videos about.

**Group ordering** is by the group's summed view count, so the biggest thing that happened is at
the top. The per-group `avg breakout` is a mean of vidIQ's vendor scores and is labelled
`Derived` — vidIQ's individual numbers are never recomputed (decision 0012), but averaging them
is our arithmetic and says so.

**Own-coverage sits on the group header only** (`you: 23 videos`), never on individual video rows.
Grouped-and-covered is a useful signal; the same badge repeated on every row is noise.

**The patterns section is removed.** `_synthesize/patterns/<date>.json` is written by no skill and
has rendered an honest empty state every day since launch. It does not render at all until the
file exists.

No window picker is added here. The feed's window is the sweep's window, and a second window
concept on this page would mean two different things by the same name.

## `/channels/[id]` — the channel page

```
┌──────────────────────────────────────────────────────────────┐
│  [face]  Pat Simmons  @per_simmons · en   ★ #1 growth 90d    │
│          21,700 subs ±100 · 1,658,816 views · 71 videos      │
│          2d cadence                            compare →     │
└──────────────────────────────────────────────────────────────┘

window  7d 14d [30d] 90d 180d 365d        ← shared, inherited

BY WINDOW
   window     Δsubs    growth    Δviews  subs/1k  videos
      7d    +1,400     +6.9%     +142K     14.4       3
     14d    +2,100    +10.7%     +231K     12.9       6
     30d    +7,000    +47.6%     +588K     12.5      12
     90d   +19,000   +703.7%    +1.59M     11.9      31
    180d   +19,140   +747.7%    +1.61M     11.8      58
    365d        --        --        --       --      71
               ↑ blocked · 1 unusable day

GROWTH    [subscribers] views      ╱╲╱‾╲╱‾‾╲╱
UPLOADS   format  [all] long  shorts
STILL PULLING · 4 videos
▸ COMMENTS · 1,204 ingested                        (collapsed)
```

Three changes:

1. **The growth chart's private 30/90/365 picker goes**, replaced by the shared six-window control
   inherited from wherever you arrived from. Same concept, two different sets, one page apart —
   the exact drift `WindowTabs` was written to stop.
2. **A by-window table lands under the chart.** One row per window, columns
   `Δsubs · growth · Δviews · subs/1k · videos` — the same metric set `/compare` uses, for one
   channel. The chart shows shape; the table gives numbers you can read off. Non-`ok` cells render
   their state and the reason, as the `365d` row does above.
3. **Comments are demoted** — collapsed, opening on click, below the performance blocks. Comment
   classification is step 12 and unbuilt, so the table reports ingest volume and nothing more.

No separate OUTPUT summary block. The format toggle on the uploads list covers it.

---

## Honesty constraints

Global, and each one is a way this could render a lie:

- A gap cell renders `--` unless **both** sides are `state: "ok"`. A `bounded` cell counts as
  not-ok. Pat's `365d` subs is `blocked` with `unusable: 1`; a ratio across it invents a number.
- Deltas below 5× bucket width keep rendering `< N` via `deltaText`.
- The differing-bucket-width callout stays above the `/compare` table.
- A zero denominator is a state, not an infinity: `you only` is a label, never a computed value.
- An empty window renders a state line, never zeros.
- Absent channels on `/channels` show last-seen state, never zeros.
- Feed videos without a topic are shown in their own group, never dropped.
- Format never applies to Δsubs or Δviews, on any page.

## Code

### Removed

- `coverageByTopic`, `comparePartition`, and `lib/compare.test.ts` — imported only by the compare
  page, and they go with the topic table.
- The stats-table body of `ChannelsTable`, replaced by directory rows.
- `ChannelGrowth`'s private `WINDOW_CHOICES` picker.
- The patterns section of the topics page.

### Added

New pure helpers in `lib/compare.ts`, fs-free and react-free so vitest drives them directly:

| helper | responsibility |
|---|---|
| `videosInWindow(videos, window, now)` | filter by `published_at` |
| `splitByFormat(videos, format)` | filter on `type` |
| `outputStats(videos)` | count, long/short split, median lifetime views |
| `gap(them, you, opts)` | even / percent / multiple / `you only` / `--`, plus direction and lower-is-better inversion |

`gap` returns a described value (`{ kind, magnitude, direction, label }`), never a formatted
string. Formatting belongs to the component; tests assert on the description. This is what lets
the `frontend-design` pass restyle the cell without touching logic.

New beside `lib/recent.ts`: `groupFeedByTopic(feed, videosById)` — the join, the untopiced group,
and group ordering by summed views. Pure, tested the same way.

Selection state on `/` is client-side, capped at two, self implied when one is ticked.

`cadenceDays` stays shared with the channel page, fed a window-filtered date list. It averages the
last 10 gaps by design, so on a short window it describes fewer than 10 and the tooltip must not
claim otherwise.

### Structure

`/compare` and `/` split into a server shell that loads bundles and a client component that owns
control state, mirroring how `channel-growth.tsx` already separates the two.

URL params: `w` app-wide, `fmt` page-local, `a` and `b` on `/compare` as today.

## Testing

Test-first, per the project rule — every one of these can render a wrong number.

- `gap`: each branch of the form table, both directions, the ±10% boundary on both sides, the 2×
  threshold on both sides, zero denominator, non-`ok` input, lower-is-better inversion
- `videosInWindow`: boundary dates on both edges, empty result
- `splitByFormat` / `outputStats`: even and odd medians, single video, empty set
- `groupFeedByTopic`: multi-topic videos, the untopiced group, group ordering, empty feed
- `bundles.test.ts` gains `type` and `duration_s` on `VideoRow` if not already asserted
- `lib/compare.test.ts` is deleted with the helpers it covered

## Out of scope

- Any pipeline change. Everything here reads bundles that exist today.
- Views-gained-in-window rows, until `traction.views_gained` reports `ok`.
- Comparing more than two channels.
- Comment classification (step 12) and the reply queue.
- Writing `_synthesize/patterns/<date>.json`. This spec removes the empty section; it does not
  fill it.

## Open flags

- **Roster health has no home.** Absent, corrupt, and per-channel snapshot coverage were visible
  on the old `/channels` table. The directory does not carry them and no other page does either.
  Owner: Eric. Not blocking — nothing regresses that anyone was reading.
- Ticking a third channel on `/` replaces the oldest. Assumed, not confirmed. Low stakes.

## Follow-on

Visual refinement runs through the `frontend-design` skill after the implementation plan lands.
This spec fixes information architecture and semantics. It does not fix typography, spacing, the
exact rendering of the gap cell, or the directory row layout.
