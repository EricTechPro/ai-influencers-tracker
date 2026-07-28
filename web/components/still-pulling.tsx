"use client"

import { useState } from "react"
import { deltaText, fmtDate, fmtInt } from "@/lib/trust"
import { CommentTable } from "./comment-table"
import type { CommentRow, CategoryCounts, StateCell } from "@/lib/types"

export interface StillPullingRow {
  video_id: string
  title: string
  published_at: string
  view_count: number | null
  gained7d: StateCell | null
  multiplier: number | null
  topic_id: string | null
  comments: {
    totals: { comments: number }
    by_category: CategoryCounts
    top: CommentRow[]
  } | null
}

export function StillPulling({
  rows,
  channelClassified,
}: {
  rows: StillPullingRow[]
  /** channel-level classified count; per-video totals don't carry their own */
  channelClassified: number
}) {
  const [open, setOpen] = useState<string | null>(null)
  if (rows.length === 0) {
    return (
      <div className="card pad">
        <p className="note" style={{ margin: 0 }}>
          No video currently clears the still-growing bar (traction thresholds in
          config/thresholds.json). That is a measurement, not an error.
        </p>
      </div>
    )
  }
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <table className="tbl" style={{ fontSize: 12 }}>
        <thead>
          <tr>
            <th>video</th>
            <th className="r">published</th>
            <th className="r">views</th>
            <th className="r">
              <span className="derived" title="exact viewCount delta over the last 7 daily snapshots">+7d</span>
            </th>
            <th className="r">
              <span className="derived" title="30d views divided by channel median">mult</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <FragmentRow key={r.video_id} row={r} channelClassified={channelClassified}
              open={open === r.video_id}
              onToggle={() => setOpen(open === r.video_id ? null : r.video_id)} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FragmentRow({ row, channelClassified, open, onToggle }: {
  row: StillPullingRow; channelClassified: number; open: boolean; onToggle: () => void
}) {
  return (
    <>
      <tr className="rowlink" onClick={onToggle} aria-expanded={open}
        style={{ cursor: "pointer" }}>
        <td style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="mono10">{open ? "▾" : "▸"}</span>
          <img src={`https://i.ytimg.com/vi/${row.video_id}/mqdefault.jpg`} alt=""
            width={64} height={36} loading="lazy"
            style={{ objectFit: "cover", borderRadius: 2, flexShrink: 0 }} />
          <span>{row.title}</span>
        </td>
        <td className="r num">{fmtDate(row.published_at)}</td>
        <td className="r num">{row.view_count === null ? "--" : fmtInt(row.view_count)}</td>
        <td className="r num gain">{row.gained7d ? deltaText(row.gained7d) : "--"}</td>
        <td className="r num">{row.multiplier === null ? "--" : `${row.multiplier.toFixed(1)}×`}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} style={{ padding: "0.8rem 1rem", background: "var(--secondary)" }}>
            {row.comments ? (
              <>
                <div className="mono10" style={{ marginBottom: 6 }}>
                  <b className="num">{fmtInt(row.comments.totals.comments)}</b> comments
                  {row.topic_id ? <> · topic: <a href={`/topics/${row.topic_id}`}>{row.topic_id}</a></> : null}
                  {" · "}
                  <a href={`https://youtu.be/${row.video_id}`} target="_blank" rel="noreferrer">
                    open video ↗
                  </a>
                </div>
                <CommentTable rows={row.comments.top} byCategory={row.comments.by_category}
                  totals={{ ingested: row.comments.totals.comments, classified: channelClassified }}
                  showVideo={false} />
              </>
            ) : (
              <span className="mono10">no comments ingested for this video yet</span>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
