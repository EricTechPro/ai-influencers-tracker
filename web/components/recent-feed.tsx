"use client"

import { useCallback, useMemo, useState } from "react"
import { selectRecent, type FormatKey, type RecentWindow } from "@/lib/recent"
import type { RecentBundle, RecentRow } from "@/lib/types"
import { agoText, fmtInt } from "@/lib/trust"
import { GridVideoCard } from "./grid-video-card"
import { Pager, usePager } from "./pager"
import { PatternRows } from "./pattern-rows"
import { SectionKicker } from "./section-kicker"
import { VideoTable } from "./video-table"

const WINDOWS: RecentWindow[] = [7, 14, 30]

/** The heading is the window. Saying "this week" over a 30-day list is a small lie that costs
 *  nothing to avoid, and the number is the one thing the reader is filtering on. */
const HEADING: Record<RecentWindow, string> = {
  7: "WHAT WENT UP THIS WEEK",
  14: "WHAT WENT UP IN 14 DAYS",
  30: "WHAT WENT UP IN 30 DAYS",
}
const FORMATS: { key: FormatKey; label: string }[] = [
  { key: "all", label: "all formats" },
  { key: "videos", label: "long-form" },
  { key: "shorts", label: "shorts" },
]

/** Sorts the sidebar offers over the grid. "breakout" is the list selectRecent already returns,
 *  so it is the default and costs nothing; the other three reorder it. */
const SORTS = [
  { key: "breakout", label: "breakout score" },
  { key: "climbing", label: "still climbing first" },
  { key: "views", label: "most views" },
  { key: "newest", label: "newest" },
] as const
type SortKey = (typeof SORTS)[number]["key"]

/** climbing first, then steady, then flat, then the ones vidIQ could not measure. Unmeasured
 *  sorts last rather than as a zero: a video we cannot judge is not a dead one. */
const MOMENTUM_RANK = { climbing: 0, steady: 1, flat: 2, unmeasured: 3 } as const

/** The empty selection, so the sidebar's own reset and the toolbar's are one definition. */
const NO_TOPIC = ""

/**
 * The feed: one filtered, sorted, paged list of what went up.
 *
 * It used to be two grids — everything at or above the display floor, then a collapsed "held
 * back" shelf under it. That split described the config rather than the videos: a 2.44x behind a
 * wall read as a different kind of video than the 2.50x above it. Now the floor and the
 * per-channel cap only decide *order* (lib/recent.ts), the score badge dims down the ladder, and
 * the low end is simply page two.
 *
 * The chrome is the shop layout: filters down the left, one toolbar carrying the count and the
 * search, the results as a 3-up grid or a sortable table. Every filter is client-side over one
 * already-loaded bundle, so none of them costs a request or a vidIQ credit.
 */
