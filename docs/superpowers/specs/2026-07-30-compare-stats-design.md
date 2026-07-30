# `/compare` becomes a stats comparison

Date: 2026-07-30
Status: approved, not implemented

## The problem

`/compare` today leads with a topic-coverage table — "what Pat Simmons covers that you do not" —
and buries the actual numbers below it under a section called "the numbers".

Two things are wrong with that.

**The topic table answers a question `/topics` already owns.** Opportunity scoring, verdicts, and
supply-vs-demand all live on `/topics`, computed against the whole 72-channel roster rather than
one arbitrary rival. A pairwise topic diff is a weaker version of the same answer: it tells you
Pat has not made a `rag-pipelines` video, which is true of most channels and actionable for none
of them. In the screenshot that motivated this change, the entire `him only` section was empty and
the table opened with a paragraph explaining that it had nothing to say.

**The numbers section is frozen.** It hardcodes `90d` for every subscriber and view row and `30d`
for every output row, even though `channels.json` carries all six windows for the first group. You
cannot ask "how did the last 7 days go", which is the question you actually open this page with.
It also says nothing about format, so a channel that posts 30 shorts and a channel that posts 30
long-form videos read identically on the `videos 30d` row, and their `median views 30d` rows are
not comparable at all.

## What this replaces it with

The topic table is **removed**, not collapsed. `/compare` becomes one thing: a stats comparison
between two channels, over a window you pick, optionally filtered to one format.

```
[avatar] Pat Simmons ▾   ↔   [avatar] Eric Tech ★ ▾
window  7d 14d 30d 90d 180d 365d        format  all | long | shorts

AUDIENCE                    them        you           gap
  subscribers            21,700 ±100  69,000 ±100   ▲ 3.2×
  Δ subs                    +19,000    +13,900       ▼ 27%
  growth rate               +703.7%     +25.2%       ▼ 28×

REACH
  views                   1,658,816  4,349,584       ▲ 2.6×
  Δ views                +1,593,334 +1,232,167       ▼ 23%
  subs / 1k views              11.9       11.3       ≈ even

OUTPUT                                        (respects the format filter)
  videos published               12         26        ▲ 2.2×
  mix                      4L · 8S    18L · 8S           --
  median views               24,097      3,750       ▼ 6.4×
  cadence                        2d         1d       ▲ 2× more often
```

## The gap column

The old table had no gap column at all; you did the arithmetic in your head. The first draft of
this design added one carrying signed raw deltas (`+14`, `-1d`), and Eric rejected it: a signed
integer trailing a unit reads as noise, not as a comparison.

**The rule: signed numbers live only in the two channel columns. The gap column is always
relative.**

`Δ subs +19,000` stays exactly as it renders today, because there the sign is the meaning — the
channel gained subscribers. In the gap column a sign is redundant with the direction glyph and
the colour, and the magnitude matters more than the unit.

### Form

| condition | renders |
|---|---|
| ratio < 2× | percent, e.g. `▲ 117%` |
| ratio ≥ 2× | multiple, e.g. `▲ 3.2×` |
| within ±10% | `≈ even`, muted |
| their side is 0 | `you only` |
| either cell is not `state: "ok"` | `--` |

Percent below 2× and a multiple above it, because `+540%` is how nobody reads a six-fold gap and
`3.2×` is how nobody reads a modest lead. One threshold, one column, no mixed mental math.

### Colour

| state | token | already used for |
|---|---|---|
| you ahead | `--v-make` | the live dot, `.gain`, rank-1 chips |
| within ±10% | `--muted-foreground` | every muted number on the site |
| you behind | `--v-crowded` | the `crowded` verdict badge |

The `▲` / `▼` glyph carries direction independently of hue, so the cell survives a colourblind
reader and the accessibility audit. Hue is never the only channel.

Magnitude is not encoded as a fourth and fifth hue. A large gap gets heavier font weight; the
palette stays at three colours.

### Direction on lower-is-better rows

`cadence` is the only row where a smaller number wins. Its arrow inverts and its label says so
(`▲ 2× more often`) rather than leaving a bare `2×` that reads backwards. No other row needs this,
and the inversion is a property of the row definition, not a special case in the renderer.

## Windows and formats

**Window** is one of the six `WindowKey` values, driven by the existing shared `WindowTabs`
component — the same control the leaderboard and channels index already use. It was written to
stop exactly this kind of drift and `/compare` never adopted it.

Every row moves with the window. The Audience and Reach rows read the matching key straight out of
`channels.json`, which already stores all six. The Output rows are computed in the web layer from
`videos.json` by filtering on `published_at`.

**Format** is `all`, `long`, or `shorts`, and filters the Output rows only. `videos.json` carries a
`type` field on every row (3,974 shorts and 7,762 long across the roster) plus `duration_s`, so no
pipeline change is needed.

The `mix` row shows the long/short split and appears **only when the format filter is `all`**,
where it is the one place that split is visible. Under `long` or `shorts` it is redundant with the
filter itself and hides.

