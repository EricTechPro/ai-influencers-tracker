// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { PagedTable } from "./paged-table"
import type { SortColumn } from "./sortable-table"

interface Row {
  id: string
  n: number | null
}

const COLUMNS: SortColumn<"n">[] = [{ key: "n", label: "n", align: "right" }]

function table(rows: Row[], perPage = 3, resetKey?: string) {
  return render(
    <PagedTable
      rows={rows}
      columns={COLUMNS}
      value={(r) => r.n}
      initialKey="n"
      perPage={perPage}
      unit="rows"
      rowKey={(r) => r.id}
      resetKey={resetKey}
      row={(r) => (
        <tr>
          <td>{r.id}</td>
        </tr>
      )}
    />
  )
}

/** Ten rows whose values ascend, so "sorted the whole list" and "sorted this page" give
 *  visibly different first pages. */
const TEN: Row[] = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}`, n: i }))

describe("PagedTable orders the list, then slices it", () => {
  it("page one holds the global maximum, not the first chunk's maximum", () => {
    // The failure this exists to prevent: pager first, sort second. That renders r0..r2 sorted
    // among themselves and calls it "highest first", which is a wrong number nobody would
    // notice — the column reads as ordered because, locally, it is.
    table(TEN)
    expect(screen.getByText("r9")).toBeTruthy()
    expect(screen.queryByText("r0")).toBeNull()
  })

  it("the readout counts every row, never just the page", () => {
    // "1-3 of 10 rows": the page never hides how much is behind it.
    const { container } = table(TEN)
    expect(container.querySelector(".pgcount")?.textContent).toContain("10")
  })

  it("an unmeasured value sinks in both directions rather than sorting as a zero", () => {
    // lib/sort's tiering, reached through this component: null is missing, not small, so it
    // must not float to the top when the direction flips.
    const rows: Row[] = [{ id: "gone", n: null }, { id: "low", n: 1 }, { id: "high", n: 9 }]
    table(rows, 2)
    expect(screen.getByText("high")).toBeTruthy()
    expect(screen.getByText("low")).toBeTruthy()
    expect(screen.queryByText("gone")).toBeNull()
  })

  it("renders its empty state instead of a headed table with no body", () => {
    table([])
    expect(screen.getByText("nothing matches these filters")).toBeTruthy()
  })
})

describe("PagedTable sends you back to the top when the order changes", () => {
  // Nothing unmounts between cases without vitest `globals`, and every case here renders its own
  // pager, so a document-wide getByRole("button", {name: "4"}) matches several tables at once.
  afterEach(cleanup)

  /** Page 4 of 4 with perPage 3: rows r0..r2 ascending, so the last page is the smallest. */
  function onLastPage() {
    const view = table(TEN, 3)
    fireEvent.click(within(view.container).getByRole("button", { name: "4" }))
    expect(view.container.querySelector(".pgcount")?.textContent).toContain("10–10")
    return view
  }

  it("a re-sort returns to page 1 rather than showing the bottom of the new order", () => {
    // The failure this exists to prevent: you are on the last page, you click a column header to
    // see the biggest rows, the sort applies to all ten correctly — and you are still shown the
    // smallest, under a descending arrow, with nothing saying you are at the bottom of what you
    // just asked for. usePager only ever clamped *down* when a filter shrank the list, and a sort
    // cannot change the row count, so nothing fired.
    const { container } = onLastPage()
    fireEvent.click(container.querySelector(".thsort")!)
    expect(container.querySelector(".pgcount")?.textContent).toContain("1–3")
  })

  it("a resetKey change returns to page 1, for the filters that do not shrink the list", () => {
    // Unticking a category that removes three of 74 rows leaves the page count untouched, so
    // page 3 silently becomes a different set of channels. The caller says "this is a different
    // question now" with resetKey.
    const { container, rerender } = onLastPage()
    rerender(
      <PagedTable
        rows={TEN}
        columns={COLUMNS}
        value={(r: Row) => r.n}
        initialKey="n"
        perPage={3}
        unit="rows"
        rowKey={(r: Row) => r.id}
        resetKey="company-off"
        row={(r: Row) => (
          <tr>
            <td>{r.id}</td>
          </tr>
        )}
      />
    )
    expect(container.querySelector(".pgcount")?.textContent).toContain("1–3")
  })

  it("hands the row renderer the key the table is actually ordered by", () => {
    // The leaderboard's "#" stops being the row order the moment another column is sorted, and it
    // has no other way to know.
    const seen: string[] = []
    render(
      <PagedTable
        rows={TEN}
        columns={COLUMNS}
        value={(r: Row) => r.n}
        initialKey="n"
        perPage={3}
        unit="rows"
        rowKey={(r: Row) => r.id}
        row={(r: Row, sortKey) => {
          seen.push(sortKey)
          return (
            <tr>
              <td>{r.id}</td>
            </tr>
          )
        }}
      />
    )
    expect(seen).toContain("n")
  })
})
