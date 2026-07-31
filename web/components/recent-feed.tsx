"use client"

import { useCallback, useMemo, useState } from "react"
import {
  selectRecent, windowsHeld, type FormatKey, type RecentWindow,
} from "@/lib/recent"
import type { RecentBundle, RecentRow } from "@/lib/types"
import { agoText, fmtInt } from "@/lib/trust"
import { GridVideoCard } from "./grid-video-card"
import { Pager, usePager } from "./pager"
import { PatternRows } from "./pattern-rows"
import { SectionKicker } from "./section-kicker"

/** The heading is the window. Saying "this week" over a 30-day list is a small lie that costs
 *  nothing to avoid, and the number is the one thing the reader is filtering on. */
function heading(window: RecentWindow): string {
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
  { key: "breakout", label: "breakout", tip: "how far past its channel's normal each video ran, as vidIQ measured it" },
  { key: "growing", label: "growing", tip: "videos still gaining fastest first: share of its own view count a video is adding each day. 2%/day or more is climbing, under 0.5% is flat" },
  { key: "views", label: "views", tip: "most views first, whatever the channel's size" },
  { key: "newest", label: "newest", tip: "most recently published first" },
] as const
type SortKey = (typeof SORTS)[number]["key"]

/** How many tag keys the rail shows before it stops and says how many it left out. */
const TAGS_SHOWN = 16

/** climbing first, then steady, then flat, then the ones vidIQ could not measure. Unmeasured
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
 * The filters are a column of stamped keys rather than lists or dropdowns: every facet here has
 * two to six short values, which is the shape a row of keys reads fastest in, and it keeps the
 * whole rail under one screen so nothing about the filters ever scrolls. Every one of them is
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

  // meta.generated_at, not `new Date()`. This is a client component, so `new Date()` was the
  // viewer's own clock: _db anchors to midnight UTC of the build's day, and a browser reading
  // the page late in that day filtered against a `now` hours ahead of the data, quietly dropping
  // the oldest day of a 7d window that the pipeline's own counts still include.
  const now = useMemo(() => new Date(generatedAt), [generatedAt])
  const windows = useMemo(() => windowsHeld(bundle.videos, now), [bundle.videos, now])
  const { feed } = useMemo(
    () => selectRecent(bundle, { window, format, perChannelCap: cap, floor }, now),
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
  const { tagFacets, tagged } = useMemo(() => {
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
    return { tagFacets: shared.length >= 6 ? shared : facets, tagged }
  }, [feed, tagsByVideo])

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

  // Nine is the 3x3 the grid is drawn as, so a page is exactly the block you see.
  const { slice, props: pagerProps } = usePager(rows, 9)

  const failed = bundle.coverage.batches_failed

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
          {failed > 0 && (
            <p className="note">
              ⚠ {failed} of {failed + bundle.coverage.batches_ok} batches failed.{" "}
              {bundle.coverage.missing_channel_ids.length} channels are missing from this list.
            </p>
          )}

          <div className="shop">
            <aside className="shopside">
              <Keys label="window">
                {windows.map((w) => (
                  <Key key={w} on={window === w} onClick={() => setWindow(w)} label={`${w}d`} />
                ))}
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

              <Keys label="per channel">
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

              <Keys label="sort by">
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

              {tagFacets.length > 0 && (
                <div className="keys" role="group" aria-label="tags">
                  <span className="klabel">tags</span>
                  <span className="krow tags">
                    <Key on={tag === null} onClick={() => setTag(null)} label="any" />
                    {tagFacets.slice(0, TAGS_SHOWN).map((t) => (
                      <Key
                        key={t.name}
                        on={tag === t.name}
                        onClick={() => setTag(tag === t.name ? null : t.name)}
                        label={t.name}
                        n={t.n}
                      />
                    ))}
                  </span>
                </div>
              )}

              {/* Two limits the keys above cannot show on their own: how far back the sweep
                  reaches, and how many of these videos were ever captured with tags. Filtering
                  on a tag drops every untagged video, so that number belongs beside the tags. */}
              <p className="sfoot">
                sweep holds {windows[windows.length - 1]} days
                {tagFacets.length > 0 && (
                  <>
                    <br />
                    tags on {fmtInt(tagged)} of {fmtInt(feed.length)} videos
                    {tagFacets.length > TAGS_SHOWN && (
                      <>
                        <br />
                        {fmtInt(tagFacets.length - TAGS_SHOWN)} more tags
                      </>
                    )}
                  </>
                )}
              </p>
            </aside>

            <div className="shopmain">
              <div className="shopbar">
                <span className="shopcount num">
                  <b>{fmtInt(rows.length)}</b> {rows.length === 1 ? "video" : "videos"}
                  {rows.length !== feed.length && (
                    <span className="of"> of {fmtInt(feed.length)}</span>
                  )}
                </span>

                {/* Not a boxed input. The field is a ruled line that thickens on focus, which is
                    the same hairline vocabulary the rest of the board is drawn in. */}
                <span className={query ? "qfield on" : "qfield"}>
                  <span className="qglyph" aria-hidden="true">⌕</span>
                  <input
                    type="text"
                    value={query}
                    placeholder="title or channel"
                    aria-label="search title or channel"
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && setQuery("")}
                  />
                  {query && (
                    <button type="button" aria-label="clear search" onClick={() => setQuery("")}>
                      ×
                    </button>
                  )}
                </span>
              </div>

              {rows.length === 0 ? (
                <p className="note">Nothing in this window matches that search.</p>
              ) : (
                <>
                  <div className="ygrid g3">
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
                  <Pager {...pagerProps} unit="videos" perPageOptions={[9, 18, 36]} />
                </>
              )}
            </div>
          </div>

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
  return `swept ${clock}, ${agoText(iso)}`
}

/** One facet: its name, then its keys. */
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
