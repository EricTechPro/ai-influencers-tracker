import { describe, expect, it } from "vitest"
import { langTabsFor, NO_LANG } from "./language"

const item = (lang: string | null) => ({ lang })

describe("langTabsFor", () => {
  it("leads with all, then orders languages by size", () => {
    const tabs = langTabsFor([item("zh"), item("en"), item("en")])
    expect(tabs.map((t) => t.key)).toEqual(["all", "en", "zh"])
    expect(tabs.map((t) => t.count)).toEqual([3, 2, 1])
  })

  it("names a language in its own script, and an unread one as unread", () => {
    const tabs = langTabsFor([item("en"), item("zh"), item(null)])
    const labels = Object.fromEntries(tabs.map((t) => [t.key, t.label]))
    expect(labels.en).toBe("english")
    expect(labels.zh).toBe("中文")
    expect(labels[NO_LANG]).toBe("unread")
  })

  it("sinks the unread bucket to the end whatever its size", () => {
    const tabs = langTabsFor([item(null), item(null), item(null), item("en")])
    expect(tabs.map((t) => t.key)).toEqual(["all", "en", NO_LANG])
  })

  it("carries a language it has no name for through as its own code", () => {
    const tabs = langTabsFor([item("ja")])
    expect(tabs.find((t) => t.key === "ja")?.label).toBe("ja")
  })

  it("offers no tab for a language the set does not hold", () => {
    expect(langTabsFor([item("en")]).map((t) => t.key)).toEqual(["all", "en"])
  })
})
