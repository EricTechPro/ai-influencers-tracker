import { describe, expect, it } from "vitest"
import { rollupLine, videosPerWeek } from "./rollup"

const NOW = new Date("2026-07-28T12:00:00Z") // a Tuesday; week starts Mon 2026-07-27

describe("videosPerWeek", () => {
  it("buckets publish dates into trailing ISO weeks, oldest first", () => {
    const points = videosPerWeek(
      [
        "2026-07-27T09:00:00Z", // current week
        "2026-07-28T01:00:00Z", // current week
        "2026-07-20T10:00:00Z", // previous week
        "2026-05-01T10:00:00Z", // before the window: dropped
      ],
      4,
      NOW
    )
    expect(points).toHaveLength(4)
    expect(points[0].week_start).toBe("2026-07-06")
    expect(points[3].week_start).toBe("2026-07-27")
    expect(points.map((p) => p.count)).toEqual([0, 0, 1, 2])
  })

  it("an empty corpus is all zeros, not an error", () => {
    const points = videosPerWeek([], 3, NOW)
    expect(points.map((p) => p.count)).toEqual([0, 0, 0])
  })
})

describe("rollupLine", () => {
  it("derives the heating-or-cooling sentence", () => {
    const points = videosPerWeek(
      ["2026-07-27T09:00:00Z", "2026-07-28T01:00:00Z", "2026-07-06T10:00:00Z"],
      4,
      NOW
    )
    expect(rollupLine(points)).toBe("2 videos/wk across this branch, up from 1 in July.")
  })
  it("needs at least two points", () => {
    expect(rollupLine([])).toBeNull()
    expect(rollupLine([{ week_start: "2026-07-27", count: 3 }])).toBeNull()
  })
})
