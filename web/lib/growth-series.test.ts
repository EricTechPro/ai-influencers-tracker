/**
 * Per-day growth, and the rounding floor that decides whether a daily number may be spoken.
 *
 * YouTube rounds subscriberCount to three significant figures for any channel you do not own, so
 * a 69,500-sub channel is counted in steps of 100. Eric grows about 114 a day. Plotting that as a
 * bare daily number would be plotting quantization noise and calling it growth, which is the one
 * thing this board will not do.
 */
import { describe, expect, it } from "vitest"
import {
  MIN_RANGE, axisTicks, clampRange, dailySeries, daySpan, indexedToStart, monthTicks, nearestIndex,
  noiseFloor, perDayAverage, perDayPerThousand, rangeFromDrag, uploadMarks, zoomAbout,
} from "./growth-series"

const day = (date: string, value: number) => ({ date, value })

describe("noiseFloor", () => {
  it("is five buckets, the same bar the rest of the board uses for a delta", () => {
    expect(noiseFloor(100)).toBe(500)
  })

  it("is zero when the count is exact, because views are not rounded at all", () => {
    expect(noiseFloor(null)).toBe(0)
  })
})

describe("dailySeries", () => {
  it("gives the first day no delta, because there is nothing before it to subtract", () => {
    const out = dailySeries([day("2026-08-01", 69_400), day("2026-08-02", 69_500)], 100)
    expect(out[0].delta).toBeNull()
    expect(out[1].delta).toBe(100)
  })

  it("marks a daily move under the floor as unresolved, not as a measured number", () => {
    // 100 a day on a 100 bucket: one tick of rounding, indistinguishable from no change at all.
    const out = dailySeries([day("2026-08-01", 69_400), day("2026-08-02", 69_500)], 100)
    expect(out[1].belowFloor).toBe(true)
  })

  it("lets a move clear of the rounding stand as measured", () => {
    const out = dailySeries([day("2026-08-01", 69_400), day("2026-08-02", 70_400)], 100)
    expect(out[1].delta).toBe(1000)
    expect(out[1].belowFloor).toBe(false)
  })

  it("never marks an exact count as below the floor, however small the move", () => {
    // Views are oracle tier. A one-view day is a real one-view day.
    const out = dailySeries([day("2026-08-01", 1000), day("2026-08-02", 1001)], null)
    expect(out[1].delta).toBe(1)
    expect(out[1].belowFloor).toBe(false)
  })

  it("carries the bucket as the band the point could really sit anywhere inside", () => {
    const out = dailySeries([day("2026-08-01", 69_400), day("2026-08-02", 69_500)], 100)
    expect(out[1].band).toBe(100)
  })

  it("returns nothing for an empty series rather than inventing a zero day", () => {
    expect(dailySeries([], 100)).toEqual([])
  })
})

describe("daySpan", () => {
  it("counts calendar days, not points, so a missed sweep does not speed the channel up", () => {
    // Three days elapsed, one snapshot missing in the middle. Dividing by points would say two.
    expect(daySpan([day("2026-05-04", 17_000), day("2026-05-06", 17_500),
                    day("2026-05-07", 18_000)])).toBe(3)
  })

  it("is zero for a series with nothing to span", () => {
    expect(daySpan([day("2026-05-04", 17_000)])).toBe(0)
    expect(daySpan([])).toBe(0)
  })
})

describe("perDayAverage", () => {
  it("divides the whole move by the days it took", () => {
    // Austin Marchese's real 90-day window: 17,000 -> 80,700 is +63,700, which is 707.8 a day.
    expect(perDayAverage([day("2026-05-04", 17_000), day("2026-08-02", 80_700)]))
      .toBeCloseTo(707.8, 1)
  })

  it("counts the small days that the rounding floor cannot resolve", () => {
    // The regression this replaces: the old headline took the median of the days clearing the
    // floor, so a run of unresolvable days raised the number instead of lowering it. Four days,
    // three of them flat at the rounding, one jump of 1,000 — the average day is 250, not 1,000.
    expect(perDayAverage([day("2026-05-04", 17_000), day("2026-05-05", 17_000),
                          day("2026-05-06", 17_000), day("2026-05-07", 17_000),
                          day("2026-05-08", 18_000)])).toBe(250)
  })

  it("goes negative when the channel lost subscribers, rather than reporting the good days", () => {
    expect(perDayAverage([day("2026-05-04", 18_000), day("2026-05-06", 17_000)])).toBe(-500)
  })

  it("is null with no span to divide by, because a rate needs elapsed time", () => {
    expect(perDayAverage([day("2026-05-04", 17_000)])).toBeNull()
    expect(perDayAverage([])).toBeNull()
  })
})

