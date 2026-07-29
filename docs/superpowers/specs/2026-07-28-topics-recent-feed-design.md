# The recent feed on `/topics`

Date: 2026-07-28
Status: approved, not implemented

## The problem

`/topics` answers "what has this niche made", organised by the 24 leaves in `config/topics.json`.
It does not answer "what went up this week", which is the question Eric actually opens YouTube to
answer.

His manual ritual today: open the subscriptions page sorted by newest, scroll, eyeball each video
against its channel's normal performance, keep the ones that clearly overshot, then notice that
three of them are about the same thing and conclude that thing is trending.

## The score: vidIQ's, not ours

**Decided 2026-07-29: the badge shows vidIQ's `breakoutScore`. Our computed multiplier does not
appear on this page.**

We had a multiplier already (`pipeline/multiplier.py`: views over the median of the channel's last
20 mature same-format uploads). Checked against vidIQ on videos we both cover, it is wrong in two
distinguishable ways:

| video | ours | vidIQ |
|---|---|---|
| I Tested 100+ Hermes Agent Automations | 19.4 | 9.59 |
| OpenCode Full Tutorial (own channel) | 26.1 | 15.13 |
| 4 Free Repos That Cut Token Usage (own) | 4.6 | 2.28 |
| Hermes Agent Works Better (own) | 1.2 | 2.75 |

- **The median baseline is too low on a skewed catalogue.** Eric Tech's last 20 mature long uploads
  have a median of 1,648 views against a mean of 6,628, a 4.0x gap. Dubibubi's is 9.7x. Dividing by
  that median inflates every score.
- **vidIQ normalises by video age and we do not.** Their implied divisor moves per video (686 to
  4,316 across one channel), so a 7-day-old video is judged against what that channel does *at 7
  days*. Ours compares a 3-day-old video's total views to mature lifetime views. That is the last
  row above, where we read colder rather than hotter.

The second is not a tuning constant, it is a missing dimension, and fixing it needs the view-count
history that does not exist yet. vidIQ has already solved it. More importantly, Eric's eye is
calibrated to vidIQ's numbers: a dashboard that says 19.4x where vidIQ says 9.6x costs trust it
cannot earn back.

`pipeline/multiplier.py` stays where it is and keeps serving the taxonomy shelves. It is simply not
what this page shows.

### What that costs and how it is fetched

`vidiq_outliers` takes a `channelIds` array. **72 IDs in one call fails; 24 succeeds**, so the
roster is fetched in 3 batches. 5 credits per call.

- 3 calls x long + 3 calls x shorts = **30 credits per refresh**
- `publishedWithin: "thisMonth"` is fetched once and the 7d and 14d views are filtered from it
  client-side, so the window toggle costs nothing extra
- 30 credits/day against a 2,000-credit cycle is ~900/cycle, and `si-refresh` shares that pool

### What changes because of it

- **vidIQ returns only videos it judges outliers.** This week that was 28 long-form across all 72
  channels, not the 159 they uploaded. The feed is a shortlist, not a full upload list, and the
  "no baseline yet" tail is replaced by "16 more outliers below 2.5x".
- The window toggle maps to vidIQ's buckets: `thisWeek` / `thisMonth` / `threeMonths`.
- vidIQ's view counts run fresher than ours (36,869 vs our 32,757 on the same video), so the card
  shows vidIQ's.
- The score is **Oracle from a vendor**, not Derived by us. It carries a `source: "vidiq"` field and
  the page names the source, because we cannot show the working for a number we did not compute.

## Where it goes

A new section on `/topics`, above the existing taxonomy shelves. Not a new route.

`/topics` stays the taxonomy Eric has committed to. The feed sits above it as the intake: a pattern
that proves itself in the feed gets hand-promoted into `config/topics.json` and from then on has a
real topic page with history. One direction, and the pipeline still never writes into config.

## What ships, in order

### Part 1: the breaking feed

Mockup: `docs/mockups/topics-recent.html` (served by `docs/mockups/serve.py`, port 3013), built
from the real 7-day window on 2026-07-28.

**Layout.** Social-invest chrome and tokens throughout, matching every other page: `.appnav`,
`.section-kicker`, `.card`, the Google Sans Code type ramp, the existing colour variables. Inside
that frame the video grid is deliberately YouTube's own geometry, because that is the layout the eye
already reads at speed:

- 4-up responsive grid (2-up under 60rem), 16px row gap.
- 16:9 thumbnail, 8px radius, real `i.ytimg.com` thumbnails, no quota cost.
- Duration pill bottom-right, on a dark backdrop, exactly where YouTube puts it.
- **The multiplier badge takes the slot YouTube uses for LIVE / NEW**: bottom-left, filled, green.
  Solid at >= 10x, mid-green 3-10x, grey below. It is the sort key, so it is the loudest thing on
  the card.
