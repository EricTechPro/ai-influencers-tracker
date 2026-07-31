// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { PagedTable } from "./paged-table"
import type { SortColumn } from "./sortable-table"

interface Row {
  id: string
  n: number | null
}

const COLUMNS: SortColumn<"n">[] = [{ key: "n", label: "n", align: "right" }]

function table(rows: Row[], perPage = 3) {
  return render(
    <PagedTable
      rows={rows}
      columns={COLUMNS}
      value={(r) => r.n}
      initialKey="n"
      perPage={perPage}
      unit="rows"
      rowKey={(r) => r.id}
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