describe("perDayPerThousand", () => {
  it("expresses a day's gain against the count it grew from", () => {
    // 17,000 -> 17,170 is 170 on a 17,000 base, which is 10 per 1,000.
    const out = perDayPerThousand([day("2026-05-04", 17_000), day("2026-05-05", 17_170)])
    expect(out).toHaveLength(1)
    expect(out[0].value).toBeCloseTo(10, 6)
  })

  it("puts a small channel and a large one on the same axis", () => {
    // The bug this exists for: 300 a day on 17,000 and 900 a day on 80,000 plot as 1:3 in absolute
    // terms, which pins the smaller line flat. As a rate the smaller channel is the faster one.
    const small = perDayPerThousand([day("2026-05-04", 17_000), day("2026-05-05", 17_300)])
    const large = perDayPerThousand([day("2026-05-04", 80_000), day("2026-05-05", 80_900)])
    expect(small[0].value).toBeGreaterThan(large[0].value)
  })

  it("drops a day that grew from nothing rather than dividing by it", () => {
    expect(perDayPerThousand([day("2026-05-04", 0), day("2026-05-05", 500)])).toEqual([])
  })

  it("keeps a losing day negative", () => {
    const out = perDayPerThousand([day("2026-05-04", 10_000), day("2026-05-05", 9_900)])
    expect(out[0].value).toBeCloseTo(-10, 6)
  })

  it("returns nothing when there is no day to difference", () => {
    expect(perDayPerThousand([day("2026-05-04", 17_000)])).toEqual([])
    expect(perDayPerThousand([])).toEqual([])
  })
})

describe("axisTicks", () => {
  it("steps at 1, 2 or 5 times a power of ten, never at a raw division of the span", () => {
    expect(axisTicks(0, 3_600)).toEqual([0, 1_000, 2_000, 3_000])
  })

  it("starts at the first round value inside the range, not below it", () => {
    expect(axisTicks(120, 480)[0]).toBeGreaterThanOrEqual(120)
  })

  it("labels a negative range too, because a channel can lose subscribers", () => {
    expect(axisTicks(-400, 400)).toContain(0)
  })

  it("gives a flat series its one value rather than an empty axis", () => {
    expect(axisTicks(500, 500)).toEqual([500])
  })
})

describe("uploadMarks", () => {
  const series = [day("2026-05-04", 1), day("2026-05-05", 2), day("2026-05-06", 3),
                  day("2026-05-07", 4), day("2026-05-08", 5)]

  it("places an upload at its own day, as a percentage along the plotted series", () => {
    expect(uploadMarks(series, ["2026-05-06T14:00:00Z"]))
      .toEqual([{ pct: 50, index: 2, date: "2026-05-06" }])
  })

  it("carries the point index, so a dot can be drawn at that day's own value", () => {
    const out = uploadMarks(series, ["2026-05-04T00:00:00Z", "2026-05-08T00:00:00Z"])
    expect(out.map((m) => m.index)).toEqual([0, 4])
  })

  it("drops uploads outside the window instead of clamping them to an edge", () => {
    expect(uploadMarks(series, ["2026-01-01T00:00:00Z", "2026-12-01T00:00:00Z"])).toEqual([])
  })

  it("marks a day once however many times the channel posted on it", () => {
    const out = uploadMarks(series, ["2026-05-06T09:00:00Z", "2026-05-06T18:00:00Z"])
    expect(out).toHaveLength(1)
  })

  it("puts an upload on a missed sweep day at the next day the chart draws", () => {
    // No 05-06 snapshot, so an 05-06 upload belongs on 05-07 rather than nowhere.
    const gapped = [day("2026-05-04", 1), day("2026-05-05", 2), day("2026-05-07", 4)]
    expect(uploadMarks(gapped, ["2026-05-06T12:00:00Z"]))
      .toEqual([{ pct: 100, index: 2, date: "2026-05-06" }])
  })

  it("returns nothing when there is no series to place them on", () => {
    expect(uploadMarks([day("2026-05-04", 1)], ["2026-05-04T00:00:00Z"])).toEqual([])
  })
})

describe("clampRange", () => {
  it("keeps a range inside the series", () => {
    expect(clampRange([-5, 200], 90)).toEqual([0, 89])
  })

  it("orders a backwards drag rather than dropping it", () => {
    expect(clampRange([60, 20], 90)).toEqual([20, 60])
  })

  it("widens a selection too small to show anything", () => {
    const [a, b] = clampRange([40, 41], 90)
    expect(b - a).toBe(MIN_RANGE)
  })

  it("widens away from the edge when the drag lands at the very end", () => {
    // Widening rightwards would run off the series, so it has to grow leftwards instead.
    expect(clampRange([89, 89], 90)).toEqual([85, 89])
  })

  it("never exceeds a series shorter than the minimum range", () => {
    expect(clampRange([0, 2], 3)).toEqual([0, 2])
  })
})

