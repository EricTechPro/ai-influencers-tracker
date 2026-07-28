import { describe, expect, it } from "vitest"
import {
  CADENCE_FORMULA, cadenceDays, categoryTabs, filterByCategory, lagText,
} from "./channel"
import type { CommentRow } from "./types"

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString()

function row(over: Partial<CommentRow>): CommentRow {
  return {
    comment_id: "c", video_id: "v", video_title: "t", video_url: "u",
    video_published_at: day(0), author: "a", author_channel_id: null, text: "x",
    like_count: 0, reply_count: 0, published_at: day(1), answered: false,
    lag_days: 1, topic_ids: [], category: null, channel_id: "ch", ...over,
  }
}

describe("cadenceDays", () => {
  it("is the median gap over the last 10 uploads", () => {
    // gaps of 2,2,4 days: median 2
    expect(cadenceDays([day(0), day(2), day(4), day(8)])).toBe(2)
  })
  it("averages the middle pair on an even gap count", () => {
    // gaps 2,4: median 3
    expect(cadenceDays([day(0), day(2), day(6)])).toBe(3)
  })
  it("uses only the last 10 uploads", () => {
    const dates = [day(0), ...Array.from({ length: 10 }, (_, i) => day(100 + i))]
    expect(cadenceDays(dates)).toBe(1) // the 100-day gap falls outside the last 10
  })
  it("is null below two uploads, never a fake number", () => {
    expect(cadenceDays([])).toBeNull()
    expect(cadenceDays([day(0)])).toBeNull()
  })
  it("names its formula", () => {
    expect(CADENCE_FORMULA).toMatch(/median/)
  })
})

describe("lagText", () => {
  it("renders same day and Nd after", () => {
    expect(lagText(0)).toBe("same day")
    expect(lagText(41)).toBe("41d after")
  })
})

describe("categoryTabs", () => {
  it("keeps the fixed order with counts, all first", () => {
    const tabs = categoryTabs(
      { video_request: 1, question: 2, correction: 3, suggestion: 4, other: 5, unsorted: 6 },
      21,
    )
    expect(tabs.map((t) => t.key)).toEqual([
      "all", "video_request", "question", "correction", "suggestion", "other",
    ])
    expect(tabs[0].count).toBe(21)
    expect(tabs[3].count).toBe(3)
  })
})

describe("filter and sort", () => {
  const rows = [
    row({ comment_id: "1", like_count: 5, reply_count: 9 }),
    row({ comment_id: "2", like_count: 9, reply_count: 1,
          category: { key: "question", trust: "inference", model: "m", classified_at: day(2) } }),
  ]
  it("all keeps unsorted rows visible", () => {
    expect(filterByCategory(rows, "all")).toHaveLength(2)
  })
  it("a category tab shows only its rows", () => {
    expect(filterByCategory(rows, "question").map((r) => r.comment_id)).toEqual(["2"])
  })
  it("sorts by likes or replies, descending, stable input untouched", () => {
    expect(rows[0].comment_id).toBe("1")
  })
})
