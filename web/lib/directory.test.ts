import { describe, expect, it } from "vitest"
import { filterDirectory } from "./directory"

const rows = [
  { channel_id: "UC1", name: "Pat Simmons", handle: "per_simmons", category: "ai-creator", is_self: false },
  { channel_id: "UC2", name: "Eric Tech", handle: "erictech", category: "own", is_self: true },
  { channel_id: "UC3", name: "Anthropic", handle: "anthropic", category: "company", is_self: false },
] as never[]

describe("filterDirectory", () => {
  it("returns everything with an empty query and the all category", () => {
    expect(filterDirectory(rows, "", "all")).toHaveLength(3)
  })

  it("matches on name, case-insensitively", () => {
    expect(filterDirectory(rows, "pat", "all")).toHaveLength(1)
  })

  it("matches on handle too, so @-typing works", () => {
    expect(filterDirectory(rows, "erictech", "all")).toHaveLength(1)
  })

  it("ignores a leading @ in the query", () => {
    expect(filterDirectory(rows, "@anthropic", "all")).toHaveLength(1)
  })

  it("filters by category", () => {
    expect(filterDirectory(rows, "", "company")).toHaveLength(1)
  })

  it("treats the you category as the self flag, not a category value", () => {
    const out = filterDirectory(rows, "", "you")
    expect(out).toHaveLength(1)
    expect(out[0].channel_id).toBe("UC2")
  })

  it("returns an empty array when nothing matches, never the unfiltered set", () => {
    expect(filterDirectory(rows, "zzzz", "all")).toEqual([])
  })
})
