"use client"

import { useCallback, useEffect, useId, useMemo, useState } from "react"
import {
  selectRecent, windowsHeld, type FormatKey, type RecentWindow,
} from "@/lib/recent"
import type { RecentBundle, RecentRow } from "@/lib/types"
import { agoText, fmtInt } from "@/lib/trust"
import { GridVideoCard } from "./grid-video-card"
import { Pager, usePager } from "./pager"
import { PatternRows } from "./pattern-rows"
import { SearchField } from "./search-field"
import { SectionKicker } from "./section-kicker"

/** The heading is the window. Saying "this week" over a 30-day list is a small lie that costs
 *  nothing to avoid, and the number is the one thing the reader is filtering on. The 1-day case
 *  is named rather than numbered: the window exists so the board can answer "what went up
 *  today", and "IN 1 DAYS" is both ungrammatical and a worse answer to it. */
function heading(window: RecentWindow): string {
  if (window === 1) return "WHAT WENT UP TODAY"
  return window === 7 ? "WHAT WENT UP THIS WEEK" : `WHAT WENT UP IN ${window} DAYS`
}

const FORMATS: { key: FormatKey; label: string }[] = [
  { key: "all", label: "all" },
  { key: "videos", label: "long" },
  { key: "shorts", label: "shorts" },
]

/** Sorts the rail offers. "breakout" is the list selectRecent already returns, so it is the
 *  default and costs nothing; the other three reorder it. */
const SORTS = [
  { key: "breakout", label: "breakout", tip: "how far past its channel's own normal each video ran: its views over the median of that channel's last mature uploads of the same kind" },
  { key: "growing", label: "growing", tip: "videos still gaining fastest first: share of its own view count a video is adding each day. 2%/day or more is climbing, under 0.5% is flat" },
  { key: "views", label: "views", tip: "most views first, whatever the channel's size" },
  { key: "newest", label: "newest", tip: "most recently published first" },
] as const
type SortKey = (typeof SORTS)[number]["key"]

/** How many tag keys the strip shows collapsed. The rest are one click away, not unreachable:
 *  the button beside them says exactly how many it is holding back. */
const TAGS_COLLAPSED = 12

/** climbing first, then steady, then flat, then the ones we have only observed once. Unmeasured
 *  sorts last rather than as a zero: a video we cannot judge is not a dead one. */
const MOMENTUM_RANK = { climbing: 0, steady: 1, flat: 2, unmeasured: 3 } as const

/**
 * The feed: one filtered, sorted, paged grid of what went up.
 *
 * It used to be two grids — everything at or above the display floor, then a collapsed "held
 * back" shelf under it. That split described the config rather than the videos. Now the floor and
 * the per-channel cap only decide *order* (lib/recent.ts), the score badge dims down the ladder,
 * and the low end is simply page two.
 *
 * The filters are stamped keys rather than lists or dropdowns: every facet here has two to six
 * short values, which is the shape a row of keys reads fastest in. They used to stack down a
 * 158px rail, which put five labels and a boxed tag well between the heading and the first
 * thumbnail — taller than two rows of cards, for controls that are not the page. They are two
 * lines now: one for the four short facets, one for the tag strip. Every one of them is
 * client-side over one already-loaded bundle, so none costs a request or a vidIQ credit.
 */
