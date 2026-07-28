"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  categoryTabs, filterByCategory, lagText, sortComments,
} from "@/lib/channel"
import { fmtInt } from "@/lib/trust"
import type { CategoryCounts, CommentCategory, CommentRow } from "@/lib/types"

const CAT_ABBR: Record<CommentCategory, string> = {
  video_request: "req", question: "que", correction: "cor", suggestion: "sug", other: "oth",
}

export function CommentTable({
  rows,
  byCategory,
  totals,
  showVideo = true,
  creatorNames,
}: {
  rows: CommentRow[]
  byCategory: CategoryCounts
  totals: { ingested: number; classified: number }
  showVideo?: boolean
  /** topic view: channel_id -> display name; adds the who-said-it column */
  creatorNames?: Record<string, string>
}) {
  const [tab, setTab] = useState<"all" | CommentCategory>("all")
  const [sortBy, setSortBy] = useState<"likes" | "replies">("likes")
  const [shown, setShown] = useState(5)

  const visible = useMemo(
    () => sortComments(filterByCategory(rows, tab), sortBy),
    [rows, tab, sortBy],
  )
  const page = visible.slice(0, shown)
  const unclassified = totals.classified === 0

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div className="cattabs">
          {categoryTabs(byCategory, totals.ingested).map((t) => (
            <button
              key={t.key}
              className={`t${tab === t.key ? " on" : ""}`}
              disabled={t.key !== "all" && unclassified}
              onClick={() => { setTab(t.key); setShown(5) }}
            >
              {t.label} <b>{unclassified && t.key !== "all" ? "--" : fmtInt(t.count)}</b>
            </button>
          ))}
        </div>
        <span className="mono10" style={{ marginLeft: "auto" }}>
          sort{" "}
          {(["likes", "replies"] as const).map((s) => (
            <button key={s} className={`linklike${sortBy === s ? " on" : ""}`}
              onClick={() => setSortBy(s)}>{s}</button>
          ))}
        </span>
      </div>
      {unclassified && (
        <p className="note" style={{ margin: "6px 0 0", fontSize: 11 }}>
          not classified yet: the classification pass is build step 12. All{" "}
          {fmtInt(byCategory.unsorted)} ingested comments render unlabeled below.
        </p>
      )}
      <div className="card" style={{ marginTop: 8, overflowX: "auto" }}>
        <table className="tbl" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              {creatorNames && <th>creator</th>}
              <th>who</th>
              <th>comment</th>
              <th>cat</th>
              <th className="r">likes</th>
              <th className="r">repl</th>
              {showVideo && <th>video</th>}
              <th>topic</th>
              <th className="r">
                <span className="derived" title="days between the video going up and the comment">
                  lag
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {page.map((r) => (
              <tr key={r.comment_id}>
                {creatorNames && (
                  <td className="mono10">{creatorNames[r.channel_id] ?? r.channel_id}</td>
                )}
                <td className="mono10">{r.author}</td>
                <td data-testid="comment-text" style={{ maxWidth: "26rem" }}>{r.text}</td>
                <td>
                  {r.category ? (
                    <span className={`cat cat-${CAT_ABBR[r.category.key]}`}>
                      {CAT_ABBR[r.category.key]}
                    </span>
                  ) : (
                    <span className="cat muted">·</span>
                  )}
                </td>
                <td className="r num">{fmtInt(r.like_count)}</td>
                <td className="r num">{fmtInt(r.reply_count)}</td>
                {showVideo && (
                  <td className="mono10" style={{ maxWidth: "12rem" }}>
                    <a href={r.video_url} target="_blank" rel="noreferrer">
                      {r.video_title.length > 28 ? `${r.video_title.slice(0, 28)}…` : r.video_title} ↗
                    </a>
                  </td>
                )}
                <td className="mono10">
                  {r.topic_ids[0] ? (
                    <Link href={`/topics/${r.topic_ids[0]}`}>{r.topic_ids[0]}</Link>
                  ) : ("--")}
                </td>
                <td className="r num">{lagText(r.lag_days)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mono10" style={{ marginTop: 6, display: "flex", gap: 10 }}>
        <span>
          showing {Math.min(shown, visible.length)} of {fmtInt(totals.ingested)}
          {rows.length < totals.ingested ? ` · top ${rows.length} by likes` : ""}
        </span>
        {shown < visible.length && (
          <button className="linklike" onClick={() => setShown(shown === 5 ? 10 : shown + 20)}>
            {shown === 5 ? "show 10" : "show more"}
          </button>
        )}
      </div>
    </div>
  )
}
