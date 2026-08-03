"use client"

/**
 * One shelf of video cards on a channel page.
 *
 * The same `GridVideoCard` the feed renders, deliberately. A channel page asking "what are this
 * creator's biggest videos" and /topics asking "what went up lately" are different questions over
 * the same corpus, and a second tile would have been a second idea of what a card is — with the
 * drift landing on `momentum`, the one field a card cannot fake.
 *
 * Muting is filtered here rather than upstream so the count can name what it dropped. A shelf
 * that silently shrinks from 20 to 17 reads as a thin channel; "17 of 20" reads as three
 * decisions.
 */
import { useMemo, useState } from "react"
import { GridVideoCard } from "./grid-video-card"
import { Pager, usePager } from "./pager"
import { SectionKicker } from "./section-kicker"
import type { RecentRow } from "@/lib/types"

export type VideoSort = "views" | "multiplier" | "newest" | "climbing"

const SORT_LABEL: Record<VideoSort, string> = {
  views: "most viewed",
  multiplier: "biggest outlier",
  newest: "newest first",
  climbing: "still climbing",
}

export type MomentumFilter = "all" | MomentumState
type MomentumState = "climbing" | "steady" | "flat" | "unmeasured"

/**
 * The badge on the card, as something you can filter down to.
 *
 * Sorting by climbing already floats those rows to the top, but a sort cannot answer "which of
 * these are still pulling views" — it puts the flat ones underneath rather than out, and on a
 * channel whose back catalogue is mostly flat the answer is buried under a page of them.
 *
 * `unmeasured` is offered as its own option rather than folded into flat. A video whose vph
 * nobody returned is not a video nobody is watching, and the whole point of the fourth state is
 * that the two are not the same claim.
 */
const MOMENTUM_LABEL: Record<MomentumFilter, string> = {
  all: "any momentum",
  climbing: "climbing",
  steady: "steady",
  flat: "flat",
  unmeasured: "no data",
}

const MOMENTUM_ORDER: MomentumFilter[] = ["all", "climbing", "steady", "flat", "unmeasured"]

/**
 * Descending on the chosen key, unmeasured last, video_id breaking every tie.
 *
 * A null is a video nobody has counted or scored yet, not a video that did badly, so it sinks
 * below every measured row rather than sorting as a zero. The id tiebreak keeps the order stable
 * across re-renders when two rows hold the same value.
 */
function sortKey(row: RecentRow, by: VideoSort): [number, number, string] {
  if (by === "newest") return [0, -Date.parse(row.published_at), row.video_id]
  if (by === "multiplier") {
    return [row.multiplier === null ? 1 : 0, -(row.multiplier ?? 0), row.video_id]
  }
  if (by === "climbing") {
    // Climbing first, then by how fast inside that group. "no data" is not "flat".
    const rank = { climbing: 0, steady: 1, flat: 2, unmeasured: 3 }[row.momentum.state] ?? 3
    return [rank, -(row.momentum.per_day ?? 0), row.video_id]
  }
  return [row.view_count === null ? 1 : 0, -(row.view_count ?? 0), row.video_id]
}

export function ChannelVideos({
  heading,
  rows,
  avatarUrl,
  mutedIds,
  isSelf = false,
  empty = "Nothing here yet.",
  perPage = 12,
  sorts = ["views", "multiplier", "climbing", "newest"],
  onToggleMute,
}: {
  heading: string
  rows: RecentRow[]
  avatarUrl: string | null
  mutedIds: Set<string>
  isSelf?: boolean
  /** what to say instead of an empty grid. A shelf with no rows is a state and reads as one. */
  empty?: string
  perPage?: number
  sorts?: VideoSort[]
  /** Omitted on a server-rendered shelf. A mute button with no handler would be a control that
   *  does nothing, which is worse than no control. */
  onToggleMute?: (entry: { video_id: string; title: string; channel_name: string }) => void
}) {
  const [by, setBy] = useState<VideoSort>(sorts[0] ?? "views")
  const [momentum, setMomentum] = useState<MomentumFilter>("all")

  // Muting and filtering both shrink the shelf, and they are not the same act — one is a decision
  // you made about a video, the other is a question you asked of the set. Counted separately so
  // the line underneath can say which did what.
  const unmuted = useMemo(() => rows.filter((r) => !mutedIds.has(r.video_id)), [rows, mutedIds])

  // Counted over the unmuted set, so an option never promises rows that a mute has already taken.
  const counts = useMemo(() => {
    const out = new Map<MomentumFilter, number>([["all", unmuted.length]])
    for (const r of unmuted) out.set(r.momentum.state, (out.get(r.momentum.state) ?? 0) + 1)
    return out
  }, [unmuted])

  const shown = useMemo(() => {
    const kept = momentum === "all"
      ? unmuted
      : unmuted.filter((r) => r.momentum.state === momentum)
    return [...kept].sort((a, b) => {
      const ka = sortKey(a, by)
      const kb = sortKey(b, by)
      return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2])
    })
  }, [unmuted, momentum, by])

  const { slice, props } = usePager(shown, perPage)

  return (
    <>
      <SectionKicker label={heading} />
      {/* An empty grid because of a filter is not an empty shelf, and the way out of it is the
          control that emptied it — so the controls stay on screen and the message names the
          filter rather than repeating the channel-has-nothing copy. */}
      {unmuted.length === 0 ? (
        <div className="card pad">
          <p className="note" style={{ margin: 0 }}>{empty}</p>
        </div>
      ) : (
        <>
          <div className="controls"
            style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
                     marginBottom: 10 }}>
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              sort
              <select value={by} onChange={(e) => setBy(e.target.value as VideoSort)}
                aria-label="sort videos">
                {sorts.map((s) => (
                  <option key={s} value={s}>{SORT_LABEL[s]}</option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              show
              <select value={momentum}
                onChange={(e) => setMomentum(e.target.value as MomentumFilter)}
                aria-label="filter videos by momentum">
                {MOMENTUM_ORDER.map((m) => (
                  // The count rides on the label so the shelf tells you what an option holds
                  // before you pick it, rather than emptying and making you pick your way back.
                  <option key={m} value={m} disabled={m !== "all" && !counts.get(m)}>
                    {MOMENTUM_LABEL[m]} ({counts.get(m) ?? 0})
                  </option>
                ))}
              </select>
            </label>
            {/* Two reasons a shelf is short, named separately. A count that folded a mute and a
                filter into one "showing 3 of 20" would be hiding which of the two did it. */}
            <span className="note" style={{ marginLeft: "auto" }}>
              {momentum !== "all"
                ? `${shown.length} ${MOMENTUM_LABEL[momentum]} of ${unmuted.length}`
                : shown.length < rows.length
                  ? `showing ${shown.length} of ${rows.length}`
                  : `${shown.length} videos`}
              {rows.length > unmuted.length ? ` · ${rows.length - unmuted.length} muted` : ""}
            </span>
          </div>
          {shown.length === 0 && (
            <div className="card pad">
              <p className="note" style={{ margin: 0 }}>
                None of this channel&rsquo;s {unmuted.length} uploads are{" "}
                {MOMENTUM_LABEL[momentum]}.
              </p>
            </div>
          )}
          <div className="ygrid">
            {slice.map((v) => (
              <GridVideoCard
                key={v.video_id}
                v={v}
                avatarUrl={avatarUrl}
                isSelf={isSelf}
                onToggleMute={onToggleMute}
              />
            ))}
          </div>
          {props.pageCount > 1 && <Pager {...props} unit="videos" perPageOptions={[12, 24, 48]} />}
        </>
      )}
    </>
  )
}