Format filtering exists because blending the two destroys `median views`. A shorts-heavy channel's
median collapses for reasons that have nothing to do with how it is performing, and comparing that
number against a long-form channel's median is not a comparison of anything.

## What the Output rows are allowed to mean

Per-video views-gained is **not usable**. Every video in `_db/videos.json` reports
`traction.views_gained` as `building` or `insufficient_data` at both `7d` and `30d` — 3,299 and
8,437 rows respectively, and zero `ok`.

So an Output row means: **videos published inside the window, and the lifetime views those videos
have accumulated.** It does not mean views earned during the window. The row labels and the
`Derived` tooltips must say this. Rendering a lifetime view count under a `7d` tab without that
qualifier is precisely the inference-styled-as-measurement failure the project rule names.

When the view history matures enough for `views_gained` to go `ok`, that becomes a different row
and a separate decision. It is out of scope here.

## Claim tiers

| row | tier | note |
|---|---|---|
| subscribers | Oracle, rounded | keeps its `±bucket` chip |
| Δ subs, growth rate | Derived | existing `StateCell`, existing formula tooltips |
| views | Oracle | exact `viewCount` |
| Δ views, subs / 1k views | Derived | unchanged formulas |
| videos published, mix | Oracle | a count of rows in `videos.json` |
| median views | Derived | median of exact lifetime `view_count` over the filtered set |
| cadence | Derived | `CADENCE_FORMULA`, fed a window-filtered date list |
| every gap cell | Derived | its own formula tooltip, stating which side divides which |

## Honesty constraints

- A gap cell renders `--` unless **both** sides are `state: "ok"`. Pat's `365d` subs cell is
  `blocked` with `unusable: 1`; a ratio computed across it would invent a number.
- Deltas below 5× a channel's bucket width keep rendering `< N` via `deltaText`. The gap column
  treats a `bounded` cell as not-`ok` and renders `--`.
- The differing-bucket-width callout stays exactly as it is, above the table.
- A zero denominator is a state, not an infinity. `you only` is a label, not a computed value.
- An empty window (no videos published in it) renders a state line, not zeros.

## Code

**`lib/compare.ts` is replaced.** `coverageByTopic` and `comparePartition` are imported by
`app/compare/page.tsx` and nothing else, so they and `lib/compare.test.ts` go with the topic table.

New pure helpers in `lib/compare.ts`, all fs-free and react-free so vitest can drive them directly:

| helper | responsibility |
|---|---|
| `videosInWindow(videos, window, now)` | filter by `published_at` |
| `splitByFormat(videos, format)` | filter on `type` |
| `outputStats(videos)` | count, long/short split, median lifetime views |
| `gap(them, you, opts)` | the whole gap-cell decision: even / percent / multiple / `you only` / `--`, plus direction and lower-is-better inversion |

`gap` returns a described value (`{ kind, magnitude, direction, label }`), never a formatted
string. Formatting belongs to the component; the tests assert on the description.

`cadenceDays` in `lib/channel.ts` stays shared with the channel page. It is fed a window-filtered
list rather than the full history. Note it averages over the last 10 gaps by design, so on a short
window it describes fewer than 10 — the tooltip should not claim otherwise.

**The page splits** into a server shell that loads bundles and a client component that owns the
window and format state, mirroring how `channel-growth.tsx` already separates the two. State is
URL-backed — `?a=&b=&w=90d&fmt=long` — so a comparison is reloadable and shareable, matching how
`a` and `b` already work.

### Interactivity

1. Window tabs, driving every row
2. Format toggle, driving the Output rows
3. Gap column with the leading side highlighted
4. Row expand: the window's resolved `from → to` dates (already on `StateCell`) plus a sparkline
   for the subscriber and view rows. The daily `SnapshotDay[]` series is already loaded for
   channel pages, so this is a wiring job, not new data.
5. Swap sides (`↔`)

## Testing

Test-first, per the project rule, since every one of these can render a wrong number.

- `gap`: each branch of the form table, both directions, the ±10% boundary on both sides, the 2×
  threshold on both sides, zero denominator, non-`ok` input, lower-is-better inversion
- `videosInWindow`: boundary dates on both edges, empty result
- `splitByFormat` and `outputStats`: even and odd medians, single video, empty set
- `bundles.test.ts` gains `type` and `duration_s` on `VideoRow` if not already asserted
- The existing `lib/compare.test.ts` is deleted with the helpers it covers

## Out of scope

- Any pipeline change. Everything here reads bundles that exist today.
- Views-gained-in-window rows, until `traction.views_gained` reports `ok`.
- Comparing more than two channels.
- Moving anything onto `/topics`. The topic table is deleted, not relocated; `/topics` already
  answers that question better and needs no change to keep doing so.

## Follow-on

Visual refinement of the table runs through the `frontend-design` skill after the implementation
plan lands. This spec fixes the information architecture and the semantics; it does not fix the
typography, spacing, or the exact rendering of the gap cell.
