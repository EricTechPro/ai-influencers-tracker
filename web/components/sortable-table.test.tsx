// Task 6 is the first real consumer of useTableSort/SortableHeader. The repo
// has no DOM test renderer (no jsdom, no @testing-library, no
// react-test-renderer) and installing one is out of scope, so this exercises
// what is observable without a mounted DOM: SortableHeader's aria-sort/arrow
// output per state, and useTableSort's sort output for the key/dir pairs a
// header click actually produces (same key flips dir, a new key resets to
// dir -1) rather than a simulated click event.
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { SortableHeader, useTableSort, type SortColumn } from "./sortable-table"
import type { SortDir } from "@/lib/sort"

type Key = "a" | "b"
const COLUMNS: SortColumn<Key>[] = [
  { key: "a", label: "A" },
  { key: "b", label: "B", sortable: false },
]

function renderHeader(sortKey: Key, sortDir: SortDir) {
  return renderToStaticMarkup(
    <table>
      <SortableHeader columns={COLUMNS} sortKey={sortKey} sortDir={sortDir} onSort={() => {}} />
    </table>
  )
}

describe("SortableHeader aria-sort", () => {
  it("the active descending column", () => {
    const html = renderHeader("a", -1)
    expect(html).toContain('aria-sort="descending"')
    expect(html).toContain("A ▾")
  })

  it("the active ascending column", () => {
    const html = renderHeader("a", 1)
    expect(html).toContain('aria-sort="ascending"')
    expect(html).toContain("A ▴")
  })

  it("an inactive but sortable column gets aria-sort=none and the neutral arrow", () => {
    const html = renderHeader("b", -1)
    // "a" is not the active key here, so it must read as unsorted
    expect(html).toMatch(/aria-sort="none"[^]*?A ↕/)
  })

  it("a non-sortable column renders plain text, no button, no aria-sort", () => {
    const html = renderHeader("a", -1)
    const bCell = html.slice(html.indexOf(">B<") - 40, html.indexOf(">B<") + 10)
    expect(bCell).not.toContain("<button")
    expect(bCell).not.toContain("aria-sort")
  })
})

interface Row {
  id: string
  score: number | null
  alt: number | null
}

function Harness({ rows, initialKey, initialDir }: { rows: Row[]; initialKey: Key; initialDir: SortDir }) {
  const { sorted } = useTableSort<Row, Key>(
    rows,
    (row, key) => (key === "a" ? row.score : row.alt),
    initialKey,
    initialDir
  )
  return <span data-order={sorted.map((r) => r.id).join(",")} />
}

function order(rows: Row[], initialKey: Key, initialDir: SortDir): string[] {
  const html = renderToStaticMarkup(<Harness rows={rows} initialKey={initialKey} initialDir={initialDir} />)
  const match = html.match(/data-order="([^"]*)"/)
  return match ? match[1].split(",").filter(Boolean) : []
}

describe("useTableSort produces the order a header click should", () => {
  const rows: Row[] = [
    { id: "low", score: 10, alt: 3 },
    { id: "high", score: 90, alt: 1 },
    { id: "null", score: null, alt: 2 },
    { id: "mid", score: 50, alt: 4 },
  ]

  it("first click on a column: dir -1, descending, nulls last", () => {
    expect(order(rows, "a", -1)).toEqual(["high", "mid", "low", "null"])
  })

  it("second click on the same column flips to dir 1, nulls still last", () => {
    expect(order(rows, "a", 1)).toEqual(["low", "mid", "high", "null"])
  })

  it("clicking a different column sorts by that column's own value, dir -1", () => {
    // key "b" reads row.alt: high=1, low=3, null=2, mid=4 -> descending is mid,low,null,high
    expect(order(rows, "b" as Key, -1)).toEqual(["mid", "low", "null", "high"])
  })
})
