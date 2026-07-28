import { describe, expect, it } from "vitest"
import { compareSortValues, tiered, type SortValue } from "./sort"

function order(values: SortValue[], dir: 1 | -1): SortValue[] {
  return values
    .map((v, i) => ({ v, i }))
    .sort((a, b) => compareSortValues(a.v, b.v, dir) || a.i - b.i)
    .map((x) => x.v)
}

describe("tiered mirrors pipeline rank_value", () => {
  it("measured is tier 2, bounded tier 1 on upper, unmeasured tier 0", () => {
    expect(tiered({ state: "ok", value: 15000 })).toEqual({ tier: 2, v: 15000 })
    expect(tiered({ state: "bounded", value: null, upper: 50000 })).toEqual({ tier: 1, v: 50000 })
    expect(tiered({ state: "building", value: null, have: 1, need: 90 })).toEqual({ tier: 0, v: 0 })
    expect(tiered({ state: "insufficient_data", value: null })).toEqual({ tier: 0, v: 0 })
  })
})

describe("compareSortValues: ok > bounded > unmeasured in BOTH directions", () => {
  const okBig = { tier: 2, v: 15000 } as const
  const okSmall = { tier: 2, v: 180 } as const
  const boundedBig = { tier: 1, v: 50000 } as const
  const boundedSmall = { tier: 1, v: 500 } as const

  it("descending", () => {
    expect(order([null, boundedSmall, okSmall, boundedBig, okBig], -1)).toEqual([
      okBig,
      okSmall,
      boundedBig,
      boundedSmall,
      null,
    ])
  })

  it("ascending still keeps bounded under ok and unmeasured last", () => {
    expect(order([null, boundedSmall, okSmall, boundedBig, okBig], 1)).toEqual([
      okSmall,
      okBig,
      boundedSmall,
      boundedBig,
      null,
    ])
  })

  it("null, undefined and NaN all sort last both ways", () => {
    expect(order([null, 5, undefined, 3, NaN], -1)).toEqual([5, 3, null, undefined, NaN])
    expect(order([null, 5, undefined, 3, NaN], 1)).toEqual([3, 5, null, undefined, NaN])
  })

  it("plain numbers and strings still sort", () => {
    expect(order([2, 9, 4], -1)).toEqual([9, 4, 2])
    expect(order(["b", "a", "c"], 1)).toEqual(["a", "b", "c"])
  })

  it("ties are stable (comparator returns 0)", () => {
    expect(compareSortValues(5, 5, -1)).toBe(0)
    expect(compareSortValues(null, undefined, -1)).toBe(0)
  })
})