export function RecentFeed({
  bundle,
  avatars,
  selfChannelId,
  topicsByVideo,
  tagsByVideo,
  topicLabels,
  generatedAt,
}: {
  bundle: RecentBundle
  avatars: Record<string, string | null>
  selfChannelId: string
  /** video id -> topic ids, narrowed server-side to only the feed's own videos */
  topicsByVideo: Record<string, string[]>
  /** video id -> the uploader's own keywords, lowercased. Sparse: a video whose tags were never
   *  captured has no entry at all, which is why the rail states its own coverage. */
  tagsByVideo: Record<string, string[]>
  /** topic id -> human label, narrowed server-side to only the ids this feed shows */
  topicLabels: Record<string, string>
  /** meta.generated_at. The window anchors to the build, never to the viewer's clock. */
  generatedAt: string
}) {
  // Both come from config/thresholds.json via the bundle. They were JSX literals, which meant
  // the config block documented a decision it did not control.
  const floor = bundle.display_floor
  const defaultCap = bundle.per_channel_cap
  const [window, setWindow] = useState<RecentWindow>(7)
  const [format, setFormat] = useState<FormatKey>("all")
  const [sort, setSort] = useState<SortKey>("breakout")
  const [query, setQuery] = useState("")
  const [tag, setTag] = useState<string | null>(null)
  // null is uncapped, and it is the default. The cap is a per-channel fairness rule, and with one
  // grid it no longer hides anything: it demotes a channel's later videos to the back of the list.
  const [cap, setCap] = useState<number | null>(null)
  // Collapsed by default so the strip is one line. Open, it wraps to however many rows the whole
  // facet list needs — the point of the button is that no tag is unreachable, not that the list
  // is short.
  const [tagsOpen, setTagsOpen] = useState(false)
  /** so the "+ N more" button can name the strip it opens */
  const tagStripId = useId()

  // meta.generated_at, not `new Date()`. This is a client component, so `new Date()` was the
  // viewer's own clock: _db anchors to midnight UTC of the build's day, and a browser reading
  // the page late in that day filtered against a `now` hours ahead of the data, quietly dropping
  // the oldest day of a 7d window that the pipeline's own counts still include.
  const now = useMemo(() => new Date(generatedAt), [generatedAt])
  const windows = useMemo(() => windowsHeld(bundle.videos, now), [bundle.videos, now])

  // The default is 7, and until windowsHeld guarded its lower bound every rail contained it.
  // It no longer must: a feed whose newest video is ten days old offers 14 upward, and 7 would
  // then be a heading reading "IN 7 DAYS" over an empty grid with no key lit to say why.
  // windows[0] is the shortest window that actually holds something.
  useEffect(() => {
    if (!windows.includes(window)) setWindow(windows[0])
  }, [windows, window])
  const { feed } = useMemo(
    () => selectRecent(bundle, { window, format, perChannelCap: cap, floor, lang: "all" }, now),
    [bundle, window, format, cap, floor, now]
  )

  // Built from config rather than written 1, 2: changing outliers.per_channel_cap has to change
  // what the page offers, or the threshold is documentation for a decision it does not control.
  const capChoices = useMemo(
    () => [...new Set([1, defaultCap])].sort((a, b) => a - b),
    [defaultCap]
  )

  // Counted over the window's own videos, not over the current selection: a facet that recounts
  // itself as you click it can only ever read 1. Heaviest first, and the rail states both how
  // many tags it did not show and how many of these videos carry no tags at all — filtering on a
  // tag silently drops every untagged video, and that number has to be visible before you do it.
  const { tagFacets, tagCounts, tagged } = useMemo(() => {
    const counts = new Map<string, number>()
    let tagged = 0
    for (const v of feed) {
      const tags = tagsByVideo[v.video_id]
      if (!tags?.length) continue
      tagged += 1
      for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    // Heaviest first, then shortest. Alphabetical was the wrong tie-break: a 7d window puts
    // almost every tag on 2 videos, so it sorted an alphabetical run of near-duplicates —
    // "ai agent", "ai agent startup", "ai agents" — into the first three keys. Shortest-first
    // surfaces the general tag over its own long variants, which is the one worth clicking.
    const facets = [...counts.entries()]
      .map(([name, n]) => ({ name, n }))
      .sort((a, b) => b.n - a.n || a.name.length - b.name.length || a.name.localeCompare(b.name))
    // A tag on one video is not a facet, it is that video's own title in another form. Kept only
    // when almost nothing clears 2, so a thin window still gets a usable list.
    const shared = facets.filter((t) => t.n > 1)
    return { tagFacets: shared.length >= 6 ? shared : facets, tagCounts: counts, tagged }
  }, [feed, tagsByVideo])

  /**
   * The keys the strip draws, which is the ranked list plus one guarantee: whatever tag is
   * filtering is always among them.
   *
   * The list is ranked and then sliced, and a slice can drop the selected facet out from under
   * the reader in three ways — collapsing the strip, switching the window so the facet reorders
   * past the cut, or narrowing the feed until the tag stops clearing the `n > 1` gate and leaves
   * the facet list entirely. Every one of them left the grid narrowed by a tag that no key on the
   * page named, with "any" reading unpressed too, which is precisely the invisible state this
   * strip was rebuilt to remove. It never showed up in the browser because it needs a slice
   * boundary to cross.
   *
   * A selected tag that has fallen out of the facet list is appended with whatever count it still
   * has in this window, and with no count at all when that is zero: a key reading "0" is a number
   * nobody measured, and the only job left for that key is to be unclicked.
   */
  const visibleTags = useMemo(() => {
    const shown = tagsOpen ? tagFacets : tagFacets.slice(0, TAGS_COLLAPSED)
    if (tag === null || shown.some((t) => t.name === tag)) return shown
    return [...shown, tagFacets.find((t) => t.name === tag) ?? { name: tag, n: tagCounts.get(tag) ?? 0 }]
  }, [tagFacets, tagCounts, tagsOpen, tag])

  // A video can carry several topics. The card has room for one, so it takes the first assigned
  // and the rest stay on the hover — the alternative is a card that grows with its assignments.
  const cardTopic = useCallback(
    (videoId: string) => {
      const ids = topicsByVideo[videoId] ?? []
      return ids.length === 0 ? null : topicLabels[ids[0]] ?? ids[0]
    },
    [topicsByVideo, topicLabels]
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const hits = feed.filter(
      (v) =>
        (tag === null || (tagsByVideo[v.video_id] ?? []).includes(tag)) &&
        (q === "" ||
          v.title.toLowerCase().includes(q) ||
          v.channel_name.toLowerCase().includes(q))
    )
    if (sort === "breakout") return hits
    // Every alternative sort is stable over the breakout order, so rows that tie on views or on
    // momentum still fall back to the ranking the page opened with rather than to bundle order.
    const by: Record<Exclude<SortKey, "breakout">, (v: RecentRow) => number> = {
      growing: (v) => MOMENTUM_RANK[v.momentum.state],
      views: (v) => -(v.view_count ?? -1),
      newest: (v) => -Date.parse(v.published_at),
    }
    return [...hits].sort((a, b) => by[sort](a) - by[sort](b))
  }, [feed, query, sort, tag, tagsByVideo])

  // Twelve is the 4x3 the grid is drawn as, so a page is exactly the block you see.
  const { slice, props: pagerProps } = usePager(rows, 12)

  const unscored = bundle.coverage.unscored_channel_ids.length

  return (
    <section>
      <SectionKicker
        label={heading(window)}
        cap={<>{freshness(bundle)} · {fmtInt(bundle.videos.length)} scanned</>}
      />

      {bundle.fetched_at === null ? (
        <p className="note">
          No outlier sweep has run yet. Run <code>python3 -m pipeline.outliers --no-dry-run</code>{" "}
          and rebuild. This is empty because nothing was fetched, not because nothing broke out.
        </p>
      ) : (
        <>
          {unscored > 0 && (
            <p className="note">
              ⚠ {unscored} of {bundle.coverage.channels_requested} channels have too few mature
              uploads to build a baseline from, so their videos cannot be measured against a
              normal. They are in this list, marked unmeasured, never as a low score.
            </p>
          )}

          {/* Its own line, and the full width of the board.
              It sat last on the facet line, after the count and pushed to the far right by the
              count's own `margin-left: auto`, which detached it from its row by whatever gap the
              viewport left. Moving it to the head of that line fixed the detachment and not the
              real problem: a field the size of a key, in a key's border, standing in a line of
              thirteen keys, is one box in a wall of boxes. Nothing about it said it was the way
              in, and it is the only control here that takes an answer rather than offering a
              fixed set of them.
              Its own line costs this block about 30px of height, which is a real cost on a
              header that was deliberately cut down from a rail to two lines — paid because the
              alternative is a search nobody finds. */}
          <SearchField
            className="srch-bar"
            value={query}
            onChange={setQuery}
            label="search videos by title or channel"
            placeholder="search by title or channel"
          />

          {/* Sticky, because the filters are how you get back out of a long list. The rail was
              sticky and the flat bar that replaced it was not, so at 48 per page a reader four
              thousand pixels down had to scroll the whole way back up to change the window or
              clear a tag. Both lines ride together, on the board's own background so the cards
              cannot show through them. */}
          <div className="fbars">
          <div className="fbar">
            {/* How far back the sweep reaches, as visible text. It spent one commit as a `title`
                on this group, which is a tooltip: no touch device shows one, and the div is not
                focusable so no keyboard reaches one either. It is a claim about the limit of what
                is on disk — without it a key row that stops at 30d reads as a choice — so it is
                worth its ~70px on the line. */}
            <Keys label="window">
              {windows.map((w) => (
                <Key key={w} on={window === w} onClick={() => setWindow(w)} label={`${w}d`} />
              ))}
              <span className="kcap">holds {windows[windows.length - 1]}d</span>
            </Keys>

            <Keys label="format">
              {FORMATS.map((f) => (
                <Key
                  key={f.key}
                  on={format === f.key}
                  onClick={() => setFormat(f.key)}
                  label={f.label}
                />
              ))}
            </Keys>

            <Keys label="videos per channel">
              <Key on={cap === null} onClick={() => setCap(null)} label="all" />
              {capChoices.map((n) => (
                <Key
                  key={n}
                  on={cap === n}
                  onClick={() => setCap(n)}
                  label={`${n}`}
                  title={`at most ${n} video${n === 1 ? "" : "s"} per channel before the rest fall to the back`}
                />
              ))}
            </Keys>

            {/* "sort by" shortened to "sort": the four key labels already say it is an order and
                the line has four groups plus the count and the search to fit. */}
            <Keys label="sort">
              {SORTS.map((s) => (
                <Key
                  key={s.key}
                  on={sort === s.key}
                  onClick={() => setSort(s.key)}
                  label={s.label}
                  title={s.tip}
                />
              ))}
            </Keys>

            <span className="shopcount num">
              <b>{fmtInt(rows.length)}</b> {rows.length === 1 ? "video" : "videos"}
              {rows.length !== feed.length && (
                <span className="of"> of {fmtInt(feed.length)}</span>
              )}
            </span>
          </div>

          {tagFacets.length > 0 && (
            <div className="fbar tagbar">
              <div className="keys" role="group" aria-label="tags">
                <span className="klabel">tags</span>
                {/* Wraps in both states, and that is the whole difference between them: open
                    renders more keys, it does not switch layout mode. The collapsed strip used to
                    be one nowrap line scrolled sideways under a fade, which cost four separate
                    defects — the overflow clipped every key's focus ring, the scrollbar was
                    suppressed on an axis a wheel does not drive, the fade half-erased the last key
                    even when nothing overflowed, and on a phone the row's other occupants squeezed
                    it to about one key wide. Twelve keys still land on one line at the board's
                    width; below it they wrap, which is the honest thing for a control whose whole
                    contract is that nothing is hidden. */}
                <span className="krow tags" id={tagStripId}>
                  <Key on={tag === null} onClick={() => setTag(null)} label="any" />
                  {visibleTags.map((t) => (
                    <Key
                      key={t.name}
                      on={tag === t.name}
                      onClick={() => setTag(tag === t.name ? null : t.name)}
                      label={t.name}
                      n={t.n > 0 ? t.n : undefined}
                    />
                  ))}
                </span>
              </div>

              {/* Deliberately not a Key: it selects nothing, and a key that filters nothing
                  sitting in a row of keys that do is the one thing this strip cannot afford.
                  aria-controls names the strip because the keys it reveals are inserted before
                  it — without the pointer a screen reader announces "expanded" and nothing about
                  what expanded or where it went. */}
              {tagFacets.length > TAGS_COLLAPSED && (
                <button
                  type="button"
                  className="kmore"
                  aria-expanded={tagsOpen}
                  aria-controls={tagStripId}
                  onClick={() => setTagsOpen((v) => !v)}
                >
                  {tagsOpen ? "less" : `+ ${fmtInt(tagFacets.length - TAGS_COLLAPSED)} more`}
                </button>
              )}

              {/* Filtering on a tag silently drops every untagged video, so how many of these
                  were ever captured with tags has to be visible before you click one. */}
              <span className="tcap">
                tags on {fmtInt(tagged)} of {fmtInt(feed.length)} videos
              </span>
            </div>
          )}
          </div>

          {rows.length === 0 ? (
            <p className="note">Nothing in this window matches that search.</p>
          ) : (
            <>
              <div className="ygrid">
                {slice.map((v) => (
                  <GridVideoCard
                    key={v.video_id}
                    v={v}
                    avatarUrl={avatars[v.channel_id] ?? null}
                    isSelf={v.channel_id === selfChannelId}
                    topicLabel={cardTopic(v.video_id)}
                  />
                ))}
              </div>
              <Pager {...pagerProps} unit="videos" perPageOptions={[12, 24, 48]} />
            </>
          )}

          {bundle.patterns.length > 0 && (
            <>
              <SectionKicker
                label="PATTERNS"
                cap={<>inference · over vidIQ&apos;s {bundle.videos.length}</>}
              />
              <PatternRows
                patterns={bundle.patterns}
                videos={bundle.videos}
                avatars={avatars}
                selfChannelId={selfChannelId}
              />
            </>
          )}
        </>
      )}
    </section>
  )
}

