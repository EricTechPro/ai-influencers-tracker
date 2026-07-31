"use client"

import { useCallback, useMemo, useState } from "react"
import { selectRecent, type FormatKey, type RecentWindow } from "@/lib/recent"
import type { RecentBundle } from "@/lib/types"
import { fmtInt } from "@/lib/trust"
import { GridVideoCard } from "./grid-video-card"
import { Pager, usePager } from "./pager"
import { PatternRows } from "./pattern-rows"
import { SectionKicker } from "./section-kicker"

const WINDOWS: RecentWindow[] = [7, 14, 30]

/** The heading is the window. Saying "this week" over a 30-day list is a small lie that costs
 *  nothing to avoid, and the number is the one thing the reader is filtering on. */
const HEADING: Record<RecentWindow, string> = {
  7: "WHAT WENT UP THIS WEEK",
  14: "WHAT WENT UP IN 14 DAYS",
  30: "WHAT WENT UP IN 30 DAYS",
}
const FORMATS: { key: FormatKey; label: string }[] = [
  { key: "videos", label: "videos" },
  { key: "shorts", label: "shorts" },
  { key: "all", label: "all" },
]

/**
 * The feed, and its three toggles.
 *
 * Format leads and defaults to long-form: the two formats are different jobs, and this page
 * answers "what should I film". All three toggles are filters over one already-loaded bundle,
 * so none of them costs a request or a vidIQ credit.
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
  // the config block documented a decision it did not control and the copy below ("nothing
  // cleared 2.5x") would keep printing the old bar after someone tuned it.
  const floor = bundle.display_floor
  const defaultCap = bundle.per_channel_cap
  const [window, setWindow] = useState<RecentWindow>(7)
  const [format, setFormat] = useState<FormatKey>("all")
  // Uncapped by default. The cap is a per-channel fairness rule for reading a leaderboard, and
  // it was hiding most of the week: nine cards out of 153 outliers read as a quiet week rather
  // than as a filtered one. The cap is still one click away.
  const [capped, setCapped] = useState(false)
  // The tail is open by default for the same reason. It is still a separate grid under its own
  // "held back by the floor" line, so the 2.5x bar keeps its meaning; it is just not a wall the
  // week sits behind. Collapse it with the same button.
  const [showTail, setShowTail] = useState(true)

  // meta.generated_at, not `new Date()`. This is a client component, so `new Date()` was the
  // viewer's own clock: _db anchors to midnight UTC of the build's day, and a browser reading
  // the page late in that day filtered against a `now` hours ahead of the data, quietly dropping
  // the oldest day of a 7d window that the pipeline's own counts still include. Same reasoning,
  // and same fix, as videosInWindow's generatedAt in lib/compare.ts.
  const now = useMemo(() => new Date(generatedAt), [generatedAt])
  const { ranked, tail } = useMemo(
    () =>
      selectRecent(
        bundle,
        { window, format, perChannelCap: capped ? defaultCap : null, floor },
        now
      ),
    [bundle, window, format, capped, defaultCap, floor, now]
  )

  // One ranked grid, not a shelf per topic. Grouping made a video that carries three topics
  // appear three times, so four near-identical one-card shelves could all be the same video and
  // the page read as a stutter. The ordering that matters is the breakout multiplier inside the
  // window you picked, which is exactly what selectRecent already returns, so the grid is that
  // list in that order and the topic rides each card instead of heading a shelf.
  //
  // 12 is three full rows at the widest grid and two at the common one, so a page always ends on
  // a complete row rather than one orphan card.
  const { slice: rankedPage, props: rankedPager } = usePager(ranked, 12)
  const { slice: tailPage, props: tailPager } = usePager(tail, 12)

  // A video can carry several topics. The card has room for one, so it takes the first assigned
  // and the rest stay on the hover — the alternative is a card that grows with its assignments.
  const cardTopic = useCallback(
    (videoId: string) => {
      const ids = topicsByVideo[videoId] ?? []
      return ids.length === 0 ? null : topicLabels[ids[0]] ?? ids[0]
    },
    [topicsByVideo, topicLabels]
  )

  const failed = bundle.coverage.batches_failed

  return (
    <section>
      <SectionKicker
        label={HEADING[window]}
        cap={
          <>
            {fmtInt(ranked.length)} shown · {fmtInt(bundle.videos.length)} outliers ·{" "}
            {bundle.fetched_at ?? "never fetched"}
          </>
        }
      />

      {bundle.fetched_at === null ? (
        <p className="note">
          No outlier sweep has run yet. Run <code>python3 -m pipeline.outliers --no-dry-run</code>{" "}
          and rebuild. This is empty because nothing was fetched, not because nothing broke out.
        </p>
      ) : (
        <>
          <p className="note">
            vidIQ&apos;s breakout score · <b>climbing</b> is still outrunning its own lifetime
            views/hour, <b>spent</b> took its views in a burst and went flat
          </p>

          {failed > 0 && (
            <p className="note">
              ⚠ {failed} of {failed + bundle.coverage.batches_ok} batches failed.{" "}
              {bundle.coverage.missing_channel_ids.length} channels are missing from this list.
            </p>
          )}

          <div className="ctrls">
            <div className="ctrl">
              <span className="lbl">format</span>
              <span className="seg big">
                {FORMATS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    aria-pressed={format === f.key}
                    className={format === f.key ? "on" : undefined}
                    onClick={() => setFormat(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </span>
            </div>
            <div className="ctrl">
              <span className="lbl">window</span>
              <span className="seg">
                {WINDOWS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    aria-pressed={window === w}
                    className={window === w ? "on" : undefined}
                    onClick={() => setWindow(w)}
                  >
                    {w}d
                  </button>
                ))}
              </span>
            </div>
            <div className="ctrl">
              <span className="lbl">per channel</span>
              <span className="seg">
                <button className={capped ? "on" : undefined} onClick={() => setCapped(true)}>
                  max {defaultCap}
                </button>
                <button className={!capped ? "on" : undefined} onClick={() => setCapped(false)}>
                  show all
                </button>
              </span>
            </div>
          </div>

          {ranked.length === 0 ? (
            <p className="note">Nothing cleared {floor}× in this window.</p>
          ) : (
            <>
              <div className="ygrid" style={{ marginTop: "10px" }}>
                {rankedPage.map((v) => (
                  <GridVideoCard
                    key={v.video_id}
                    v={v}
                    avatarUrl={avatars[v.channel_id] ?? null}
                    isSelf={v.channel_id === selfChannelId}
                    topicLabel={cardTopic(v.video_id)}
                  />
                ))}
              </div>
              <Pager {...rankedPager} unit="videos" />
            </>
          )}

          {tail.length > 0 && (
            <div className="tail">
              <span className="t1">
                {fmtInt(tail.length)} more held back by the cap or under {floor}×
              </span>
              <span className="t2">
                Nothing vidIQ returned is discarded. A video with no score is unmeasured, not low.
              </span>
              <button onClick={() => setShowTail((s) => !s)}>
                {showTail ? "hide" : "show them"}
              </button>
            </div>
          )}

          {showTail && (
            <>
              <div className="ygrid" style={{ marginTop: "14px" }}>
                {tailPage.map((v) => (
                  <GridVideoCard
                    key={v.video_id}
                    v={v}
                    avatarUrl={avatars[v.channel_id] ?? null}
                    isSelf={v.channel_id === selfChannelId}
                  />
                ))}
              </div>
              <Pager {...tailPager} unit="held back" perPageOptions={[12, 24, 48]} />
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