- Below the thumbnail: 34px round avatar on the LEFT of a title/channel/stats column. Title clamps
  to 2 lines. This is YouTube's grid card, not the existing `.shelf-rail` card, which stacks.
- Your own channel's rows carry a `· you` marker in primary blue.

The existing `.vcard` in `globals.css` stays as it is for the taxonomy shelves. The feed gets a
sibling class rather than a rewrite of the shared one.

**Controls.** Three segmented toggles, all pure client-side filters over the same bundle. Format
comes first and is rendered a size larger, because it is the first decision:

- **format: videos / shorts / all, default `videos`** (long-form)
- window: 7d / 14d / 30d, default 7d
- per channel: max 2 / show all, default max 2

Format leads and defaults to long-form because the two formats are different jobs and a mixed list
asks the eye to do a conversion it cannot do. A 5.2K-view short at 11.8x and a 32.8K-view
long-form at 19.4x are not comparable decisions. Defaulting to long-form also changes what the page
is for: it is a "what should I film" page, and the long-form feed answers that directly.

Both effects are visible in the real 7-day window. Ranked with shorts mixed in, Samin Yasar takes 6
of the top 14 (small shorts baseline, so nearly every short he posts scores 8-11x) and the top of
the feed is dominated by one channel's quote cards. Filtered to long-form the same window opens with
Hermes Agent at 19.4x, an Opus 5 build-off at 12.7x, and three independent Opus 5 reviews. The
second list is the one worth acting on.

Window counts under the default:

| window | long-form | scored | no baseline |
|---|---|---|---|
| 7d | 159 | 112 | 47 |
| 14d | 310 | 209 | 101 |
| 30d | 649 | 452 | 197 |

The per-channel cap is not a nicety either. It is what keeps a single prolific channel from
recreating the exact failure of the subscriptions page this section exists to replace.

- Cards sorted by `multiplier.value` descending.
- Renders the existing `components/video-card.tsx` unchanged except for one thing: the card
  currently hides the multiplier badge below 2.0x (`const hot = ... >= 2`). In this feed the
  multiplier is the sort key, so the badge always renders. The `hot` threshold stays as-is for
  every other surface; the feed passes a prop.
- Videos whose multiplier is `no_baseline` go in a collapsed tail below the ranked cards, labelled
  as having no baseline yet. They are never silently dropped and never sorted as if they were zero.

Measured against today's `_db/`:

| window | videos | `multiplier.state == "ok"` | of those, >= 2.0x |
|---|---|---|---|
| 7d | 302 | 214 | 39 |
| 14d | 606 | 410 | 79 |
| 30d | 1,270 | 827 | 157 |

39 cards is one useful morning. 827 at 30d is still small enough to ship in a bundle.

### Part 2: pattern rows

Same page, below the ranked feed.

- Each row is one pattern label plus the cards that share it, matching Eric's sketch: Pattern A
  holds videos 1-3, Pattern B holds videos 4-5.
- Patterns are named by an LLM pass over the titles of the 30d qualifying set. The hand-authored
  leaves cannot do this job: "Claude Code" is a single leaf and would swallow both "Claude 5" and
  "somebody's `/doctor` command", which are the two examples Eric gave of what he wants separated.
- Output is written to `_synthesize/patterns.json` (it cost money to compute, so it belongs there,
  not in `_db/`) and read into the `_db/` bundle by `build_data.py`.
- Rendered as **Inference**, beside the titles that formed the group. Never styled as a
  measurement. The multiplier on each card stays Derived and is unaffected.
- Videos the pass does not group fall into a trailing "no pattern yet" row.

**Every row resolves to one of three actions, and the row says which.** This is the part that makes
the section useful rather than decorative: a pattern is not automatically a new topic.

| state | when | action |
|---|---|---|
| `promote to a topic →` | clears the 3-creator floor and matches no existing leaf | author a new leaf in `config/topics.json` |
| `add to that topic →` | the grouped titles match aliases on a leaf you already authored | file them under that leaf; the existing topic page shows it heating up |
| `needs 3 creators` | a real group, but too few distinct channels | disabled. Watch it, do not author it |

The floor is `min_n.consensus_min_creators`, already 3 in `config/thresholds.json`. It does not apply
to the `add to that topic` case, because that topic cleared it when it was authored.

The existing-leaf check is a deterministic alias match against `config/topics.json`, run after the
grouping pass. It is Derived, not Inference: either the titles hit the leaf's aliases or they do not.
Only the label and the membership of a group are inference.