/**
 * How old the scores on this page are, in the most precise form the sweep actually recorded.
 *
 * Sweeps written before pipeline/outliers.py started stamping the clock carry only their day, so
 * this says the day and stops. Inventing a time for them would be exactly the kind of number this
 * board exists not to print.
 */
function freshness(bundle: RecentBundle): string {
  const iso = bundle.fetched_at_utc
  if (!iso) return `swept ${bundle.fetched_at}`
  const t = new Date(iso)
  const clock = t.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  })
  // The age rides along only once it is one. agoText floors to whole days, so a sweep from this
  // morning read "swept Jul 31, 5:52 AM, 0d" — and now that the feed is built from the free daily
  // sweep rather than a paid one nobody automated, same-day is the normal case, so that "0d"
  // would be permanent furniture. The clock already says when.
  const ago = agoText(iso)
  return ago === "0d" ? `swept ${clock}` : `swept ${clock}, ${ago}`
}

/** One facet: its name, then its keys.
 *
 *  No `title` prop. It carried the window group's "sweep holds N days" for one commit, which put
 *  a fact about the corpus behind a hover on a non-focusable div — invisible to touch, to a
 *  keyboard, and to most screen readers on a role="group". Anything the group as a whole has to
 *  say goes in as a visible child instead. */
function Keys({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="keys" role="group" aria-label={label}>
      <span className="klabel">{label}</span>
      <span className="krow">{children}</span>
    </div>
  )
}

function Key({
  on, onClick, label, title, n,
}: {
  on: boolean
  onClick: () => void
  label: string
  title?: string
  /** how many videos carry this key, shown the way a tag list shows its count */
  n?: number
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      className={on ? "key on" : "key"}
      onClick={onClick}
    >
      {label}
      {n !== undefined && <span className="kn">{fmtInt(n)}</span>}
    </button>
  )
}
