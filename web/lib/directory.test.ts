import { describe, expect, it } from "vitest"
import { filterDirectory, langTabs, matchesQuery } from "./directory"

const rows = [
  { channel_id: "UC1", name: "Pat Simmons", handle: "per_simmons", lang: "en", is_self: false },
  { channel_id: "UC2", name: "Eric Tech", handle: "erictech", lang: "en", is_self: true },
  { channel_id: "UC3", name: "AI超元域", handle: "aichaoyuanyu", lang: "zh", is_self: false },
  { channel_id: "UC4", name: "Nobody", handle: "nobody", lang: null, is_self: false },
] as never[]

describe("matchesQuery", () => {
  it("matches on name, case-insensitively", () => {
    expect(rows.filter((c) => matchesQuery(c, "pat"))).toHaveLength(1)
  })

  it("matches on handle too, so @-typing works", () => {
    expect(rows.filter((c) => matchesQuery(c, "erictech"))).toHaveLength(1)
  })

  it("ignores a leading @ in the query", () => {
    expect(rows.filter((c) => matchesQuery(c, "@erictech"))).toHaveLength(1)
  })

  it("matches a CJK name typed in its own script", () => {
    expect(rows.filter((c) => matchesQuery(c, "超元域"))).toHaveLength(1)
  })

  it("an empty query matches everything", () => {
    expect(rows.filter((c) => matchesQuery(c, "   "))).toHaveLength(4)
  })
})

describe("filterDirectory", () => {
  it("returns everything with an empty query and the all language", () => {
    expect(filterDirectory(rows, "", "all")).toHaveLength(4)
  })

  it("filters to one language", () => {
    const out = filterDirectory(rows, "", "zh")
    expect(out).toHaveLength(1)
    expect(out[0].channel_id).toBe("UC3")
  })

  it("english excludes every channel that is not english, chinese included", () => {
    const out = filterDirectory(rows, "", "en")
    expect(out.map((c) => c.channel_id)).toEqual(["UC1", "UC2"])
  })

  it("treats an unread language as its own bucket rather than folding it into a real one", () => {
    const out = filterDirectory(rows, "", "none")
    expect(out).toHaveLength(1)
    expect(out[0].channel_id).toBe("UC4")
  })

  it("applies the query and the language together", () => {
    expect(filterDirectory(rows, "eric", "en")).toHaveLength(1)
    expect(filterDirectory(rows, "eric", "zh")).toEqual([])
  })

  it("returns an empty array when nothing matches, never the unfiltered set", () => {
    expect(filterDirectory(rows, "zzzz", "all")).toEqual([])
  })
})

describe("langTabs", () => {
  it("counts what clicking the tab produces, not the whole roster", () => {
    const tabs = langTabs(rows, "eric")
    expect(tabs.map((t) => [t.key, t.count])).toEqual([
      ["all", 1],
      ["en", 1],
    ])
  })

  it("leads with all, then orders languages by size", () => {
    expect(langTabs(rows, "").map((t) => t.key)).toEqual(["all", "en", "zh", "none"])
  })

  it("the all count is the sum of every other tab", () => {
    const tabs = langTabs(rows, "")
    const all = tabs.find((t) => t.key === "all")!
    const rest = tabs.filter((t) => t.key !== "all").reduce((n, t) => n + t.count, 0)
    expect(all.count).toBe(rest)
  })

  it("names a language in its own script, and an unread one as unread", () => {
    const by = Object.fromEntries(langTabs(rows, "").map((t) => [t.key, t.label]))
    expect(by.en).toBe("english")
    expect(by.zh).toBe("中文")
    expect(by.none).toBe("unread")
  })

  it("carries a language it has no name for through as its own code", () => {
    const ja = [{ channel_id: "UC9", name: "x", handle: "x", lang: "ja", is_self: false }] as never[]
    expect(langTabs(ja, "").map((t) => t.label)).toEqual(["all", "ja"])
  })

  it("drops a tab that would select nothing, so no tab reads zero", () => {
    expect(langTabs(rows, "").map((t) => t.key)).not.toContain("xx")
    expect(langTabs(rows, "pat").map((t) => t.key)).toEqual(["all", "en"])
  })
})