export function RecentFeed({
  bundle,
  avatars,
  selfChannelId,
  topicsByVideo,
  topicLabels,
  generatedAt,
}: {
  bundle: RecentBundle
  avatars: Record<string, string | null>
  selfChannelId: string
  /** video id -> topic ids, narrowed server-side to only the feed's own videos */
  topicsByVideo: Record<string, string[]>
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
  const [topicId, setTopicId] = useState<string>(NO_TOPIC)
  const [query, setQuery] = useState("")
  const [view, setView] = useState<"grid" | "table">("grid")
  // Uncapped by default. The cap is a per-channel fairness rule for reading a leaderboard, and
  // it was hiding most of the week: nine cards out of 153 outliers read as a quiet week rather
  // than as a filtered one. With one grid it no longer hides anything at all — it demotes a
  // channel's third and later videos to the back of the list. It is still one click away.
  const [capped, setCapped] = useState(false)

  // meta.generated_at, not `new Date()`. This is a client component, so `new Date()` was the
  // viewer's own clock: _db anchors to midnight UTC of the build's day, and a browser reading
  // the page late in that day filtered against a `now` hours ahead of the data, quietly dropping
  // the oldest day of a 7d window that the pipeline's own counts still include.
  const now = useMemo(() => new Date(generatedAt), [generatedAt])
  const { feed } = useMemo(
    () =>
      selectRecent(
        bundle,
        { window, format, perChannelCap: capped ? defaultCap : null, floor },
        now
      ),
    [bundle, window, format, capped, defaultCap, floor, now]
  )

  // A video can carry several topics. The card has room for one, so it takes the first assigned
  // and the rest stay on the hover — the alternative is a card that grows with its assignments.
  const cardTopic = useCallback(
    (videoId: string) => {
      const ids = topicsByVideo[videoId] ?? []
      return ids.length === 0 ? null : topicLabels[ids[0]] ?? ids[0]
    },
    [topicsByVideo, topicLabels]
  )

  // Counted over the window's own videos, not over the current topic selection: a facet that
  // recounts itself as you click it can only ever read "1".
  const topicFacets = useMemo(() => {
    const counts = new Map<string, number>()
    for (const v of feed) {
      for (const id of topicsByVideo[v.video_id] ?? []) {
        counts.set(id, (counts.get(id) ?? 0) + 1)
      }
    }
    return [...counts.entries()]
      .map(([id, n]) => ({ id, label: topicLabels[id] ?? id, n }))
      .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
  }, [feed, topicsByVideo, topicLabels])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = (v: RecentRow) =>
      (topicId === NO_TOPIC || (topicsByVideo[v.video_id] ?? []).includes(topicId)) &&
      (q === "" ||
        v.title.toLowerCase().includes(q) ||
        v.channel_name.toLowerCase().includes(q))

    const hits = feed.filter(matches)
    if (sort === "breakout") return hits
    // Every alternative sort is stable over the breakout order, so rows that tie on views or on
    // momentum still fall back to the ranking the page opened with rather than to bundle order.
    const by: Record<Exclude<SortKey, "breakout">, (v: RecentRow) => number> = {
      climbing: (v) => MOMENTUM_RANK[v.momentum.state],
      views: (v) => -(v.view_count ?? -1),
      newest: (v) => -Date.parse(v.published_at),
    }
    return [...hits].sort((a, b) => by[sort](a) - by[sort](b))
  }, [feed, query, topicId, topicsByVideo, sort])

  // Nine is the 3x3 the grid is drawn as, so a page is exactly the block you see.
  const { slice, props: pagerProps } = usePager(rows, 9)

  const filtered = rows.length !== feed.length
  const failed = bundle.coverage.batches_failed
  const reset = () => {
    setQuery("")
    setTopicId(NO_TOPIC)
    setSort("breakout")
  }

  return (
    <section>
      <SectionKicker
        label={HEADING[window]}
        cap={<>{freshness(bundle)} · {fmtInt(bundle.videos.length)} scanned</>}
      />

      {bundle.fetched_at === null ? (
        <p className="note">
          No outlier sweep has run yet. Run <code>python3 -m pipeline.outliers --no-dry-run</code>{" "}
          and rebuild. This is empty because nothing was fetched, not because nothing broke out.
        </p>
      ) : (
        <>
          {/* The legend that used to sit here — two lines defining the breakout score, climbing,
              spent, and the no-score rule — is gone. Every term it defined already carries the
              same sentence as a tooltip on the badge that uses it, so the paragraph was a glossary
              printed above a page whose words are each self-explaining on hover. It cost four
              lines of the first screen, which is the screen the feed exists to fill with videos. */}
          {failed > 0 && (
            <p className="note">
              ⚠ {failed} of {failed + bundle.coverage.batches_ok} batches failed.{" "}
              {bundle.coverage.missing_channel_ids.length} channels are missing from this list.
            </p>
          )}

          <div className="shop">
            <aside className="shopside">
              <Facet label="sort">
                <select
                  className="shopsort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  aria-label="sort"
                >
                  {SORTS.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </Facet>

              <Facet label="format">
                <ul className="slist">
                  {FORMATS.map((f) => (
                    <Choice
                      key={f.key}
                      on={format === f.key}
                      onClick={() => setFormat(f.key)}
                      label={f.label}
                    />
                  ))}
                </ul>
              </Facet>

              <Facet label="window">
                <ul className="slist">
                  {WINDOWS.map((w) => (
                    <Choice
                      key={w}
                      on={window === w}
                      onClick={() => setWindow(w)}
                      label={`last ${w} days`}
                    />
                  ))}
                </ul>
              </Facet>

              <Facet label="per channel">
                <ul className="slist">
                  <Choice on={!capped} onClick={() => setCapped(false)} label="every video" />
                  <Choice
                    on={capped}
                    onClick={() => setCapped(true)}
                    label={`best ${defaultCap} first`}
                  />
                </ul>
              </Facet>

              {topicFacets.length > 0 && (
                <Facet label="topic">
                  <ul className="slist tall">
                    <Choice
                      on={topicId === NO_TOPIC}
                      onClick={() => setTopicId(NO_TOPIC)}
                      label="every topic"
                      n={feed.length}
                    />
                    {topicFacets.map((t) => (
                      <Choice
                        key={t.id}
                        on={topicId === t.id}
                        onClick={() => setTopicId(t.id)}
                        label={t.label}
                        n={t.n}
                      />
                    ))}
                  </ul>
                </Facet>
              )}
            </aside>

            <div className="shopmain">
              <div className="shopbar">
                <span className="shopcount num">
                  <b>{fmtInt(rows.length)}</b> {rows.length === 1 ? "video" : "videos"}
                  {filtered && <span className="of"> of {fmtInt(feed.length)}</span>}
                </span>

                <input
                  className="shopsearch"
                  type="search"
                  value={query}
                  placeholder="search title or channel"
                  aria-label="search title or channel"
                  onChange={(e) => setQuery(e.target.value)}
                />

                <button type="button" className="shopreset" onClick={reset} disabled={!filtered}>
                  reset
                </button>

                <span className="seg shopview">
                  <button
                    type="button"
                    aria-pressed={view === "grid"}
                    className={view === "grid" ? "on" : undefined}
                    onClick={() => setView("grid")}
                  >
                    grid
                  </button>
                  <button
                    type="button"
                    aria-pressed={view === "table"}
                    className={view === "table" ? "on" : undefined}
                    onClick={() => setView("table")}
                  >
                    table
                  </button>
                </span>
              </div>

              {rows.length === 0 ? (
                <p className="note">Nothing in this window matches those filters.</p>
              ) : view === "table" ? (
                <VideoTable rows={rows} selfChannelId={selfChannelId} topicOf={cardTopic} />
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

function Facet({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="facet">
      <span className="flabel">{label}</span>
      {children}
    </div>
  )
}

/** One row of a sidebar list. A button inside the li, so it is a control to the keyboard and to
 *  a screen reader rather than a clickable list item that neither can reach. */
function Choice({
  on, onClick, label, n,
}: {
  on: boolean
  onClick: () => void
  label: string
  n?: number
}) {
  return (
    <li>
      {/* title as well as the visible label: a 158px rail ellipsises the longer topic names,
          and the hover is where the rest of the name has to live. */}
      <button
        type="button"
        title={label}
        aria-pressed={on}
        className={on ? "on" : undefined}
        onClick={onClick}
      >
        <span className="sname">{label}</span>
        {n !== undefined && <span className="scount num">{fmtInt(n)}</span>}
      </button>
    </li>
  )
}