describe("rangeFromDrag", () => {
  it("maps a drag across the whole plot back to the whole visible slice", () => {
    expect(rangeFromDrag([0, 89], 0, 1, 90)).toEqual([0, 89])
  })

  it("selects the middle third of what is drawn", () => {
    expect(rangeFromDrag([0, 90], 1 / 3, 2 / 3, 91)).toEqual([30, 60])
  })

  it("composes, so a second zoom is a fraction of the first slice not of the window", () => {
    // Already looking at days 30-60; dragging the right half selects 45-60, not 45-90.
    expect(rangeFromDrag([30, 60], 0.5, 1, 91)).toEqual([45, 60])
  })
})

describe("zoomAbout", () => {
  it("keeps the point under the cursor under the cursor", () => {
    // Anchored at the midpoint of 0-100, so both edges close in by the same amount.
    expect(zoomAbout([0, 100], 0.5, 0.5, 101)).toEqual([25, 75])
  })

  it("holds the left edge when the cursor is on it", () => {
    expect(zoomAbout([0, 100], 0, 0.5, 101)).toEqual([0, 50])
  })

  it("zooms out with a factor above one, and stops at the ends of the series", () => {
    expect(zoomAbout([40, 60], 0.5, 10, 101)).toEqual([0, 100])
  })

  it("cannot zoom past the point where the chart says nothing", () => {
    const [a, b] = zoomAbout([40, 60], 0.5, 0.001, 101)
    expect(b - a).toBe(MIN_RANGE)
  })
})

describe("indexedToStart", () => {
  it("starts every series at 100 so two channels of different size are comparable", () => {
    const out = indexedToStart([day("2026-01-01", 17_000), day("2026-04-01", 80_700)])
    expect(out[0].value).toBe(100)
    expect(Math.round(out[1].value)).toBe(475)
  })

  it("refuses to index a series that starts at zero, which has no ratio to take", () => {
    expect(indexedToStart([day("2026-01-01", 0), day("2026-02-01", 50)])).toEqual([])
  })

  it("returns nothing for an empty series", () => {
    expect(indexedToStart([])).toEqual([])
  })
})

describe("monthTicks", () => {
  it("puts a tick at the first day of each month the window crosses", () => {
    const points = [
      day("2026-05-30", 1), day("2026-05-31", 2),
      day("2026-06-01", 3), day("2026-06-02", 4),
      day("2026-07-01", 5),
    ]
    expect(monthTicks(points).map((t) => t.label)).toEqual(["Jun", "Jul"])
  })

  it("does not tick the first point's own month, which needs no boundary", () => {
    // The left edge already carries its full date. A "May" tick sitting on top of it would be
    // labelling the same thing twice.
    const points = [day("2026-05-30", 1), day("2026-05-31", 2)]
    expect(monthTicks(points)).toEqual([])
  })

  it("places a tick at the fraction of the way along the series that day sits", () => {
    const points = [day("2026-05-31", 1), day("2026-06-01", 2), day("2026-06-02", 3)]
    expect(monthTicks(points)[0].pct).toBeCloseTo(50)
  })

  it("carries the year when the window crosses one, so Jan is not ambiguous", () => {
    const points = [day("2025-12-31", 1), day("2026-01-01", 2)]
    expect(monthTicks(points)[0].label).toBe("Jan 26")
  })

  it("returns nothing for a series too short to have a boundary", () => {
    expect(monthTicks([])).toEqual([])
    expect(monthTicks([day("2026-05-01", 1)])).toEqual([])
  })
})

describe("nearestIndex", () => {
  it("maps the left edge to the first point and the right edge to the last", () => {
    const points = [day("a", 1), day("b", 2), day("c", 3)]
    expect(nearestIndex(points, 0)).toBe(0)
    expect(nearestIndex(points, 1)).toBe(2)
  })

  it("rounds to whichever point the pointer is closest to", () => {
    const points = [day("a", 1), day("b", 2), day("c", 3)]
    expect(nearestIndex(points, 0.4)).toBe(1)
    expect(nearestIndex(points, 0.6)).toBe(1)
  })

  it("clamps a pointer that ran off either end rather than indexing out of range", () => {
    const points = [day("a", 1), day("b", 2)]
    expect(nearestIndex(points, -3)).toBe(0)
    expect(nearestIndex(points, 9)).toBe(1)
  })

  it("returns null for an empty series, because there is no point to name", () => {
    expect(nearestIndex([], 0.5)).toBeNull()
  })
})