All three states appear in the real 7-day window, which is why they are in the mockup: Hermes Agent
is below the floor at 2 creators, Opus 5 reviews clears it at 3, and the Skills group matches the
existing `claude-code-skills-authoring` leaf.

Grouping is computed once over the 30d set. Flipping the window filters the existing rows client
side; it does not trigger a re-grouping.

### Part 3: evergreen, deferred with a reason

Eric also wants the other direction: older videos that keep climbing, ranked by daily growth rate.

That is not computable today. `_db/meta.json` reports `days_present: 1`, `days_missing: 89`, and
`_raw/video_snapshots/` holds exactly one file (`2026-07-28.json`). So `traction.still_growing` is
`null` on all 11,657 videos and `views_gained["7d"]` is `insufficient_data` on all of them. Not low.
Unmeasured.

The code to compute it is already written and tested (`pipeline/traction.py`, `pipeline/growth.py`,
`pipeline/snapshot.py`). What is missing is history, and the reason there is no history is that
`scripts/ait-snapshot.plist` was never installed into `~/Library/LaunchAgents/` (verified: no
matching file present).

So this work installs it via `scripts/install_ait_snapshot_launchd.sh` as its first task, which
starts the clock. First deltas land the next morning; a usable 7d rate exists a week later. At that
point evergreen becomes a third section reading `traction` fields that are already in
`videos.json`, needing no new plumbing.

Nothing in Parts 1 and 2 depends on this.

## Data

New bundle `_db/recent.json`, written by a new `pipeline/bundles/recent.py`, registered in
`build_data.build()` alongside the existing bundle writers.

Why its own bundle rather than slicing `videos.json` in the web layer: `videos.json` is 16.7 MB and
`web/lib/bundles.ts` deliberately never ships it wholesale, only id slices. The feed needs a
whole-set client-side sort across three windows, so it needs its own slim payload. Carrying only
the card fields for the 30d set keeps it small.

Shape, following the existing bundle conventions (`VERSION`, a `TRUST` map, sorted keys, written
whole):

```
{
  "generated_at": ..., "version": 1, "window_days": 30,
  "videos": [
    { video_id, title, published_at, view_count, duration_s, type,
      channel_id, channel_name, multiplier: {value, state, baseline, baseline_n},
      pattern_id | null }
  ],
  "patterns": [ { pattern_id, label, evidence: [video_id, ...], trust: "inference" } ],
  "trust": { "multiplier": "derived", "pattern": "inference" }
}
```

`channel_name` is denormalised into the row so the feed does not have to load `channels.json` to
render a card. Avatars keep resolving through the existing `channelAvatarUrl` path.

## Web

- `web/lib/recent.ts`: pure filter and sort. Takes the bundle plus `{window, format, perChannelCap}`
  and returns ranked rows plus the no-baseline tail. No I/O.
- `web/components/recent-feed.tsx`: client component, owns the three toggles' state.
- `web/components/grid-video-card.tsx`: the YouTube-geometry card. A sibling to the existing
  `video-card.tsx`, not a rewrite of it, so the taxonomy shelves below are untouched.
- `web/lib/bundles.ts`: one new `loadRecent()` following the existing `load<T>()` pattern.
- `web/lib/types.ts`: `RecentBundle`, `RecentRow`, `PatternRow`.
- `web/app/topics/page.tsx`: mount the section above the existing root loop.

## Testing

Test-first, per the repo rule for anything that can render a wrong number.

Python (`pipeline/bundles/test_recent.py`):
- window boundary is inclusive at exactly N days and excludes N+1
- `no_baseline` rows are present in the bundle and carry their state, never a zero value
- sort is by multiplier descending, with a stable tiebreak
- a video with `view_count: null` never appears as ranked
- rebuild is byte-identical (the existing idempotency guarantee)

TypeScript (`web/lib/recent.test.ts`, vitest):
- filtering 30d down to 7d and 14d returns the expected subsets
- the per-channel cap keeps the 2 highest-multiplier rows of a channel and drops the rest, and
  lifting the cap restores them in order
- the format filter partitions cleanly and never drops a row from both sides
- the no-baseline tail is separated from the ranked list
- an empty window renders as empty, not as an error

## Out of scope

- Any change to how `multiplier` itself is computed.
- Any change to the existing taxonomy shelves on `/topics`.
- Automatic promotion of a pattern into `config/topics.json`. That stays a human edit, by rule.
- Server-side sorting, pagination, or a saved-view feature. 827 rows does not need any of it.

## Open risk

The pattern pass is the only part that can produce something confidently wrong. Mitigation is the
trust tier: every pattern label renders with the titles that produced it, so a bad grouping is
visible as a bad grouping rather than passing as a finding. If the labels turn out to be mush in
practice, Part 1 still stands on its own and Part 2 can be cut without touching it.
