"use client"

import { useEffect, useMemo, useState } from "react"
import { fmtInt } from "@/lib/trust"

/**
 * One pager for every long list on the board.
 *
 * It reads as a statement of coverage first and a control second: "1–25 of 72" is the sentence,
 * the arrows are how you move. That ordering is the point. A bare "‹ 1 2 3 ›" tells you where
 * the widget is; it never tells you how much you have not seen, and this board's whole contract
 * is that a number never hides how much is behind it.
 *
 * Nothing here filters. The pager slices what it is handed and says so, so a page of 25 out of a
 * 72-row roster can never be misread as the roster.
 */
export function usePager<T>(rows: T[], initialPerPage = 25) {
  const [perPage, setPerPage] = useState(initialPerPage)
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(rows.length / perPage))

  // A filter above can shrink the list under the current page. Snapping back to the last real
  // page beats rendering an empty grid that looks like "nothing matched".
  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const slice = useMemo(
    () => rows.slice((page - 1) * perPage, (page - 1) * perPage + perPage),
    [rows, page, perPage]
  )

  return {
    slice,
    props: {
      page,
      pageCount,
      perPage,
      total: rows.length,
      onPage: setPage,
      onPerPage: (n: number) => {
        setPerPage(n)
        setPage(1)
      },
    },
  }
}

export type PagerProps = {
  page: number
  pageCount: number
  perPage: number
  total: number
  onPage: (p: number) => void
  onPerPage: (n: number) => void
  /** what one row is, for the readout: "channels", "videos" */
  unit?: string
  perPageOptions?: number[]
}

/** Elided page numbers: first, last, and a window of three around the current one. A 72-row
 *  table is 3 pages and shows them all; this only matters once a list is long enough that a
 *  full run of numbers would be its own scroll. */
function pageList(page: number, count: number): (number | "gap")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1)
  const near = [page - 1, page, page + 1].filter((p) => p > 1 && p < count)
  const out: (number | "gap")[] = [1]
  if (near[0] !== undefined && near[0] > 2) out.push("gap")
  out.push(...near)
  if (near[near.length - 1] !== undefined && near[near.length - 1] < count - 1) out.push("gap")
  out.push(count)
  return out
}

export function Pager({
  page, pageCount, perPage, total, onPage, onPerPage,
  unit = "rows",
  perPageOptions = [25, 50, 100],
}: PagerProps) {
  if (total === 0) return null
  const from = (page - 1) * perPage + 1
  const to = Math.min(total, page * perPage)
  const single = pageCount === 1

  return (
    <div className="pager">
      <span className="pgcount num">
        {fmtInt(from)}–{fmtInt(to)} <span className="pgof">of</span> {fmtInt(total)} {unit}
      </span>

      <span className="pgper">
        <label>
          per page{" "}
          <select
            value={perPage}
            onChange={(e) => onPerPage(Number(e.target.value))}
            aria-label="rows per page"
          >
            {perPageOptions.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </span>

      {!single && (
        <nav className="pgnav" aria-label="pagination">
          <button type="button" onClick={() => onPage(page - 1)} disabled={page === 1}
            aria-label="previous page">‹</button>
          {pageList(page, pageCount).map((p, i) =>
            p === "gap" ? (
              <span key={`gap${i}`} className="pggap" aria-hidden="true">…</span>
            ) : (
              <button
                key={p}
                type="button"
                className={p === page ? "on" : undefined}
                aria-current={p === page ? "page" : undefined}
                onClick={() => onPage(p)}
              >
                {p}
              </button>
            )
          )}
          <button type="button" onClick={() => onPage(page + 1)} disabled={page === pageCount}
            aria-label="next page">›</button>
        </nav>
      )}
    </div>
  )
}
