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

  const shown = useMemo(() => {
    const kept = rows.filter((r) => !mutedIds.has(r.video_id))
    return [...kept].sort((a, b) => {
      const ka = sortKey(a, by)
      const kb = sortKey(b, by)
      return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2])
    })
  }, [rows, mutedIds, by])

  const { slice, props } = usePager(shown, perPage)

  return (
    <>
      <SectionKicker label={heading} />
      {shown.length === 0 ? (
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
            <span className="note" style={{ marginLeft: "auto" }}>
              {shown.length < rows.length
                ? `showing ${shown.length} of ${rows.length} · ${rows.length - shown.length} muted`
                : `${shown.length} videos`}
            </span>
          </div>
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
