"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { categoryTabs, filterByCategory, lagText } from "@/lib/channel"
import { PagedTable } from "./paged-table"
import type { SortColumn } from "./sortable-table"
import type { SortValue } from "@/lib/sort"
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

type ColKey =
  | "creator" | "who" | "comment" | "cat" | "likes" | "replies" | "video" | "topic" | "lag"

/** Built per render rather than as a module constant: the creator and video columns are
 *  conditional (topic view adds one, the channel view drops the other), and the header has to
 *  agree with the colgroup and the cells or the whole fixed layout shears by one column. */
function columns(withCreator: boolean, withVideo: boolean): SortColumn<ColKey>[] {
  return [
    ...(withCreator ? [{ key: "creator" as const, label: "creator" }] : []),
    { key: "who", label: "who" },
    { key: "comment", label: "comment", sortable: false },
    { key: "cat", label: "cat" },
    { key: "likes", label: "likes", align: "right" as const },
    { key: "replies", label: "repl", align: "right" as const },
    ...(withVideo ? [{ key: "video" as const, label: "video" }] : []),
    { key: "topic", label: "topic" },
    { key: "lag", label: "lag", align: "right" as const,
      tip: "days between the video going up and the comment" },
  ]
}
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

  const visible = useMemo(() => filterByCategory(rows, tab), [rows, tab])
  // Every column sorts now. It used to be two buttons offering likes or replies, which meant
  // "which of these landed late" and "who said this" were questions the table held the answer
  // to and would not order by.
  const value = useCallback((r: CommentRow, key: ColKey): SortValue => {
    if (key === "likes") return r.like_count
    if (key === "replies") return r.reply_count
    if (key === "lag") return r.lag_days
    if (key === "who") return r.author.toLowerCase()
    if (key === "creator") return creatorNames?.[r.channel_id]?.toLowerCase() ?? r.channel_id
    if (key === "cat") return r.category?.key ?? null
    if (key === "video") return r.video_title.toLowerCase()
    if (key === "topic") return r.topic_ids[0] ?? null
    return null
  }, [creatorNames])
  const unclassified = totals.classified === 0
  const minWidth = COL.who + COL.cat + COL.likes + COL.repl + COL.topic + COL.lag + COMMENT_MIN
    + (creatorNames ? COL.creator : 0) + (showVideo ? COL.video : 0)

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div className="cattabs" role="group" aria-label="comment category">
          {categoryTabs(byCategory, totals.ingested).map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={tab === t.key}
              className={`t${tab === t.key ? " on" : ""}`}
              disabled={t.key !== "all" && unclassified}
              onClick={() => setTab(t.key)}
            >
              {t.label} <b>{unclassified && t.key !== "all" ? "--" : fmtInt(t.count)}</b>
            </button>
          ))}
        </div>
      </div>
      {unclassified && (
        <p className="note" style={{ margin: "6px 0 0", fontSize: 11 }}>
          not classified yet: the classification pass is build step 12. All{" "}
          {fmtInt(byCategory.unsorted)} ingested comments render unlabeled below.
        </p>
      )}
      <PagedTable
        rows={visible}
        columns={columns(Boolean(creatorNames), showVideo)}
        value={value}
        initialKey="likes"
        rowKey={(r) => r.comment_id}
        unit="comments"
        empty="no comments in this category"
        wrapClassName="card tblwrap"
        className="tbl tbl-fixed tbl-sticky tbl-hover"
        style={{ fontSize: 12, minWidth: rem(minWidth) }}
        colgroup={
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
        }
        footnote={
          rows.length < totals.ingested ? (
            <p className="mono10" style={{ marginTop: 6 }}>
              These are the top {fmtInt(rows.length)} by likes out of {fmtInt(totals.ingested)}
              {" "}ingested. The pager above slices that {fmtInt(rows.length)}, not the whole set.
            </p>
          ) : null
        }
        row={(r) => (
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
                  {r.topic_ids[0] ?? "--"}
                </td>
                <td className="r num nowrap">{lagText(r.lag_days)}</td>
              </tr>
        )}
      />
    </div>
  )
}
