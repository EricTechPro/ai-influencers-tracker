"use client"

import { useCallback, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { compareSortValues, type SortDir, type SortValue } from "@/lib/sort"
import { useTip } from "./tip"

export interface SortColumn<K extends string> {
  key: K
  label: string
  align?: "right"
  /** hover explanation for headers that are not self-explanatory */
  tip?: string
  /** default true; set false for display-only columns */
  sortable?: boolean
}

/**
 * Shared table sort. Click header: desc first, click again: asc.
 * ok rows first, bounded under them, unmeasured last, in both directions.
 */
export function useTableSort<T, K extends string>(
  rows: T[],
  value: (row: T, key: K) => SortValue,
  initialKey: K,
  initialDir: SortDir = -1
) {
  const [sortKey, setSortKey] = useState<K>(initialKey)
  const [sortDir, setSortDir] = useState<SortDir>(initialDir)

  const sorted = useMemo(() => {
    const indexed = rows.map((row, i) => ({ row, i, v: value(row, sortKey) }))
    indexed.sort((a, b) => compareSortValues(a.v, b.v, sortDir) || a.i - b.i)
    return indexed.map((x) => x.row)
  }, [rows, sortKey, sortDir, value])

  const toggle = useCallback(
    (key: K) => {
      if (key === sortKey) {
        setSortDir((d) => (d === -1 ? 1 : -1))
      } else {
        setSortKey(key)
        setSortDir(-1)
      }
    },
    [sortKey]
  )

  return { sorted, sortKey, sortDir, toggle }
}

export function SortableHeader<K extends string>({
  columns,
  sortKey,
  sortDir,
  onSort,
  leading,
}: {
  columns: SortColumn<K>[]
  sortKey: K
  sortDir: SortDir
  onSort: (key: K) => void
  /** An extra, unsorted `<th>` rendered before the sortable columns — the
   *  leaderboard's selection checkbox column, for one. Optional so every
   *  other table using this header is unaffected. */
  leading?: ReactNode
}) {
  return (
    <thead>
      <tr>
        {leading}
        {columns.map((col) => {
          const active = col.key === sortKey
          const sortable = col.sortable !== false
          const ariaSort = !sortable
            ? undefined
            : active
              ? sortDir === -1
                ? ("descending" as const)
                : ("ascending" as const)
              : ("none" as const)
          // The indicator is its own element pinned to one edge rather than a
          // character appended to the label. Appended, it sat immediately after
          // the text, so it landed in a different place in every column: after
          // "#", after "channel", and hard against the right rule on the
          // numeric ones. Pinned, the whole row of them lines up.
          const arrow = !sortable ? "" : active ? (sortDir === -1 ? "▾" : "▴") : "↕"
          return (
            <SortableTh
              key={col.key}
              col={col}
              ariaSort={ariaSort}
              active={active}
              arrow={arrow}
              sortable={sortable}
              onSort={onSort}
            />
          )
        })}
      </tr>
    </thead>
  )
}

/**
 * One header cell. Its own component only because it needs a hook, and a hook cannot be called
 * inside the columns loop.
 *
 * The tip used to sit on the `<th>` while a second `title` sat on the button inside it, and
 * `.thsort { width: 100% }` makes that button fill the cell. A nested title wins, so hovering any
 * header showed "Sort by Δsubs 90d" and never the definition — which silently killed the
 * rounding-bucket disclosure, the growth denominator, the per-1k unit and the "always 30d" note on
 * six of the eight columns. There is one disclosure per header now, it is the definition, and it
 * is reachable by keyboard because it hangs off the button that was already focusable.
 */
function SortableTh<K extends string>({
  col,
  ariaSort,
  active,
  arrow,
  sortable,
  onSort,
}: {
  col: SortColumn<K>
  ariaSort: "ascending" | "descending" | "none" | undefined
  active: boolean
  arrow: string
  sortable: boolean
  onSort: (key: K) => void
}) {
  const { ref, triggerProps, tip } = useTip(col.tip)
  return (
    <th aria-sort={ariaSort} className={col.align === "right" ? "r" : undefined}>
      {sortable ? (
        <button
          ref={ref}
          type="button"
          className={active ? "thsort on" : "thsort"}
          onClick={() => onSort(col.key)}
          {...triggerProps}
        >
          <span className="thlabel">{col.label}</span>
          <span className="tharrow" aria-hidden="true">{arrow}</span>
        </button>
      ) : (
        col.label
      )}
      {tip}
    </th>
  )
}
