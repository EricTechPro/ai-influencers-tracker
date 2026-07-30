import { describe, expect, it } from "vitest"
import { gap, okValue } from "./compare"
import type { StateCell } from "./types"

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
