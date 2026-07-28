"use client"

import { useCallback, useMemo, useState } from "react"
import { compareSortValues, type SortDir, type SortValue } from "@/lib/sort"

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
}: {
  columns: SortColumn<K>[]
  sortKey: K
  sortDir: SortDir
  onSort: (key: K) => void
}) {
  return (
    <thead>
      <tr>
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
          const arrow = !sortable ? "" : active ? (sortDir === -1 ? " ▾" : " ▴") : " ↕"
          return (
            <th
              key={col.key}
              aria-sort={ariaSort}
              className={col.align === "right" ? "r" : undefined}
              title={col.tip}
            >
              {sortable ? (
                <button type="button" className="thsort" onClick={() => onSort(col.key)}>
                  {col.label}
                  {arrow}
                </button>
              ) : (
                col.label
              )}
            </th>
          )
        })}
      </tr>
    </thead>
  )
}
