import { describe, expect, it } from "vitest"
import { gap, okValue, outputStats, splitByFormat, videosInWindow, windowDays } from "./compare"
import type { StateCell, VideoRow } from "./types"

describe("okValue", () => {
  it("returns the number for an ok cell", () => {
    expect(okValue({ state: "ok", value: 1200 } as StateCell)).toBe(1200)
  })

  it("returns null for every non-ok state, bounded included", () => {
    const states = ["bounded", "building", "blocked", "insufficient_data", "no_baseline", "unavailable"]
    for (const state of states) {
      expect(okValue({ state, value: 999 } as StateCell)).toBeNull()
    }
  })
})

describe("gap", () => {
  it("is unknown when either side is missing", () => {
    expect(gap(null, 10).kind).toBe("unknown")
    expect(gap(10, null).kind).toBe("unknown")
  })

  it("is unknown when either side is negative, because a ratio across a sign is not a gap", () => {
    expect(gap(-100, 200).kind).toBe("unknown")
    expect(gap(100, -200).kind).toBe("unknown")
  })

  it("calls a 0-vs-something row 'only you' rather than dividing by zero", () => {
    expect(gap(0, 26)).toEqual({ kind: "only-you", magnitude: null, direction: "ahead", qualifier: null })
  })

  it("calls 0 vs 0 even", () => {
    expect(gap(0, 0).kind).toBe("even")
  })

  it("calls anything inside 10% even", () => {
    expect(gap(12.5, 11.8).kind).toBe("even")
    expect(gap(100, 110).kind).toBe("even")
    expect(gap(100, 91).kind).toBe("even")
  })

  it("treats exactly 10% as still even, and just past it as a percent", () => {
    expect(gap(100, 110).kind).toBe("even")
    expect(gap(100, 111).kind).toBe("percent")
  })

  it("renders a lead under 2x as a percent", () => {
    const g = gap(12, 20)
    expect(g.kind).toBe("percent")
    expect(g.direction).toBe("ahead")
    expect(g.magnitude).toBeCloseTo(0.667, 3)
  })

  it("renders a deficit under 2x as a percent", () => {
    const g = gap(7000, 4100)
    expect(g.kind).toBe("percent")
    expect(g.direction).toBe("behind")
    expect(g.magnitude).toBeCloseTo(0.414, 3)
  })

  it("switches to a multiple at exactly 2x, in both directions", () => {
    expect(gap(10, 20)).toMatchObject({ kind: "multiple", direction: "ahead", magnitude: 2 })
    expect(gap(20, 10)).toMatchObject({ kind: "multiple", direction: "behind", magnitude: 2 })
  })

  it("reports the multiple as the larger side over the smaller, never a fraction", () => {
    const g = gap(24097, 3750)
    expect(g.kind).toBe("multiple")
    expect(g.direction).toBe("behind")
    expect(g.magnitude).toBeCloseTo(6.43, 2)
  })

  it("inverts direction on a lower-is-better row and carries its qualifier", () => {
    const g = gap(2, 1, { lowerIsBetter: true, qualifier: "more often" })
    expect(g).toMatchObject({ kind: "multiple", direction: "ahead", qualifier: "more often" })
    expect(g.magnitude).toBe(2)
  })

  it("inverts the other way too: posting less often than them is behind", () => {
    expect(gap(1, 2, { lowerIsBetter: true })).toMatchObject({ kind: "multiple", direction: "behind" })
  })
})

function vid(over: Partial<VideoRow>): VideoRow {
  return {
    channel_id: "UC1",
    video_id: "v",
    title: "t",
    published_at: "2026-07-01T00:00:00Z",
    view_count: 100,
    duration_s: 600,
    type: "long",
    topic_assignments: [],
    comment_stats: { classified: 0, root_count: 0, top_comment_likes: 0 },
    multiplier: { value: null, baseline: null, baseline_n: 0, source: "computed", state: "ok" },
    traction: { share_recent_7d: null, still_growing: null, views_gained: {} },
    ...over,
  } as VideoRow
}

const NOW = new Date("2026-07-30T00:00:00Z")

describe("windowDays", () => {
  it("reads the number off the key", () => {
    expect(windowDays("7d")).toBe(7)
    expect(windowDays("365d")).toBe(365)
  })
})

describe("videosInWindow", () => {
  it("keeps a video published exactly on the boundary", () => {
    const v = vid({ published_at: "2026-07-23T00:00:00Z" })
    expect(videosInWindow([v], "7d", NOW)).toHaveLength(1)
  })

  it("drops a video published one second before the boundary", () => {
    const v = vid({ published_at: "2026-07-22T23:59:59Z" })
    expect(videosInWindow([v], "7d", NOW)).toHaveLength(0)
  })

  it("returns an empty array rather than throwing on an empty corpus", () => {
    expect(videosInWindow([], "30d", NOW)).toEqual([])
  })

  it("excludes a null view_count, matching the pipeline's own filter", () => {
    const v = vid({ published_at: "2026-07-28T00:00:00Z", view_count: null })
    expect(videosInWindow([v], "7d", NOW)).toHaveLength(0)
  })

  it("excludes a future-dated video instead of counting it in every window", () => {
    const v = vid({ published_at: "2026-08-15T00:00:00Z" })
    expect(videosInWindow([v], "365d", NOW)).toHaveLength(0)
  })
})

describe("splitByFormat", () => {
  const set = [vid({ type: "long" }), vid({ type: "short" }), vid({ type: "short" })]

  it("passes everything through on all", () => {
    expect(splitByFormat(set, "all")).toHaveLength(3)
  })

  it("filters to one format", () => {
    expect(splitByFormat(set, "long")).toHaveLength(1)
    expect(splitByFormat(set, "short")).toHaveLength(2)
  })
})

describe("outputStats", () => {
  it("counts the mix", () => {
    const s = outputStats([vid({ type: "long" }), vid({ type: "short" }), vid({ type: "short" })])
    expect(s).toMatchObject({ videos: 3, long: 1, short: 2 })
  })

  it("takes the middle value of an odd set", () => {
    const s = outputStats([vid({ view_count: 10 }), vid({ view_count: 30 }), vid({ view_count: 20 })])
    expect(s.medianViews).toBe(20)
  })

  it("averages the middle pair of an even set", () => {
    const s = outputStats([vid({ view_count: 10 }), vid({ view_count: 30 })])
    expect(s.medianViews).toBe(20)
  })

  it("handles a single video", () => {
    expect(outputStats([vid({ view_count: 42 })]).medianViews).toBe(42)
  })

  it("reports no median for an empty set rather than zero", () => {
    expect(outputStats([])).toEqual({ videos: 0, long: 0, short: 0, medianViews: null })
  })

  it("skips a null view_count instead of counting it as zero", () => {
    const s = outputStats([vid({ view_count: null }), vid({ view_count: 50 })])
    expect(s.videos).toBe(2)
    expect(s.medianViews).toBe(50)
  })
})
