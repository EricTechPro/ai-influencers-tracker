"use client"

import { Fragment, type CSSProperties, type ReactNode } from "react"
import { Pager, usePager } from "./pager"
import { SortableHeader, useTableSort, type SortColumn } from "./sortable-table"
import type { SortDir, SortValue } from "@/lib/sort"

/**
 * One sortable, paged table for every long list on the board.
 *
 * Sort and pagination were two separate pieces that every caller wired together by hand, and the
 * order they compose in is the whole correctness question: sorting has to run over the entire
 * row set and pagination has to slice the result. Sorting a page instead of the list gives you
 * a table where "highest first" means "highest on this page", which is a different and much
 * quieter kind of wrong number than the ones this project usually guards against.
 *
 * So it is one component rather than a documented convention. `useTableSort` orders all rows,
 * `usePager` slices what comes out, and a caller cannot get that backwards.
 *
 * The three-way tier ordering comes free with `lib/sort`: measured rows first, bounded under
 * them, unmeasured last, in both directions. Reversing the direction never floats an unmeasured
 * row to the top, because a missing value is not a small one.
 */
export function PagedTable<T, K extends string>({
  rows,
  columns,
  value,
  initialKey,
  initialDir = -1,
  row,
  rowKey,
  unit = "rows",
  perPage = 10,
  leadingHeader,
  empty = "nothing matches these filters",
  className = "tbl tbl-hover",
  colgroup,
  style,
  wrapClassName = "tblwrap",
  footnote,
}: {
  rows: T[]
  columns: SortColumn<K>[]
  /** what to sort a row by, per column key */
  value: (row: T, key: K) => SortValue
  initialKey: K
  initialDir?: SortDir
  /** the row's complete markup, `<tr>` included. Returning a fragment of several `<tr>`s is
   *  how an expandable table renders its detail row under its summary row. */
  row: (row: T) => ReactNode
  rowKey: (row: T) => string
  /** what one row is, for the pager's readout: "channels", "videos" */
  unit?: string
  /** 10 by default: a table you can read without scrolling beats one you can read all of. */
  perPage?: number
  /** an extra unsorted <th> before the sortable ones, matching SortableHeader's own slot */
  leadingHeader?: ReactNode
  empty?: ReactNode
  className?: string
  /** fixed column widths, for a table whose layout must not reflow when a tab or sort
   *  changes. Rendered straight through as the table's own <colgroup>. */
  colgroup?: ReactNode
  style?: CSSProperties
  wrapClassName?: string
  /** a sentence under the pager: what this table is a slice OF, when that is not the
   *  same question as which page you are on. */
  footnote?: ReactNode
}) {
  // Order the whole set...
  const { sorted, sortKey, sortDir, toggle } = useTableSort(rows, value, initialKey, initialDir)
  // ...then slice it. Never the other way round.
  const { slice, props: pager } = usePager(sorted, perPage)

  if (rows.length === 0) return <div className="empty">{empty}</div>

  return (
    <>
      <div className={wrapClassName}>
        <table className={className} style={style}>
          {colgroup}
          <SortableHeader
            columns={columns}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggle}
            leading={leadingHeader}
          />
          <tbody>
            {slice.map((r) => (
              <Fragment key={rowKey(r)}>{row(r)}</Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <Pager {...pager} unit={unit} />
      {footnote}
    </>
  )
}
