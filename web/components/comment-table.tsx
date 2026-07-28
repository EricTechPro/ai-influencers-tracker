"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  categoryTabs, filterByCategory, lagText, sortComments,
} from "@/lib/channel"
import { fmtInt } from "@/lib/trust"
import type { CategoryCounts, CommentCategory, CommentRow } from "@/lib/types"

const CAT_ABBR: Record<CommentCategory, string> = {
  video_request: "req", question: "que", correction: "cor", suggestion: "sug", other: "oth",
}

/** Every column but the comment is fixed, so switching a tab or a sort cannot
 *  reflow the table. Widths are in rem and live here rather than in the CSS
 *  because the table's own min-width is derived from them: fixed columns plus
 *  a comment column still wide enough to read a sentence in. Below that the
 *  wrapper scrolls sideways instead of crushing the comment to nothing. */
const COL = {
  creator: 6.5, who: 6.5, cat: 2.8, likes: 4.4, repl: 3.4, video: 8, topic: 7.5, lag: 5.2,
}
const COMMENT_MIN = 15
const rem = (n: number) => `${n}rem`

/** Clamped to three lines, with the toggle shown only when the text is really
 *  clipped. A character-count guess gets this wrong at some column widths and
 *  leaves some rows four lines tall and others three, so measure instead. */
function CommentText({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const [clipped, setClipped] = useState(false)
  const el = useRef<HTMLSpanElement>(null)
  const openRef = useRef(open)
  openRef.current = open

  useEffect(() => {
    const node = el.current
    if (!node || typeof ResizeObserver === "undefined") return
    // Only meaningful while the clamp is on: expanded, scrollHeight equals
    // clientHeight and re-measuring would hide the control that collapses it.
    const measure = () => {
      if (!openRef.current) setClipped(node.scrollHeight > node.clientHeight + 1)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(node)
    return () => ro.disconnect()
  }, [text])

  return (
    <>
      <span ref={el} className={open ? undefined : "clamp3"}>{text}</span>
      {clipped && (
        <button className="linklike more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "less ▴" : "more ▾"}
        </button>
      )}
    </>
  )
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
  const minWidth = COL.who + COL.cat + COL.likes + COL.repl + COL.topic + COL.lag + COMMENT_MIN
    + (creatorNames ? COL.creator : 0) + (showVideo ? COL.video : 0)

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
        <span className="mono10 sortctl" style={{ marginLeft: "auto" }}>
          sort
          {(["likes", "replies"] as const).map((s) => (
            <button key={s} className={`linklike${sortBy === s ? " on" : ""}`}
              aria-pressed={sortBy === s}
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
      <div className="card tblwrap" style={{ marginTop: 8 }}>
        <table className="tbl tbl-fixed tbl-sticky tbl-hover"
          style={{ fontSize: 12, minWidth: rem(minWidth) }}>
          <colgroup>
            {creatorNames && <col style={{ width: rem(COL.creator) }} />}
            <col style={{ width: rem(COL.who) }} />
            <col />
            <col style={{ width: rem(COL.cat) }} />
            <col style={{ width: rem(COL.likes) }} />
            <col style={{ width: rem(COL.repl) }} />
            {showVideo && <col style={{ width: rem(COL.video) }} />}
            <col style={{ width: rem(COL.topic) }} />
            <col style={{ width: rem(COL.lag) }} />
          </colgroup>
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
                  <td className="mono10 ell" title={creatorNames[r.channel_id] ?? r.channel_id}>
                    {creatorNames[r.channel_id] ?? r.channel_id}
                  </td>
                )}
                <td className="mono10 ell" title={r.author}>{r.author}</td>
                <td data-testid="comment-text"><CommentText text={r.text} /></td>
                <td>
                  {r.category ? (
                    <span className={`cat cat-${CAT_ABBR[r.category.key]}`}>
                      {CAT_ABBR[r.category.key]}
                    </span>
                  ) : (
                    <span className="cat cat-none" title="not classified yet">--</span>
                  )}
                </td>
                <td className="r num">{fmtInt(r.like_count)}</td>
                <td className="r num">{fmtInt(r.reply_count)}</td>
                {showVideo && (
                  <td className="mono10">
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
                <td className="r num nowrap">{lagText(r.lag_days)}</td>
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
