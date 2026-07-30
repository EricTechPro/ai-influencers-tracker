import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { Pager } from "./pager"

/** The readout is a claim about how much of a list you are looking at, so it is the part that
 *  can lie. These pin the arithmetic at the edges: the last page, a page that does not divide
 *  evenly, and an empty list. */
function markup(over: Partial<Parameters<typeof Pager>[0]> = {}) {
  return renderToStaticMarkup(
    <Pager
      page={1}
      pageCount={3}
      perPage={25}
      total={72}
      onPage={() => {}}
      onPerPage={() => {}}
      unit="channels"
      {...over}
    />
  )
}

describe("Pager readout", () => {
  it("states the slice and the whole", () => {
    expect(markup()).toContain("1–25")
    expect(markup()).toContain("72")
  })

  it("clamps the last page to the total rather than to perPage", () => {
    // 72 rows at 25/page: page 3 is 51-72, not 51-75.
    const html = markup({ page: 3 })
    expect(html).toContain("51–72")
    expect(html).not.toContain("51–75")
  })

  it("renders nothing at all for an empty list", () => {
    expect(markup({ total: 0, pageCount: 1 })).toBe("")
  })

  it("drops the page nav when everything fits on one page", () => {
    const html = markup({ total: 12, pageCount: 1, perPage: 25 })
    expect(html).toContain("1–12")
    expect(html).not.toContain("pagination")
  })
})
