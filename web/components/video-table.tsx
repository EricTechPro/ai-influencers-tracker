"use client"

import { agoText, durationText, fmtInt, tierIndex } from "@/lib/trust"
import type { RecentRow } from "@/lib/types"
import type { SortValue } from "@/lib/sort"
import { PagedTable } from "./paged-table"
import { SCORE_CLASS } from "./grid-video-card"
import type { SortColumn } from "./sortable-table"

/**
 * The feed as rows, for the question the grid is bad at.
 *
 * A 3-up grid answers "what does this week look like"; it cannot answer "which of these has the
 * most views for the least age" without the eye jumping between nine thumbnails. Same rows, same
 * filters, same order — this only changes which comparisons are cheap. Sorting runs over the
 * whole filtered set and pagination slices the result, which is PagedTable's entire contract.
 */

type Key = "title" | "score" | "views" | "momentum" | "age" | "topic"

const COLUMNS: SortColumn<Key>[] = [
  { key: "title", label: "video" },
  { key: "score", label: "breakout", align: "right", tip: "vidIQ's breakout score. How far past this channel's normal performance at this age the video ran. Measured by vidIQ, not by us." },
  { key: "views", label: "views", align: "right" },
  { key: "momentum", label: "still climbing", tip: "share of its own view count the video is still adding each day. Climbing is 2%/day or more, flat is under 0.5%." },
  { key: "age", label: "published", align: "right" },
  { key: "topic", label: "topic" },
]

/** climbing first, then steady, then flat. Unmeasured is null, which lib/sort already lands
 *  last in both directions: a video vidIQ returned no views/hour for is not a dead one. */
const MOMENTUM_SORT = { climbing: 3, steady: 2, flat: 1, unmeasured: null } as const
const MOMENTUM_LABEL = {
  climbing: "climbing",
  steady: "steady",
  flat: "flat",
  unmeasured: "no data",
} as const

export function VideoTable({
  rows,
  selfChannelId,
  topicOf,
}: {
  rows: RecentRow[]
  selfChannelId: string
  /** the same first-assigned-topic rule the cards use, passed in so the two never disagree */
  topicOf: (videoId: string) => string | null
}) {
  const value = (v: RecentRow, key: Key): SortValue => {
    switch (key) {
      case "title": return v.title.toLowerCase()
      case "score": return v.breakout_score
      case "views": return v.view_count
      case "momentum": return MOMENTUM_SORT[v.momentum.state]
      case "age": return Date.parse(v.published_at)
      case "topic": return topicOf(v.video_id)?.toLowerCase() ?? null
    }
  }

  return (
    <PagedTable
      rows={rows}
      columns={COLUMNS}
      value={value}
      initialKey="score"
      rowKey={(v) => v.video_id}
      unit="videos"
      perPage={10}
      empty="nothing matches these filters"
      row={(v) => {
        const len = durationText(v.duration_s)
        return (
          <tr>
            <td className="lead">
              <a
                className="vtitle"
                href={`https://www.youtube.com/watch?v=${v.video_id}`}
                target="_blank"
                rel="noreferrer"
              >
                {v.title}
              </a>
              <span className="vsub">
                <span className={v.channel_id === selfChannelId ? "yself" : undefined}>
                  {v.channel_name}
                  {v.channel_id === selfChannelId ? " · you" : ""}
                </span>
                {v.type === "short" && <span className="vshort">SHORT</span>}
                {len && <span className="num"> · {len}</span>}
              </span>
            </td>
            <td className="r num">
              {v.breakout_score === null ? (
                <span className="vnone" title="vidIQ returned no score for this video">
                  unmeasured
                </span>
              ) : (
                <span className={`ymult inline ${SCORE_CLASS[tierIndex(v.breakout_score)]}`}>
                  {v.breakout_score.toFixed(2)}×
                </span>
              )}
            </td>
            <td className="r num">
              {v.view_count === null ? <span className="vnone">--</span> : fmtInt(v.view_count)}
            </td>
            <td>
              <span
                className={`ymom ${v.momentum.state}`}
                title={
                  v.momentum.daily_share === null
                    ? "no views-per-hour returned for this video, so it cannot be judged"
                    : `about ${v.momentum.per_day?.toLocaleString()} views a day, ${(v.momentum.daily_share * 100).toFixed(1)}% of the ${v.view_count?.toLocaleString()} it already has.`
                }
              >
                {MOMENTUM_LABEL[v.momentum.state]}
              </span>
            </td>
            <td className="r num">{agoText(v.published_at)}</td>
            <td className="vtopic">{topicOf(v.video_id) ?? <span className="vnone">—</span>}</td>
          </tr>
        )
      }}
    />
  )
}
